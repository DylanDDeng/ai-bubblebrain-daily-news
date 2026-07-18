import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/db", () => ({ openContentDatabase: vi.fn() }));
vi.mock("../shared/admin", () => ({
  requireAccess: vi.fn(),
  csrfSessionResponse: vi.fn(
    () =>
      new Response(JSON.stringify({ csrf_token: "test" }), {
        headers: { "Set-Cookie": "__Host-content_csrf=test" },
      }),
  ),
  requireMutationGuards: vi.fn(),
  readAdminBody: vi.fn(),
  idempotencyKey: vi.fn(),
  attest: vi.fn(),
}));

import { openContentDatabase } from "../shared/db";
import {
  attest,
  csrfSessionResponse,
  idempotencyKey,
  readAdminBody,
  requireAccess,
} from "../shared/admin";
import worker from "./index";

function fakeSql(queryError?: Error & { code?: string }) {
  const queries: string[] = [];
  const sql = ((strings: TemplateStringsArray) => {
    queries.push(strings.join("?"));
    if (queryError) return Promise.reject(queryError);
    return Promise.resolve([{ result: { ok: true } }]);
  }) as unknown as {
    (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<Array<{ result: unknown }>>;
    end: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  sql.end = vi.fn().mockResolvedValue(undefined);
  sql.json = vi.fn((value) => value);
  return { sql, queries };
}

describe("routine content admin information architecture", () => {
  beforeEach(() => {
    vi.mocked(requireAccess).mockResolvedValue("owner-sub");
    vi.mocked(attest).mockResolvedValue({
      assertion: { payload: "test" },
      bodySha256: "a".repeat(64),
    });
  });

  it("bootstraps CSRF before opening a database connection", async () => {
    const response = await worker.fetch(
      new Request("https://admin.test/v1/session"),
      {} as never,
    );
    expect(response.status).toBe(200);
    expect(csrfSessionResponse).toHaveBeenCalledOnce();
    expect(openContentDatabase).not.toHaveBeenCalled();
  });

  it("serves the Access-protected Routine console without opening the database", async () => {
    const response = await worker.fetch(
      new Request("https://admin.test/"),
      {} as never,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(await response.text()).toContain("Content Desk");
    expect(openContentDatabase).not.toHaveBeenCalled();
  });

  it.each([
    ["/v1/content?limit=25", "/v1/content", { after: null, limit: 25 }],
    ["/v1/operations?limit=25", "/v1/operations", { limit: 25 }],
    [
      "/v1/operations/verifier-diff?site_release_id=11111111-1111-4111-8111-111111111111",
      "/v1/operations/verifier-diff",
      { site_release_id: "11111111-1111-4111-8111-111111111111" },
    ],
  ])(
    "serves %s only through an attested read RPC",
    async (path, route, arguments_) => {
      const { sql, queries } = fakeSql();
      vi.mocked(openContentDatabase).mockReturnValue(sql as never);
      const response = await worker.fetch(
        new Request(`https://admin.test${path}`),
        {} as never,
      );
      expect(response.status).toBe(200);
      expect(queries.join("\n")).toContain("read_admin_v1");
      expect(attest).toHaveBeenCalledWith(
        expect.any(Request),
        expect.anything(),
        "content-routine",
        "admin.read",
        { route, arguments: arguments_ },
      );
      expect(sql.end).toHaveBeenCalled();
    },
  );

  it("rejects malformed content cursors before querying", async () => {
    const { sql, queries } = fakeSql();
    vi.mocked(openContentDatabase).mockReturnValue(sql as never);
    const response = await worker.fetch(
      new Request("https://admin.test/v1/content?after=latest"),
      {} as never,
    );
    expect(response.status).toBe(400);
    expect(queries).toEqual([]);
  });

  it("lists highlights through a route-bound read attestation", async () => {
    const { sql, queries } = fakeSql();
    vi.mocked(openContentDatabase).mockReturnValue(sql as never);
    const response = await worker.fetch(
      new Request("https://admin.test/v1/highlights?locale=zh-CN&limit=35"),
      {} as never,
    );
    expect(response.status).toBe(200);
    expect(queries.join("\n")).toContain("read_admin_highlights_v1");
    expect(attest).toHaveBeenCalledWith(
      expect.any(Request),
      expect.anything(),
      "content-routine",
      "admin.read",
      { route: "/v1/highlights", arguments: { locale: "zh-CN", limit: 35 } },
    );
  });

  it("creates a validated highlight through an attested mutation", async () => {
    const { sql, queries } = fakeSql();
    vi.mocked(openContentDatabase).mockReturnValue(sql as never);
    vi.mocked(idempotencyKey).mockReturnValue(
      "11111111-1111-4111-8111-111111111111",
    );
    vi.mocked(readAdminBody).mockResolvedValue({
      locale: "zh-CN",
      title: "新的精选内容",
      description: "值得保存的资料",
      source_url: "https://example.com/article",
      cover_url: null,
      tags: ["Agent"],
      status: "published",
      reason: "手动收录精选内容",
    });
    const response = await worker.fetch(
      new Request("https://admin.test/v1/highlights", { method: "POST" }),
      {} as never,
    );
    expect(response.status).toBe(201);
    expect(queries.join("\n")).toContain("create_highlight_v1");
    expect(attest).toHaveBeenCalledWith(
      expect.any(Request),
      expect.anything(),
      "content-routine",
      "highlight.create",
      expect.objectContaining({ title: "新的精选内容", status: "published" }),
    );
  });

  it("rejects unsafe highlight URLs before attestation", async () => {
    const { sql, queries } = fakeSql();
    vi.mocked(openContentDatabase).mockReturnValue(sql as never);
    vi.mocked(readAdminBody).mockResolvedValue({
      locale: "zh-CN",
      title: "不安全链接",
      description: "",
      source_url: "javascript:alert(1)",
      cover_url: null,
      tags: [],
      status: "published",
      reason: "验证非法链接",
    });
    const response = await worker.fetch(
      new Request("https://admin.test/v1/highlights", { method: "POST" }),
      {} as never,
    );
    expect(response.status).toBe(400);
    expect(queries).toEqual([]);
  });

  it("returns forbidden when the database rejects an unbound read principal", async () => {
    const denial = Object.assign(new Error("role binding denied"), {
      code: "42501",
    });
    const { sql } = fakeSql(denial);
    vi.mocked(openContentDatabase).mockReturnValue(sql as never);
    const response = await worker.fetch(
      new Request("https://admin.test/v1/dashboard"),
      {} as never,
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
  });
});
