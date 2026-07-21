#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import postgres from "postgres";

import { validateContentDatabaseTopology } from "./content-database-topology.mjs";

const PROJECT_REF = /^[a-z0-9]{20}$/;
const ACCOUNT_ID = /^[a-f0-9]{32}$/i;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const BATCHES = [
  [2, "morning"],
  [7, "afternoon"],
  [15, "night"],
  [18, "lateNight"],
  [19, "lateNightSupplement"],
];

function required(label, value) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} is missing`);
  if (/replace[_-]?with|change[_-]?me|todo/i.test(normalized))
    throw new Error(`${label} contains a placeholder`);
  return normalized;
}

function urls(label, value) {
  const entries = required(label, value)
    .split(",")
    .map((entry) => entry.trim());
  if (entries.length < 2) throw new Error(`${label} requires two endpoints`);
  const parsed = entries.map((entry) => {
    const parsed = new URL(entry);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.hash
    ) {
      throw new Error(`${label} contains an unsafe URL`);
    }
    return parsed;
  });
  if (new Set(parsed.map((entry) => entry.origin)).size < 2)
    throw new Error(`${label} requires two distinct origins`);
  return parsed;
}

function projectRefFromDatabaseUrl(value) {
  const parsed = new URL(value);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol))
    throw new Error("observability database URL must be PostgreSQL");
  const username = decodeURIComponent(parsed.username);
  const role = username.match(/^content_deployer(?:\.([a-z0-9]{20}))?$/i);
  if (!role)
    throw new Error("observability database URL must use content_deployer");
  return (
    parsed.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/i)?.[1] ||
    role[1] ||
    ""
  );
}

export function validateContentObservabilityDatabaseEnvironment(env) {
  const databaseUrl = required(
    "CONTENT_OBSERVABILITY_DATABASE_URL",
    env.CONTENT_OBSERVABILITY_DATABASE_URL,
  );
  const projectRef = required(
    "CONTENT_DATABASE_PROJECT_REF",
    env.CONTENT_DATABASE_PROJECT_REF,
  );
  const topology = validateContentDatabaseTopology(env, projectRef);
  if (
    !PROJECT_REF.test(projectRef) ||
    projectRefFromDatabaseUrl(databaseUrl) !== projectRef
  ) {
    throw new Error(
      "observability database URL does not match the content project ref",
    );
  }
  return { databaseUrl, projectRef, topology };
}

export function validateContentObservabilityEnvironment(env) {
  const { databaseUrl, projectRef, topology } =
    validateContentObservabilityDatabaseEnvironment(env);
  const accountId = required(
    "CLOUDFLARE_ACCOUNT_ID",
    env.CLOUDFLARE_ACCOUNT_ID,
  );
  const zoneId = required("CLOUDFLARE_ZONE_ID", env.CLOUDFLARE_ZONE_ID);
  if (!ACCOUNT_ID.test(accountId) || !ACCOUNT_ID.test(zoneId))
    throw new Error("Cloudflare account or zone ID is invalid");
  const apiToken = required(
    "CLOUDFLARE_ANALYTICS_API_TOKEN",
    env.CLOUDFLARE_ANALYTICS_API_TOKEN,
  );
  if (apiToken.length < 32)
    throw new Error("Cloudflare analytics token is too short");
  const scheduleHealthToken = required(
    "CONTENT_SCHEDULE_HEALTH_TOKEN",
    env.CONTENT_SCHEDULE_HEALTH_TOKEN,
  );
  if (scheduleHealthToken.length < 32)
    throw new Error("content schedule health token is too short");
  const scheduleHealthUrl = new URL(
    required("CONTENT_SCHEDULE_HEALTH_URL", env.CONTENT_SCHEDULE_HEALTH_URL),
  );
  if (
    scheduleHealthUrl.protocol !== "https:" ||
    scheduleHealthUrl.username ||
    scheduleHealthUrl.password ||
    scheduleHealthUrl.pathname !== "/health/scheduled" ||
    scheduleHealthUrl.search ||
    scheduleHealthUrl.hash
  ) {
    throw new Error(
      "CONTENT_SCHEDULE_HEALTH_URL must be an exact HTTPS /health/scheduled endpoint",
    );
  }
  const currentUrls = urls("CONTENT_CURRENT_URLS", env.CONTENT_CURRENT_URLS);
  if (currentUrls.some((url) => url.pathname !== "/v1/current" || url.search))
    throw new Error(
      "CONTENT_CURRENT_URLS must contain exact /v1/current endpoints",
    );
  const manifestUrls = urls(
    "CONTENT_STATIC_MANIFEST_URLS",
    env.CONTENT_STATIC_MANIFEST_URLS,
  );
  if (
    manifestUrls.some(
      (url) =>
        !url.pathname.endsWith("/release-manifests/site-route-manifest.json") ||
        url.search,
    )
  ) {
    throw new Error(
      "CONTENT_STATIC_MANIFEST_URLS must contain site-route-manifest.json endpoints",
    );
  }
  const cacheHitMinimum = Number(env.CONTENT_API_CACHE_HIT_MINIMUM ?? "0.5");
  const cacheSampleMinimum = Number(
    env.CONTENT_API_CACHE_SAMPLE_MINIMUM ?? "100",
  );
  const startedAtText = required(
    "CONTENT_OBSERVABILITY_STARTED_AT",
    env.CONTENT_OBSERVABILITY_STARTED_AT,
  );
  const startedAt = Date.parse(startedAtText);
  if (
    !Number.isFinite(cacheHitMinimum) ||
    cacheHitMinimum < 0 ||
    cacheHitMinimum > 1 ||
    !Number.isSafeInteger(cacheSampleMinimum) ||
    cacheSampleMinimum < 1
  ) {
    throw new Error("cache observability thresholds are invalid");
  }
  if (
    !Number.isFinite(startedAt) ||
    new Date(startedAt).toISOString() !== startedAtText
  ) {
    throw new Error(
      "CONTENT_OBSERVABILITY_STARTED_AT must be an exact UTC ISO timestamp",
    );
  }
  return {
    accountId,
    apiToken,
    cacheHitMinimum,
    cacheSampleMinimum,
    currentUrls,
    databaseUrl,
    manifestUrls,
    projectRef,
    scheduleHealthToken,
    scheduleHealthUrl,
    startedAt,
    topology,
    zoneId,
  };
}

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

export function dueContentBatches(now = Date.now(), lookbackHours = 30) {
  const due = [];
  const start = now - lookbackHours * 60 * 60 * 1000;
  const firstDay = new Date(start);
  firstDay.setUTCHours(0, 0, 0, 0);
  for (let day = firstDay.getTime(); day <= now; day += 24 * 60 * 60 * 1000) {
    for (const [hour, batch_id] of BATCHES) {
      const scheduled_at = day + hour * 60 * 60 * 1000;
      if (scheduled_at < start || scheduled_at + 10 * 60 * 1000 > now) continue;
      due.push({
        batch_id,
        deadline: new Date(scheduled_at + 10 * 60 * 1000).toISOString(),
        report_date: dateString(new Date(day)),
        scheduled_at: new Date(scheduled_at).toISOString(),
      });
    }
  }
  return due;
}

function currentIdentity(value) {
  return {
    artifact_fingerprint_sha256: String(
      value?.artifact_fingerprint_sha256 || "",
    ),
    artifact_sha256: String(value?.artifact_sha256 || ""),
    build_environment_version: String(value?.build_environment_version || ""),
    code_sha: String(value?.code_sha || ""),
    content_sha256: String(value?.content_sha256 || ""),
    manifest_sha256: String(value?.manifest_sha256 || ""),
    content_base_release_id: String(value?.content_base_release_id || ""),
    release_kind: String(value?.release_kind || "content"),
    site_release_id: String(value?.site_release_id || ""),
    site_release_sequence: Number(value?.site_release_sequence),
  };
}

function staticIdentity(value) {
  const build = value?.build || {};
  return {
    artifact_fingerprint_sha256: String(build.artifact_sha256 || ""),
    build_environment_version: String(build.build_environment_version || ""),
    code_sha: String(build.code_sha || ""),
    content_sha256: String(build.content_sha256 || ""),
    manifest_sha256: String(build.manifest_sha256 || ""),
    site_release_id: String(build.site_release_id || ""),
    site_release_sequence: Number(build.site_release_sequence),
  };
}

function sameCurrentIdentity(left, right) {
  return (
    left.site_release_id === right.site_release_id &&
    left.site_release_sequence === right.site_release_sequence &&
    left.manifest_sha256 === right.manifest_sha256 &&
    left.content_sha256 === right.content_sha256 &&
    left.artifact_sha256 === right.artifact_sha256 &&
    left.artifact_fingerprint_sha256 === right.artifact_fingerprint_sha256 &&
    left.code_sha === right.code_sha &&
    left.build_environment_version === right.build_environment_version
  );
}

function sameStaticIdentity(current, staticManifest) {
  return (
    current.site_release_id === staticManifest.site_release_id &&
    current.site_release_sequence === staticManifest.site_release_sequence &&
    current.manifest_sha256 === staticManifest.manifest_sha256 &&
    current.content_sha256 === staticManifest.content_sha256 &&
    current.artifact_fingerprint_sha256 ===
      staticManifest.artifact_fingerprint_sha256 &&
    current.code_sha === staticManifest.code_sha &&
    current.build_environment_version ===
      staticManifest.build_environment_version
  );
}

export function evaluateContentObservability(input, now = Date.now()) {
  const reasons = [];
  const database = input.database || {};
  const current = currentIdentity(database.current);
  if (
    !UUID.test(current.site_release_id) ||
    !Number.isSafeInteger(current.site_release_sequence) ||
    !SHA256.test(current.manifest_sha256) ||
    !SHA256.test(current.content_sha256) ||
    !SHA256.test(current.artifact_sha256) ||
    !SHA256.test(current.artifact_fingerprint_sha256) ||
    !/^[a-f0-9]{40}$/.test(current.code_sha) ||
    !current.build_environment_version
  ) {
    reasons.push("database_current_identity_invalid");
  }

  for (const endpoint of input.currentEndpoints || []) {
    if (!sameCurrentIdentity(current, currentIdentity(endpoint.body)))
      reasons.push(`current_manifest_drift:${endpoint.url}`);
  }
  for (const endpoint of input.staticManifests || []) {
    if (!sameStaticIdentity(current, staticIdentity(endpoint.body)))
      reasons.push(`static_manifest_drift:${endpoint.url}`);
  }

  const attempts = new Map(
    (database.publication_attempts || []).map((attempt) => [
      `${attempt.report_date}:${attempt.batch_id}`,
      attempt,
    ]),
  );
  const dueBatches = dueContentBatches(now).filter(
    (batch) => Date.parse(batch.scheduled_at) >= (input.startedAt ?? -Infinity),
  );
  const scheduledOutcomes = new Map(
    (input.scheduledOutcomes || []).map((outcome) => [
      String(outcome?.scheduled_at || ""),
      outcome,
    ]),
  );
  for (const due of dueBatches) {
    const scheduledOutcome = scheduledOutcomes.get(due.scheduled_at);
    const scheduledKey = `${due.report_date}:${due.batch_id}:${due.scheduled_at}`;
    if (!scheduledOutcome || scheduledOutcome.status === "missing") {
      reasons.push(`scheduled_run_missing:${scheduledKey}`);
    } else if (scheduledOutcome.status !== "succeeded") {
      reasons.push(`scheduled_run_failed:${scheduledKey}`);
    }
    const attempt = attempts.get(`${due.report_date}:${due.batch_id}`);
    if (!attempt || !["succeeded", "failed"].includes(attempt.status)) {
      reasons.push(`batch_terminal_missing:${due.report_date}:${due.batch_id}`);
    } else if (attempt.status === "failed") {
      reasons.push(`batch_failed:${due.report_date}:${due.batch_id}`);
    }
  }

  const latestSucceededDate = [...attempts.values()]
    .filter((attempt) => attempt.status === "succeeded")
    .map((attempt) => String(attempt.report_date))
    .sort()
    .at(-1);
  const searchLatestDate = String(database.search_latest_report_date || "");
  if (latestSucceededDate && searchLatestDate < latestSucceededDate) {
    reasons.push(
      `search_stale:${searchLatestDate || "missing"}:${latestSucceededDate}`,
    );
  }

  const deadLetterCount = Number(database.outbox?.dead_letter_count || 0);
  const staleQueuedCount = Number(database.outbox?.stale_queued_count || 0);
  const releaseHeadStaleCount = Number(
    database.outbox?.release_head_stale_count || 0,
  );
  if (
    !Number.isSafeInteger(deadLetterCount) ||
    deadLetterCount < 0 ||
    !Number.isSafeInteger(staleQueuedCount) ||
    staleQueuedCount < 0
  ) {
    reasons.push("outbox_state_invalid");
  } else {
    if (deadLetterCount > 0)
      reasons.push(`outbox_dead_letter:${deadLetterCount}`);
    if (staleQueuedCount > 0)
      reasons.push(`outbox_stale_queued:${staleQueuedCount}`);
  }
  if (
    !Number.isSafeInteger(releaseHeadStaleCount) ||
    releaseHeadStaleCount < 0
  ) {
    reasons.push("release_head_state_invalid");
  } else if (releaseHeadStaleCount > 0) {
    reasons.push(`release_head_stale:${releaseHeadStaleCount}`);
  }

  const requests = Number(input.analytics?.requests || 0);
  const serverErrors = Number(input.analytics?.server_errors || 0);
  const cacheableRequests = Number(input.analytics?.cacheable_requests || 0);
  const cacheHits = Number(input.analytics?.cache_hits || 0);
  if (
    ![requests, serverErrors, cacheableRequests, cacheHits].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    serverErrors > requests ||
    cacheableRequests > requests ||
    cacheHits > cacheableRequests
  ) {
    reasons.push("api_analytics_sample_invalid");
  }
  const serverErrorRatio = requests > 0 ? serverErrors / requests : null;
  if (serverErrorRatio !== null && serverErrorRatio > 0.01)
    reasons.push(`api_5xx_ratio:${serverErrorRatio.toFixed(6)}`);
  const cacheHitRatio =
    cacheableRequests > 0 ? cacheHits / cacheableRequests : null;
  if (
    cacheHitRatio !== null &&
    cacheableRequests >= input.cacheSampleMinimum &&
    cacheHitRatio < input.cacheHitMinimum
  ) {
    reasons.push(`api_cache_hit_ratio:${cacheHitRatio.toFixed(6)}`);
  }

  return {
    analytics: {
      cache_hit_ratio: cacheHitRatio,
      cache_hits: cacheHits,
      cacheable_requests: cacheableRequests,
      requests,
      server_error_ratio: serverErrorRatio,
      server_errors: serverErrors,
    },
    checked_at: new Date(now).toISOString(),
    current,
    due_batches: dueBatches,
    healthy: reasons.length === 0,
    outbox: {
      dead_letter_count: deadLetterCount,
      release_head_stale_count: releaseHeadStaleCount,
      stale_queued_count: staleQueuedCount,
    },
    reasons,
    search_latest_report_date: searchLatestDate || null,
  };
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`observability fetch failed: ${response.status}`);
  return response.json();
}

async function cloudflareAnalytics(input, now) {
  const start = new Date(now - 5 * 60 * 1000).toISOString();
  const end = new Date(now).toISOString();
  const hosts = [...new Set(input.currentUrls.map((url) => url.hostname))];
  const body = await fetchJson("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `query ContentApiHealth($zone: String!, $start: Time!, $end: Time!, $hosts: [String!]) {
        viewer { zones(filter: {zoneTag: $zone}) {
          httpRequestsAdaptiveGroups(limit: 10000, filter: {
            datetime_geq: $start, datetime_lt: $end, clientRequestHTTPHost_in: $hosts
          }) { count dimensions { cacheStatus edgeResponseStatus } }
        } }
      }`,
      variables: { end, hosts, start, zone: input.zoneId },
    }),
  });
  if (body.errors?.length) throw new Error("Cloudflare analytics query failed");
  const groups = body.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups;
  if (!Array.isArray(groups))
    throw new Error("Cloudflare analytics response is malformed");
  return groups.reduce(
    (summary, group) => {
      const count = Number(group.count || 0);
      summary.requests += count;
      if (Number(group.dimensions?.edgeResponseStatus) >= 500)
        summary.server_errors += count;
      if (
        ["hit", "miss", "expired", "revalidated"].includes(
          String(group.dimensions?.cacheStatus || "").toLowerCase(),
        )
      ) {
        summary.cacheable_requests += count;
      }
      if (String(group.dimensions?.cacheStatus || "").toLowerCase() === "hit")
        summary.cache_hits += count;
      return summary;
    },
    { cache_hits: 0, cacheable_requests: 0, requests: 0, server_errors: 0 },
  );
}

async function scheduledRunHealth(input, now) {
  const due = dueContentBatches(now).filter(
    (batch) => Date.parse(batch.scheduled_at) >= input.startedAt,
  );
  if (!due.length) return [];
  const url = new URL(input.scheduleHealthUrl);
  for (const batch of due) url.searchParams.append("scheduled_at", batch.scheduled_at);
  const body = await fetchJson(url, {
    headers: { Authorization: `Bearer ${input.scheduleHealthToken}` },
  });
  if (body?.success !== true || !Array.isArray(body.slots)) {
    throw new Error("scheduled run health response is malformed");
  }
  return body.slots;
}

async function run(env = process.env, now = Date.now()) {
  const input = validateContentObservabilityEnvironment(env);
  const sql = postgres(input.databaseUrl, {
    max: 1,
    prepare: false,
    ssl: "require",
  });
  try {
    const rows =
      await sql`select private.get_content_observability_v1() as result`;
    const [currentEndpoints, staticManifests, analytics, scheduledOutcomes] = await Promise.all([
      Promise.all(
        input.currentUrls.map(async (url) => ({
          body: await fetchJson(url, {
            headers: { "Cache-Control": "no-cache" },
          }),
          url: url.href,
        })),
      ),
      Promise.all(
        input.manifestUrls.map(async (url) => ({
          body: await fetchJson(url, {
            headers: { "Cache-Control": "no-cache" },
          }),
          url: url.href,
        })),
      ),
      cloudflareAnalytics(input, now),
      scheduledRunHealth(input, now),
    ]);
    const result = evaluateContentObservability(
      {
        analytics,
        cacheHitMinimum: input.cacheHitMinimum,
        cacheSampleMinimum: input.cacheSampleMinimum,
        currentEndpoints,
        database: rows[0]?.result,
        scheduledOutcomes,
        staticManifests,
        startedAt: input.startedAt,
      },
      now,
    );
    const recorded = await sql`
      select private.record_content_observability_v1(${sql.json(result)}) as result
    `;
    process.stdout.write(
      `${JSON.stringify({ ...result, record: recorded[0]?.result }, null, 2)}\n`,
    );
    if (!result.healthy) process.exitCode = 1;
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
