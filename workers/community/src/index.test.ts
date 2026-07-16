import { afterEach, describe, expect, it, vi } from "vitest";

import worker, { type CommunityEnv } from "./index";

const origin = "https://bubblenews.today";
const userId = "33333333-3333-4333-8333-333333333333";
const commentId = "55555555-5555-4555-8555-555555555555";

function env(overrides: Partial<CommunityEnv> = {}): CommunityEnv {
  return {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    COMMENTS_WRITE_ENABLED: "true",
    ALLOWED_ORIGINS: origin,
    COMMUNITY_RATE_LIMITER: {
      limit: vi.fn().mockResolvedValue({ success: true }),
    },
    ...overrides,
  };
}

function request(path: string, init: RequestInit = {}): Request {
  return new Request(`https://community-api.bubblenews.today${path}`, {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: "Bearer a-valid-looking-access-token",
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.9",
      ...init.headers,
    },
    body: JSON.stringify({
      threadId: "page:/daily/2026/07/2026-07-16/",
      type: "question",
      content: "Useful context",
      turnstileToken: "turnstile-token-value",
    }),
    ...init,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("community worker", () => {
  it("fails closed when writes are disabled", async () => {
    const response = await worker.fetch(
      request("/comments"),
      env({ COMMENTS_WRITE_ENABLED: "false" }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Comment writing is disabled",
    });
  });

  it("rejects unapproved origins before authentication", async () => {
    const response = await worker.fetch(
      request("/comments", { headers: { Origin: "https://evil.example" } }),
      env(),
    );
    expect(response.status).toBe(403);
  });

  it("creates a comment only after auth and Turnstile verification", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: userId }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(commentId), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ id: commentId, content: "Useful context" }]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(request("/comments"), env());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      comment: { id: commentId, content: "Useful context" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const rpcCall = fetchMock.mock.calls[2];
    expect(rpcCall[0]).toContain("/rpc/community_create_comment");
    expect(String((rpcCall[1] as RequestInit).body)).toContain(userId);
  });

  it("rejects failed human verification without calling the database", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: userId }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(request("/comments"), env());
    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed thread IDs before database access", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: userId }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      request("/comments", {
        body: JSON.stringify({
          threadId: "ai-gallery:01",
          type: "question",
          content: "No",
          turnstileToken: "turnstile-token-value",
        }),
      }),
      env(),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("enforces the edge rate limiter", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: userId }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const response = await worker.fetch(
      request("/comments"),
      env({
        COMMUNITY_RATE_LIMITER: {
          limit: vi.fn().mockResolvedValue({ success: false }),
        },
      }),
    );
    expect(response.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
