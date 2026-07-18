import { openContentDatabase, type ContentSql } from "../shared/db";
import {
  attest,
  csrfSessionResponse,
  idempotencyKey,
  readAdminBody,
  requireAccess,
  requireMutationGuards,
  type AdminEnv,
} from "../shared/admin";
import { contentConsoleResponse } from "../shared/console";

type Env = AdminEnv & {
  CONTENT_DB?: { connectionString?: string };
  CONTENT_DATABASE_URL?: string;
  PRODUCTION_BROKER: Fetcher;
  CONTROL_BROKER_SECRET: string;
};
type JsonRecord = Record<string, unknown>;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function result(
  query: PromiseLike<readonly JsonRecord[]>,
): Promise<unknown> {
  const rows = await query;
  return rows[0]?.result ?? null;
}

async function authorizedRead(
  request: Request,
  env: Env,
  sql: ContentSql,
  route: string,
  arguments_: JsonRecord,
): Promise<Response> {
  const context = { route, arguments: arguments_ };
  const proof = await attest(
    request,
    env,
    "content-control-read",
    "admin.read",
    context,
  );
  try {
    return json(
      await result(sql<JsonRecord[]>`
      select private.read_admin_v1(
        'content-control-read', ${route}, ${sql.json(arguments_)},
        ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `),
    );
  } catch (error) {
    if ((error as { code?: string })?.code === "42501") {
      throw new Error("forbidden");
    }
    throw error;
  }
}

async function readRoute(
  request: Request,
  env: Env,
  url: URL,
  sql: ContentSql,
): Promise<Response | null> {
  if (url.pathname === "/v1/dashboard") {
    return authorizedRead(request, env, sql, url.pathname, {});
  }
  if (url.pathname === "/v1/releases") {
    return authorizedRead(request, env, sql, url.pathname, { limit: 100 });
  }
  if (url.pathname === "/v1/audit") {
    const before = url.searchParams.get("before");
    const id = before === null ? null : Number(before);
    if (id !== null && !Number.isSafeInteger(id))
      throw new Error("invalid_request");
    return authorizedRead(request, env, sql, url.pathname, {
      before: id,
      limit: 200,
    });
  }
  if (url.pathname === "/v1/operations") {
    const limit = Number(url.searchParams.get("limit") || "50");
    if (!Number.isSafeInteger(limit)) throw new Error("invalid_request");
    return authorizedRead(request, env, sql, url.pathname, { limit });
  }
  if (url.pathname === "/v1/operations/verifier-diff") {
    const releaseId = url.searchParams.get("site_release_id");
    if (releaseId && !UUID.test(releaseId)) throw new Error("invalid_request");
    return authorizedRead(request, env, sql, url.pathname, {
      site_release_id: releaseId,
    });
  }
  return null;
}

async function mutation(
  request: Request,
  env: Env,
  sql: ContentSql,
  url: URL,
): Promise<Response | null> {
  requireMutationGuards(request, env);
  const body = await readAdminBody(request);
  const key = idempotencyKey(request);
  const publishMatch = /^\/v1\/drafts\/([0-9a-f-]{36})\/publish$/i.exec(
    url.pathname,
  );
  if (publishMatch) {
    if (
      !UUID.test(publishMatch[1]) ||
      !UUID.test(String(body.preview_build_id)) ||
      !Number.isSafeInteger(body.expected_row_version) ||
      typeof body.reason !== "string"
    ) {
      throw new Error("invalid_request");
    }
    const proof = await attest(
      request,
      env,
      "content-control",
      "draft.publish",
      body,
    );
    return json(
      await result(sql<JsonRecord[]>`
      select private.request_editorial_publish_v1(
        ${publishMatch[1]}::uuid, ${String(body.preview_build_id)}::uuid,
        ${Number(body.expected_row_version)}, ${String(body.reason)}, ${key}::uuid,
        ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `),
      202,
    );
  }
  if (url.pathname === "/v1/settings") {
    if (
      typeof body.setting_key !== "string" ||
      typeof body.enabled !== "boolean" ||
      !Number.isSafeInteger(body.expected_row_version) ||
      typeof body.reason !== "string" ||
      typeof body.typed_confirmation !== "string"
    )
      throw new Error("invalid_request");
    const proof = await attest(
      request,
      env,
      "content-control",
      "settings.update",
      body,
    );
    return json(
      await result(sql<JsonRecord[]>`
      select private.update_content_setting_v1(
        ${body.setting_key}, ${body.enabled}, ${Number(body.expected_row_version)},
        ${body.reason}, ${body.typed_confirmation}, ${key}::uuid,
        ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `),
    );
  }
  if (url.pathname === "/v1/roles") {
    if (
      typeof body.principal_sub !== "string" ||
      typeof body.role !== "string" ||
      typeof body.principal_status !== "string" ||
      typeof body.reason !== "string" ||
      typeof body.typed_confirmation !== "string"
    )
      throw new Error("invalid_request");
    const proof = await attest(
      request,
      env,
      "content-control",
      "roles.update",
      body,
    );
    return json(
      await result(sql<JsonRecord[]>`
      select private.upsert_admin_role_v1(
        ${body.principal_sub}, ${body.display_email ? String(body.display_email) : null},
        ${body.principal_status}, ${body.role},
        ${body.valid_until ? String(body.valid_until) : null}::timestamptz,
        ${body.reason}, ${body.typed_confirmation}, ${key}::uuid,
        ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `),
    );
  }
  if (url.pathname === "/v1/suppressions") {
    if (
      typeof body.item_id !== "string" ||
      typeof body.reason !== "string" ||
      typeof body.typed_confirmation !== "string"
    )
      throw new Error("invalid_request");
    const proof = await attest(
      request,
      env,
      "content-control",
      "global.suppress",
      body,
    );
    return json(
      await result(sql<JsonRecord[]>`
      select private.global_suppress_item_v1(
        ${body.item_id}, ${body.reason}, ${body.typed_confirmation}, ${key}::uuid,
        ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `),
    );
  }
  if (url.pathname === "/v1/rollback") {
    if (
      !UUID.test(String(body.target_site_release_id)) ||
      !Number.isSafeInteger(body.expected_pointer_generation) ||
      typeof body.reason !== "string" ||
      body.typed_confirmation !==
        `ROLLBACK ${String(body.target_site_release_id)}`
    ) {
      throw new Error("invalid_request");
    }
    const proof = await attest(
      request,
      env,
      "content-control",
      "production.rollback",
      body,
    );
    const authorization = (await result(sql<JsonRecord[]>`
      select private.authorize_production_rollback_v1(
        ${String(body.target_site_release_id)}::uuid, ${Number(body.expected_pointer_generation)},
        ${`control:${key}`}, ${String(body.reason)}, ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `)) as JsonRecord;
    const broker = await env.PRODUCTION_BROKER.fetch(
      "https://broker.internal/v1/rollback",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Content-Control-Secret": env.CONTROL_BROKER_SECRET,
        },
        body: JSON.stringify({
          target_site_release_id: body.target_site_release_id,
          fencing_token: authorization.fencing_token,
          expected_pointer_generation:
            authorization.expected_pointer_generation,
        }),
      },
    );
    return new Response(broker.body, {
      status: broker.status,
      headers: broker.headers,
    });
  }
  if (url.pathname === "/v1/reconcile") {
    if (
      typeof body.reason !== "string" ||
      body.typed_confirmation !== "RECONCILE PRODUCTION"
    ) {
      throw new Error("invalid_request");
    }
    const proof = await attest(
      request,
      env,
      "content-control",
      "production.reconcile",
      body,
    );
    await result(sql<JsonRecord[]>`
      select private.authorize_production_reconcile_v1(
        ${body.reason}, ${body.typed_confirmation}, ${key}::uuid,
        ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `);
    const broker = await env.PRODUCTION_BROKER.fetch(
      "https://broker.internal/v1/reconcile",
      {
        method: "POST",
        headers: { "X-Content-Control-Secret": env.CONTROL_BROKER_SECRET },
      },
    );
    return new Response(broker.body, {
      status: broker.status,
      headers: broker.headers,
    });
  }
  if (url.pathname === "/v1/operations/retry") {
    if (
      !UUID.test(String(body.outbox_id)) ||
      typeof body.reason !== "string" ||
      body.typed_confirmation !== `RETRY ${String(body.outbox_id)}`
    ) {
      throw new Error("invalid_request");
    }
    const proof = await attest(
      request,
      env,
      "content-control",
      "operations.retry",
      body,
    );
    return json(
      await result(sql<JsonRecord[]>`
      select private.retry_content_outbox_v1(
        ${String(body.outbox_id)}::uuid, ${body.reason}, ${body.typed_confirmation},
        ${key}::uuid, ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `),
      202,
    );
  }
  if (url.pathname === "/v1/operations/rebuild") {
    if (
      !UUID.test(String(body.site_release_id)) ||
      typeof body.reason !== "string" ||
      body.typed_confirmation !== `REBUILD ${String(body.site_release_id)}`
    ) {
      throw new Error("invalid_request");
    }
    const proof = await attest(
      request,
      env,
      "content-control",
      "operations.rebuild",
      body,
    );
    return json(
      await result(sql<JsonRecord[]>`
      select private.rebuild_content_release_v1(
        ${String(body.site_release_id)}::uuid, ${body.reason}, ${body.typed_confirmation},
        ${key}::uuid, ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `),
      202,
    );
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      await requireAccess(request, env);
    } catch {
      return json({ error: "unauthorized" }, 401);
    }
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return contentConsoleResponse("control");
    }
    if (request.method === "GET" && url.pathname === "/v1/session") {
      return csrfSessionResponse();
    }
    const sql = openContentDatabase(env, "content-control-plane");
    try {
      const response =
        request.method === "GET"
          ? await readRoute(request, env, url, sql)
          : request.method === "POST"
            ? await mutation(request, env, sql, url)
            : json({ error: "method_not_allowed" }, 405);
      return response || json({ error: "not_found" }, 404);
    } catch (error) {
      const code =
        error instanceof Error ? error.message : "service_unavailable";
      if (
        [
          "invalid_request",
          "invalid_idempotency_key",
          "invalid_origin",
          "csrf_rejected",
        ].includes(code)
      ) {
        return json({ error: code }, 400);
      }
      if (code === "step_up_required") return json({ error: code }, 403);
      if (code === "forbidden") return json({ error: code }, 403);
      console.error("[ContentControl] request failed", {
        errorType: error instanceof Error ? error.name : "Error",
      });
      return json({ error: "service_unavailable" }, 503);
    } finally {
      await sql.end({ timeout: 2 });
    }
  },
};
