import { describe, expect, it } from "vitest";
import { SHARED_CONTENT_PROJECT_ACK } from "../../scripts/content-database-topology.mjs";
import {
  dueContentBatches,
  evaluateContentObservability,
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
  return {
    analytics: {
      cache_hits: 900,
      cacheable_requests: 1000,
      requests: 1200,
      server_errors: 2,
    },
    cacheHitMinimum: 0.5,
    cacheSampleMinimum: 100,
    currentEndpoints: [
      { url: "https://api-one.invalid/v1/current", body: CURRENT },
      { url: "https://api-two.invalid/v1/current", body: CURRENT },
    ],
    database: {
      current: CURRENT,
      outbox: { dead_letter_count: 0, stale_queued_count: 0 },
      publication_attempts: due.map((batch) => ({
        ...batch,
        status: "succeeded",
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
  it("maps the four canonical UTC schedules to their report dates", () => {
    expect(dueContentBatches(NOW)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          report_date: "2026-07-17",
          batch_id: "lateNight",
        }),
        expect.objectContaining({
          report_date: "2026-07-18",
          batch_id: "morning",
        }),
        expect.objectContaining({
          report_date: "2026-07-18",
          batch_id: "afternoon",
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

  it("fails closed on missing batches, manifest drift, stale search and bad API signals", () => {
    const input = healthyInput();
    input.database.publication_attempts.pop();
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
    const result = evaluateContentObservability(input, NOW);
    expect(result.healthy).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^batch_terminal_missing:/),
        expect.stringMatching(/^current_manifest_drift:/),
        expect.stringMatching(/^static_manifest_drift:/),
        expect.stringMatching(/^search_stale:/),
        expect.stringMatching(/^api_5xx_ratio:/),
        expect.stringMatching(/^api_cache_hit_ratio:/),
        "outbox_dead_letter:1",
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
const WINDOW_NOW = Date.parse("2026-07-18T20:00:00.000Z");

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
    ready_at: "2026-07-18T19:10:00.000Z",
    slots,
    start_at: "2026-07-16T16:00:00.000Z",
    start_date: WINDOW_START,
    window_complete: true,
  };
}

describe("two-day production observation gate", () => {
  it("derives eight real canonical scheduled triggers including lateNight", () => {
    const slots = expectedObservationSlots(WINDOW_START);
    expect(slots).toHaveLength(8);
    expect(slots[3]).toMatchObject({
      batch_id: "lateNight",
      expected_trigger_kind: `scheduled:${Date.parse("2026-07-17T19:00:00.000Z")}`,
      report_date: "2026-07-17",
    });
    expect(slots[7].deadline).toBe("2026-07-18T19:10:00.000Z");
  });

  it("passes only when all eight releases have immutable, edge and monitor evidence", () => {
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

  it("fails on manual repair, noncanonical trigger, rollback or missing edge evidence", () => {
    const input = healthyWindowInput();
    input.publication_attempts[0].trigger_kind = "manual:repair";
    input.manual_actions.push({ action: "operations.retry" });
    input.failure_events.push({ event_type: "rollback_committed" });
    input.slots[1].edge_evidence.maximum_inconsistency_ms = 300_000;
    input.checks[2].healthy = false;
    const result = evaluateContentObservationWindow(input, WINDOW_NOW);
    expect(result.measurable_gate_passed).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        "observation_contains_unhealthy_check",
        "manual_repair_actions:1",
        "production_failure_or_rollback_events:1",
        "slot_noncanonical_trigger:2026-07-17:morning",
        "slot_edge_evidence_invalid:2026-07-17:afternoon",
        "slot_healthy_observation_missing:2026-07-17:night",
      ]),
    );
  });
});
