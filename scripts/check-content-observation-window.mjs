#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

import { validateContentObservabilityDatabaseEnvironment } from "./check-content-observability.mjs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const SHA1 = /^[a-f0-9]{40}$/;
const BATCHES = [
  [2, "morning"],
  [7, "afternoon"],
  [15, "night"],
  [19, "lateNight"],
];

function validDate(value) {
  if (!DATE.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function expectedObservationSlots(startDate) {
  if (!validDate(startDate))
    throw new Error("observation start date is invalid");
  const slots = [];
  for (let day = 0; day < 2; day += 1) {
    const reportDate = addDays(startDate, day);
    for (const [hour, batchId] of BATCHES) {
      const scheduledAt = Date.parse(
        `${reportDate}T${String(hour).padStart(2, "0")}:00:00.000Z`,
      );
      slots.push({
        batch_id: batchId,
        deadline: new Date(scheduledAt + 10 * 60 * 1000).toISOString(),
        expected_trigger_kind: `scheduled:${scheduledAt}`,
        report_date: reportDate,
        scheduled_at: new Date(scheduledAt).toISOString(),
      });
    }
  }
  return slots;
}

function identityMatches(current, slot) {
  return (
    current?.site_release_id === slot.site_release_id &&
    Number(current?.site_release_sequence) ===
      Number(slot.site_release_sequence) &&
    current?.manifest_sha256 === slot.site_manifest_sha256 &&
    current?.content_sha256 === slot.site_content_sha256 &&
    current?.artifact_sha256 === slot.artifact_sha256 &&
    current?.artifact_fingerprint_sha256 === slot.artifact_fingerprint_sha256 &&
    current?.code_sha === slot.code_sha &&
    current?.build_environment_version === slot.build_environment_version
  );
}

function verifierIdentityComplete(slot) {
  const evidence = slot.edge_evidence;
  const endpoints = Array.isArray(evidence?.endpoints)
    ? evidence.endpoints
    : [];
  const origins = new Set(endpoints.map((entry) => String(entry?.url || "")));
  return (
    evidence?.multi_edge_verified === true &&
    identityMatches(
      {
        ...evidence,
        manifest_sha256: evidence.manifest_sha256,
      },
      slot,
    ) &&
    Number.isSafeInteger(Number(evidence.convergence_elapsed_ms)) &&
    Number(evidence.convergence_elapsed_ms) >= 0 &&
    Number.isSafeInteger(Number(evidence.maximum_inconsistency_ms)) &&
    Number(evidence.maximum_inconsistency_ms) >= 10_000 &&
    Number(evidence.maximum_inconsistency_ms) <= 300_000 &&
    Number(evidence.convergence_elapsed_ms) <=
      Number(evidence.maximum_inconsistency_ms) &&
    endpoints.length >= 2 &&
    origins.size >= 2
  );
}

function checkCoversSlot(check, slot, expected, upperBound) {
  const checkedAt = Date.parse(String(check?.checked_at || ""));
  const lowerBound = Math.max(
    Date.parse(expected.deadline),
    Date.parse(String(slot.edge_verified_at || "")),
  );
  return (
    check?.healthy === true &&
    Array.isArray(check.reasons) &&
    check.reasons.length === 0 &&
    Number.isFinite(checkedAt) &&
    Number.isFinite(lowerBound) &&
    checkedAt >= lowerBound &&
    checkedAt < upperBound &&
    (identityMatches(check.current, slot) ||
      (check.current?.release_kind === "code" &&
        UUID.test(String(check.current?.site_release_id || "")) &&
        Number(check.current?.site_release_sequence) >
          Number(slot.site_release_sequence) &&
        check.current?.content_sha256 === slot.site_content_sha256)) &&
    Array.isArray(check.due_batches) &&
    check.due_batches.some(
      (batch) =>
        batch?.report_date === expected.report_date &&
        batch?.batch_id === expected.batch_id,
    )
  );
}

export function evaluateContentObservationWindow(input, now = Date.now()) {
  const reasons = [];
  const startDate = String(input?.start_date || "");
  let expectedSlots;
  try {
    expectedSlots = expectedObservationSlots(startDate);
  } catch {
    return {
      checked_at: new Date(now).toISOString(),
      measurable_gate_passed: false,
      reasons: ["observation_start_date_invalid"],
      status: "failed",
    };
  }
  const readyAt = Date.parse(String(input?.ready_at || ""));
  if (
    input?.window_complete !== true ||
    !Number.isFinite(readyAt) ||
    now < readyAt
  ) {
    reasons.push("observation_window_not_complete");
  }

  const attempts = Array.isArray(input?.publication_attempts)
    ? input.publication_attempts
    : [];
  const slots = Array.isArray(input?.slots) ? input.slots : [];
  const checks = Array.isArray(input?.checks) ? input.checks : [];
  if (checks.some((check) => check?.healthy !== true))
    reasons.push("observation_contains_unhealthy_check");
  if (Array.isArray(input?.manual_actions) && input.manual_actions.length)
    reasons.push(`manual_repair_actions:${input.manual_actions.length}`);
  if (Array.isArray(input?.failure_events) && input.failure_events.length)
    reasons.push(
      `production_failure_or_rollback_events:${input.failure_events.length}`,
    );

  for (let index = 0; index < expectedSlots.length; index += 1) {
    const expected = expectedSlots[index];
    const key = `${expected.report_date}:${expected.batch_id}`;
    const matchingAttempts = attempts
      .filter(
        (attempt) =>
          attempt?.report_date === expected.report_date &&
          attempt?.batch_id === expected.batch_id,
      )
      .sort(
        (left, right) =>
          Number(left.attempt_number) - Number(right.attempt_number),
      );
    if (!matchingAttempts.length) {
      reasons.push(`slot_attempt_missing:${key}`);
    } else {
      if (
        matchingAttempts.some(
          (attempt) => attempt.trigger_kind !== expected.expected_trigger_kind,
        )
      ) {
        reasons.push(`slot_noncanonical_trigger:${key}`);
      }
      if (matchingAttempts.at(-1)?.status !== "succeeded")
        reasons.push(`slot_final_attempt_not_succeeded:${key}`);
      if (matchingAttempts.some((attempt) => attempt.status === "started"))
        reasons.push(`slot_attempt_unfinished:${key}`);
    }

    const matchingSlots = slots.filter(
      (slot) =>
        slot?.report_date === expected.report_date &&
        slot?.batch_id === expected.batch_id,
    );
    if (matchingSlots.length !== 1) {
      reasons.push(`slot_semantic_result_count:${key}:${matchingSlots.length}`);
      continue;
    }
    const slot = matchingSlots[0];
    if (
      !UUID.test(String(slot.report_snapshot_id || "")) ||
      !UUID.test(String(slot.site_release_id || "")) ||
      !SHA256.test(String(slot.report_byte_sha256 || "")) ||
      slot.report_object_key !==
        `report-snapshots/sha256/${slot.report_byte_sha256}.json` ||
      !SHA256.test(String(slot.site_manifest_sha256 || "")) ||
      !SHA256.test(String(slot.site_content_sha256 || "")) ||
      !SHA256.test(String(slot.artifact_sha256 || "")) ||
      !SHA256.test(String(slot.artifact_fingerprint_sha256 || "")) ||
      !SHA1.test(String(slot.code_sha || "")) ||
      !slot.build_environment_version ||
      !slot.artifact_production_verified_at
    ) {
      reasons.push(`slot_immutable_identity_invalid:${key}`);
    }
    if (
      Number(slot.outbox_count) < 1 ||
      slot.outbox_all_deployed !== true ||
      Number(slot.outbox_active_leases) !== 0
    ) {
      reasons.push(`slot_outbox_not_reconciled:${key}`);
    }
    if (!slot.edge_verified_at || !verifierIdentityComplete(slot))
      reasons.push(`slot_edge_evidence_invalid:${key}`);

    const nextScheduledAt = expectedSlots[index + 1]?.scheduled_at;
    const upperBound = nextScheduledAt
      ? Date.parse(nextScheduledAt)
      : readyAt + 6 * 60 * 60 * 1000;
    if (
      !checks.some((check) =>
        checkCoversSlot(check, slot, expected, upperBound),
      )
    )
      reasons.push(`slot_healthy_observation_missing:${key}`);
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    checked_at: new Date(now).toISOString(),
    expected_slots: expectedSlots,
    independent_incident_and_reviewer_evidence_required: true,
    measurable_gate_passed: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    start_date: startDate,
    status: uniqueReasons.length === 0 ? "passed" : "failed",
    window_end_at: input?.end_at || null,
    window_ready_at: input?.ready_at || null,
  };
}

async function run(env = process.env, argv = process.argv.slice(2)) {
  const { databaseUrl, projectRef } =
    validateContentObservabilityDatabaseEnvironment(env);
  const startDate = String(env.CONTENT_OBSERVATION_START_DATE || "").trim();
  if (!validDate(startDate))
    throw new Error("CONTENT_OBSERVATION_START_DATE is invalid");
  const evidenceIndex = argv.indexOf("--evidence-out");
  const evidenceOut = evidenceIndex >= 0 ? argv[evidenceIndex + 1] : null;
  if (evidenceIndex >= 0 && !evidenceOut)
    throw new Error("--evidence-out requires a path");

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    ssl: "require",
  });
  try {
    const rows = await sql`
      select private.get_content_observation_window_v1(${startDate}::date) as result
    `;
    const raw = rows[0]?.result;
    if (!raw || typeof raw !== "object")
      throw new Error("content observation window RPC returned no result");
    const evaluated = evaluateContentObservationWindow(raw);
    const result = {
      ...evaluated,
      kind: "content-database-v4.1-production-observation-window",
      project_ref: projectRef,
      schema_version: 1,
    };
    const output = `${JSON.stringify(result, null, 2)}\n`;
    if (evidenceOut) await writeFile(evidenceOut, output, "utf8");
    process.stdout.write(output);
    if (!result.measurable_gate_passed) process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
