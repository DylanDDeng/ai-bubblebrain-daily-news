import { canonicalJsonBytes, equalBytes, sha256Hex } from "../shared/canonical";
import {
  databaseErrorCode,
  failIngestionPublicationAttempt,
  finalizeSiteRelease,
  ingestReportSnapshot,
  isRetryableReleaseContention,
  openContentDatabase,
  reserveIngestionSiteRelease,
  type ContentSql,
} from "../shared/db";
import { putVerifiedImmutable } from "../shared/r2";

type MirrorEnv = {
  CONTENT_DATABASE_MIRROR_ENABLED?: string;
  CONTENT_DATABASE_PUBLICATION_ENABLED?: string;
  CONTENT_DB?: { connectionString?: string };
  CONTENT_DATABASE_URL?: string;
  REPORT_SNAPSHOTS: Parameters<typeof putVerifiedImmutable>[0];
  SITE_MANIFESTS: Parameters<typeof putVerifiedImmutable>[0];
  STRUCTURED_CUTOVER_DATE?: string;
  DAILY_SOURCE_CONTRACT_VERSION?: string;
  BUILD_ENVIRONMENT_VERSION?: string;
  DAILY_SERIALIZER_VERSION?: string;
  DAILY_PRODUCER_VERSION?: string;
  SEARCH_CONTRACT_VERSION?: string;
};

type DailyReport = Record<string, unknown> & {
  date: string;
  schema_version: number;
  taxonomy_version: number;
};

export type MirrorResult = {
  status: "disabled" | "mirrored";
  reportSnapshotId?: string;
  siteReleaseId?: string;
  siteReleaseSequence?: number;
  contentSha256?: string;
  manifestSha256?: string;
};

const MAX_CONTENTION_ATTEMPTS = 3;
const CONTENTION_RETRY_BASE_MS = 100;

export function publicationBatchId(
  batch: string,
  triggerId?: string | null,
): string {
  if (batch !== "lateNight") return batch;
  const scheduledAt = String(triggerId || "").match(/^scheduled:(\d{13})$/)?.[1];
  if (!scheduledAt) return batch;
  const timestamp = Number(scheduledAt);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Shanghai",
    }).format(new Date(timestamp)),
  );
  return hour === 3 ? "lateNightSupplement" : batch;
}

async function withContentionRetry<T>(
  operation: () => Promise<T>,
  label: string,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_CONTENTION_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableReleaseContention(error) || attempt === MAX_CONTENTION_ATTEMPTS) {
        throw error;
      }
      console.warn("[ContentMirror] transient database contention; retrying", {
        attempt,
        operation: label,
      });
      await sleep(CONTENTION_RETRY_BASE_MS * 2 ** (attempt - 1));
    }
  }
  throw new Error("Content mirror retry loop exhausted");
}

export async function mirrorStructuredReport(
  env: MirrorEnv,
  input: {
    report: DailyReport;
    canonicalJson: string;
    codeSha: string;
    batch: string;
    triggerId?: string | null;
  },
  dependencies: {
    openDatabase?: typeof openContentDatabase;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<MirrorResult> {
  if (String(env.CONTENT_DATABASE_MIRROR_ENABLED).toLowerCase() !== "true") {
    return { status: "disabled" };
  }
  if (!env.REPORT_SNAPSHOTS || !env.SITE_MANIFESTS) {
    throw new Error("Content-addressed R2 bindings are required");
  }
  if (!/^[a-f0-9]{40}$/i.test(input.codeSha))
    throw new Error("Mirror requires an exact code SHA");
  if (!["morning", "afternoon", "night", "lateNight"].includes(input.batch)) {
    throw new Error("Mirror requires a canonical batch");
  }

  const reportBytes = new TextEncoder().encode(input.canonicalJson);
  const parsed = JSON.parse(input.canonicalJson) as DailyReport;
  if (!equalBytes(canonicalJsonBytes(input.report), reportBytes)) {
    throw new Error("Canonical report bytes do not match the in-memory report");
  }
  const reportObject = await putVerifiedImmutable(
    env.REPORT_SNAPSHOTS,
    "report-snapshots",
    "json",
    reportBytes,
    "application/json; charset=utf-8",
  );
  const triggerKind =
    input.triggerId ||
    `structured:${input.report.date}:${input.batch}:${input.codeSha.toLowerCase()}`;
  const publicationBatch = publicationBatchId(input.batch, input.triggerId);
  const workerVersion =
    env.DAILY_PRODUCER_VERSION ||
    env.BUILD_ENVIRONMENT_VERSION ||
    "content-ingestor-unknown";

  const sql = (dependencies.openDatabase || openContentDatabase)(
    env,
    "content-ingestor",
  );
  const sleep =
    dependencies.sleep ||
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  try {
    const snapshot = await ingestReportSnapshot(sql, {
      document: parsed,
      objectKey: reportObject.key,
      byteLength: reportObject.byteLength,
      byteSha256: reportObject.sha256,
      serializerVersion: env.DAILY_SERIALIZER_VERSION || "daily-json-c14n-v1",
      provenanceKind: "live_ingestion",
    });
    const reservation = await withContentionRetry(
      () =>
        reserveIngestionSiteRelease(sql, {
          reportSnapshotId: String(snapshot.report_snapshot_id),
          batchId: publicationBatch,
          inputSha256: reportObject.sha256,
          contentSha256: reportObject.sha256,
          triggerKind,
          workerVersion,
        }),
      "reserve",
      sleep,
    );
    const reports = Array.isArray(reservation.reports)
      ? reservation.reports
      : [];
    const contract = {
      schema_version: input.report.schema_version,
      taxonomy_version: input.report.taxonomy_version,
      site_release_id: reservation.site_release_id,
      site_release_sequence: reservation.site_release_sequence,
      expected_predecessor_id: reservation.expected_predecessor_id,
      structured_cutover_date: env.STRUCTURED_CUTOVER_DATE || "2026-07-16",
      source_contract_version:
        env.DAILY_SOURCE_CONTRACT_VERSION || "daily-source-v1",
      serializer_version: env.DAILY_SERIALIZER_VERSION || "daily-json-c14n-v1",
      search_contract_version: env.SEARCH_CONTRACT_VERSION || "search-v1",
      no_report_days: [],
      reports,
    };
    const contentRootSha256 = await sha256Hex(
      canonicalJsonBytes({
        schema_version: contract.schema_version,
        taxonomy_version: contract.taxonomy_version,
        structured_cutover_date: contract.structured_cutover_date,
        source_contract_version: contract.source_contract_version,
        serializer_version: contract.serializer_version,
        search_contract_version: contract.search_contract_version,
        no_report_days: contract.no_report_days,
        reports,
      }),
    );
    const manifestBytes = canonicalJsonBytes({
      ...contract,
      content_root_sha256: contentRootSha256,
    });
    const manifestObject = await putVerifiedImmutable(
      env.SITE_MANIFESTS,
      "site-manifests",
      "json",
      manifestBytes,
      "application/json; charset=utf-8",
    );
    const dispatchId = crypto.randomUUID();
    const dispatchPayload = {
      dispatch_id: dispatchId,
      site_release_id: reservation.site_release_id,
      site_release_sequence: reservation.site_release_sequence,
      expected_predecessor_id: reservation.expected_predecessor_id,
      expected_content_sha: contentRootSha256,
      code_sha: input.codeSha.toLowerCase(),
      build_environment_version:
        env.BUILD_ENVIRONMENT_VERSION || "node22.17-astro7-hugo0.147.9-v1",
      mode:
        String(env.CONTENT_DATABASE_PUBLICATION_ENABLED).toLowerCase() ===
        "true"
          ? "production"
          : "shadow",
    };
    const release = await withContentionRetry(
      () =>
        finalizeSiteRelease(sql, {
          reservationId: String(reservation.reservation_id),
          manifestObjectKey: manifestObject.key,
          manifestByteLength: manifestObject.byteLength,
          manifestSha256: manifestObject.sha256,
          contentRootSha256,
          schemaVersion: input.report.schema_version,
          taxonomyVersion: input.report.taxonomy_version,
          serializerVersion: contract.serializer_version,
          searchContractVersion: contract.search_contract_version,
          sourceContractVersion: contract.source_contract_version,
          structuredCutoverDate: contract.structured_cutover_date,
          noReportDays: contract.no_report_days,
          dispatchId,
          dispatchPayload,
        }),
      "finalize",
      sleep,
    );
    return {
      status: "mirrored",
      reportSnapshotId: String(snapshot.report_snapshot_id),
      siteReleaseId: String(release.site_release_id),
      siteReleaseSequence: Number(release.site_release_sequence),
      contentSha256: reportObject.sha256,
      manifestSha256: manifestObject.sha256,
    };
  } catch (error) {
    if (isRetryableReleaseContention(error)) {
      console.warn(
        "[ContentMirror] database contention retries exhausted",
        { errorCode: databaseErrorCode(error) },
      );
    } else {
      try {
        await failIngestionPublicationAttempt(sql, {
          reportDate: input.report.date,
          batchId: publicationBatch,
          inputSha256: reportObject.sha256,
          triggerKind,
          workerVersion,
          errorCode: error instanceof Error ? error.name : "Error",
          errorDetail: error instanceof Error ? error.message : String(error),
        });
      } catch (attemptError) {
        console.error(
          "[ContentMirror] failed to persist publication attempt failure",
          {
            errorType:
              attemptError instanceof Error ? attemptError.name : "Error",
          },
        );
      }
    }
    throw error;
  } finally {
    await (sql as ContentSql).end({ timeout: 2 });
  }
}
