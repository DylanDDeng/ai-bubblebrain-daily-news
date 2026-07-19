import { canonicalJsonBytes, equalBytes, sha256Hex } from "../shared/canonical";
import {
  databaseErrorCode,
  isRetryableReleaseContention,
  openContentDatabase,
} from "../shared/db";
import { putVerifiedImmutable } from "../shared/r2";

type Env = {
  CONTENT_DB?: { connectionString?: string };
  CONTENT_DATABASE_URL?: string;
  REPORT_SNAPSHOTS: R2Bucket;
  SITE_MANIFESTS: R2Bucket;
};
type JsonRecord = Record<string, unknown>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const CONTRACT_VERSION = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const ALLOWED_PATCH_FIELDS = new Set([
  "title",
  "summary",
  "category",
  "featured",
  "score",
  "reason",
  "topic_ids",
  "entity_ids",
  "report_hidden",
  "report_date",
]);

function validReleaseContract(input: JsonRecord): boolean {
  return Boolean(
    Number.isSafeInteger(input.schema_version) &&
    Number(input.schema_version) >= 1 &&
    Number.isSafeInteger(input.taxonomy_version) &&
    Number(input.taxonomy_version) >= 1 &&
    CONTRACT_VERSION.test(String(input.serializer_version || "")) &&
    CONTRACT_VERSION.test(String(input.search_contract_version || "")) &&
    CONTRACT_VERSION.test(String(input.source_contract_version || "")),
  );
}

async function one(
  sql: ReturnType<typeof openContentDatabase>,
  query: PromiseLike<readonly JsonRecord[]>,
): Promise<JsonRecord> {
  const rows = await query;
  const value = rows[0]?.result;
  if (!value || typeof value !== "object")
    throw new Error("Editorial RPC returned no result");
  return value as JsonRecord;
}

function removeReportItem(
  document: JsonRecord,
  itemId: string,
  overviewText: string,
): void {
  if (!Array.isArray(document.items) || !Array.isArray(document.batches)) {
    throw new Error("Base report is malformed");
  }
  const before = document.items.length;
  document.items = document.items
    .filter((item) => item && typeof item === "object" && item.id !== itemId)
    .map((item) => {
      const value = item as JsonRecord;
      if (Array.isArray(value.related_source_ids)) {
        value.related_source_ids = value.related_source_ids.filter(
          (id) => id !== itemId,
        );
      }
      return value;
    });
  if (document.items.length !== before - 1) {
    throw new Error("Hidden item is not uniquely present in the target report");
  }
  for (const batch of document.batches) {
    if (!batch || typeof batch !== "object" || !Array.isArray(batch.item_ids)) {
      throw new Error("Base report batch is malformed");
    }
    batch.item_ids = batch.item_ids.filter((id: unknown) => id !== itemId);
  }
  document.overview = {
    text: overviewText,
    kind: "fallback",
    provenance: { method: "template", model: null, prompt_version: null },
  };
}

export function applyDraft(document: JsonRecord, items: JsonRecord[]): void {
  const reportItems = document.items;
  if (!Array.isArray(reportItems))
    throw new Error("Base report items are malformed");
  for (const draftItem of items) {
    const itemId = String(draftItem.item_id || "");
    const patch = draftItem.patch;
    const base = draftItem.base_document;
    if (
      !itemId ||
      !patch ||
      typeof patch !== "object" ||
      Array.isArray(patch) ||
      !base ||
      typeof base !== "object" ||
      Array.isArray(base)
    )
      throw new Error("Draft item is malformed");
    for (const key of Object.keys(patch)) {
      if (!ALLOWED_PATCH_FIELDS.has(key))
        throw new Error(`Draft patch field is not allowed: ${key}`);
    }
    const reportHidden = (patch as JsonRecord).report_hidden;
    const reportDate = (patch as JsonRecord).report_date;
    if (reportHidden !== undefined || reportDate !== undefined) {
      if (
        reportHidden !== true ||
        typeof reportDate !== "string" ||
        Object.keys(patch).some(
          (key) => !["report_hidden", "report_date"].includes(key),
        )
      ) {
        throw new Error("Report hide patch is malformed");
      }
      if (document.date === reportDate) {
        removeReportItem(
          document,
          itemId,
          "本期日报已根据报告级隐藏请求更新。",
        );
      }
      continue;
    }
    for (const reportItem of reportItems) {
      if (
        !reportItem ||
        typeof reportItem !== "object" ||
        reportItem.id !== itemId
      )
        continue;
      for (const [key, value] of Object.entries(patch)) {
        reportItem[key] = value === null ? (base as JsonRecord)[key] : value;
      }
    }
  }
}

export function applyGlobalSuppression(
  document: JsonRecord,
  itemId: string,
): void {
  try {
    removeReportItem(document, itemId, "本期日报已根据全局内容下架请求更新。");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Hidden item is not uniquely present")
    ) {
      throw new Error(
        "Suppressed item is not uniquely present in the base report",
      );
    }
    throw error;
  }
}

async function exactBaseReport(
  env: Env,
  reference: JsonRecord,
): Promise<JsonRecord> {
  const key = String(reference.object_key || "");
  const expectedHash = String(reference.byte_sha256 || "");
  const expectedLength = Number(reference.byte_length);
  if (
    !/^report-snapshots\/sha256\/[a-f0-9]{64}\.json$/.test(key) ||
    !HASH.test(expectedHash) ||
    !Number.isSafeInteger(expectedLength)
  ) {
    throw new Error("Base report reference is malformed");
  }
  const object = await env.REPORT_SNAPSHOTS.get(key);
  if (!object || object.size !== expectedLength)
    throw new Error("Base report object is unavailable");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if ((await sha256Hex(bytes)) !== expectedHash)
    throw new Error("Base report object hash mismatch");
  return JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  ) as JsonRecord;
}

export async function processEditorialPublish(
  env: Env,
): Promise<"empty" | "published"> {
  const workerId = `editorial:${crypto.randomUUID()}`;
  const sql = openContentDatabase(env, "content-editorial-materializer");
  let claimed: JsonRecord | null = null;
  try {
    const claimRows = await sql<JsonRecord[]>`
      select private.claim_editorial_publish_request_v1(${workerId}, 600) as result
    `;
    claimed = claimRows[0]?.result as JsonRecord | null;
    if (!claimed) return "empty";
    const requestId = String(claimed.id || "");
    if (!UUID.test(requestId))
      throw new Error("Claimed editorial request is malformed");
    const input = await one(
      sql,
      sql<JsonRecord[]>`
      select private.get_editorial_publish_input_v1(${requestId}::uuid) as result
    `,
    );
    if (
      !Array.isArray(input.items) ||
      !Array.isArray(input.reports) ||
      !UUID.test(String(input.base_site_release_id)) ||
      !/^[a-f0-9]{40}$/.test(String(input.code_sha)) ||
      !validReleaseContract(input)
    ) {
      throw new Error("Editorial publish input is malformed");
    }
    const reportObjects = [];
    for (const reference of input.reports as JsonRecord[]) {
      const document = await exactBaseReport(env, reference);
      applyDraft(document, input.items as JsonRecord[]);
      const bytes = canonicalJsonBytes(document);
      const object = await putVerifiedImmutable(
        env.REPORT_SNAPSHOTS,
        "report-snapshots",
        "json",
        bytes,
        "application/json; charset=utf-8",
      );
      if (!equalBytes(bytes, canonicalJsonBytes(document)))
        throw new Error("Editorial serialization drift");
      reportObjects.push({
        report_date: String(reference.report_date),
        object_key: object.key,
        byte_length: object.byteLength,
        byte_sha256: object.sha256,
        parsed_document: document,
      });
    }
    const reservation = await one(
      sql,
      sql<JsonRecord[]>`
      select private.stage_editorial_release_v1(${requestId}::uuid, ${sql.json(reportObjects)}) as result
    `,
    );
    if (
      !UUID.test(String(reservation.site_release_id)) ||
      !Number.isSafeInteger(reservation.site_release_sequence) ||
      !Array.isArray(reservation.reports)
    )
      throw new Error("Editorial release reservation is malformed");
    const contractBase = {
      schema_version: input.schema_version,
      taxonomy_version: input.taxonomy_version,
      structured_cutover_date: input.structured_cutover_date,
      source_contract_version: input.source_contract_version,
      serializer_version: input.serializer_version,
      search_contract_version: input.search_contract_version,
      no_report_days: input.no_report_days,
      reports: reservation.reports,
    };
    const contentRootSha256 = await sha256Hex(canonicalJsonBytes(contractBase));
    const manifest = {
      site_release_id: reservation.site_release_id,
      site_release_sequence: reservation.site_release_sequence,
      expected_predecessor_id: reservation.expected_predecessor_id,
      ...contractBase,
      content_root_sha256: contentRootSha256,
    };
    const manifestObject = await putVerifiedImmutable(
      env.SITE_MANIFESTS,
      "site-manifests",
      "json",
      canonicalJsonBytes(manifest),
      "application/json; charset=utf-8",
    );
    const dispatchId = crypto.randomUUID();
    await one(
      sql,
      sql<JsonRecord[]>`
      select private.finalize_editorial_release_v1(
        ${requestId}::uuid, ${manifestObject.key}, ${manifestObject.byteLength},
        ${manifestObject.sha256}, ${contentRootSha256}, ${dispatchId}::uuid,
        ${sql.json({
          dispatch_id: dispatchId,
          site_release_id: reservation.site_release_id,
          site_release_sequence: reservation.site_release_sequence,
          expected_predecessor_id: reservation.expected_predecessor_id,
          expected_content_sha: contentRootSha256,
          code_sha: input.code_sha,
          build_environment_version: input.build_environment_version,
          mode: "production",
        })}
      ) as result
    `,
    );
    return "published";
  } catch (error) {
    if (claimed?.id) {
      const errorCode =
        databaseErrorCode(error) ||
        (error instanceof Error ? error.name : "Error");
      if (isRetryableReleaseContention(error)) {
        await sql`select private.defer_editorial_publish_request_v1(
          ${String(claimed.id)}::uuid, ${workerId}, ${errorCode}
        )`.catch(() => undefined);
      } else {
        await sql`select private.fail_editorial_publish_request_v1(
          ${String(claimed.id)}::uuid, ${workerId}, ${errorCode}
        )`.catch(() => undefined);
      }
    }
    throw error;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

export async function processGlobalSuppression(
  env: Env,
): Promise<"empty" | "published"> {
  const workerId = `suppression:${crypto.randomUUID()}`;
  const sql = openContentDatabase(
    env,
    "content-global-suppression-materializer",
  );
  let claimed: JsonRecord | null = null;
  try {
    const claimRows = await sql<JsonRecord[]>`
      select private.claim_global_suppression_request_v1(${workerId}, 600) as result
    `;
    claimed = claimRows[0]?.result as JsonRecord | null;
    if (!claimed) return "empty";
    const requestId = String(claimed.id || "");
    if (!UUID.test(requestId))
      throw new Error("Claimed suppression request is malformed");
    const input = await one(
      sql,
      sql<JsonRecord[]>`
      select private.get_global_suppression_input_v1(${requestId}::uuid) as result
    `,
    );
    const itemId = String(input.item_id || "");
    if (
      !/^n_[a-f0-9]{64}$/.test(itemId) ||
      !Array.isArray(input.reports) ||
      !UUID.test(String(input.base_site_release_id)) ||
      !/^[a-f0-9]{40}$/.test(String(input.code_sha)) ||
      !validReleaseContract(input)
    ) {
      throw new Error("Global suppression input is malformed");
    }
    const reportObjects = [];
    for (const reference of input.reports as JsonRecord[]) {
      const document = await exactBaseReport(env, reference);
      applyGlobalSuppression(document, itemId);
      const bytes = canonicalJsonBytes(document);
      const object = await putVerifiedImmutable(
        env.REPORT_SNAPSHOTS,
        "report-snapshots",
        "json",
        bytes,
        "application/json; charset=utf-8",
      );
      if (!equalBytes(bytes, canonicalJsonBytes(document))) {
        throw new Error("Global suppression serialization drift");
      }
      reportObjects.push({
        report_date: String(reference.report_date),
        object_key: object.key,
        byte_length: object.byteLength,
        byte_sha256: object.sha256,
        parsed_document: document,
      });
    }
    const reservation = await one(
      sql,
      sql<JsonRecord[]>`
      select private.stage_global_suppression_release_v1(
        ${requestId}::uuid, ${sql.json(reportObjects)}
      ) as result
    `,
    );
    if (
      !UUID.test(String(reservation.site_release_id)) ||
      !Number.isSafeInteger(reservation.site_release_sequence) ||
      !Array.isArray(reservation.reports)
    ) {
      throw new Error("Global suppression release reservation is malformed");
    }
    const contractBase = {
      schema_version: input.schema_version,
      taxonomy_version: input.taxonomy_version,
      structured_cutover_date: input.structured_cutover_date,
      source_contract_version: input.source_contract_version,
      serializer_version: input.serializer_version,
      search_contract_version: input.search_contract_version,
      no_report_days: input.no_report_days,
      reports: reservation.reports,
    };
    const contentRootSha256 = await sha256Hex(canonicalJsonBytes(contractBase));
    const manifestObject = await putVerifiedImmutable(
      env.SITE_MANIFESTS,
      "site-manifests",
      "json",
      canonicalJsonBytes({
        site_release_id: reservation.site_release_id,
        site_release_sequence: reservation.site_release_sequence,
        expected_predecessor_id: reservation.expected_predecessor_id,
        ...contractBase,
        content_root_sha256: contentRootSha256,
      }),
      "application/json; charset=utf-8",
    );
    const dispatchId = crypto.randomUUID();
    await one(
      sql,
      sql<JsonRecord[]>`
      select private.finalize_global_suppression_release_v1(
        ${requestId}::uuid, ${manifestObject.key}, ${manifestObject.byteLength},
        ${manifestObject.sha256}, ${contentRootSha256}, ${dispatchId}::uuid,
        ${sql.json({
          dispatch_id: dispatchId,
          site_release_id: reservation.site_release_id,
          site_release_sequence: reservation.site_release_sequence,
          expected_predecessor_id: reservation.expected_predecessor_id,
          expected_content_sha: contentRootSha256,
          code_sha: input.code_sha,
          build_environment_version: input.build_environment_version,
          mode: "production",
        })}
      ) as result
    `,
    );
    return "published";
  } catch (error) {
    if (claimed?.id) {
      const errorCode =
        databaseErrorCode(error) ||
        (error instanceof Error ? error.name : "Error");
      if (isRetryableReleaseContention(error)) {
        await sql`select private.defer_global_suppression_request_v1(
          ${String(claimed.id)}::uuid, ${workerId}, ${errorCode}
        )`.catch(() => undefined);
      } else {
        await sql`select private.fail_global_suppression_request_v1(
          ${String(claimed.id)}::uuid, ${workerId}, ${errorCode}
        )`.catch(() => undefined);
      }
    }
    throw error;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

export default {
  scheduled(
    _controller: ScheduledController,
    env: Env,
    context: ExecutionContext,
  ): void {
    context.waitUntil(
      processGlobalSuppression(env)
        .then((result) =>
          result === "empty" ? processEditorialPublish(env) : result,
        )
        .catch((error) => {
          console.error("[ContentEditorial] publish failed", {
            errorType: error instanceof Error ? error.name : "Error",
          });
        }),
    );
  },
  fetch(): Response {
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  },
};
