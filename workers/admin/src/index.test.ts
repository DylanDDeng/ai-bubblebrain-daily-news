import { afterEach, describe, expect, it, vi } from "vitest";

import worker, { type AdminEnv } from "./index";

const adminOrigin = "https://admin.bubblenews.today";

function env(): AdminEnv {
  return {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    ADMIN_EMAILS: "owner@example.com",
    ADMIN_ORIGIN: adminOrigin,
  };
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`${adminOrigin}${path}`, {
    ...init,
    headers: {
      "Cf-Access-Jwt-Assertion": "access-jwt",
      "Cf-Access-Authenticated-User-Email": "owner@example.com",
      ...init.headers,
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("admin worker", () => {
  it("rejects requests without Cloudflare Access identity", async () => {
    const response = await worker.fetch(
      new Request(`${adminOrigin}/admin/`),
      env(),
    );
    expect(response.status).toBe(401);
  });

  it("rejects identities outside the allowlist", async () => {
    const response = await worker.fetch(
      request("/admin/", {
        headers: { "Cf-Access-Authenticated-User-Email": "other@example.com" },
      }),
      env(),
    );
    expect(response.status).toBe(401);
  });

  it("serves a no-store admin page with a nonce CSP", async () => {
    const response = await worker.fetch(request("/admin/"), env());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(await response.text()).toContain("社区审核");
  });

  it("rejects cross-origin moderation mutations", async () => {
    const response = await worker.fetch(
      request(
        "/admin/api/comments/55555555-5555-4555-8555-555555555555/moderate",
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

  it("calls the moderation RPC for an approved mutation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(true), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      request(
        "/admin/api/comments/55555555-5555-4555-8555-555555555555/moderate",
        {
          method: "POST",
          headers: { Origin: adminOrigin, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "hidden", reason: "spam" }),
        },
      ),
      env(),
    );
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toContain("/rpc/admin_moderate_comment");
  });
});
