import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  dispatchOne,
  handleBuildContentRequest,
  handleRecoveryHealthCallback,
  outboxAlertReasons,
  runRetentionMaintenance,
  validateDispatchPayload,
} from "./index";

async function signedRecoveryRequest(
  secret: string,
  body: string,
): Promise<Request> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  const hex = Array.from(new Uint8Array(signature), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return new Request("https://deployer.test/internal/recovery-health", {
    method: "POST",
    headers: { "X-Content-Signature": hex },
    body,
  });
}

const valid = {
  dispatch_id: "11111111-1111-4111-8111-111111111111",
  site_release_id: "22222222-2222-4222-8222-222222222222",
  site_release_sequence: 1,
  expected_predecessor_id: null,
  expected_content_sha: "a".repeat(64),
  code_sha: "b".repeat(40),
  build_environment_version: "node22-v1",
  mode: "shadow",
};

describe("content release dispatcher input", () => {
  it("accepts only the complete exact-build contract", () => {
    expect(() => validateDispatchPayload(valid)).not.toThrow();
    for (const field of Object.keys(valid)) {
      const copy = { ...valid } as Record<string, unknown>;
      delete copy[field];
      expect(() => validateDispatchPayload(copy), field).toThrow(
        "Invalid dispatch payload",
      );
    }
  });

  it("rejects latest aliases and unrecognized deployment modes", () => {
    expect(() =>
      validateDispatchPayload({ ...valid, site_release_id: "latest" }),
    ).toThrow();
    expect(() =>
      validateDispatchPayload({ ...valid, mode: "production-now" }),
    ).toThrow();
  });
});

describe("content release dispatch recovery", () => {
  it("reuses the exact dispatch tuple after an accepted response is lost", async () => {
    const claimed = {
      site_release_id: valid.site_release_id,
      dispatch_id: valid.dispatch_id,
      payload: valid,
    };
    const events: string[] = [];
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.join("?");
        if (query.includes("claim_content_outbox_v1"))
          return [{ result: claimed }];
        if (query.includes("record_deployment_event_v1")) {
          events.push(String(values[2]));
          return [];
        }
        throw new Error(`Unexpected SQL: ${query}`);
      },
    );
    Object.assign(sql, { json: vi.fn((value: unknown) => value), end });
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(
        new TypeError("response lost after remote acceptance"),
      )
      .mockResolvedValueOnce(undefined);
    const dependencies = {
      openDatabase: vi.fn(() => sql as never),
      dispatch,
      randomUUID: () => "33333333-3333-4333-8333-333333333333",
    };

    await expect(dispatchOne({} as never, dependencies)).rejects.toThrow(
      "response lost",
    );
    await expect(dispatchOne({} as never, dependencies)).resolves.toBe(
      "dispatched",
    );

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0]).toEqual(dispatch.mock.calls[1]);
    expect(dispatch.mock.calls[0][2]).toMatchObject({
      dispatch_id: valid.dispatch_id,
      site_release_id: valid.site_release_id,
    });
    expect(events).toEqual(["failed", "building"]);
    expect(end).toHaveBeenCalledTimes(2);
  });
});

describe("authenticated immutable build content", () => {
  it("rejects browser requests without the dedicated build capability", async () => {
    const callRpc = vi.fn();
    const response = await handleBuildContentRequest(
      new Request(
        `https://deployer.test/internal/build/releases/${valid.site_release_id}/manifest`,
      ),
      { CONTENT_BUILD_API_SECRET: "build-secret" } as never,
      { callRpc },
    );
    expect(response.status).toBe(401);
    expect(callRpc).not.toHaveBeenCalled();
  });

  it("serves an unpromoted release only through the deployer build RPC", async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ site_release_id: valid.site_release_id }),
    );
    const hash = createHash("sha256").update(bytes).digest("hex");
    const callRpc = vi.fn().mockResolvedValue({
      manifest_object_key: `site-manifests/sha256/${hash}.json`,
      manifest_sha256: hash,
      manifest_byte_length: bytes.byteLength,
    });
    const get = vi.fn().mockResolvedValue({
      arrayBuffer: async () => bytes.buffer,
    });
    const response = await handleBuildContentRequest(
      new Request(
        `https://deployer.test/internal/build/releases/${valid.site_release_id}/manifest`,
        { headers: { Authorization: "Bearer build-secret" } },
      ),
      {
        CONTENT_BUILD_API_SECRET: "build-secret",
        SITE_MANIFESTS: { get },
      } as never,
      { callRpc },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("etag")).toBe(`"sha256-${hash}"`);
    expect(callRpc).toHaveBeenCalledWith(
      "manifest",
      valid.site_release_id,
      undefined,
    );
    expect(await response.text()).toBe(new TextDecoder().decode(bytes));
  });
});

describe("outbox operational alerts", () => {
  it("raises structured reasons for DLQ rows and ten-minute backlog", () => {
    expect(
      outboxAlertReasons({ dead_letter_count: 2, stale_queued_count: 3 }),
    ).toEqual(["dead_letter_count:2", "stale_queued_count:3"]);
    expect(
      outboxAlertReasons({ dead_letter_count: 0, stale_queued_count: 0 }),
    ).toEqual([]);
  });
});

describe("operational retention", () => {
  it("uses only the deployer retention RPC and closes the connection", async () => {
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      expect(strings.join("?")).toContain(
        "prune_content_operational_history_v1",
      );
      return [{ result: { status: "succeeded" } }];
    });
    Object.assign(sql, { end });

    await expect(
      runRetentionMaintenance({} as never, {
        openDatabase: vi.fn(() => sql as never),
      }),
    ).resolves.toEqual({ status: "succeeded" });
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });
});

describe("recovery monitor health callback", () => {
  const secret = "recovery-monitor-secret";
  const evidence = {
    healthy: true,
    checked_at: "2026-07-17T20:00:00.000Z",
    pitr_enabled: true,
    latest_backup_object_key: `database/2026/07/17/${"a".repeat(64)}.dump.age`,
    latest_backup_at: "2026-07-17T19:59:00.000Z",
    latest_backup_age_seconds: 60,
    maximum_backup_age_seconds: 3600,
  };

  it("rejects an unsigned health result before opening the database", async () => {
    const openDatabase = vi.fn();
    const response = await handleRecoveryHealthCallback(
      new Request("https://deployer.test/internal/recovery-health", {
        method: "POST",
        body: JSON.stringify(evidence),
      }),
      { RECOVERY_MONITOR_SECRET: secret } as never,
      { openDatabase },
    );
    expect(response.status).toBe(401);
    expect(openDatabase).not.toHaveBeenCalled();
  });

  it("records a signed healthy result through the deployer-only RPC", async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      expect(strings.join("?")).toContain("record_recovery_health_v1");
      return [{ result: { id: 1 } }];
    });
    Object.assign(sql, { json: vi.fn((value: unknown) => value), end });
    const response = await handleRecoveryHealthCallback(
      await signedRecoveryRequest(secret, JSON.stringify(evidence)),
      { RECOVERY_MONITOR_SECRET: secret } as never,
      { openDatabase: vi.fn(() => sql as never) },
    );
    expect(response.status).toBe(202);
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });
});
