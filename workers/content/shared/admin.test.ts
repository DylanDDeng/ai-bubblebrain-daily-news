import { describe, expect, it } from "vitest";
import { csrfSessionResponse, requireMutationGuards } from "./admin";

const env = {
  ADMIN_ALLOWED_ORIGIN: "https://content-admin.example.test",
} as never;

describe("content Admin CSRF session", () => {
  it("issues a short-lived host-only HttpOnly token accepted by the mutation guard", async () => {
    const response = csrfSessionResponse();
    const body = (await response.json()) as {
      csrf_token: string;
      expires_in: number;
    };
    const cookie = response.headers.get("Set-Cookie") || "";

    expect(body.csrf_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.expires_in).toBe(600);
    expect(cookie).toContain(`__Host-content_csrf=${body.csrf_token}`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(response.headers.get("Cache-Control")).toContain("no-store");

    expect(() =>
      requireMutationGuards(
        new Request("https://content-admin.example.test/v1/drafts", {
          method: "POST",
          headers: {
            Origin: "https://content-admin.example.test",
            Cookie: `__Host-content_csrf=${body.csrf_token}`,
            "X-CSRF-Token": body.csrf_token,
          },
        }),
        env,
      ),
    ).not.toThrow();
  });

  it.each([
    [
      "wrong origin",
      "https://evil.example.test",
      "same",
      "same",
      "invalid_origin",
    ],
    [
      "missing cookie",
      "https://content-admin.example.test",
      "",
      "a".repeat(43),
      "csrf_rejected",
    ],
    [
      "mismatched header",
      "https://content-admin.example.test",
      "a".repeat(43),
      "b".repeat(43),
      "csrf_rejected",
    ],
  ])("rejects %s", (_name, origin, cookie, supplied, error) => {
    expect(() =>
      requireMutationGuards(
        new Request("https://content-admin.example.test/v1/drafts", {
          method: "POST",
          headers: {
            Origin: origin,
            ...(cookie ? { Cookie: `__Host-content_csrf=${cookie}` } : {}),
            "X-CSRF-Token": supplied,
          },
        }),
        env,
      ),
    ).toThrow(error);
  });
});
