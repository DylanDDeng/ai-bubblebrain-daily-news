interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export interface CommunityEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  COMMENTS_WRITE_ENABLED: string;
  ALLOWED_ORIGINS: string;
  COMMUNITY_RATE_LIMITER: RateLimitBinding;
}

interface AuthUser {
  id: string;
}

interface CreateBody {
  threadId?: unknown;
  type?: unknown;
  content?: unknown;
  turnstileToken?: unknown;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const THREAD_PATTERN = /^page:\/[^\s]+\/$/;
const ROOT_TYPES = new Set(["question", "repro", "suggestion"]);

function json(body: unknown, status = 200, origin?: string): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function allowedOrigin(request: Request, env: CommunityEnv): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const allowed = new Set(
    env.ALLOWED_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return allowed.has(origin) ? origin : null;
}

function clientAddress(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

async function readBody(request: Request): Promise<CreateBody> {
  const length = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(length) && length > 12_000)
    throw new Error("Request body is too large");
  const value: unknown = await request.json();
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid JSON body");
  return value as CreateBody;
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get("Authorization");
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.length > 20 ? token : null;
}

async function authenticate(
  request: Request,
  env: CommunityEnv,
): Promise<AuthUser | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  const user = (await response.json()) as Partial<AuthUser>;
  return typeof user.id === "string" && UUID_PATTERN.test(user.id)
    ? { id: user.id }
    : null;
}

async function verifyTurnstile(
  token: unknown,
  request: Request,
  env: CommunityEnv,
): Promise<boolean> {
  if (typeof token !== "string" || token.length < 10 || token.length > 2048)
    return false;
  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  form.set("remoteip", clientAddress(request));
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: form,
    },
  );
  if (!response.ok) return false;
  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}

async function supabaseRpc(
  env: CommunityEnv,
  name: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(
      detail?.message ?? `Database request failed (${response.status})`,
    );
  }
  if (response.status === 204) return null;
  return response.json();
}

async function loadComment(env: CommunityEnv, id: string): Promise<unknown> {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/page_comments?id=eq.${encodeURIComponent(id)}&select=*`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!response.ok) throw new Error("Created comment could not be loaded");
  const rows = (await response.json()) as unknown[];
  if (rows.length !== 1) throw new Error("Created comment is not visible");
  return rows[0];
}

function publicError(error: unknown): { status: number; message: string } {
  const message = error instanceof Error ? error.message : "Request failed";
  if (message === "Comment writing is disabled")
    return { status: 503, message };
  if (message.includes("rate limit"))
    return { status: 429, message: "Please wait before posting again" };
  if (message.includes("not owned")) return { status: 403, message };
  if (
    message.includes("Invalid") ||
    message.includes("must") ||
    message.includes("cannot") ||
    message.includes("Only") ||
    message.includes("does not exist")
  ) {
    return { status: 400, message };
  }
  return {
    status: 502,
    message: "Community service is temporarily unavailable",
  };
}

async function handleMutation(
  request: Request,
  env: CommunityEnv,
  origin: string,
): Promise<Response> {
  if (env.COMMENTS_WRITE_ENABLED !== "true")
    return json({ error: "Comment writing is disabled" }, 503, origin);
  const user = await authenticate(request, env);
  if (!user) return json({ error: "Authentication required" }, 401, origin);
  const limited = await env.COMMUNITY_RATE_LIMITER.limit({
    key: `${user.id}:${clientAddress(request)}`,
  });
  if (!limited.success)
    return json({ error: "Please wait before posting again" }, 429, origin);

  try {
    const body = await readBody(request);
    if (!(await verifyTurnstile(body.turnstileToken, request, env))) {
      return json({ error: "Human verification failed" }, 403, origin);
    }

    const url = new URL(request.url);
    const replyMatch = url.pathname.match(
      /^\/comments\/([0-9a-f-]+)\/replies$/i,
    );
    if (
      request.method === "POST" &&
      (url.pathname === "/comments" || replyMatch)
    ) {
      if (
        typeof body.threadId !== "string" ||
        !THREAD_PATTERN.test(body.threadId) ||
        body.threadId.length > 512
      ) {
        return json({ error: "Invalid comment thread" }, 400, origin);
      }
      if (
        typeof body.content !== "string" ||
        body.content !== body.content.trim() ||
        body.content.length < 1 ||
        body.content.length > 4000
      ) {
        return json(
          { error: "Comment must contain 1 to 4000 trimmed characters" },
          400,
          origin,
        );
      }
      const parentId = replyMatch?.[1] ?? null;
      if (parentId && !UUID_PATTERN.test(parentId))
        return json({ error: "Invalid parent comment" }, 400, origin);
      const type = parentId ? "reply" : body.type;
      if (!parentId && (typeof type !== "string" || !ROOT_TYPES.has(type))) {
        return json({ error: "Invalid comment type" }, 400, origin);
      }
      const id = await supabaseRpc(env, "community_create_comment", {
        p_actor_id: user.id,
        p_thread_id: body.threadId,
        p_parent_id: parentId,
        p_type: type,
        p_content: body.content,
      });
      if (typeof id !== "string" || !UUID_PATTERN.test(id))
        throw new Error("Database returned an invalid comment ID");
      return json({ comment: await loadComment(env, id) }, 201, origin);
    }

    const deleteMatch = url.pathname.match(/^\/comments\/([0-9a-f-]+)$/i);
    if (
      request.method === "DELETE" &&
      deleteMatch &&
      UUID_PATTERN.test(deleteMatch[1])
    ) {
      await supabaseRpc(env, "community_delete_comment", {
        p_actor_id: user.id,
        p_comment_id: deleteMatch[1],
      });
      return new Response(null, {
        status: 204,
        headers: {
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          Vary: "Origin",
        },
      });
    }
    return json({ error: "Not found" }, 404, origin);
  } catch (error) {
    const result = publicError(error);
    return json({ error: result.message }, result.status, origin);
  }
}

export default {
  async fetch(request: Request, env: CommunityEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const origin = allowedOrigin(request, env) ?? undefined;
      return json(
        { ok: true, writesEnabled: env.COMMENTS_WRITE_ENABLED === "true" },
        200,
        origin,
      );
    }

    const origin = allowedOrigin(request, env);
    if (!origin) return json({ error: "Origin is not allowed" }, 403);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers":
            "Authorization, Content-Type, X-Turnstile-Token",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        },
      });
    }
    return handleMutation(request, env, origin);
  },
};
