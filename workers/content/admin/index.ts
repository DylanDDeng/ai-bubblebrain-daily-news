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
  DEPLOYER: Fetcher;
  PREVIEW_DISPATCH_SECRET: string;
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

function int(value: string | null, fallback: number): number {
  const parsed = value === null ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("invalid_request");
  return parsed;
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
    "content-routine",
    "admin.read",
    context,
  );
  try {
    return json(
      await result(sql<JsonRecord[]>`
      select private.read_admin_v1(
        'content-routine', ${route}, ${sql.json(arguments_)},
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

async function authorizedHighlightRead(
  request: Request,
  env: Env,
  sql: ContentSql,
  arguments_: JsonRecord,
): Promise<Response> {
  const context = { route: "/v1/highlights", arguments: arguments_ };
  const proof = await attest(
    request,
    env,
    "content-routine",
    "admin.read",
    context,
  );
  try {
    return json(
      await result(sql<JsonRecord[]>`
      select private.read_admin_highlights_v1(
        ${sql.json(arguments_)}, ${sql.json(proof.assertion)}, ${proof.bodySha256}
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

async function authorizedLibraryRead(
  request: Request,
  env: Env,
  sql: ContentSql,
  route: "/v1/prompts" | "/v1/model-evals",
  arguments_: JsonRecord,
): Promise<Response> {
  const context = { route, arguments: arguments_ };
  const proof = await attest(
    request,
    env,
    "content-routine",
    "admin.read",
    context,
  );
  try {
    return json(
      await result(sql<JsonRecord[]>`
      select private.read_admin_library_v1(
        ${sql.json(arguments_)}, ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `),
    );
  } catch (error) {
    if ((error as { code?: string })?.code === "42501")
      throw new Error("forbidden");
    throw error;
  }
}

function validHttpsUrl(value: unknown, optional = false): boolean {
  if ((value === null || value === "") && optional) return true;
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validIsoDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
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
  if (url.pathname === "/v1/reports") {
    const before = url.searchParams.get("before");
    if (before && !/^\d{4}-\d{2}-\d{2}$/.test(before))
      throw new Error("invalid_request");
    return authorizedRead(request, env, sql, url.pathname, {
      before,
      limit: int(url.searchParams.get("limit"), 50),
    });
  }
  if (url.pathname === "/v1/releases") {
    return authorizedRead(request, env, sql, url.pathname, {
      limit: int(url.searchParams.get("limit"), 50),
    });
  }
  if (url.pathname === "/v1/content") {
    const after = url.searchParams.get("after");
    if (after && !/^n_[a-f0-9]{64}$/.test(after))
      throw new Error("invalid_request");
    return authorizedRead(request, env, sql, url.pathname, {
      after,
      limit: int(url.searchParams.get("limit"), 50),
    });
  }
  if (url.pathname === "/v1/highlights") {
    const locale = url.searchParams.get("locale") || "zh-CN";
    const limit = int(url.searchParams.get("limit"), 100);
    if (!["zh-CN", "en"].includes(locale) || limit < 1 || limit > 200)
      throw new Error("invalid_request");
    return authorizedHighlightRead(request, env, sql, { locale, limit });
  }
  if (url.pathname === "/v1/prompts") {
    const locale = url.searchParams.get("locale") || "zh-CN";
    const limit = int(url.searchParams.get("limit"), 100);
    if (!["zh-CN", "en"].includes(locale) || limit < 1 || limit > 200)
      throw new Error("invalid_request");
    return authorizedLibraryRead(request, env, sql, "/v1/prompts", {
      kind: "prompt",
      locale,
      limit,
    });
  }
  if (url.pathname === "/v1/model-evals") {
    const locale = url.searchParams.get("locale") || "zh-CN";
    const limit = int(url.searchParams.get("limit"), 100);
    if (!["zh-CN", "en"].includes(locale) || limit < 1 || limit > 200)
      throw new Error("invalid_request");
    return authorizedLibraryRead(request, env, sql, "/v1/model-evals", {
      kind: "model_eval",
      locale,
      limit,
    });
  }
  if (url.pathname === "/v1/drafts") {
    return authorizedRead(request, env, sql, url.pathname, {
      limit: int(url.searchParams.get("limit"), 50),
    });
  }
  if (url.pathname === "/v1/operations") {
    return authorizedRead(request, env, sql, url.pathname, {
      limit: int(url.searchParams.get("limit"), 50),
    });
  }
  if (url.pathname === "/v1/operations/verifier-diff") {
    const releaseId = url.searchParams.get("site_release_id");
    if (releaseId && !UUID.test(releaseId)) throw new Error("invalid_request");
    return authorizedRead(request, env, sql, url.pathname, {
      site_release_id: releaseId,
    });
  }
  if (url.pathname === "/v1/audit") {
    const before = url.searchParams.get("before");
    return authorizedRead(request, env, sql, url.pathname, {
      before: before ? int(before, 0) : null,
      limit: int(url.searchParams.get("limit"), 100),
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
  let match: RegExpExecArray | null;
  if (url.pathname === "/v1/highlights") {
    if (
      !["zh-CN", "en"].includes(String(body.locale)) ||
      typeof body.title !== "string" ||
      body.title.trim().length < 1 ||
      body.title.trim().length > 300 ||
      (body.description !== undefined &&
        typeof body.description !== "string") ||
      !validHttpsUrl(body.source_url) ||
      !validHttpsUrl(body.cover_url, true) ||
      !Array.isArray(body.tags) ||
      body.tags.length > 20 ||
      body.tags.some(
        (tag) => typeof tag !== "string" || !tag.trim() || tag.length > 64,
      ) ||
      !["draft", "published"].includes(String(body.status)) ||
      typeof body.reason !== "string" ||
      body.reason.trim().length < 4
    ) {
      throw new Error("invalid_request");
    }
    const proof = await attest(
      request,
      env,
      "content-routine",
      "highlight.create",
      body,
    );
    return json(
      await result(sql<JsonRecord[]>`
      select private.create_highlight_v1(
        ${String(body.locale)}, ${body.title.trim()}, ${String(body.description || "")},
        ${String(body.source_url)}, ${body.cover_url ? String(body.cover_url) : null},
        ${body.tags as string[]}, ${String(body.status)}, ${body.reason.trim()},
        ${key}::uuid, ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `),
      201,
    );
  }
  if (url.pathname === "/v1/prompts") {
    if (
      !["zh-CN", "en"].includes(String(body.locale)) ||
      typeof body.slug !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,119}$/.test(body.slug) ||
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.length > 300 ||
      (body.description !== undefined &&
        typeof body.description !== "string") ||
      (body.model !== undefined && typeof body.model !== "string") ||
      typeof body.body_markdown !== "string" ||
      body.body_markdown.length < 1 ||
      body.body_markdown.length > 100000 ||
      (body.date !== null &&
        body.date !== undefined &&
        !validIsoDate(body.date)) ||
      !Array.isArray(body.tags) ||
      body.tags.length > 20 ||
      body.tags.some(
        (tag) => typeof tag !== "string" || !tag.trim() || tag.length > 64,
      ) ||
      !["draft", "published"].includes(String(body.status)) ||
      typeof body.reason !== "string" ||
      body.reason.trim().length < 4
    )
      throw new Error("invalid_request");
    const proof = await attest(
      request,
      env,
      "content-routine",
      "prompt.create",
      body,
    );
    return json(
      await result(sql<JsonRecord[]>`
      select private.create_prompt_v1(
        ${String(body.locale)}, ${body.slug}, ${body.title.trim()},
        ${String(body.description || "")}, ${String(body.model || "")},
        ${body.tags as string[]}, ${body.body_markdown},
        ${body.date ? String(body.date) : null}::date, ${String(body.status)},
        ${body.reason.trim()}, ${key}::uuid, ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `),
      201,
    );
  }
  if (url.pathname === "/v1/model-evals") {
    if (
      !["zh-CN", "en"].includes(String(body.locale)) ||
      typeof body.external_id !== "string" ||
      !body.external_id.trim() ||
      body.external_id.length > 200 ||
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 300 ||
      typeof body.company !== "string" ||
      !body.company.trim() ||
      body.company.length > 120 ||
      !validHttpsUrl(body.logo_url, true) ||
      typeof body.release_month !== "string" ||
      !/^20\d{2}-(0[1-9]|1[0-2])$/.test(body.release_month) ||
      (body.description !== undefined &&
        typeof body.description !== "string") ||
      !Array.isArray(body.tags) ||
      body.tags.length > 20 ||
      body.tags.some(
        (tag) => typeof tag !== "string" || !tag.trim() || tag.length > 64,
      ) ||
      !["draft", "published"].includes(String(body.status)) ||
      typeof body.reason !== "string" ||
      body.reason.trim().length < 4
    )
      throw new Error("invalid_request");
    const proof = await attest(
      request,
      env,
      "content-routine",
      "model_eval.create",
      body,
    );
    return json(
      await result(sql<JsonRecord[]>`
      select private.create_model_eval_v1(
        ${String(body.locale)}, ${body.external_id.trim()}, ${body.name.trim()},
        ${body.company.trim()}, ${body.logo_url ? String(body.logo_url) : null},
        ${body.release_month}, ${String(body.description || "")}, ${body.tags as string[]},
        ${String(body.status)}, ${body.reason.trim()}, ${key}::uuid,
        ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `),
      201,
    );
  }
  if (url.pathname === "/v1/drafts") {
    if (!UUID.test(String(body.base_site_release_id)))
      throw new Error("invalid_request");
    const proof = await attest(
      request,
      env,
      "content-routine",
      "draft.create",
      body,
    );
    return json(
      await result(sql<JsonRecord[]>`
      select private.create_editorial_draft_v1(
        ${String(body.base_site_release_id)}::uuid, ${key}::uuid,
        ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `),
      201,
    );
  }
  if ((match = /^\/v1\/drafts\/([0-9a-f-]{36})\/items$/i.exec(url.pathname))) {
    if (
      !UUID.test(match[1]) ||
      typeof body.item_id !== "string" ||
      !UUID.test(String(body.base_revision_id)) ||
      (body.base_override_id !== null &&
        body.base_override_id !== undefined &&
        !UUID.test(String(body.base_override_id))) ||
      !body.patch ||
      typeof body.patch !== "object" ||
      Array.isArray(body.patch) ||
      !Number.isSafeInteger(body.expected_row_version) ||
      typeof body.reason !== "string"
    ) {
      throw new Error("invalid_request");
    }
    const proof = await attest(
      request,
      env,
      "content-routine",
      "draft.update",
      body,
    );
    return json(
      await result(sql<JsonRecord[]>`
      select private.upsert_editorial_draft_item_v1(
        ${match[1]}::uuid, ${String(body.item_id)}, ${String(body.base_revision_id)}::uuid,
        ${body.base_override_id ? String(body.base_override_id) : null}::uuid,
        ${sql.json(body.patch as JsonRecord)}, ${Number(body.expected_row_version)}, ${String(body.reason)},
        ${key}::uuid, ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `),
    );
  }
  if ((match = /^\/v1\/drafts\/([0-9a-f-]{36})\/rebase$/i.exec(url.pathname))) {
    if (
      !UUID.test(match[1]) ||
      !UUID.test(String(body.new_base_site_release_id)) ||
      !Number.isSafeInteger(body.expected_row_version)
    )
      throw new Error("invalid_request");
    const proof = await attest(
      request,
      env,
      "content-routine",
      "draft.rebase",
      body,
    );
    return json(
      await result(sql<JsonRecord[]>`
      select private.rebase_editorial_draft_v1(
        ${match[1]}::uuid, ${String(body.new_base_site_release_id)}::uuid,
        ${Number(body.expected_row_version)}, ${key}::uuid,
        ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `),
    );
  }
  if (
    (match = /^\/v1\/drafts\/([0-9a-f-]{36})\/preview$/i.exec(url.pathname))
  ) {
    if (
      !UUID.test(match[1]) ||
      !Number.isSafeInteger(body.expected_row_version)
    )
      throw new Error("invalid_request");
    const proof = await attest(
      request,
      env,
      "content-routine",
      "preview.build",
      body,
    );
    const preview = (await result(sql<JsonRecord[]>`
      select private.request_preview_build_v1(
        ${match[1]}::uuid, ${Number(body.expected_row_version)}, ${key}::uuid,
        ${sql.json(proof.assertion)}, ${proof.bodySha256}
      ) as result
    `)) as JsonRecord;
    const dispatched = await env.DEPLOYER.fetch(
      "https://deployer.internal/internal/preview-dispatch",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Preview-Dispatch-Secret": env.PREVIEW_DISPATCH_SECRET,
        },
        body: JSON.stringify({
          draft_id: preview.draft_id,
          preview_sha256: preview.preview_sha256,
        }),
      },
    );
    if (!dispatched.ok) throw new Error("preview_dispatch_failed");
    return json(preview, 202);
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
      return contentConsoleResponse("routine");
    }
    if (request.method === "GET" && url.pathname === "/v1/session") {
      return csrfSessionResponse();
    }
    const sql = openContentDatabase(env, "content-routine-admin");
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
      console.error("[ContentAdmin] request failed", {
        errorType: error instanceof Error ? error.name : "Error",
      });
      return json({ error: "service_unavailable" }, 503);
    } finally {
      await sql.end({ timeout: 2 });
    }
  },
};
