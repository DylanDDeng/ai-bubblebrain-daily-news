import { describe, expect, it, vi } from "vitest";
import { requestProductionPromotion } from "../../scripts/request-production-promotion.mjs";

const operationId = "123e4567-e89b-42d3-a456-426614174000";
const siteReleaseId = "123e4567-e89b-42d3-a456-426614174001";
const body = JSON.stringify({
  site_release_id: siteReleaseId,
});

function completedResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Operation-Status": "completed",
    },
  });
}

describe("production promotion client", () => {
  it("remains compatible with the old synchronous Broker response", async () => {
    const fetchImpl = vi.fn(
      async (_url, init) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () =>
              resolve(
                Response.json({ ok: true, site_release_id: siteReleaseId }),
              ),
            20,
          );
          init.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(init.signal.reason);
            },
            { once: true },
          );
        }),
    );

    const result = await requestProductionPromotion({
      brokerUrl: "https://broker.test",
      secret: "secret",
      body,
      fetchImpl,
      submitTimeoutMs: 50,
      requestTimeoutMs: 5,
    });

    expect(JSON.parse(result)).toEqual({
      ok: true,
      site_release_id: siteReleaseId,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(new URL(fetchImpl.mock.calls[0][0]).pathname).toBe("/v1/promote");
  });

  it("polls independent signed requests until an asynchronous operation completes", async () => {
    const responses = [
      new Response(
        JSON.stringify({
          ok: true,
          operation_id: operationId,
          site_release_id: siteReleaseId,
          status: "queued",
        }),
        { status: 202 },
      ),
      new Response(
        JSON.stringify({
          ok: true,
          operation_id: operationId,
          site_release_id: siteReleaseId,
          status: "running",
          attempts: 1,
        }),
        { status: 202 },
      ),
      new Response(JSON.stringify({ error: "temporary_unavailable" }), {
        status: 503,
      }),
      completedResponse({ ok: true, site_release_id: siteReleaseId }),
    ];
    const fetchImpl = vi.fn(async () => responses.shift());
    let clock = 1_000;
    const sleep = vi.fn(async (milliseconds) => {
      clock += milliseconds;
    });

    const result = await requestProductionPromotion({
      brokerUrl: "https://broker.test",
      secret: "secret",
      body,
      fetchImpl,
      now: () => clock,
      sleep,
      pollIntervalMs: 5,
      waitTimeoutMs: 1_000,
    });

    expect(JSON.parse(result)).toEqual({
      ok: true,
      site_release_id: siteReleaseId,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    for (const [url, init] of fetchImpl.mock.calls.slice(1)) {
      expect(new URL(url).pathname).toBe(`/v1/operations/${operationId}`);
      expect(init.headers["X-Content-Signature"]).toMatch(/^[a-f0-9]{64}$/);
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(init.body)).toEqual({
        operation_id: operationId,
        site_release_id: siteReleaseId,
      });
    }
  });

  it("surfaces a completed operation failure instead of retrying it", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            operation_id: operationId,
            site_release_id: siteReleaseId,
            status: "queued",
          }),
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        completedResponse({ error: "production_convergence_timeout" }, 503),
      );
    let clock = 1_000;

    await expect(
      requestProductionPromotion({
        brokerUrl: "https://broker.test",
        secret: "secret",
        body,
        fetchImpl,
        now: () => clock,
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
        pollIntervalMs: 5,
        waitTimeoutMs: 1_000,
      }),
    ).rejects.toThrow(
      `Production Broker operation ${operationId} failed with 503`,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects a mismatched operation identity before polling", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            operation_id: operationId,
            site_release_id: "123e4567-e89b-42d3-a456-426614174099",
            status: "queued",
          }),
          { status: 202 },
        ),
    );

    await expect(
      requestProductionPromotion({
        brokerUrl: "https://broker.test",
        secret: "secret",
        body,
        fetchImpl,
      }),
    ).rejects.toThrow(
      "Production Broker returned an invalid operation identity",
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("bounds each Broker request independently", async () => {
    const fetchImpl = vi.fn(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener(
            "abort",
            () => reject(init.signal.reason),
            { once: true },
          );
        }),
    );

    await expect(
      requestProductionPromotion({
        brokerUrl: "https://broker.test",
        secret: "secret",
        body,
        fetchImpl,
        submitTimeoutMs: 5,
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
