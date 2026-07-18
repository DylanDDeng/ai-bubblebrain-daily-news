import { verifyAccessJwt } from "../../admin/src/index";
import { canonicalJsonBytes } from "./canonical";

export type AdminEnv = {
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  ADMIN_ALLOWED_ORIGIN: string;
  ATTESTATION: Fetcher;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSRF_COOKIE = "__Host-content_csrf";
const CSRF_MAX_AGE_SECONDS = 10 * 60;

function csrfToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function csrfSessionResponse(): Response {
  const token = csrfToken();
  return new Response(
    JSON.stringify({ csrf_token: token, expires_in: CSRF_MAX_AGE_SECONDS }),
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "application/json; charset=utf-8",
        Pragma: "no-cache",
        "Set-Cookie": `${CSRF_COOKIE}=${token}; Path=/; Max-Age=${CSRF_MAX_AGE_SECONDS}; Secure; HttpOnly; SameSite=Strict`,
      },
    },
  );
}

export async function requireAccess(
  request: Request,
  env: AdminEnv,
): Promise<string> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion")?.trim();
  if (!token) throw new Error("unauthorized");
  const claims = await verifyAccessJwt(token, env as never);
  if (!claims.sub || typeof claims.sub !== "string")
    throw new Error("unauthorized");
  return token;
}

export function requireMutationGuards(request: Request, env: AdminEnv): void {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== env.ADMIN_ALLOWED_ORIGIN)
    throw new Error("invalid_origin");
  const supplied = request.headers.get("X-CSRF-Token") || "";
  const cookie =
    request.headers
      .get("Cookie")
      ?.match(
        /(?:^|;\s*)__Host-content_csrf=([A-Za-z0-9_-]{32,128})(?:;|$)/,
      )?.[1] || "";
  if (!cookie || cookie.length !== supplied.length)
    throw new Error("csrf_rejected");
  let difference = 0;
  for (let index = 0; index < cookie.length; index += 1) {
    difference |= cookie.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  if (difference !== 0) throw new Error("csrf_rejected");
}

export async function readAdminBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("Content-Length") || "0");
  if (declared > 64 * 1024) throw new Error("payload_too_large");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > 64 * 1024) throw new Error("payload_too_large");
  const value = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid_request");
  return value as Record<string, unknown>;
}

export function idempotencyKey(request: Request): string {
  const value = request.headers.get("Idempotency-Key") || "";
  if (!UUID.test(value)) throw new Error("invalid_idempotency_key");
  return value;
}

export async function bodySha256(
  body: Record<string, unknown>,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    canonicalJsonBytes(body),
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export async function attest(
  request: Request,
  env: AdminEnv,
  audience: "content-routine" | "content-control" | "content-control-read",
  action: string,
  body: Record<string, unknown>,
): Promise<{ assertion: Record<string, unknown>; bodySha256: string }> {
  const bodyHash = await bodySha256(body);
  const token = request.headers.get("Cf-Access-Jwt-Assertion") || "";
  const response = await env.ATTESTATION.fetch(
    "https://attestation.internal/v1/assert",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cf-Access-Jwt-Assertion": token,
      },
      body: JSON.stringify({
        audience,
        action,
        body_sha256: bodyHash,
        ...(action === "admin.read" ? { request_context: body } : {}),
        ...(audience === "content-control"
          ? { totp_code: body.totp_code }
          : {}),
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 403 ? "step_up_required" : "attestation_failed",
    );
  const assertion = (await response.json()) as Record<string, unknown>;
  return { assertion, bodySha256: bodyHash };
}
