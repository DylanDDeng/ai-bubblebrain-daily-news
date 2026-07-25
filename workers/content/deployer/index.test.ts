import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  dispatchOne,
  diffGitHubTrees,
  handleBuildContentRequest,
  handleCodeReleaseRequest,
  handleDeploymentCallback,
  handleDeploymentPlanRequest,
  handleRecoveryHealthCallback,
  outboxAlertReasons,
  replayContentBacklog,
  runRetentionMaintenance,
  validateCodeReleaseChangeSet,
  validateDispatchPayload,
} from "./index";

async function signedDeploymentCallback(
  secret: string,
  payload: Record<string, unknown>,
): Promise<Request> {
  const body = JSON.stringify(payload);
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
  return new Request("https://deployer.test/internal/deployment-callback", {
    method: "POST",
    headers: { "X-Content-Signature": hex },
    body,
  });
}

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

async function signedCodeReleaseRequest(
  secret: string,
  codeSha: string,
): Promise<Request> {
  const body = JSON.stringify({ code_sha: codeSha });
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
  return new Request("https://deployer.test/internal/code-release", {
    method: "POST",
    headers: { "X-Code-Release-Signature": hex },
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

describe("content backlog replay trigger", () => {
  it("is a no-op unless the feature, binding, and secret are all configured", async () => {
    const fetch = vi.fn();
    await expect(replayContentBacklog({} as never)).resolves.toBeUndefined();
    await expect(
      replayContentBacklog({
        CONTENT_BACKLOG_REPLAY_ENABLED: "true",
        CONTENT_INGESTOR: { fetch },
      } as never),
    ).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls the ingestion service binding with the dedicated secret", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, status: "empty" }), {
          status: 200,
        }),
    );
    await replayContentBacklog(
      {
        CONTENT_BACKLOG_REPLAY_ENABLED: "true",
        CONTENT_BACKLOG_REPLAY_SECRET: "backlog-secret",
        CONTENT_INGESTOR: { fetch },
      } as never,
      new Date("2026-07-14T02:30:00.000Z"),
    );

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://ai-daily.internal/internal/backlog/replay");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "X-Content-Backlog-Secret": "backlog-secret" },
    });
  });

  it("surfaces non-success responses for the cron isolation boundary to catch", async () => {
    await expect(
      replayContentBacklog(
        {
          CONTENT_BACKLOG_REPLAY_ENABLED: "true",
          CONTENT_BACKLOG_REPLAY_SECRET: "backlog-secret",
          CONTENT_INGESTOR: {
            fetch: vi.fn(
              async () => new Response("unavailable", { status: 503 }),
            ),
          },
        } as never,
        new Date("2026-07-14T02:30:00.000Z"),
      ),
    ).rejects.toThrow(/503/);
  });

  it("does not replay around the top of hour reserved for fresh ingestion", async () => {
    const fetch = vi.fn();
    const replayEnv = {
      CONTENT_BACKLOG_REPLAY_ENABLED: "true",
      CONTENT_BACKLOG_REPLAY_SECRET: "backlog-secret",
      CONTENT_INGESTOR: { fetch },
    } as never;
    for (const minute of [55, 59, 0, 5]) {
      await replayContentBacklog(
        replayEnv,
        new Date(`2026-07-14T02:${String(minute).padStart(2, "0")}:00.000Z`),
      );
    }
    expect(fetch).not.toHaveBeenCalled();
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

  it("dispatches only the fenced identity and never a caller plan", async () => {
    const attemptToken = "44444444-4444-4444-8444-444444444444";
    const claimed = {
      site_release_id: valid.site_release_id,
      dispatch_id: valid.dispatch_id,
      payload: valid,
      attempt_token: attemptToken,
      execution_generation: 3,
    };
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("claim_content_outbox_v1"))
        return [{ result: claimed }];
      if (query.includes("record_deployment_event_v1")) return [];
      throw new Error(`Unexpected SQL: ${query}`);
    });
    Object.assign(sql, { json: vi.fn((value: unknown) => value), end });
    const dispatch = vi.fn(async () => undefined);

    await expect(
      dispatchOne({} as never, {
        openDatabase: vi.fn(() => sql as never),
        dispatch,
        randomUUID: () => "33333333-3333-4333-8333-333333333333",
      }),
    ).resolves.toBe("dispatched");

    expect(dispatch.mock.calls[0][2]).toMatchObject({
      attempt_token: attemptToken,
      execution_generation: "3",
    });
    expect(dispatch.mock.calls[0][2]).not.toHaveProperty("resume_plan");
  });
});

describe("server-computed deployment plan", () => {
  it("returns the database plan only for the active fenced attempt", async () => {
    const plan = {
      resume_stage: "promote",
      artifact: { artifact_sha256: "a".repeat(64) },
      trusted_baseline: { artifact_sha256: "b".repeat(64) },
      preview_checkpoint: { preview_url: "https://preview.example" },
    };
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("accept_deployment_callback_v2"))
        return [{ result: true }];
      if (query.includes("get_content_release_resume_plan_v1"))
        return [{ result: plan }];
      throw new Error(`Unexpected SQL: ${query}`);
    });
    Object.assign(sql, { json: vi.fn((value: unknown) => value), end });
    const response = await handleDeploymentPlanRequest(
      await signedDeploymentCallback("callback-secret", {
        site_release_id: valid.site_release_id,
        dispatch_id: valid.dispatch_id,
        attempt_token: "44444444-4444-4444-8444-444444444444",
        execution_generation: 2,
      }),
      {
        DEPLOY_CALLBACK_SECRET: "callback-secret",
        CONTENT_RELEASE_RESUME_ENABLED: "true",
        CONTENT_RELEASE_INCREMENTAL_REUSE_ENABLED: "true",
      } as never,
      { openDatabase: vi.fn(() => sql as never) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(plan);
    expect(sql).toHaveBeenCalledTimes(2);
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });
});

describe("fenced deployment callbacks", () => {
  it("rejects an unfenced content callback before opening the database", async () => {
    const openDatabase = vi.fn();
    const response = await handleDeploymentCallback(
      await signedDeploymentCallback("callback-secret", {
        site_release_id: valid.site_release_id,
        dispatch_id: valid.dispatch_id,
        event_type: "failed",
        evidence: { error: "workflow_failed" },
      }),
      {
        DEPLOY_CALLBACK_SECRET: "callback-secret",
        CONTENT_RELEASE_REQUIRE_FENCED_CALLBACKS: "true",
      } as never,
      { openDatabase },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "fenced_callback_required",
    });
    expect(openDatabase).not.toHaveBeenCalled();
  });

  it("keeps the unfenced callback path available only when the rollout gate is off", async () => {
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("record_deployment_event_v1")) return [];
      throw new Error(`Unexpected SQL: ${query}`);
    });
    Object.assign(sql, { json: vi.fn((value: unknown) => value), end });
    const response = await handleDeploymentCallback(
      await signedDeploymentCallback("callback-secret", {
        site_release_id: valid.site_release_id,
        dispatch_id: valid.dispatch_id,
        event_type: "failed",
        evidence: { error: "workflow_failed" },
      }),
      {
        DEPLOY_CALLBACK_SECRET: "callback-secret",
        CONTENT_RELEASE_REQUIRE_FENCED_CALLBACKS: "false",
      } as never,
      { openDatabase: vi.fn(() => sql as never) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(sql).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });

  it("audits a stale callback without mutating release state", async () => {
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("accept_deployment_callback_v2"))
        return [{ result: false }];
      throw new Error(`Unexpected SQL after stale callback: ${query}`);
    });
    Object.assign(sql, { json: vi.fn((value: unknown) => value), end });
    const response = await handleDeploymentCallback(
      await signedDeploymentCallback("callback-secret", {
        site_release_id: valid.site_release_id,
        dispatch_id: valid.dispatch_id,
        attempt_token: "44444444-4444-4444-8444-444444444444",
        execution_generation: 2,
        event_type: "preview_verified",
        evidence: {
          artifact_sha256: "a".repeat(64),
          content_sha256: "b".repeat(64),
          code_sha: "c".repeat(40),
        },
      }),
      {
        DEPLOY_CALLBACK_SECRET: "callback-secret",
      } as never,
      { openDatabase: vi.fn(() => sql as never) },
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, stale: true });
    expect(sql).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });

  it("extends a fenced attempt lease on heartbeat", async () => {
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("accept_deployment_callback_v2"))
        return [{ result: true }];
      throw new Error(`Unexpected SQL: ${query}`);
    });
    Object.assign(sql, { json: vi.fn((value: unknown) => value), end });
    const response = await handleDeploymentCallback(
      await signedDeploymentCallback("callback-secret", {
        site_release_id: valid.site_release_id,
        dispatch_id: valid.dispatch_id,
        attempt_token: "44444444-4444-4444-8444-444444444444",
        execution_generation: 2,
        event_type: "heartbeat",
        evidence: { github_run_id: 123, stage: "checkout_verified" },
      }),
      {
        DEPLOY_CALLBACK_SECRET: "callback-secret",
      } as never,
      { openDatabase: vi.fn(() => sql as never) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, lease_extended: true });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("returns a stable retryable stage when opening the callback database fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await handleDeploymentCallback(
      await signedDeploymentCallback("callback-secret", {
        site_release_id: valid.site_release_id,
        dispatch_id: valid.dispatch_id,
        attempt_token: "44444444-4444-4444-8444-444444444444",
        execution_generation: 2,
        event_type: "preview_verified",
        evidence: { secret_value: "must-not-leak" },
      }),
      {
        DEPLOY_CALLBACK_SECRET: "callback-secret",
      } as never,
      {
        openDatabase: vi.fn(() => {
          throw new Error("database password must-not-leak");
        }),
      },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: "deployment_callback_failed",
      stage: "database_open",
      code: "database_unavailable",
      retryable: true,
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("must-not-leak");
    log.mockRestore();
  });

  it("classifies nested database contention at the fenced accept stage", async () => {
    const end = vi.fn(async () => undefined);
    const contention = Object.assign(new Error("locked"), {
      cause: { code: "55P03" },
    });
    const sql = vi.fn(async () => {
      throw contention;
    });
    Object.assign(sql, { json: vi.fn((value: unknown) => value), end });
    const response = await handleDeploymentCallback(
      await signedDeploymentCallback("callback-secret", {
        site_release_id: valid.site_release_id,
        dispatch_id: valid.dispatch_id,
        attempt_token: "44444444-4444-4444-8444-444444444444",
        execution_generation: 2,
        event_type: "preview_verified",
        evidence: {},
      }),
      {
        DEPLOY_CALLBACK_SECRET: "callback-secret",
      } as never,
      { openDatabase: vi.fn(() => sql as never) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      error: "deployment_callback_failed",
      stage: "accept",
      code: "database_contention",
      retryable: true,
    });
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });

  it("classifies malformed artifact evidence without exposing database details", async () => {
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("accept_deployment_callback_v2"))
        return [{ result: true }];
      if (query.includes("register_release_artifact_v1")) {
        throw Object.assign(new Error("invalid byte_length secret"), {
          code: "P0001",
        });
      }
      throw new Error(`Unexpected SQL: ${query}`);
    });
    Object.assign(sql, { json: vi.fn((value: unknown) => value), end });
    const response = await handleDeploymentCallback(
      await signedDeploymentCallback("callback-secret", {
        site_release_id: valid.site_release_id,
        dispatch_id: valid.dispatch_id,
        attempt_token: "44444444-4444-4444-8444-444444444444",
        execution_generation: 2,
        event_type: "artifact_registered",
        evidence: {
          object_key: "artifact",
          byte_length: -1,
          artifact_sha256: "a".repeat(64),
          artifact_fingerprint_sha256: "b".repeat(64),
          hash_algorithm: "sha256",
          code_sha: "c".repeat(40),
          build_environment_version: "test",
        },
      }),
      {
        DEPLOY_CALLBACK_SECRET: "callback-secret",
      } as never,
      { openDatabase: vi.fn(() => sql as never) },
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      ok: false,
      error: "deployment_callback_failed",
      stage: "artifact_register",
      code: "invalid_evidence",
      retryable: false,
    });
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });

  it("does not replace a successful callback when database close fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const end = vi.fn(async () => {
      throw new Error("close failed");
    });
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("accept_deployment_callback_v2"))
        return [{ result: true }];
      throw new Error(`Unexpected SQL: ${query}`);
    });
    Object.assign(sql, { json: vi.fn((value: unknown) => value), end });
    const response = await handleDeploymentCallback(
      await signedDeploymentCallback("callback-secret", {
        site_release_id: valid.site_release_id,
        dispatch_id: valid.dispatch_id,
        attempt_token: "44444444-4444-4444-8444-444444444444",
        execution_generation: 2,
        event_type: "heartbeat",
        evidence: {},
      }),
      {
        DEPLOY_CALLBACK_SECRET: "callback-secret",
      } as never,
      { openDatabase: vi.fn(() => sql as never) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      lease_extended: true,
    });
    expect(log).toHaveBeenCalledWith(
      "[ContentDeployer] callback database close failed",
      expect.objectContaining({
        event: "deployment_callback_database_close_failed",
      }),
    );
    log.mockRestore();
  });
});

describe("automatic code release boundary", () => {
  const baseCodeSha = "a".repeat(40);
  const targetCodeSha = "b".repeat(40);

  function comparison(files: Array<Record<string, unknown>>) {
    return {
      status: "ahead",
      base_commit: { sha: baseCodeSha },
      merge_base_commit: { sha: baseCodeSha },
      commits: [{ sha: targetCodeSha }],
      files,
    };
  }

  it("allows publishable UI alongside classified inert and DB-owned files", () => {
    expect(
      validateCodeReleaseChangeSet(
        comparison([
          { filename: "astro/src/pages/index.astro", status: "modified" },
          {
            filename: "astro/src/components/QuietIndexHome.astro",
            status: "modified",
          },
          {
            filename: "astro/src/layouts/BaseLayout.astro",
            status: "modified",
          },
          { filename: "astro/src/styles/quiet-index.css", status: "modified" },
          { filename: "astro/src/scripts/authControls.ts", status: "modified" },
          { filename: "astro/src/lib/searchIndex.ts", status: "modified" },
          { filename: "astro/public/favicon.svg", status: "modified" },
          { filename: "data/knowledge/taxonomy.json", status: "modified" },
          { filename: "static/css/daily-timeline.css", status: "modified" },
          { filename: "static/js/ai-infographic.js", status: "modified" },
          { filename: "static/js/daily-timeline.js", status: "modified" },
          { filename: "static/js/knowledge-search.js", status: "modified" },
          { filename: "static/js/navigation.js", status: "added" },
          { filename: "static/js/site-shell.js", status: "modified" },
          { filename: "workers/content/deployer/index.ts", status: "modified" },
          { filename: "src/daily/sourceAdapters.js", status: "modified" },
          { filename: "wrangler.toml", status: "modified" },
          {
            filename: "scripts/verify-site.mjs",
            status: "modified",
          },
          {
            filename: "scripts/request-production-promotion.mjs",
            status: "modified",
          },
          {
            filename: "scripts/create-content-addressed-artifact.mjs",
            status: "modified",
          },
          {
            filename: "scripts/upload-content-addressed-artifact.mjs",
            status: "modified",
          },
          {
            filename: "scripts/materialize-content-addressed-artifact.mjs",
            status: "added",
          },
          {
            filename: "scripts/request-content-release-plan.mjs",
            status: "added",
          },
          {
            filename: "scripts/send-content-deployment-callback.mjs",
            status: "modified",
          },
          {
            filename: "scripts/test-supabase-local.sh",
            status: "modified",
          },
          {
            filename: "scripts/verify-preview.mjs",
            status: "modified",
          },
          {
            filename: "wrangler.content-broker.toml",
            status: "modified",
          },
          {
            filename: "supabase/migrations/20260719000100_release.sql",
            status: "added",
          },
          {
            filename: ".github/workflows/automatic-code-release.yml",
            status: "added",
          },
          {
            filename: "data/daily/2026-07-19.json",
            status: "modified",
          },
          {
            filename: "astro/scripts/generate-site-contract.mjs",
            status: "modified",
          },
          { filename: "astro/wrangler.jsonc", status: "added" },
          { filename: "cloudflare-pages.toml", status: "modified" },
          { filename: "themes/hextra/theme.toml", status: "removed" },
          { filename: "layouts/index.html", status: "removed" },
          { filename: "i18n/en.toml", status: "removed" },
          { filename: "hugo.toml", status: "removed" },
          {
            filename: "scripts/sync-daily-to-hugo.sh",
            status: "removed",
          },
        ]),
        {
          baseCodeSha,
          targetCodeSha,
          structuredCutoverDate: "2026-07-16",
        },
      ),
    ).toHaveLength(38);
  });

  it.each([
    "themes/hextra/theme.toml",
    "layouts/index.html",
    "i18n/en.toml",
    "hugo.toml",
    "scripts/sync-daily-to-hugo.sh",
  ])("rejects reintroducing retired Hugo path %s", (retiredPath) => {
    expect(() =>
      validateCodeReleaseChangeSet(
        comparison([
          { filename: "astro/src/pages/index.astro", status: "modified" },
          { filename: retiredPath, status: "added" },
        ]),
        {
          baseCodeSha,
          targetCodeSha,
          structuredCutoverDate: "2026-07-16",
        },
      ),
    ).toThrow(`Code release may only remove retired Hugo path: ${retiredPath}`);
  });

  it("accepts a complete classified change set above the compare API file cap", () => {
    const files = Array.from({ length: 301 }, (_, index) => ({
      filename: `workers/generated/file-${String(index).padStart(3, "0")}.ts`,
      status: "modified",
    }));
    expect(
      validateCodeReleaseChangeSet(comparison(files), {
        baseCodeSha,
        targetCodeSha,
        structuredCutoverDate: "2026-07-16",
      }),
    ).toHaveLength(301);
  });

  it("derives a complete deterministic change set from Git trees", () => {
    const unchanged = {
      path: "workers/unchanged.ts",
      mode: "100644",
      type: "blob",
      sha: "1".repeat(40),
    };
    expect(
      diffGitHubTrees(
        [
          unchanged,
          {
            path: "workers/removed.ts",
            mode: "100644",
            type: "blob",
            sha: "2".repeat(40),
          },
          {
            path: "workers/modified.ts",
            mode: "100644",
            type: "blob",
            sha: "3".repeat(40),
          },
        ],
        [
          unchanged,
          {
            path: "workers/added.ts",
            mode: "100644",
            type: "blob",
            sha: "4".repeat(40),
          },
          {
            path: "workers/modified.ts",
            mode: "100755",
            type: "blob",
            sha: "5".repeat(40),
          },
        ],
      ),
    ).toEqual([
      {
        filename: "workers/added.ts",
        status: "added",
        sha: "4".repeat(40),
      },
      {
        filename: "workers/modified.ts",
        status: "modified",
        sha: "5".repeat(40),
      },
      {
        filename: "workers/removed.ts",
        status: "removed",
        sha: "2".repeat(40),
      },
    ]);
  });

  it.each([
    "static/highlights.json",
    "content/about/index.md",
    "data/daily/2026-07-15.json",
    "assets/daily.json",
    "unknown/release-input.json",
  ])("rejects a mixed release containing %s", (forbiddenPath) => {
    expect(() =>
      validateCodeReleaseChangeSet(
        comparison([
          { filename: "astro/src/pages/index.astro", status: "modified" },
          { filename: forbiddenPath, status: "modified" },
        ]),
        {
          baseCodeSha,
          targetCodeSha,
          structuredCutoverDate: "2026-07-16",
        },
      ),
    ).toThrow(
      `Code release contains forbidden or unknown path: ${forbiddenPath}`,
    );
  });

  it("rejects a rename whose previous filename is forbidden", () => {
    expect(() =>
      validateCodeReleaseChangeSet(
        comparison([
          {
            filename: "astro/src/pages/index.astro",
            previous_filename: "static/highlights.json",
            status: "renamed",
          },
        ]),
        {
          baseCodeSha,
          targetCodeSha,
          structuredCutoverDate: "2026-07-16",
        },
      ),
    ).toThrow(
      "Code release contains forbidden or unknown path: static/highlights.json",
    );
  });

  it("returns a retryable conflict when the requested SHA is already superseded", async () => {
    const currentMainSha = "c".repeat(40);
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      expect(strings.join("?")).toContain("get_code_release_base_v1");
      return [
        {
          result: {
            site_release_id: "11111111-1111-4111-8111-111111111111",
            code_sha: baseCodeSha,
            content_root_sha256: "d".repeat(64),
            structured_cutover_date: "2026-07-16",
          },
        },
      ];
    });
    Object.assign(sql, { end });
    const compare = vi.fn();
    const response = await handleCodeReleaseRequest(
      await signedCodeReleaseRequest("code-secret", targetCodeSha),
      { CODE_RELEASE_SECRET: "code-secret" } as never,
      {
        openDatabase: vi.fn(() => sql as never),
        getCurrentMainSha: vi.fn(async () => currentMainSha),
        compare,
      },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "code_release_target_superseded",
      retryable: true,
      requested_code_sha: targetCodeSha,
      current_main_sha: currentMainSha,
    });
    expect(compare).not.toHaveBeenCalled();
    expect(sql).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });

  it("rechecks main immediately before reservation", async () => {
    const newerMainSha = "c".repeat(40);
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      if (query.includes("get_code_release_base_v1")) {
        return [
          {
            result: {
              site_release_id: "11111111-1111-4111-8111-111111111111",
              code_sha: baseCodeSha,
              content_root_sha256: "d".repeat(64),
              structured_cutover_date: "2026-07-16",
            },
          },
        ];
      }
      throw new Error(`Reservation should not be attempted: ${query}`);
    });
    Object.assign(sql, { end });
    const getCurrentMainSha = vi
      .fn()
      .mockResolvedValueOnce(targetCodeSha)
      .mockResolvedValueOnce(newerMainSha);
    const response = await handleCodeReleaseRequest(
      await signedCodeReleaseRequest("code-secret", targetCodeSha),
      { CODE_RELEASE_SECRET: "code-secret" } as never,
      {
        openDatabase: vi.fn(() => sql as never),
        getCurrentMainSha,
        compare: vi.fn(async () => ({
          files: [
            { filename: "astro/src/pages/index.astro", status: "modified" },
          ],
          changeSetSha256: "e".repeat(64),
        })),
      },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "code_release_target_superseded",
      retryable: true,
      requested_code_sha: targetCodeSha,
      current_main_sha: newerMainSha,
    });
    expect(getCurrentMainSha).toHaveBeenCalledTimes(2);
    expect(sql).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });

  it("returns no_changes for a classified infrastructure-only range", async () => {
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      expect(strings.join("?")).toContain("get_code_release_base_v1");
      return [
        {
          result: {
            site_release_id: "11111111-1111-4111-8111-111111111111",
            code_sha: baseCodeSha,
            content_root_sha256: "d".repeat(64),
            structured_cutover_date: "2026-07-16",
          },
        },
      ];
    });
    Object.assign(sql, { end });
    const getCurrentMainSha = vi.fn(async () => targetCodeSha);
    const response = await handleCodeReleaseRequest(
      await signedCodeReleaseRequest("code-secret", targetCodeSha),
      { CODE_RELEASE_SECRET: "code-secret" } as never,
      {
        openDatabase: vi.fn(() => sql as never),
        getCurrentMainSha,
        compare: vi.fn(async () => ({
          files: [
            {
              filename: "workers/content/deployer/index.ts",
              status: "modified",
            },
            {
              filename: "data/daily/2026-07-19.json",
              status: "modified",
            },
            {
              filename: "scripts/create-content-addressed-artifact.mjs",
              status: "modified",
            },
            {
              filename: "scripts/upload-content-addressed-artifact.mjs",
              status: "modified",
            },
            {
              filename: "scripts/verify-preview.mjs",
              status: "modified",
            },
          ],
          changeSetSha256: "e".repeat(64),
        })),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      status: "no_changes",
      code_sha: targetCodeSha,
      changed_file_count: 5,
    });
    expect(getCurrentMainSha).toHaveBeenCalledTimes(1);
    expect(sql).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });

  it("materializes a cloned manifest and queues the exact main SHA", async () => {
    const baseReleaseId = "11111111-1111-4111-8111-111111111111";
    const nextReleaseId = "22222222-2222-4222-8222-222222222222";
    const contentSha = "c".repeat(64);
    const dispatchIds: string[] = [];
    const idempotencyKeys: string[] = [];
    const baseManifest = {
      site_release_id: baseReleaseId,
      site_release_sequence: 7,
      expected_predecessor_id: null,
      content_root_sha256: contentSha,
      structured_cutover_date: "2026-07-16",
      reports: [{ report_date: "2026-07-19", byte_sha256: "d".repeat(64) }],
    };
    const baseBytes = new TextEncoder().encode(
      `${JSON.stringify(baseManifest)}\n`,
    );
    const baseHash = createHash("sha256").update(baseBytes).digest("hex");
    const objects = new Map<string, Uint8Array>([
      [`site-manifests/sha256/${baseHash}.json`, baseBytes],
    ]);
    const bucket = {
      get: vi.fn(async (key: string) => {
        const bytes = objects.get(key);
        return bytes ? { arrayBuffer: async () => bytes.buffer } : null;
      }),
      put: vi.fn(async (key: string, bytes: Uint8Array) => {
        objects.set(key, bytes);
      }),
    };
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const query = strings.join("?");
        if (query.includes("get_code_release_base_v1")) {
          return [
            {
              result: {
                site_release_id: baseReleaseId,
                code_sha: baseCodeSha,
                content_root_sha256: contentSha,
                structured_cutover_date: "2026-07-16",
              },
            },
          ];
        }
        if (query.includes("reserve_code_release_v1")) {
          expect(values).toContain(targetCodeSha);
          idempotencyKeys.push(String(values[0]));
          return [
            {
              result: {
                reservation_id: nextReleaseId,
                site_release_id: nextReleaseId,
                site_release_sequence: 8,
                expected_predecessor_id: baseReleaseId,
                content_root_sha256: contentSha,
                base_manifest: {
                  object_key: `site-manifests/sha256/${baseHash}.json`,
                  byte_length: baseBytes.byteLength,
                  sha256: baseHash,
                },
              },
            },
          ];
        }
        if (query.includes("finalize_code_release_v1")) {
          const dispatchPayload = values.at(-1) as Record<string, unknown>;
          dispatchIds.push(String(values[4]));
          expect(dispatchPayload).toMatchObject({
            dispatch_id: values[4],
            site_release_id: nextReleaseId,
            expected_predecessor_id: baseReleaseId,
            code_sha: targetCodeSha,
            expected_content_sha: contentSha,
            mode: "production",
          });
          return [
            {
              result: {
                site_release_id: nextReleaseId,
                site_release_sequence: 8,
              },
            },
          ];
        }
        throw new Error(`Unexpected SQL: ${query}`);
      },
    );
    Object.assign(sql, { json: vi.fn((value: unknown) => value), end });
    const dependencies = {
      openDatabase: vi.fn(() => sql as never),
      getCurrentMainSha: vi.fn(async () => targetCodeSha),
      compare: vi.fn(async () => ({
        files: [
          {
            filename: "astro/src/styles/quiet-index.css",
            status: "modified",
          },
        ],
        changeSetSha256: "e".repeat(64),
      })),
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await handleCodeReleaseRequest(
        await signedCodeReleaseRequest("code-secret", targetCodeSha),
        {
          CODE_RELEASE_SECRET: "code-secret",
          SITE_MANIFESTS: bucket,
        } as never,
        dependencies,
      );
      expect(response.status).toBe(202);
      expect(await response.json()).toMatchObject({
        ok: true,
        status: "queued",
        site_release_id: nextReleaseId,
        code_sha: targetCodeSha,
        content_sha256: contentSha,
      });
    }

    expect(idempotencyKeys).toHaveLength(2);
    expect(idempotencyKeys).toEqual([
      "b56f4d01-0b51-54ea-a471-f9da86f0c287",
      "b56f4d01-0b51-54ea-a471-f9da86f0c287",
    ]);
    expect(dispatchIds).toHaveLength(2);
    expect(dispatchIds).toEqual([
      "b56f4d01-0b51-54ea-a471-f9da86f0c287",
      "b56f4d01-0b51-54ea-a471-f9da86f0c287",
    ]);
    expect(bucket.put).toHaveBeenCalledTimes(1);
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
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, no-transform",
    );
    expect(response.headers.get("content-encoding")).toBe("identity");
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
