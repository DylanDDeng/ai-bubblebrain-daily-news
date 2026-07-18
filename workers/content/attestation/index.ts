import { verifyAccessJwt, type AccessClaims } from "../../admin/src/index";
import { canonicalize } from "../shared/canonical";

type Env = {
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_ROUTINE_AUD: string;
  CF_ACCESS_CONTROL_AUD: string;
  ATTESTATION_ED25519_KEY_ID: string;
  ATTESTATION_ED25519_PRIVATE_JWK: string;
  CONTROL_TOTP_SECRET: string;
};

const ACTION_AUDIENCES: Record<string, ReadonlySet<string>> = {
  "draft.create": new Set(["content-routine"]),
  "draft.update": new Set(["content-routine"]),
  "draft.rebase": new Set(["content-routine"]),
  "preview.build": new Set(["content-routine"]),
  "highlight.create": new Set(["content-routine"]),
  "prompt.create": new Set(["content-routine"]),
  "model_eval.create": new Set(["content-routine"]),
  "draft.publish": new Set(["content-control"]),
  "production.rollback": new Set(["content-control"]),
  "production.reconcile": new Set(["content-control"]),
  "global.suppress": new Set(["content-control"]),
  "settings.update": new Set(["content-control"]),
  "roles.update": new Set(["content-control"]),
  "operations.retry": new Set(["content-control"]),
  "operations.rebuild": new Set(["content-control"]),
  "admin.read": new Set(["content-routine", "content-control-read"]),
};
const HASH = /^[a-f0-9]{64}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function decodeBase32(value: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/\s+/g, "");
  let bits = "";
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid TOTP secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const output: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    output.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return new Uint8Array(output);
}

async function totp(secret: string, counter: number): Promise<string> {
  const message = new Uint8Array(8);
  let value = BigInt(counter);
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = Number(value & 255n);
    value >>= 8n;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase32(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = digest[digest.length - 1] & 15;
  const code =
    ((digest[offset] & 127) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

async function verifyTotp(
  secret: string,
  supplied: string,
  now = Date.now(),
): Promise<boolean> {
  if (!/^\d{6}$/.test(supplied)) return false;
  const counter = Math.floor(now / 30_000);
  const codes = await Promise.all(
    [-1, 0, 1].map((delta) => totp(secret, counter + delta)),
  );
  return codes.some((candidate) => {
    let difference = 0;
    for (let index = 0; index < 6; index += 1) {
      difference |= candidate.charCodeAt(index) ^ supplied.charCodeAt(index);
    }
    return difference === 0;
  });
}

async function sign(privateJwk: string, payload: string): Promise<string> {
  let jwk: JsonWebKey;
  try {
    jwk = JSON.parse(privateJwk) as JsonWebKey;
  } catch {
    throw new Error("Invalid Ed25519 private key");
  }
  if (
    jwk.kty !== "OKP" ||
    jwk.crv !== "Ed25519" ||
    !/^[A-Za-z0-9_-]{43}$/.test(String(jwk.x || "")) ||
    !/^[A-Za-z0-9_-]{43}$/.test(String(jwk.d || ""))
  ) {
    throw new Error("Invalid Ed25519 private key");
  }
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "Ed25519",
    key,
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export async function handleAttestation(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);
  const token = request.headers.get("Cf-Access-Jwt-Assertion")?.trim();
  if (!token) return json({ error: "unauthorized" }, 401);
  let body: Record<string, unknown>;
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > 4096)
      return json({ error: "payload_too_large" }, 413);
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const audience = String(body.audience || "");
  const action = String(body.action || "");
  const bodySha256 = String(body.body_sha256 || "");
  if (
    !["content-routine", "content-control", "content-control-read"].includes(
      audience,
    ) ||
    !ACTION_AUDIENCES[action]?.has(audience) ||
    !HASH.test(bodySha256)
  ) {
    return json({ error: "invalid_request" }, 400);
  }
  const expectedAccessAudience =
    audience === "content-routine"
      ? env.CF_ACCESS_ROUTINE_AUD
      : env.CF_ACCESS_CONTROL_AUD;
  let claims: AccessClaims;
  try {
    claims = await verifyAccessJwt(token, {
      ...env,
      CF_ACCESS_AUD: expectedAccessAudience,
    } as never);
  } catch {
    return json({ error: "unauthorized" }, 401);
  }
  if (
    typeof claims.sub !== "string" ||
    !claims.sub ||
    typeof claims.iat !== "number"
  ) {
    return json({ error: "unauthorized" }, 401);
  }
  const requestContext = body.request_context;
  if (
    action === "admin.read" &&
    (!requestContext ||
      typeof requestContext !== "object" ||
      Array.isArray(requestContext))
  ) {
    return json({ error: "invalid_request" }, 400);
  }
  let authContext = "access";
  if (audience === "content-control") {
    if (
      !(await verifyTotp(env.CONTROL_TOTP_SECRET, String(body.totp_code || "")))
    ) {
      return json({ error: "step_up_required" }, 403);
    }
    authContext = "access+totp";
  }
  const issuedAt = new Date();
  const payloadObject = canonicalize({
    action,
    aud: audience,
    auth_context: authContext,
    body_sha256: bodySha256,
    exp: new Date(issuedAt.getTime() + 60_000).toISOString(),
    iat: issuedAt.toISOString(),
    jti: crypto.randomUUID(),
    key_id: env.ATTESTATION_ED25519_KEY_ID,
    ...(action === "admin.read"
      ? { request_context: canonicalize(requestContext) }
      : {}),
    sub: claims.sub,
  });
  const payload = JSON.stringify(payloadObject);
  return json({
    payload,
    signature: await sign(env.ATTESTATION_ED25519_PRIVATE_JWK, payload),
  });
}

export default { fetch: handleAttestation };
