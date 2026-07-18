import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import worker, { clearAccessJwksCacheForTests, type AdminEnv } from "./index";

const adminOrigin = "https://admin.bubblenews.today";
const issuer = "https://bubblebrain.cloudflareaccess.com";
const audience = "access-audience-id";
const keyId = "access-key-1";
let privateKey: CryptoKey;
let publicJwk: JsonWebKey;

function base64Url(value: Uint8Array | string): string {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function accessToken(
  claims: Record<string, unknown> = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(
    JSON.stringify({ alg: "RS256", kid: keyId, typ: "JWT" }),
  );
  const payload = base64Url(
    JSON.stringify({
      iss: issuer,
      aud: [audience],
      email: "owner@example.com",
      exp: now + 300,
      iat: now,
      ...claims,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

function env(overrides: Partial<AdminEnv> = {}): AdminEnv {
  return {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    ADMIN_EMAILS: "owner@example.com",
    ADMIN_ORIGIN: adminOrigin,
    CF_ACCESS_TEAM_DOMAIN: issuer,
    CF_ACCESS_AUD: audience,
    ...overrides,
  };
}

function request(
  path: string,
  token?: string,
  init: RequestInit = {},
): Request {
  const headers = new Headers(init.headers);
  if (token) headers.set("Cf-Access-Jwt-Assertion", token);
  return new Request(`${adminOrigin}${path}`, { ...init, headers });
}

function jwksResponse(): Response {
  return new Response(JSON.stringify({ keys: [publicJwk] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  privateKey = pair.privateKey;
  publicJwk = {
    ...(await crypto.subtle.exportKey("jwk", pair.publicKey)),
    alg: "RS256",
    kid: keyId,
    use: "sig",
  };
});

afterEach(() => {
  clearAccessJwksCacheForTests();
  vi.unstubAllGlobals();
});

describe("admin worker", () => {
  it("rejects requests without a Cloudflare Access JWT", async () => {
    const response = await worker.fetch(request("/admin/"), env());
    expect(response.status).toBe(401);
  });

  it("rejects forged Access headers that are not signed JWTs", async () => {
    const response = await worker.fetch(
      request("/admin/", "forged.access.jwt", {
        headers: {
          "Cf-Access-Authenticated-User-Email": "owner@example.com",
        },
      }),
      env(),
    );
    expect(response.status).toBe(401);
  });

  it("serves the admin page only for a valid signed Access JWT", async () => {
    const fetchMock = vi.fn(async () => jwksResponse());
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      request("/admin/", await accessToken()),
      env(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(await response.text()).toContain("社区审核");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a signed JWT for another Access audience", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jwksResponse()),
    );
    const response = await worker.fetch(
      request("/admin/", await accessToken({ aud: ["other-audience"] })),
      env(),
    );
    expect(response.status).toBe(401);
  });

  it("rejects a signed JWT from another issuer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jwksResponse()),
    );
    const response = await worker.fetch(
      request(
        "/admin/",
        await accessToken({ iss: "https://other.cloudflareaccess.com" }),
      ),
      env(),
    );
    expect(response.status).toBe(401);
  });

  it("rejects expired signed Access JWTs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jwksResponse()),
    );
    const response = await worker.fetch(
      request(
        "/admin/",
        await accessToken({ exp: Math.floor(Date.now() / 1000) - 1 }),
      ),
      env(),
    );
    expect(response.status).toBe(401);
  });

  it("rejects signed Access JWTs that are not active yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jwksResponse()),
    );
    const response = await worker.fetch(
      request(
        "/admin/",
        await accessToken({ nbf: Math.floor(Date.now() / 1000) + 300 }),
      ),
      env(),
    );
    expect(response.status).toBe(401);
  });

  it("rejects signed Access JWTs whose issued-at time is in the future", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jwksResponse()),
    );
    const response = await worker.fetch(
      request(
        "/admin/",
        await accessToken({ iat: Math.floor(Date.now() / 1000) + 300 }),
      ),
      env(),
    );
    expect(response.status).toBe(401);
  });

  it("rejects signed Access JWTs whose expiry does not follow issued-at", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jwksResponse()),
    );
    const issuedAt = Math.floor(Date.now() / 1000);
    const response = await worker.fetch(
      request("/admin/", await accessToken({ iat: issuedAt, exp: issuedAt })),
      env(),
    );
    expect(response.status).toBe(401);
  });

  it("rejects signed identities outside the email allowlist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jwksResponse()),
    );
    const response = await worker.fetch(
      request("/admin/", await accessToken({ email: "other@example.com" })),
      env(),
    );
    expect(response.status).toBe(401);
  });

  it("fails closed when Access configuration is missing", async () => {
    const response = await worker.fetch(
      request("/admin/", await accessToken()),
      env({ CF_ACCESS_AUD: "" }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects cross-origin moderation mutations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jwksResponse()),
    );
    const response = await worker.fetch(
      request(
        "/admin/api/comments/55555555-5555-4555-8555-555555555555/moderate",
        await accessToken(),
        {
          method: "POST",
          headers: {
            Origin: "https://evil.example",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "hidden" }),
        },
      ),
      env(),
    );
    expect(response.status).toBe(403);
  });

  it("lists only article discussions and keeps Gallery and Video archives private", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/cdn-cgi/access/certs")) return jwksResponse();
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      request("/admin/api/comments?status=visible", await accessToken()),
      env(),
    );
    expect(response.status).toBe(200);
    const commentsRequest = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/rest/v1/comments?"),
    );
    expect(String(commentsRequest?.[0])).toContain("thread_id=like.page:/*");
  });

  it("calls the moderation RPC for an approved mutation", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/cdn-cgi/access/certs")) return jwksResponse();
      return new Response(JSON.stringify(true), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      request(
        "/admin/api/comments/55555555-5555-4555-8555-555555555555/moderate",
        await accessToken(),
        {
          method: "POST",
          headers: { Origin: adminOrigin, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "hidden", reason: "spam" }),
        },
      ),
      env(),
    );
    expect(response.status).toBe(200);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/rpc/admin_moderate_comment"),
      ),
    ).toBe(true);
  });

  it("rejects an oversized body even without Content-Length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jwksResponse()),
    );
    const response = await worker.fetch(
      request(
        "/admin/api/comments/55555555-5555-4555-8555-555555555555/moderate",
        await accessToken(),
        {
          method: "POST",
          headers: { Origin: adminOrigin, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "hidden", reason: "x".repeat(5_000) }),
        },
      ),
      env(),
    );
    expect(response.status).toBe(413);
  });
});
