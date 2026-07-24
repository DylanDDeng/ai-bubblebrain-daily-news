import postgres from "postgres";

type DatabaseEnv = {
  CONTENT_DB?: { connectionString?: string };
  CONTENT_DATABASE_URL?: string;
};

export type ContentSql = ReturnType<typeof postgres>;

export function databaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { code?: unknown; cause?: unknown };
  if (typeof value.code === "string" && value.code.length > 0) {
    return value.code;
  }
  return value.cause === error ? null : databaseErrorCode(value.cause);
}

export function isRetryableReleaseContention(error: unknown): boolean {
  return ["55P03", "40001"].includes(databaseErrorCode(error) || "");
}

export function openContentDatabase(
  env: DatabaseEnv,
  applicationName: string,
): ContentSql {
  const hyperdriveConnectionString = env.CONTENT_DB?.connectionString;
  const connectionString = hyperdriveConnectionString || env.CONTENT_DATABASE_URL;
  if (!connectionString)
    throw new Error("Content capability database binding is unavailable");
  return postgres(connectionString, {
    max: 1,
    prepare: false,
    // Hyperdrive terminates the Worker-side connection and applies the
    // configured TLS policy to its origin. Forcing postgres.js TLS again on
    // the binding endpoint stalls the connection handshake.
    ...(hyperdriveConnectionString ? {} : { ssl: "require" as const }),
    connection: { application_name: applicationName },
  });
}

function oneJson(
  rows: readonly Record<string, unknown>[],
  field: string,
): Record<string, unknown> {
  const value = rows[0]?.[field];
  if (!value || typeof value !== "object")
    throw new Error(`Content RPC ${field} returned no result`);
  return value as Record<string, unknown>;
}

export async function ingestReportSnapshot(
  sql: ContentSql,
  input: {
    document: Record<string, unknown>;
    objectKey: string;
    byteLength: number;
    byteSha256: string;
    serializerVersion: string;
    provenanceKind: "live_ingestion" | "legacy_structured_import";
    rawPayloadSha256?: string | null;
  },
): Promise<Record<string, unknown>> {
  const rows = await sql<Record<string, unknown>[]>`
    select private.ingest_report_snapshot_v1(
      ${sql.json(input.document)}, ${input.objectKey}, ${input.byteLength}, ${input.byteSha256},
      ${input.serializerVersion}, ${input.provenanceKind}, ${input.rawPayloadSha256 ?? null}
    ) as result
  `;
  return oneJson(rows, "result");
}

export async function reserveSiteRelease(
  sql: ContentSql,
  reportSnapshotId: string,
): Promise<Record<string, unknown>> {
  const rows = await sql<Record<string, unknown>[]>`
    select private.reserve_site_release_v1(${reportSnapshotId}::uuid) as result
  `;
  return oneJson(rows, "result");
}

export async function reserveIngestionSiteRelease(
  sql: ContentSql,
  input: {
    reportSnapshotId: string;
    batchId: string;
    inputSha256: string;
    contentSha256: string;
    triggerKind: string;
    workerVersion: string;
  },
): Promise<Record<string, unknown>> {
  const rows = await sql<Record<string, unknown>[]>`
    select private.reserve_ingestion_site_release_v1(
      ${input.reportSnapshotId}::uuid, ${input.batchId}, ${input.inputSha256}, ${input.contentSha256},
      ${input.triggerKind}, ${input.workerVersion}
    ) as result
  `;
  return oneJson(rows, "result");
}

export async function prepareIngestionPublicationSlot(
  sql: ContentSql,
  input: {
    reportSnapshotId: string;
    batchId: string;
    inputSha256: string;
  },
): Promise<Record<string, unknown>> {
  const rows = await sql<Record<string, unknown>[]>`
    select private.prepare_ingestion_publication_slot_v1(
      ${input.reportSnapshotId}::uuid, ${input.batchId}, ${input.inputSha256}
    ) as result
  `;
  return oneJson(rows, "result");
}

export async function failIngestionPublicationAttempt(
  sql: ContentSql,
  input: {
    reportDate: string;
    batchId: string;
    inputSha256: string;
    triggerKind: string;
    workerVersion: string;
    errorCode: string;
    errorDetail: string;
  },
): Promise<Record<string, unknown>> {
  const rows = await sql<Record<string, unknown>[]>`
    select private.fail_ingestion_publication_attempt_v1(
      ${input.reportDate}::date, ${input.batchId}, ${input.inputSha256},
      ${input.triggerKind}, ${input.workerVersion}, ${input.errorCode}, ${input.errorDetail}
    ) as result
  `;
  return oneJson(rows, "result");
}

export async function finalizeSiteRelease(
  sql: ContentSql,
  input: {
    reservationId: string;
    manifestObjectKey: string;
    manifestByteLength: number;
    manifestSha256: string;
    contentRootSha256: string;
    schemaVersion: number;
    taxonomyVersion: number;
    serializerVersion: string;
    searchContractVersion: string;
    sourceContractVersion: string;
    structuredCutoverDate: string;
    noReportDays: string[];
    dispatchId: string;
    dispatchPayload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const rows = await sql<Record<string, unknown>[]>`
    select private.finalize_site_release_v1(
      ${input.reservationId}::uuid, ${input.manifestObjectKey}, ${input.manifestByteLength},
      ${input.manifestSha256}, ${input.contentRootSha256}, ${input.schemaVersion},
      ${input.taxonomyVersion}, ${input.serializerVersion}, ${input.searchContractVersion},
      ${input.sourceContractVersion}, ${input.structuredCutoverDate}::date,
      ${input.noReportDays}::date[], ${input.dispatchId}::uuid, ${sql.json(input.dispatchPayload)}
    ) as result
  `;
  return oneJson(rows, "result");
}

export async function recordScheduledRunTrace(
  sql: ContentSql,
  input: {
    runId: string;
    scheduledAt: string;
    eventType: "started" | "succeeded" | "failed";
    evidence: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const rows = await sql<Record<string, unknown>[]>`
    select private.record_scheduled_run_trace_v1(
      ${input.runId}, ${input.scheduledAt}::timestamptz,
      ${input.eventType}, ${sql.json(input.evidence)}
    ) as result
  `;
  return oneJson(rows, "result");
}
