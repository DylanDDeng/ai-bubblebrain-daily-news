import { describe, expect, it, vi } from "vitest";
import { handleContentApiFetch, handleContentApiRequest } from "./index";

const RELEASE = "11111111-1111-4111-8111-111111111111";
const ITEM = `n_${"a".repeat(64)}`;

describe("release-pinned content API", () => {
  it("returns immutable report data with the payload hash ETag", async () => {
    const callRpc = vi.fn().mockResolvedValue({
      site_release_id: RELEASE,
      report_date: "2026-07-17",
      byte_sha256: "b".repeat(64),
      document: { date: "2026-07-17" },
    });
    const response = await handleContentApiRequest(
      new Request(
        `https://content.test/v1/releases/${RELEASE}/reports/2026-07-17`,
      ),
      {},
      { callRpc },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("etag")).toBe(`"sha256-${"b".repeat(64)}"`);
    expect(callRpc).toHaveBeenCalledWith("report", {
      releaseId: RELEASE,
      date: "2026-07-17",
    });
  });

  it("never resolves item and search requests through current", async () => {
    const callRpc = vi
      .fn()
      .mockResolvedValue({ site_release_id: RELEASE, item: { id: ITEM } });
    const itemResponse = await handleContentApiRequest(
      new Request(`https://content.test/v1/releases/${RELEASE}/items/${ITEM}`),
      {},
      { callRpc },
    );
    expect(itemResponse.status).toBe(200);
    expect(callRpc).toHaveBeenLastCalledWith("item", {
      releaseId: RELEASE,
      itemId: ITEM,
    });

    const searchResponse = await handleContentApiRequest(
      new Request(
        `https://content.test/v1/releases/${RELEASE}/search?q=模型&limit=10`,
      ),
      {},
      { callRpc },
    );
    expect(searchResponse.status).toBe(200);
    expect(callRpc).toHaveBeenLastCalledWith("search", {
      releaseId: RELEASE,
      query: "模型",
      limit: 10,
      beforeDate: null,
    });
    expect(callRpc.mock.calls.some(([name]) => name === "current")).toBe(false);
  });

  it("rejects invalid release identifiers, pagination, and methods", async () => {
    const callRpc = vi.fn();
    expect(
      (
        await handleContentApiRequest(
          new Request("https://content.test/v1/releases/latest/search?q=x"),
          {},
          { callRpc },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleContentApiRequest(
          new Request(
            `https://content.test/v1/releases/${RELEASE}/search?q=x&limit=1000`,
          ),
          {},
          { callRpc },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleContentApiRequest(
          new Request("https://content.test/v1/current", { method: "POST" }),
          {},
          { callRpc },
        )
      ).status,
    ).toBe(405);
    expect(callRpc).not.toHaveBeenCalled();
  });

  it("rejects unknown paths without opening a database connection", async () => {
    const response = await handleContentApiRequest(
      new Request("https://content.test/.env"),
      {},
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("uses a short-lived current pointer response and redacts database errors", async () => {
    const current = await handleContentApiRequest(
      new Request("https://content.test/v1/current"),
      {},
      {
        callRpc: vi
          .fn()
          .mockResolvedValue({ generation: 4, site_release_id: RELEASE }),
      },
    );
    expect(current.headers.get("cache-control")).toContain("no-cache");
    const failed = await handleContentApiRequest(
      new Request("https://content.test/v1/current"),
      {},
      {
        callRpc: vi
          .fn()
          .mockRejectedValue(new Error("secret connection detail")),
      },
    );
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret");
  });

  it("serves current public highlights with bounded cache and locale", async () => {
    const callRpc = vi.fn().mockResolvedValue({
      schema_version: 1,
      locale: "zh-CN",
      item_count: 1,
      items: [{ id: "highlight-01", title: "精选" }],
    });
    const response = await handleContentApiRequest(
      new Request("https://content.test/v1/highlights?locale=zh-CN&limit=35"),
      {},
      { callRpc },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(response.headers.get("etag")).toContain("sha256-");
    expect(callRpc).toHaveBeenCalledWith("highlights", {
      locale: "zh-CN",
      limit: 35,
    });
  });

  it("rejects unsupported highlight locales and excessive limits", async () => {
    const callRpc = vi.fn();
    expect(
      (
        await handleContentApiRequest(
          new Request("https://content.test/v1/highlights?locale=fr"),
          {},
          { callRpc },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleContentApiRequest(
          new Request("https://content.test/v1/highlights?limit=1000"),
          {},
          { callRpc },
        )
      ).status,
    ).toBe(400);
    expect(callRpc).not.toHaveBeenCalled();
  });

  it("serves Prompt lists and complete Prompt detail records", async () => {
    const callRpc = vi
      .fn()
      .mockResolvedValueOnce({
        schema_version: 1,
        locale: "zh-CN",
        item_count: 1,
        items: [{ id: "prompt-agent-review", title: "Agent 评审" }],
      })
      .mockResolvedValueOnce({
        schema_version: 1,
        locale: "zh-CN",
        id: "prompt-agent-review",
        title: "Agent 评审",
        body_markdown: "# 完整正文",
      });
    const list = await handleContentApiRequest(
      new Request("https://content.test/v1/prompts?locale=zh-CN&limit=12"),
      {},
      { callRpc },
    );
    expect(list.status).toBe(200);
    expect(callRpc).toHaveBeenNthCalledWith(1, "prompts", {
      locale: "zh-CN",
      limit: 12,
    });
    const detail = await handleContentApiRequest(
      new Request(
        "https://content.test/v1/prompts/prompt-agent-review?locale=zh-CN",
      ),
      {},
      { callRpc },
    );
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ body_markdown: "# 完整正文" });
    expect(callRpc).toHaveBeenNthCalledWith(2, "prompt", {
      locale: "zh-CN",
      externalId: "prompt-agent-review",
    });
  });

  it("serves model evaluations with an optional year filter", async () => {
    const callRpc = vi.fn().mockResolvedValue({
      schema_version: 1,
      locale: "zh-CN",
      year: 2026,
      item_count: 1,
      items: [{ id: "model", name: "Model" }],
    });
    const response = await handleContentApiRequest(
      new Request(
        "https://content.test/v1/model-evals?locale=zh-CN&year=2026&limit=50",
      ),
      {},
      { callRpc },
    );
    expect(response.status).toBe(200);
    expect(callRpc).toHaveBeenCalledWith("modelEvals", {
      locale: "zh-CN",
      year: 2026,
      limit: 50,
    });
  });

  it("rejects invalid Prompt and model evaluation query parameters", async () => {
    const callRpc = vi.fn();
    expect(
      (
        await handleContentApiRequest(
          new Request("https://content.test/v1/prompts?limit=201"),
          {},
          { callRpc },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handleContentApiRequest(
          new Request("https://content.test/v1/model-evals?year=1999"),
          {},
          { callRpc },
        )
      ).status,
    ).toBe(400);
    expect(callRpc).not.toHaveBeenCalled();
  });

  it("allows browser search only from the pinned public site origin", async () => {
    const callRpc = vi.fn().mockResolvedValue({
      site_release_id: RELEASE,
      results: [],
    });
    const allowed = await handleContentApiFetch(
      new Request(
        `https://content.test/v1/releases/${RELEASE}/search?q=agent`,
        { headers: { Origin: "https://bubblenews.today" } },
      ),
      { PUBLIC_SITE_ORIGIN: "https://bubblenews.today" },
      { callRpc },
    );
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "https://bubblenews.today",
    );
    const deniedPreflight = await handleContentApiFetch(
      new Request(`https://content.test/v1/releases/${RELEASE}/search`, {
        method: "OPTIONS",
        headers: { Origin: "https://attacker.test" },
      }),
      { PUBLIC_SITE_ORIGIN: "https://bubblenews.today" },
      { callRpc },
    );
    expect(deniedPreflight.status).toBe(403);
  });
});
