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

const OUTBOX = "11111111-1111-4111-8111-111111111111";
const RELEASE = "22222222-2222-4222-8222-222222222222";
const DRAFT = "44444444-4444-4444-8444-444444444444";
const PREVIEW = "55555555-5555-4555-8555-555555555555";

function fakeSql() {
  const queries: string[] = [];
  const sql = ((strings: TemplateStringsArray) => {
    queries.push(strings.join("?"));
    return Promise.resolve([{ result: { status: "queued" } }]);
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

const env = {
  PRODUCTION_BROKER: { fetch: vi.fn() },
  CONTROL_BROKER_SECRET: "test",
} as never;

describe("control operations", () => {
  beforeEach(() => {
    vi.mocked(requireAccess).mockResolvedValue("owner-sub");
    vi.mocked(idempotencyKey).mockReturnValue(
      "33333333-3333-4333-8333-333333333333",
    );
    vi.mocked(attest).mockResolvedValue({
      assertion: { payload: "test" },
      bodySha256: "a".repeat(64),
    });
  });

  it("bootstraps CSRF before opening a database connection", async () => {
    const response = await worker.fetch(
      new Request("https://control.test/v1/session"),
      env,
    );
    expect(response.status).toBe(200);
    expect(csrfSessionResponse).toHaveBeenCalledOnce();
    expect(openContentDatabase).not.toHaveBeenCalled();
  });

  it("serves a separate Access-protected Control console", async () => {
    const response = await worker.fetch(
      new Request("https://control.test/"),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    const html = await response.text();
    expect(html).toContain("Content Control");
    expect(html).toContain("Danger Zone");
    expect(openContentDatabase).not.toHaveBeenCalled();
  });

  it("exposes read-only operations and verifier diff endpoints", async () => {
    const { sql, queries } = fakeSql();
    vi.mocked(openContentDatabase).mockReturnValue(sql as never);
    expect(
      (
        await worker.fetch(
          new Request("https://control.test/v1/operations"),
          env,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await worker.fetch(
          new Request(
            `https://control.test/v1/operations/verifier-diff?site_release_id=${RELEASE}`,
          ),
          env,
        )
      ).status,
    ).toBe(200);
    expect(queries.join("\n")).toContain("read_admin_v1");
    expect(attest).toHaveBeenCalledWith(
      expect.any(Request),
      env,
      "content-control-read",
      "admin.read",
      expect.objectContaining({ route: "/v1/operations" }),
    );
  });

  it.each([
    [
      `/v1/drafts/${DRAFT}/publish`,
      {
        preview_build_id: PREVIEW,
        expected_row_version: 7,
        reason: "publish the verified Preview",
      },
      "draft.publish",
      "request_editorial_publish_v1",
    ],
    [
      "/v1/operations/retry",
      {
        outbox_id: OUTBOX,
        reason: "retry after incident review",
        typed_confirmation: `RETRY ${OUTBOX}`,
      },
      "operations.retry",
      "retry_content_outbox_v1",
    ],
    [
      "/v1/operations/rebuild",
      {
        site_release_id: RELEASE,
        reason: "rebuild after verifier review",
        typed_confirmation: `REBUILD ${RELEASE}`,
      },
      "operations.rebuild",
      "rebuild_content_release_v1",
    ],
  ])(
    "routes %s through an Owner-attested audited RPC",
    async (path, body, action, rpc) => {
      const { sql, queries } = fakeSql();
      vi.mocked(openContentDatabase).mockReturnValue(sql as never);
      vi.mocked(readAdminBody).mockResolvedValue(body);
      const response = await worker.fetch(
        new Request(`https://control.test${path}`, { method: "POST" }),
        env,
      );
      expect(response.status).toBe(202);
      expect(attest).toHaveBeenCalledWith(
        expect.any(Request),
        env,
        "content-control",
        action,
        body,
      );
      expect(queries.join("\n")).toContain(rpc);
    },
  );

  it("rejects retry without the exact typed confirmation", async () => {
    const { sql, queries } = fakeSql();
    vi.mocked(openContentDatabase).mockReturnValue(sql as never);
    vi.mocked(readAdminBody).mockResolvedValue({
      outbox_id: OUTBOX,
      reason: "retry after incident review",
      typed_confirmation: "RETRY",
    });
    const response = await worker.fetch(
      new Request("https://control.test/v1/operations/retry", {
        method: "POST",
      }),
      env,
    );
    expect(response.status).toBe(400);
    expect(queries).toEqual([]);
  });
});
