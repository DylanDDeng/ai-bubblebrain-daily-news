import { describe, expect, it, vi } from "vitest";
import { SHARED_CONTENT_PROJECT_ACK } from "../../scripts/content-database-topology.mjs";
import {
  dueContentBatches,
  evaluateContentObservability,
  scheduledRunHealth,
  validateContentObservabilityEnvironment,
} from "../../scripts/check-content-observability.mjs";
import {
  evaluateContentObservationWindow,
  expectedObservationSlots,
} from "../../scripts/check-content-observation-window.mjs";

const NOW = Date.parse("2026-07-18T08:00:00.000Z");
const CURRENT = {
  artifact_sha256: "a".repeat(64),
  artifact_fingerprint_sha256: "f".repeat(64),
  build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
  code_sha: "d".repeat(40),
  content_sha256: "c".repeat(64),
  manifest_sha256: "b".repeat(64),
  site_release_id: "11111111-1111-4111-8111-111111111111",
  site_release_sequence: 42,
};

function healthyInput() {
  const due = dueContentBatches(NOW);
  const dispatchId = "33333333-3333-4333-8333-333333333333";
  const scheduledOutcomes = due.map((batch) => ({
    run_id: batch.run_id,
    scheduled_at: batch.scheduled_at,
    status: "succeeded",
    started_at: batch.scheduled_at,
    finished_at: new Date(
      Date.parse(batch.scheduled_at) + 60_000,
    ).toISOString(),
    source_result: { status: "succeeded" },
    content_sha256: "e".repeat(64),
    no_op: false,
    database_mirror: { status: "mirrored" },
    site_release_id: CURRENT.site_release_id,
    site_release_sequence: CURRENT.site_release_sequence,
    dispatch_id: dispatchId,
  }));
  return {
    analytics: {
      cache_hits: 900,
      cacheable_requests: 1000,
      requests: 1200,
      server_errors: 2,
    },
    cacheHitMinimum: 0.5,
    cacheSampleMinimum: 100,
    scheduledOutcomes,
    currentEndpoints: [
      { url: "https://api-one.invalid/v1/current", body: CURRENT },
      { url: "https://api-two.invalid/v1/current", body: CURRENT },
    ],
    database: {
      current: CURRENT,
      outbox: {
        dead_letter_count: 0,
        release_head_stale_count: 0,
        stale_queued_count: 0,
      },
      publication_attempts: due.map((batch) => ({
        ...batch,
        trigger_kind: batch.run_id,
        status: "succeeded",
      })),
      scheduled_runs: scheduledOutcomes.map((outcome) => ({
        ...outcome,
        scheduled_at: outcome.scheduled_at.replace(".000Z", "+00:00"),
        started_at: outcome.started_at.replace(".000Z", "+00:00"),
        finished_at: outcome.finished_at.replace(".000Z", "+00:00"),
        database_mirror: { ...outcome.database_mirror },
        source_result: { ...outcome.source_result },
      })),
      search_latest_report_date: due.at(-1).report_date,
    },
    staticManifests: [
      {
        url: "https://one.invalid/manifest.json",
        body: {
          build: {
            ...CURRENT,
            artifact_sha256: CURRENT.artifact_fingerprint_sha256,
          },
        },
      },
      {
        url: "https://two.invalid/manifest.json",
        body: {
          build: {
            ...CURRENT,
            artifact_sha256: CURRENT.artifact_fingerprint_sha256,
          },
        },
      },
    ],
  };
}

describe("content observability evaluator", () => {
  it("maps every due production run through the shared paginated schedule contract", () => {
    const due = dueContentBatches(NOW);
    expect(due).toHaveLength(20);
    expect(new Set(due.map((run) => run.run_id)).size).toBe(due.length);
    expect(due).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          report_date: "2026-07-17",
          batch_id: "lateNight",
          scheduled_at: "2026-07-17T18:00:00.000Z",
        }),
        expect.objectContaining({
          report_date: "2026-07-17",
          batch_id: "lateNight",
          publication_batch_id: "lateNightSupplement",
          scheduled_at: "2026-07-17T19:00:00.000Z",
        }),
        expect.objectContaining({
          report_date: "2026-07-18",
          batch_id: "morning",
        }),
        expect.objectContaining({
          report_date: "2026-07-18",
          batch_id: "afternoon",
        }),
        expect.objectContaining({
          report_date: "2026-07-17",
          batch_id: "night",
          scheduled_at: "2026-07-17T15:00:00.000Z",
        }),
      ]),
    );
  });

  it("accepts terminal batches, converged manifests, fresh search and healthy API metrics", () => {
    const result = evaluateContentObservability(healthyInput(), NOW);
    expect(result.healthy).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.analytics.server_error_ratio).toBeLessThan(0.01);
    expect(result.analytics.cache_hit_ratio).toBe(0.9);
  });

  it("fails when KV is healthy but the database current run trace is missing", () => {
    const input = healthyInput();
    const missing = input.database.scheduled_runs.shift();
    const result = evaluateContentObservability(input, NOW);
    expect(result.healthy).toBe(false);
    expect(result.reasons).toContain(
      `scheduled_run_database_trace_missing:${missing.run_id}:${dueContentBatches(NOW)[0].report_date}:${dueContentBatches(NOW)[0].batch_id}`,
    );
  });

  it("requires a publication attempt for every changed run", () => {
    const input = healthyInput();
    const missing = input.database.publication_attempts.shift();
    const due = dueContentBatches(NOW).find(
      (run) => run.run_id === missing.trigger_kind,
    );
    const result = evaluateContentObservability(input, NOW);
    expect(result.healthy).toBe(false);
    expect(result.reasons).toContain(
      `scheduled_run_database_attempt_missing:${due.run_id}:${due.report_date}:${due.batch_id}`,
    );
  });

  it("allows a no-op without a new attempt but still requires its database trace", () => {
    const input = healthyInput();
    const noOpRun = input.database.scheduled_runs[0];
    noOpRun.no_op = true;
    input.scheduledOutcomes[0].no_op = true;
    input.database.publication_attempts =
      input.database.publication_attempts.filter(
        (attempt) => attempt.trigger_kind !== noOpRun.run_id,
      );

    expect(evaluateContentObservability(input, NOW).healthy).toBe(true);

    input.database.scheduled_runs.shift();
    const result = evaluateContentObservability(input, NOW);
    expect(result.healthy).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^scheduled_run_database_trace_missing:/),
      ]),
    );
  });

  it("fails when KV and database terminal identities diverge", () => {
    const input = healthyInput();
    input.database.scheduled_runs[0].dispatch_id =
      "44444444-4444-4444-8444-444444444444";
    const result = evaluateContentObservability(input, NOW);
    expect(result.healthy).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^scheduled_run_database_trace_mismatch:/),
      ]),
    );
  });

  it("paginates a thirty-hour health query without exceeding sixteen slots", async () => {
    const fetcher = vi.fn(async (url) => ({
      success: true,
      slots: url.searchParams.getAll("scheduled_at").map((scheduled_at) => ({
        scheduled_at,
        status: "succeeded",
      })),
    }));
    const runs = await scheduledRunHealth(
      {
        scheduleHealthUrl: new URL("https://schedule.example.test/health/scheduled"),
        scheduleHealthToken: "x".repeat(32),
        startedAt: -Infinity,
      },
      NOW,
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([url]) =>
      url.searchParams.getAll("scheduled_at").length <= 16
    )).toBe(true);
    expect(runs).toHaveLength(dueContentBatches(NOW).length);
  });

  it("fails closed on missing batches, manifest drift, stale search and bad API signals", () => {
    const input = healthyInput();
    input.scheduledOutcomes.pop();
    input.database.search_latest_report_date = "2026-07-16";
    input.currentEndpoints[0].body = { ...CURRENT, site_release_sequence: 41 };
    input.staticManifests[0].body.build = {
      ...CURRENT,
      artifact_sha256: "c".repeat(64),
    };
    input.analytics = {
      cache_hits: 100,
      cacheable_requests: 1000,
      requests: 1000,
      server_errors: 20,
    };
    input.database.outbox.dead_letter_count = 1;
    input.scheduledOutcomes[0].status = "failed";
    const result = evaluateContentObservability(input, NOW);
    expect(result.healthy).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^scheduled_run_missing:/),
        expect.stringMatching(/^current_manifest_drift:/),
        expect.stringMatching(/^static_manifest_drift:/),
        expect.stringMatching(/^search_stale:/),
        expect.stringMatching(/^api_5xx_ratio:/),
        expect.stringMatching(/^api_cache_hit_ratio:/),
        "outbox_dead_letter:1",
        expect.stringMatching(/^scheduled_run_failed:/),
      ]),
    );
  });
});

describe("content observability production identity", () => {
  const env = {
    CONTENT_OBSERVABILITY_DATABASE_URL:
      "postgresql://content_deployer.abcdefghijklmnopqrst:secret@aws-0-us-east-1.pooler.supabase.com/postgres",
    CONTENT_DATABASE_PROJECT_REF: "abcdefghijklmnopqrst",
    CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
    CLOUDFLARE_ZONE_ID: "b".repeat(32),
    CLOUDFLARE_ANALYTICS_API_TOKEN: "c".repeat(32),
    CONTENT_SCHEDULE_HEALTH_TOKEN: "d".repeat(32),
    CONTENT_SCHEDULE_HEALTH_URL:
      "https://ai-daily.example.workers.dev/health/scheduled",
    CONTENT_CURRENT_URLS:
      "https://content-api.example.com/v1/current,https://content-api-alt.example.com/v1/current",
    CONTENT_STATIC_MANIFEST_URLS:
      "https://example.com/release-manifests/site-route-manifest.json,https://www.example.com/release-manifests/site-route-manifest.json",
    CONTENT_OBSERVABILITY_STARTED_AT: "2026-07-18T15:00:00.000Z",
  };

  it("requires a matching project topology and independent endpoint sets", () => {
    expect(validateContentObservabilityEnvironment(env)).toMatchObject({
      projectRef: "abcdefghijklmnopqrst",
      cacheHitMinimum: 0.5,
      cacheSampleMinimum: 100,
    });
    expect(() =>
      validateContentObservabilityEnvironment({
        ...env,
        CONTENT_DATABASE_PROJECT_REF: "znurdobjryrhshzkalup",
      }),
    ).toThrow(/shared Supabase project/);
    expect(
      validateContentObservabilityEnvironment({
        ...env,
        CONTENT_OBSERVABILITY_DATABASE_URL:
          "postgresql://content_deployer.znurdobjryrhshzkalup:secret@aws-0-us-east-1.pooler.supabase.com/postgres",
        CONTENT_DATABASE_PROJECT_REF: "znurdobjryrhshzkalup",
        CONTENT_DATABASE_TOPOLOGY: "shared_project",
        CONTENT_SHARED_PROJECT_ACK: SHARED_CONTENT_PROJECT_ACK,
      }),
    ).toMatchObject({
      projectRef: "znurdobjryrhshzkalup",
      topology: "shared_project",
    });
    expect(() =>
      validateContentObservabilityEnvironment({
        ...env,
        CONTENT_OBSERVABILITY_DATABASE_URL:
          "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0-us-east-1.pooler.supabase.com/postgres",
      }),
    ).toThrow(/must use content_deployer/);
  });

  it("rejects malformed analytics counters instead of deriving misleading ratios", () => {
    const input = healthyInput();
    input.analytics.cache_hits = 1001;
    const result = evaluateContentObservability(input, NOW);
    expect(result.healthy).toBe(false);
    expect(result.reasons).toContain("api_analytics_sample_invalid");
  });

  it("alerts when a production release-head claim remains occupied", () => {
    const input = healthyInput();
    input.database.outbox.release_head_stale_count = 1;
    const result = evaluateContentObservability(input, NOW);
    expect(result.healthy).toBe(false);
    expect(result.reasons).toContain("release_head_stale:1");
  });

  it("does not alert on a valid zero-traffic analytics window", () => {
    const input = healthyInput();
    input.analytics = {
      cache_hits: 0,
      cacheable_requests: 0,
      requests: 0,
      server_errors: 0,
    };
    const result = evaluateContentObservability(input, NOW);
    expect(result.healthy).toBe(true);
    expect(result.analytics.server_error_ratio).toBeNull();
    expect(result.analytics.cache_hit_ratio).toBeNull();
  });

  it("does not require terminal attempts for slots before monitoring started", () => {
    const input = healthyInput();
    input.startedAt = Date.parse("2026-07-18T07:00:00.000Z");
    input.database.publication_attempts =
      input.database.publication_attempts.filter(
        (attempt) => Date.parse(attempt.scheduled_at) >= input.startedAt,
      );
    const result = evaluateContentObservability(input, NOW);
    expect(result.healthy).toBe(true);
    expect(
      result.due_batches.every(
        (batch) => Date.parse(batch.scheduled_at) >= input.startedAt,
      ),
    ).toBe(true);
  });
});

const WINDOW_START = "2026-07-17";
const WINDOW_NOW = Date.parse("2026-07-18T21:00:00.000Z");

function healthyWindowInput() {
  const expected = expectedObservationSlots(WINDOW_START);
  const slots = expected.map((entry, index) => {
    const siteReleaseId = `11111111-1111-4111-8${String(index).padStart(3, "0")}-${String(index + 1).padStart(12, "0")}`;
    const slot = {
      artifact_fingerprint_sha256: "b".repeat(64),
      artifact_production_verified_at: new Date(
        Date.parse(entry.deadline) + 30_000,
      ).toISOString(),
      artifact_sha256: "a".repeat(64),
      batch_id: entry.batch_id,
      build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
      code_sha: "f".repeat(40),
      edge_verified_at: new Date(
        Date.parse(entry.deadline) + 60_000,
      ).toISOString(),
      stable_verified_at: new Date(
        Date.parse(entry.deadline) + 90_000,
      ).toISOString(),
      input_sha256: "e".repeat(64),
      outbox_active_leases: 0,
      outbox_all_deployed: true,
      outbox_count: 1,
      report_byte_sha256: "e".repeat(64),
      report_date: entry.report_date,
      report_object_key: `report-snapshots/sha256/${"e".repeat(64)}.json`,
      report_snapshot_id: `22222222-2222-4222-8${String(index).padStart(3, "0")}-${String(index + 1).padStart(12, "0")}`,
      site_content_sha256: "d".repeat(64),
      site_manifest_sha256: "c".repeat(64),
      site_release_id: siteReleaseId,
      site_release_sequence: index + 1,
    };
    slot.edge_evidence = {
      artifact_fingerprint_sha256: slot.artifact_fingerprint_sha256,
      artifact_sha256: slot.artifact_sha256,
      build_environment_version: slot.build_environment_version,
      code_sha: slot.code_sha,
      content_sha256: slot.site_content_sha256,
      convergence_elapsed_ms: 15_000,
      endpoints: [
        { url: "https://one.example.com", colo: "IAD" },
        { url: "https://two.example.com", colo: "SJC" },
      ],
      manifest_sha256: slot.site_manifest_sha256,
      maximum_inconsistency_ms: 60_000,
      multi_edge_verified: true,
      site_release_id: slot.site_release_id,
      site_release_sequence: slot.site_release_sequence,
    };
    return slot;
  });
  return {
    checks: slots.map((slot, index) => ({
      analytics: {},
      checked_at: new Date(
        Date.parse(slot.edge_verified_at) + 60_000,
      ).toISOString(),
      current: {
        artifact_fingerprint_sha256: slot.artifact_fingerprint_sha256,
        artifact_sha256: slot.artifact_sha256,
        build_environment_version: slot.build_environment_version,
        code_sha: slot.code_sha,
        content_sha256: slot.site_content_sha256,
        manifest_sha256: slot.site_manifest_sha256,
        site_release_id: slot.site_release_id,
        site_release_sequence: slot.site_release_sequence,
      },
      due_batches: [expected[index]],
      due_runs: [expected[index]],
      healthy: true,
      outbox: {},
      reasons: [],
    })),
    end_at: "2026-07-18T16:00:00.000Z",
    failure_events: [],
    manual_actions: [],
    publication_attempts: expected.map((entry) => ({
      attempt_number: 1,
      batch_id: entry.batch_id,
      report_date: entry.report_date,
      status: "succeeded",
      trigger_kind: entry.expected_trigger_kind,
    })),
    scheduled_runs: expected.map((entry, index) => ({
      run_id: entry.run_id,
      scheduled_at: entry.scheduled_at,
      started_at: entry.scheduled_at,
      finished_at: new Date(
        Date.parse(entry.scheduled_at) + 60_000,
      ).toISOString(),
      status: "succeeded",
      source_result: { status: "succeeded" },
      content_sha256: "e".repeat(64),
      database_mirror: { status: "mirrored" },
      no_op: false,
      site_release_id: slots[index].site_release_id,
      dispatch_id: `33333333-3333-4333-8${String(index).padStart(3, "0")}-${String(index + 1).padStart(12, "0")}`,
      stable_verified_at: slots[index].stable_verified_at,
    })),
    ready_at: "2026-07-18T20:10:00.000Z",
    slots,
    start_at: "2026-07-16T16:00:00.000Z",
    start_date: WINDOW_START,
    window_complete: true,
  };
}

describe("two-day production observation gate", () => {
  it("derives all thirty-four real scheduled triggers including 23:00 and lateNight", () => {
    const slots = expectedObservationSlots(WINDOW_START);
    expect(slots).toHaveLength(34);
    expect(slots).toContainEqual(expect.objectContaining({
      batch_id: "night",
      expected_trigger_kind: `scheduled:${Date.parse("2026-07-17T15:00:00.000Z")}`,
      report_date: "2026-07-17",
    }));
    expect(slots).toContainEqual(expect.objectContaining({
      batch_id: "lateNight",
      publication_batch_id: "lateNightSupplement",
      expected_trigger_kind: `scheduled:${Date.parse("2026-07-17T19:00:00.000Z")}`,
      report_date: "2026-07-17",
    }));
    expect(slots.at(-1).deadline).toBe("2026-07-18T20:10:00.000Z");
  });

  it("passes only when all thirty-four runs have immutable, edge and monitor evidence", () => {
    const result = evaluateContentObservationWindow(
      healthyWindowInput(),
      WINDOW_NOW,
    );
    expect(result.status).toBe("passed");
    expect(result.measurable_gate_passed).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.independent_incident_and_reviewer_evidence_required).toBe(
      true,
    );
  });

  it("accepts a healthy code release that preserves a slot's content root", () => {
    const input = healthyWindowInput();
    input.checks[0].current = {
      ...input.checks[0].current,
      artifact_fingerprint_sha256: "9".repeat(64),
      artifact_sha256: "8".repeat(64),
      code_sha: "7".repeat(40),
      manifest_sha256: "6".repeat(64),
      release_kind: "code",
      site_release_id: "99999999-9999-4999-8999-999999999999",
      site_release_sequence: input.slots[0].site_release_sequence + 1,
    };
    const result = evaluateContentObservationWindow(input, WINDOW_NOW);
    expect(result.measurable_gate_passed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("fails on manual repair, noncanonical trigger, rollback or missing edge evidence", () => {
    const input = healthyWindowInput();
    input.publication_attempts[0].trigger_kind = "manual:repair";
    input.manual_actions.push({ action: "operations.retry" });
    input.failure_events.push({ event_type: "rollback_committed" });
    input.slots[1].edge_evidence.maximum_inconsistency_ms = 300_001;
    input.checks[2].healthy = false;
    const result = evaluateContentObservationWindow(input, WINDOW_NOW);
    expect(result.measurable_gate_passed).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "observation_contains_unhealthy_check",
        "manual_repair_actions:1",
        "production_failure_or_rollback_events:1",
        expect.stringMatching(/^scheduled_run_attempt_missing:/),
        expect.stringMatching(/^slot_edge_evidence_invalid:/),
        expect.stringMatching(/^slot_healthy_observation_missing:/),
      ]),
    );
  });
});
