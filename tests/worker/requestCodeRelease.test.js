import { describe, expect, it, vi } from "vitest";

import { runCodeRelease } from "../../scripts/request-code-release.mjs";

const CODE_SHA = "a".repeat(40);
const RELEASE_ID = "11111111-1111-4111-8111-111111111111";

function environment(overrides = {}) {
  return {
    CODE_RELEASE_ORIGIN: "https://deployer.example.test",
    CODE_RELEASE_SECRET: "s".repeat(32),
    EXACT_CODE_SHA: CODE_SHA,
    CONTENT_CURRENT_URLS:
      "https://api-one.example.test/v1/current,https://api-two.example.test/v1/current",
    CONTENT_SITE_IDENTITY_URLS:
      "https://site.example.test/release-manifests/site-route-manifest.json,https://pages.example.test/release-manifests/site-route-manifest.json",
    CODE_RELEASE_SITE_PROBES_PER_ORIGIN: "3",
    CODE_RELEASE_REQUEST_MAX_ATTEMPTS: "2",
    CODE_RELEASE_REQUEST_DELAY_MS: "1",
    CODE_RELEASE_POLL_DELAY_MS: "1",
    CODE_RELEASE_WAIT_TIMEOUT_SECONDS: "30",
    ...overrides,
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("automatic code release request and deployment wait", () => {
  it("does not treat a queued response as success before every current pointer converges", async () => {
    let now = 0;
    let pointerRound = 0;
    const fetch = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/internal/code-release") {
        return json(
          { status: "queued", site_release_id: RELEASE_ID, code_sha: CODE_SHA },
          202,
        );
      }
      if (url.pathname === "/release-manifests/site-route-manifest.json") {
        return json({
          build: { site_release_id: RELEASE_ID, code_sha: CODE_SHA },
        });
      }
      pointerRound += 1;
      if (pointerRound <= 2) {
        return json({ site_release_id: "old", code_sha: "b".repeat(40) });
      }
      return json({ site_release_id: RELEASE_ID, code_sha: CODE_SHA });
    });
    const sleep = vi.fn(async (milliseconds) => {
      now += milliseconds;
    });

    await expect(
      runCodeRelease(environment(), {
        fetch,
        sleep,
        now: () => now,
        log: vi.fn(),
      }),
    ).resolves.toEqual({ outcome: "deployed", siteReleaseId: RELEASE_ID });
    expect(fetch).toHaveBeenCalledTimes(17);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("waits when one site edge still serves the predecessor identity", async () => {
    let now = 0;
    let siteProbe = 0;
    const fetch = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/internal/code-release") {
        return json(
          { status: "queued", site_release_id: RELEASE_ID, code_sha: CODE_SHA },
          202,
        );
      }
      if (url.pathname === "/v1/current") {
        return json({ site_release_id: RELEASE_ID, code_sha: CODE_SHA });
      }
      siteProbe += 1;
      return json({
        build:
          siteProbe === 2
            ? { site_release_id: "old", code_sha: "b".repeat(40) }
            : { site_release_id: RELEASE_ID, code_sha: CODE_SHA },
      });
    });
    const sleep = vi.fn(async (milliseconds) => {
      now += milliseconds;
    });

    await expect(
      runCodeRelease(environment(), {
        fetch,
        sleep,
        now: () => now,
        log: vi.fn(),
      }),
    ).resolves.toEqual({ outcome: "deployed", siteReleaseId: RELEASE_ID });
    expect(sleep).toHaveBeenCalledOnce();
    expect(siteProbe).toBe(12);
  });

  it("reports a non-UI change set as an explicit safe no-op", async () => {
    const log = vi.fn();
    const fetch = vi.fn(async () =>
      json({ status: "no_changes", code_sha: CODE_SHA }),
    );

    await expect(
      runCodeRelease(environment(), { fetch, log, sleep: vi.fn() }),
    ).resolves.toEqual({ outcome: "no_op" });
    expect(fetch).toHaveBeenCalledOnce();
    expect(log.mock.calls.flat().join(" ")).toContain('"outcome":"no_op"');
  });

  it("records a superseded push and leaves the latest main run to aggregate it", async () => {
    const log = vi.fn();
    const fetch = vi.fn(async () =>
      json(
        {
          error: "code_release_target_superseded",
          retryable: true,
          current_main_sha: "b".repeat(40),
        },
        409,
      ),
    );

    await expect(
      runCodeRelease(environment(), { fetch, log, sleep: vi.fn() }),
    ).resolves.toEqual({ outcome: "superseded" });
    expect(log.mock.calls.flat().join(" ")).toContain('"outcome":"superseded"');
  });

  it("fails closed when the Deployer rejects a forbidden change set", async () => {
    const fetch = vi.fn(async () =>
      json(
        {
          error: "unsafe_code_release",
          detail: "Code release contains forbidden or unknown path",
        },
        422,
      ),
    );

    await expect(
      runCodeRelease(environment(), { fetch, sleep: vi.fn(), log: vi.fn() }),
    ).rejects.toThrow(/rejected \(422\).*unsafe_code_release/);
  });

  it("fails when the exact queued release never becomes current", async () => {
    let now = 0;
    const fetch = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/internal/code-release") {
        return json(
          {
            status: "queued",
            site_release_id: RELEASE_ID,
            code_sha: CODE_SHA,
          },
          202,
        );
      }
      if (url.pathname === "/release-manifests/site-route-manifest.json") {
        return json({
          build: { site_release_id: RELEASE_ID, code_sha: CODE_SHA },
        });
      }
      return json({ site_release_id: "old", code_sha: "b".repeat(40) });
    });
    const sleep = vi.fn(async (milliseconds) => {
      now += milliseconds;
    });

    await expect(
      runCodeRelease(
        environment({
          CODE_RELEASE_WAIT_TIMEOUT_SECONDS: "1",
          CODE_RELEASE_POLL_DELAY_MS: "1000",
        }),
        { fetch, sleep, now: () => now, log: vi.fn() },
      ),
    ).rejects.toThrow(
      /did not converge across current pointers and site identities/,
    );
  });

  it("retries only declared transient release-head failures", async () => {
    let requestCount = 0;
    const fetch = vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/internal/code-release") {
        requestCount += 1;
        return requestCount === 1
          ? json({ error: "release_head_busy", retryable: true }, 409)
          : json({ status: "already_current", code_sha: CODE_SHA });
      }
      if (url.pathname === "/release-manifests/site-route-manifest.json") {
        return json({
          build: { site_release_id: RELEASE_ID, code_sha: CODE_SHA },
        });
      }
      return json({ site_release_id: RELEASE_ID, code_sha: CODE_SHA });
    });
    const sleep = vi.fn(async () => undefined);

    await expect(
      runCodeRelease(environment(), { fetch, sleep, log: vi.fn() }),
    ).resolves.toEqual({ outcome: "deployed", siteReleaseId: RELEASE_ID });
    expect(requestCount).toBe(2);
    expect(sleep).toHaveBeenCalledOnce();
  });
});
