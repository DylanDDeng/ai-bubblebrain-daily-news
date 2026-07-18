import { sha256Hex } from "../shared/canonical";
import { openContentDatabase, type ContentSql } from "../shared/db";

type Env = {
  CONTENT_DB?: { connectionString?: string };
  CONTENT_DATABASE_URL?: string;
  GITHUB_TOKEN: string;
  GITHUB_REPOSITORY: string;
  GITHUB_WORKFLOW_REF?: string;
  DEPLOY_CALLBACK_SECRET: string;
  PREVIEW_DISPATCH_SECRET: string;
  CONTENT_BUILD_API_SECRET: string;
  RECOVERY_MONITOR_SECRET: string;
  REPORT_SNAPSHOTS?: R2BucketLike;
  SITE_MANIFESTS?: R2BucketLike;
};

type R2BucketLike = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CALLBACK_EVENTS = new Set([
  "building",
  "artifact_registered",
  "preview_verified",
  "preview_failed",
  "production_deployed",
  "edge_verified",
  "rollback_deployed",
  "failed",
  "editorial_preview_verified",
  "editorial_preview_failed",
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function hmacHex(secret: string, body: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, body);
  return Array.from(new Uint8Array(signature), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function timingSafeHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right))
    return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function timingSafeText(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function verifiedPrivateObject(
  bucket: R2BucketLike | undefined,
  descriptor: Record<string, unknown>,
  keyField: string,
  hashField: string,
  lengthField: string,
): Promise<Response> {
  if (!bucket) throw new Error("Immutable object binding is unavailable");
  const key = descriptor[keyField];
  const expectedHash = descriptor[hashField];
  const expectedLength = Number(descriptor[lengthField]);
  if (
    typeof key !== "string" ||
    typeof expectedHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(expectedHash) ||
    !Number.isSafeInteger(expectedLength) ||
    expectedLength <= 0
  ) {
    throw new Error("Malformed immutable object descriptor");
  }
  const object = await bucket.get(key);
  if (!object) throw new Error("Immutable object is missing");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (
    bytes.byteLength !== expectedLength ||
    (await sha256Hex(bytes)) !== expectedHash
  ) {
    throw new Error("Immutable object verification failed");
  }
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      ETag: `"sha256-${expectedHash}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function githubDispatch(
  env: Env,
  workflow: string,
  inputs: Record<string, unknown>,
): Promise<void> {
  const repository = env.GITHUB_REPOSITORY?.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
    throw new Error("Invalid GitHub repository");
  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "bubble-content-deployer",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: env.GITHUB_WORKFLOW_REF || "main",
        inputs: Object.fromEntries(
          Object.entries(inputs).map(([key, value]) => [key, String(value)]),
        ),
      }),
    },
  );
  if (response.status !== 204)
    throw new Error(`GitHub dispatch rejected with ${response.status}`);
}

async function recordEvent(
  sql: ContentSql,
  releaseId: string,
  dispatchId: string,
  eventType: string,
  evidence: Record<string, unknown>,
): Promise<void> {
  await sql`
    select private.record_deployment_event_v1(
      ${releaseId}::uuid, ${dispatchId}::uuid, ${eventType}, ${sql.json(evidence)}
    )
  `;
}

export function validateDispatchPayload(
  payload: unknown,
): asserts payload is Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("Invalid dispatch payload");
  const value = payload as Record<string, unknown>;
  if (
    !UUID.test(String(value.dispatch_id)) ||
    !UUID.test(String(value.site_release_id)) ||
    !Number.isSafeInteger(value.site_release_sequence) ||
    (value.expected_predecessor_id !== null &&
      !UUID.test(String(value.expected_predecessor_id))) ||
    !/^[a-f0-9]{64}$/.test(String(value.expected_content_sha)) ||
    !/^[a-f0-9]{40}$/.test(String(value.code_sha)) ||
    typeof value.build_environment_version !== "string" ||
    !["shadow", "production"].includes(String(value.mode))
  ) {
    throw new Error("Invalid dispatch payload");
  }
}

type DispatcherDependencies = {
  openDatabase?: typeof openContentDatabase;
  dispatch?: typeof githubDispatch;
  randomUUID?: () => string;
};

export async function dispatchOne(
  env: Env,
  dependencies: DispatcherDependencies = {},
): Promise<"empty" | "dispatched"> {
  const sql = (dependencies.openDatabase || openContentDatabase)(
    env,
    "content-deployer-dispatcher",
  );
  let claimed: Record<string, unknown> | null = null;
  try {
    const workerId = dependencies.randomUUID
      ? dependencies.randomUUID()
      : crypto.randomUUID();
    const rows = await sql<Record<string, unknown>[]>`
			select private.claim_content_outbox_v1(${workerId}, 600) as result
    `;
    claimed = rows[0]?.result as Record<string, unknown> | null;
    if (!claimed) return "empty";
    const payload = claimed.payload;
    validateDispatchPayload(payload);
    const dispatchPayload = payload as Record<string, unknown>;
    await (dependencies.dispatch || githubDispatch)(
      env,
      "content-release.yml",
      Object.fromEntries(
        Object.entries(dispatchPayload).map(([key, value]) => [
          key,
          value === null ? "" : value,
        ]),
      ),
    );
    await recordEvent(
      sql,
      String(claimed.site_release_id),
      String(claimed.dispatch_id),
      "building",
      { dispatch_accepted_at: new Date().toISOString() },
    );
    return "dispatched";
  } catch (error) {
    if (claimed) {
      await recordEvent(
        sql,
        String(claimed.site_release_id),
        String(claimed.dispatch_id),
        "failed",
        { error: error instanceof Error ? error.name : "Error" },
      );
    }
    throw error;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

export function outboxAlertReasons(state: Record<string, unknown>): string[] {
  const reasons: string[] = [];
  const deadLetters = Number(state.dead_letter_count);
  const staleQueued = Number(state.stale_queued_count);
  if (Number.isSafeInteger(deadLetters) && deadLetters > 0) {
    reasons.push(`dead_letter_count:${deadLetters}`);
  }
  if (Number.isSafeInteger(staleQueued) && staleQueued > 0) {
    reasons.push(`stale_queued_count:${staleQueued}`);
  }
  return reasons;
}

export async function checkOperationalAlerts(env: Env): Promise<void> {
  const sql = openContentDatabase(env, "content-deployer-alerts");
  try {
    const rows = await sql<Record<string, unknown>[]>`
			select private.get_deployer_alert_state_v1() as result
		`;
    const state = rows[0]?.result as Record<string, unknown> | undefined;
    if (!state) throw new Error("Outbox alert state is unavailable");
    const reasons = outboxAlertReasons(state);
    if (reasons.length > 0) {
      console.error("[ContentDeployer] operational alert", {
        alert: "content_outbox_unhealthy",
        reasons,
        oldestActionableAt: state.oldest_actionable_at || null,
      });
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
}

export async function runRetentionMaintenance(
  env: Env,
  dependencies: {
    openDatabase?: typeof openContentDatabase;
  } = {},
): Promise<Record<string, unknown>> {
  const sql = (dependencies.openDatabase || openContentDatabase)(
    env,
    "content-deployer-retention",
  );
  try {
    const rows = await sql<Record<string, unknown>[]>`
			select private.prune_content_operational_history_v1() as result
		`;
    const result = rows[0]?.result;
    if (!result || typeof result !== "object")
      throw new Error("Retention result is unavailable");
    return result as Record<string, unknown>;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

export async function handleDeploymentCallback(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);
  const declared = Number(request.headers.get("Content-Length") || "0");
  if (declared > 64 * 1024) return json({ error: "payload_too_large" }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > 64 * 1024)
    return json({ error: "payload_too_large" }, 413);
  const supplied = request.headers.get("X-Content-Signature") || "";
  const expected = await hmacHex(env.DEPLOY_CALLBACK_SECRET, bytes);
  if (!timingSafeHex(supplied, expected))
    return json({ error: "unauthorized" }, 401);
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const releaseId = String(payload.site_release_id || "");
  const dispatchId = String(payload.dispatch_id || "");
  const eventType = String(payload.event_type || "");
  if (
    !UUID.test(releaseId) ||
    !UUID.test(dispatchId) ||
    !CALLBACK_EVENTS.has(eventType) ||
    !payload.evidence ||
    typeof payload.evidence !== "object" ||
    Array.isArray(payload.evidence)
  ) {
    return json({ error: "invalid_request" }, 400);
  }
  const sql = openContentDatabase(env, "content-deployer-callback");
  try {
    if (eventType === "editorial_preview_verified") {
      const evidence = payload.evidence as Record<string, unknown>;
      await sql`
        select private.register_preview_build_v1(
          ${String(evidence.draft_id)}::uuid, ${String(evidence.preview_sha256)},
          ${String(evidence.artifact_sha256)}, ${String(evidence.pages_preview_url)}, ${sql.json(evidence)}
        )
      `;
      return json({ ok: true });
    }
    if (eventType === "editorial_preview_failed") {
      const evidence = payload.evidence as Record<string, unknown>;
      await sql`
        select private.fail_preview_build_v1(
          ${String(evidence.draft_id)}::uuid, ${String(evidence.preview_sha256)},
          ${String(evidence.error_code || "workflow_failed")}
        )
      `;
      return json({ ok: true });
    }
    if (eventType === "artifact_registered") {
      const evidence = payload.evidence as Record<string, unknown>;
      await sql`
        select private.register_release_artifact_v1(
          ${releaseId}::uuid, ${String(evidence.object_key)}, ${Number(evidence.byte_length)},
          ${String(evidence.artifact_sha256)}, ${String(evidence.artifact_fingerprint_sha256)},
          ${String(evidence.hash_algorithm)},
          ${String(evidence.code_sha)}, ${String(evidence.build_environment_version)}
        )
      `;
    }
    await recordEvent(
      sql,
      releaseId,
      dispatchId,
      eventType,
      payload.evidence as Record<string, unknown>,
    );
    return json({ ok: true });
  } catch {
    return json({ error: "service_unavailable" }, 503);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

type RecoveryHealthDependencies = {
  openDatabase?: typeof openContentDatabase;
};

export async function handleRecoveryHealthCallback(
  request: Request,
  env: Env,
  dependencies: RecoveryHealthDependencies = {},
): Promise<Response> {
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);
  const declared = Number(request.headers.get("Content-Length") || "0");
  if (declared > 8 * 1024) return json({ error: "payload_too_large" }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > 8 * 1024)
    return json({ error: "payload_too_large" }, 413);
  const supplied = request.headers.get("X-Content-Signature") || "";
  const expected = await hmacHex(env.RECOVERY_MONITOR_SECRET, bytes);
  if (!timingSafeHex(supplied, expected))
    return json({ error: "unauthorized" }, 401);
  let evidence: Record<string, unknown>;
  try {
    evidence = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  if (
    evidence.healthy !== true ||
    evidence.pitr_enabled !== true ||
    !Number.isSafeInteger(evidence.latest_backup_age_seconds) ||
    evidence.maximum_backup_age_seconds !== 3600 ||
    typeof evidence.checked_at !== "string" ||
    typeof evidence.latest_backup_at !== "string" ||
    !/^database\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]{64}\.dump\.age$/.test(
      String(evidence.latest_backup_object_key || ""),
    )
  ) {
    return json({ error: "invalid_request" }, 400);
  }

  const sql = (dependencies.openDatabase || openContentDatabase)(
    env,
    "content-recovery-health",
  );
  try {
    await sql`
      select private.record_recovery_health_v1(${sql.json(evidence)}) as result
    `;
    return json({ ok: true }, 202);
  } catch {
    return json({ error: "service_unavailable" }, 503);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

async function handlePreviewDispatch(
  request: Request,
  env: Env,
): Promise<Response> {
  if (
    !timingSafeText(
      request.headers.get("X-Preview-Dispatch-Secret") || "",
      env.PREVIEW_DISPATCH_SECRET,
    )
  ) {
    return json({ error: "unauthorized" }, 401);
  }
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const draftId = String(payload.draft_id || "");
  const previewSha = String(payload.preview_sha256 || "");
  if (!UUID.test(draftId) || !/^[a-f0-9]{64}$/.test(previewSha))
    return json({ error: "invalid_request" }, 400);
  const sql = openContentDatabase(env, "content-preview-dispatch");
  try {
    const rows = await sql<Record<string, unknown>[]>`
      select private.get_preview_build_input_v1(${draftId}::uuid, ${previewSha}) as result
    `;
    const input = rows[0]?.result as Record<string, unknown> | undefined;
    if (!input) throw new Error("Preview input is unavailable");
    await githubDispatch(env, "content-editorial-preview.yml", {
      dispatch_id: crypto.randomUUID(),
      draft_id: draftId,
      preview_sha256: previewSha,
      base_site_release_id: input.base_site_release_id,
      code_sha: input.code_sha,
      build_environment_version: input.build_environment_version,
    });
    return json({ ok: true }, 202);
  } catch {
    return json({ error: "service_unavailable" }, 503);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

async function handlePreviewInput(
  request: Request,
  env: Env,
  draftId: string,
  previewSha: string,
): Promise<Response> {
  const token =
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!timingSafeText(token, env.PREVIEW_DISPATCH_SECRET))
    return json({ error: "unauthorized" }, 401);
  const sql = openContentDatabase(env, "content-preview-input");
  try {
    const rows = await sql<Record<string, unknown>[]>`
      select private.get_preview_build_input_v1(${draftId}::uuid, ${previewSha}) as result
    `;
    return rows[0]?.result
      ? json(rows[0].result)
      : json({ error: "not_found" }, 404);
  } catch {
    return json({ error: "service_unavailable" }, 503);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

type BuildContentDependencies = {
  callRpc?: (
    kind: "manifest" | "report",
    releaseId: string,
    reportDate?: string,
  ) => Promise<Record<string, unknown> | null>;
};

export async function handleBuildContentRequest(
  request: Request,
  env: Env,
  dependencies: BuildContentDependencies = {},
): Promise<Response> {
  if (request.method !== "GET")
    return json({ error: "method_not_allowed" }, 405);
  const token =
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!timingSafeText(token, env.CONTENT_BUILD_API_SECRET || ""))
    return json({ error: "unauthorized" }, 401);

  const path = new URL(request.url).pathname;
  const manifest = /^\/internal\/build\/releases\/([^/]+)\/manifest$/.exec(
    path,
  );
  const report =
    /^\/internal\/build\/releases\/([^/]+)\/reports\/(\d{4}-\d{2}-\d{2})$/.exec(
      path,
    );
  const releaseId = manifest?.[1] || report?.[1] || "";
  if (!UUID.test(releaseId) || (report && !DATE.test(report[2])))
    return json({ error: "invalid_request" }, 400);
  if (!manifest && !report) return json({ error: "not_found" }, 404);

  let sql: ContentSql | null = null;
  try {
    let descriptor: Record<string, unknown> | null;
    if (dependencies.callRpc) {
      descriptor = await dependencies.callRpc(
        manifest ? "manifest" : "report",
        releaseId,
        report?.[2],
      );
    } else {
      sql = openContentDatabase(env, "content-build-input");
      const rows = manifest
        ? await sql<Record<string, unknown>[]>`
            select private.get_build_release_manifest_v1(${releaseId}::uuid) as result
          `
        : await sql<Record<string, unknown>[]>`
            select private.get_build_release_report_v1(${releaseId}::uuid, ${report![2]}::date) as result
          `;
      descriptor = (rows[0]?.result as Record<string, unknown> | null) || null;
    }
    if (!descriptor) return json({ error: "not_found" }, 404);
    return manifest
      ? verifiedPrivateObject(
          env.SITE_MANIFESTS,
          descriptor,
          "manifest_object_key",
          "manifest_sha256",
          "manifest_byte_length",
        )
      : verifiedPrivateObject(
          env.REPORT_SNAPSHOTS,
          descriptor,
          "object_key",
          "byte_sha256",
          "byte_length",
        );
  } catch {
    return json({ error: "service_unavailable" }, 503);
  } finally {
    if (sql) await sql.end({ timeout: 2 });
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/callbacks/github")
      return handleDeploymentCallback(request, env);
    if (url.pathname === "/internal/recovery-health")
      return handleRecoveryHealthCallback(request, env);
    if (
      url.pathname === "/internal/preview-dispatch" &&
      request.method === "POST"
    ) {
      return handlePreviewDispatch(request, env);
    }
    const match =
      /^\/internal\/preview-input\/([0-9a-f-]{36})\/([a-f0-9]{64})$/i.exec(
        url.pathname,
      );
    if (match && request.method === "GET")
      return handlePreviewInput(request, env, match[1], match[2]);
    if (url.pathname.startsWith("/internal/build/releases/"))
      return handleBuildContentRequest(request, env);
    return Promise.resolve(json({ error: "not_found" }, 404));
  },
  scheduled(
    _controller: ScheduledController,
    env: Env,
    context: ExecutionContext,
  ): void {
    context.waitUntil(
      (async () => {
        try {
          await dispatchOne(env);
        } catch (error) {
          console.error("[ContentDeployer] dispatch failed", {
            errorType: error instanceof Error ? error.name : "Error",
          });
        }
        try {
          await checkOperationalAlerts(env);
        } catch (error) {
          console.error("[ContentDeployer] alert check failed", {
            errorType: error instanceof Error ? error.name : "Error",
          });
        }
        try {
          await runRetentionMaintenance(env);
        } catch (error) {
          console.error("[ContentDeployer] retention maintenance failed", {
            errorType: error instanceof Error ? error.name : "Error",
          });
        }
      })(),
    );
  },
};
