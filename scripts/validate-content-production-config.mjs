#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateContentDatabaseTopology } from "./content-database-topology.mjs";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const SHA1 = /^[0-9a-f]{40}$/;
const ACCOUNT_ID = /^[0-9a-f]{32}$/i;
const HYPERDRIVE_ID = /^[0-9a-f]{32}$/i;
const ACCESS_AUD = /^[A-Za-z0-9_-]{20,128}$/;
const PLACEHOLDER =
  /(?:replace[_-]?with|replace-with|change[_-]?me|todo[_-]?secret|^0{32}$)/i;
const BUILD_ENVIRONMENT = "node22.17-astro7-hugo0.147.9-v1";

const WRANGLER_FILES = [
  "wrangler.content-admin.toml",
  "wrangler.content-api.toml",
  "wrangler.content-attestation.toml",
  "wrangler.content-broker.toml",
  "wrangler.content-control.toml",
  "wrangler.content-deployer.toml",
  "wrangler.content-editorial.toml",
];

function fail(message) {
  throw new Error(`content production preflight: ${message}`);
}

function required(label, value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) fail(`${label} is missing`);
  if (PLACEHOLDER.test(normalized))
    fail(`${label} still contains a placeholder`);
  return normalized;
}

function matches(label, value, pattern) {
  const normalized = required(label, value);
  if (!pattern.test(normalized)) fail(`${label} has an invalid format`);
  return normalized;
}

function secret(label, value, minimumLength = 24) {
  const normalized = required(label, value);
  if (normalized.length < minimumLength) fail(`${label} is too short`);
  return normalized;
}

function httpsUrl(label, value, { originOnly = false } = {}) {
  const normalized = required(label, value);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    fail(`${label} is not a URL`);
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (originOnly && (parsed.pathname !== "/" || parsed.search))
  ) {
    fail(
      `${label} must be a credential-free HTTPS ${originOnly ? "origin" : "URL"}`,
    );
  }
  return parsed;
}

function tomlString(document, key) {
  const match = document.match(
    new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"),
  );
  if (!match) fail(`${key} is missing from a Wrangler configuration`);
  return match[1];
}

function validateAccessConfig(name, document) {
  const team = httpsUrl(
    `${name}: CF_ACCESS_TEAM_DOMAIN`,
    tomlString(document, "CF_ACCESS_TEAM_DOMAIN"),
    {
      originOnly: true,
    },
  );
  if (!team.hostname.endsWith(".cloudflareaccess.com")) {
    fail(
      `${name}: CF_ACCESS_TEAM_DOMAIN is not a Cloudflare Access team domain`,
    );
  }
  const audience = matches(
    `${name}: CF_ACCESS_AUD`,
    tomlString(document, "CF_ACCESS_AUD"),
    ACCESS_AUD,
  );
  return { teamOrigin: team.origin, audience };
}

export function validateWranglerDocuments(documents) {
  for (const name of WRANGLER_FILES) {
    const document = documents[name];
    if (typeof document !== "string") fail(`${name} is missing`);
    required(name, document);
    const hyperdrives = [...document.matchAll(/^\s*id\s*=\s*"([^"]*)"/gm)].map(
      (match) => match[1],
    );
    for (const [index, id] of hyperdrives.entries()) {
      matches(`${name}: Hyperdrive id ${index + 1}`, id, HYPERDRIVE_ID);
    }
  }

  const routineAccess = validateAccessConfig(
    "Routine Admin",
    documents["wrangler.content-admin.toml"],
  );
  const controlAccess = validateAccessConfig(
    "Control",
    documents["wrangler.content-control.toml"],
  );
  const attestation = documents["wrangler.content-attestation.toml"];
  const attestationTeam = httpsUrl(
    "Attestation: CF_ACCESS_TEAM_DOMAIN",
    tomlString(attestation, "CF_ACCESS_TEAM_DOMAIN"),
    { originOnly: true },
  );
  if (!attestationTeam.hostname.endsWith(".cloudflareaccess.com")) {
    fail(
      "Attestation: CF_ACCESS_TEAM_DOMAIN is not a Cloudflare Access team domain",
    );
  }
  const attestationRoutineAudience = matches(
    "Attestation: CF_ACCESS_ROUTINE_AUD",
    tomlString(attestation, "CF_ACCESS_ROUTINE_AUD"),
    ACCESS_AUD,
  );
  const attestationControlAudience = matches(
    "Attestation: CF_ACCESS_CONTROL_AUD",
    tomlString(attestation, "CF_ACCESS_CONTROL_AUD"),
    ACCESS_AUD,
  );
  matches(
    "Attestation: ATTESTATION_ED25519_KEY_ID",
    tomlString(attestation, "ATTESTATION_ED25519_KEY_ID"),
    /^[A-Za-z0-9._-]{4,100}$/,
  );
  if (
    attestationTeam.origin !== routineAccess.teamOrigin ||
    attestationTeam.origin !== controlAccess.teamOrigin
  ) {
    fail(
      "Routine, Control and Attestation must use the same Access team issuer",
    );
  }
  if (
    attestationRoutineAudience !== routineAccess.audience ||
    attestationControlAudience !== controlAccess.audience
  ) {
    fail(
      "Attestation Access audiences must exactly match the Routine and Control applications",
    );
  }

  for (const name of [
    "wrangler.content-admin.toml",
    "wrangler.content-control.toml",
  ]) {
    httpsUrl(
      `${name}: ADMIN_ALLOWED_ORIGIN`,
      tomlString(documents[name], "ADMIN_ALLOWED_ORIGIN"),
      {
        originOnly: true,
      },
    );
  }

  matches(
    "Broker: CLOUDFLARE_ZONE_ID",
    tomlString(documents["wrangler.content-broker.toml"], "CLOUDFLARE_ZONE_ID"),
    ACCOUNT_ID,
  );
  const verifierUrls = required(
    "Broker: PRODUCTION_VERIFY_URLS",
    tomlString(
      documents["wrangler.content-broker.toml"],
      "PRODUCTION_VERIFY_URLS",
    ),
  )
    .split(",")
    .map(
      (entry) =>
        httpsUrl("Broker verifier URL", entry.trim(), { originOnly: true })
          .origin,
    );
  if (new Set(verifierUrls).size < 2)
    fail("Broker requires at least two distinct verifier origins");
  const transformedHtmlVerifierUrls = required(
    "Broker: TRANSFORMED_HTML_VERIFY_URLS",
    tomlString(
      documents["wrangler.content-broker.toml"],
      "TRANSFORMED_HTML_VERIFY_URLS",
    ),
  )
    .split(",")
    .map(
      (entry) =>
        httpsUrl("Broker transformed HTML verifier URL", entry.trim(), {
          originOnly: true,
        }).origin,
    );
  if (
    transformedHtmlVerifierUrls.some((origin) => !verifierUrls.includes(origin))
  ) {
    fail("every transformed HTML verifier must also be a verifier origin");
  }
  const minimumVerifierCount = Number(
    required(
      "Broker: VERIFY_MIN_ENDPOINTS",
      tomlString(
        documents["wrangler.content-broker.toml"],
        "VERIFY_MIN_ENDPOINTS",
      ),
    ),
  );
  const minimumExactVerifierCount = Number(
    required(
      "Broker: VERIFY_MIN_EXACT_ENDPOINTS",
      tomlString(
        documents["wrangler.content-broker.toml"],
        "VERIFY_MIN_EXACT_ENDPOINTS",
      ),
    ),
  );
  if (!Number.isSafeInteger(minimumVerifierCount) || minimumVerifierCount < 2) {
    fail("Broker VERIFY_MIN_ENDPOINTS must be an integer of at least 2");
  }
  // The Pages deployment-specific URL is added by the Broker at runtime.
  if (new Set(verifierUrls).size + 1 < minimumVerifierCount) {
    fail("Broker does not configure enough verifier origins");
  }
  if (
    !Number.isSafeInteger(minimumExactVerifierCount) ||
    minimumExactVerifierCount < 2
  ) {
    fail("Broker VERIFY_MIN_EXACT_ENDPOINTS must be an integer of at least 2");
  }
  const exactConfiguredOrigins = new Set(
    verifierUrls.filter(
      (origin) => !transformedHtmlVerifierUrls.includes(origin),
    ),
  );
  if (exactConfiguredOrigins.size + 1 < minimumExactVerifierCount) {
    fail("Broker does not configure enough exact-byte verifier origins");
  }
  const maximumInconsistencyMs = Number(
    required(
      "Broker: MAX_PRODUCTION_INCONSISTENCY_MS",
      tomlString(
        documents["wrangler.content-broker.toml"],
        "MAX_PRODUCTION_INCONSISTENCY_MS",
      ),
    ),
  );
  if (
    !Number.isSafeInteger(maximumInconsistencyMs) ||
    maximumInconsistencyMs < 10_000 ||
    maximumInconsistencyMs > 300_000
  ) {
    fail(
      "Broker MAX_PRODUCTION_INCONSISTENCY_MS must be between 10000 and 300000",
    );
  }

  const purgeUrls = required(
    "Broker: CONTENT_API_PURGE_URLS",
    tomlString(
      documents["wrangler.content-broker.toml"],
      "CONTENT_API_PURGE_URLS",
    ),
  ).split(",");
  for (const entry of purgeUrls) {
    const url = httpsUrl("Broker purge URL", entry.trim());
    if (url.pathname !== "/v1/current" || url.search) {
      fail("every Broker purge URL must be an exact /v1/current endpoint");
    }
  }
  return {
    files: WRANGLER_FILES.length,
    maximumInconsistencyMs,
    minimumExactVerifierCount,
    minimumVerifierCount,
    transformedHtmlVerifierOrigins: new Set(transformedHtmlVerifierUrls).size,
    verifierOrigins: new Set(verifierUrls).size,
  };
}

function validateReleaseEnvironment(env) {
  matches("DISPATCH_ID", env.DISPATCH_ID, UUID);
  matches("SITE_RELEASE_ID", env.SITE_RELEASE_ID, UUID);
  if (env.EXPECTED_PREDECESSOR_ID)
    matches("EXPECTED_PREDECESSOR_ID", env.EXPECTED_PREDECESSOR_ID, UUID);
  matches("CONTENT_ROOT_SHA256", env.CONTENT_ROOT_SHA256, SHA256);
  matches("EXACT_CODE_SHA", env.EXACT_CODE_SHA, SHA1);
  if (
    !/^[1-9][0-9]*$/.test(
      required("CONTENT_RELEASE_SEQUENCE", env.CONTENT_RELEASE_SEQUENCE),
    )
  ) {
    fail("CONTENT_RELEASE_SEQUENCE must be a positive integer");
  }
  if (
    required("BUILD_ENVIRONMENT_VERSION", env.BUILD_ENVIRONMENT_VERSION) !==
    BUILD_ENVIRONMENT
  ) {
    fail("BUILD_ENVIRONMENT_VERSION is not the pinned build environment");
  }
  httpsUrl("CONTENT_BUILD_API_ORIGIN", env.CONTENT_BUILD_API_ORIGIN, {
    originOnly: true,
  });
  httpsUrl("CONTENT_DEPLOY_CALLBACK_URL", env.CONTENT_DEPLOY_CALLBACK_URL);
  secret("CONTENT_BUILD_API_SECRET", env.CONTENT_BUILD_API_SECRET, 32);
  secret(
    "CONTENT_DEPLOY_CALLBACK_SECRET",
    env.CONTENT_DEPLOY_CALLBACK_SECRET,
    32,
  );
  matches("CLOUDFLARE_ACCOUNT_ID", env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT_ID);
  secret("CLOUDFLARE_PREVIEW_API_TOKEN", env.CLOUDFLARE_PREVIEW_API_TOKEN, 32);
  secret(
    "CLOUDFLARE_R2_LOCK_READ_TOKEN",
    env.CLOUDFLARE_R2_LOCK_READ_TOKEN,
    32,
  );
  secret("R2_ARTIFACT_ACCESS_KEY_ID", env.R2_ARTIFACT_ACCESS_KEY_ID, 24);
  secret(
    "R2_ARTIFACT_SECRET_ACCESS_KEY",
    env.R2_ARTIFACT_SECRET_ACCESS_KEY,
    32,
  );
  const mode = required("DEPLOYMENT_MODE", env.DEPLOYMENT_MODE);
  if (!["shadow", "production"].includes(mode))
    fail("DEPLOYMENT_MODE must be shadow or production");
  if (mode === "production") {
    httpsUrl("PRODUCTION_BROKER_URL", env.PRODUCTION_BROKER_URL);
    secret(
      "PRODUCTION_BROKER_HMAC_SECRET",
      env.PRODUCTION_BROKER_HMAC_SECRET,
      32,
    );
  }
  return { profile: "workflow-release", mode };
}

function validateEditorialEnvironment(env) {
  matches("DISPATCH_ID", env.DISPATCH_ID, UUID);
  matches("DRAFT_ID", env.DRAFT_ID, UUID);
  matches("SITE_RELEASE_ID", env.SITE_RELEASE_ID, UUID);
  matches("EDITORIAL_PREVIEW_SHA256", env.EDITORIAL_PREVIEW_SHA256, SHA256);
  matches("EXACT_CODE_SHA", env.EXACT_CODE_SHA, SHA1);
  if (
    required("BUILD_ENVIRONMENT_VERSION", env.BUILD_ENVIRONMENT_VERSION) !==
    BUILD_ENVIRONMENT
  ) {
    fail("BUILD_ENVIRONMENT_VERSION is not the pinned build environment");
  }
  httpsUrl("CONTENT_DEPLOYER_ORIGIN", env.CONTENT_DEPLOYER_ORIGIN, {
    originOnly: true,
  });
  httpsUrl("CONTENT_DEPLOY_CALLBACK_URL", env.CONTENT_DEPLOY_CALLBACK_URL);
  secret("CONTENT_BUILD_API_SECRET", env.CONTENT_BUILD_API_SECRET, 32);
  secret(
    "CONTENT_DEPLOY_CALLBACK_SECRET",
    env.CONTENT_DEPLOY_CALLBACK_SECRET,
    32,
  );
  secret(
    "EDITORIAL_PREVIEW_INPUT_SECRET",
    env.EDITORIAL_PREVIEW_INPUT_SECRET,
    32,
  );
  matches("CLOUDFLARE_ACCOUNT_ID", env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT_ID);
  secret("CLOUDFLARE_PREVIEW_API_TOKEN", env.CLOUDFLARE_PREVIEW_API_TOKEN, 32);
  return { profile: "workflow-editorial-preview" };
}

function backupConnectionFromDatabaseUrl(variable, value) {
  const parsed = new URL(required(variable, value));
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    fail(`${variable} must use postgres or postgresql`);
  }
  const username = decodeURIComponent(parsed.username);
  const backupRole = username.match(/^content_backup(?:\.([a-z0-9]{20}))?$/i);
  if (!backupRole)
    fail(`${variable} must use the dedicated content_backup role`);
  const direct = parsed.hostname.match(
    /^db\.([a-z0-9]{20})\.supabase\.co$/i,
  )?.[1];
  return { projectRef: direct || backupRole[1] || "", username };
}

function validateObservabilityEnvironment(env) {
  const projectRef = matches(
    "CONTENT_DATABASE_PROJECT_REF",
    env.CONTENT_DATABASE_PROJECT_REF,
    /^[a-z0-9]{20}$/,
  );
  validateContentDatabaseTopology(env, projectRef);
  const databaseUrl = required(
    "CONTENT_OBSERVABILITY_DATABASE_URL",
    env.CONTENT_OBSERVABILITY_DATABASE_URL,
  );
  const parsed = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol))
    fail("CONTENT_OBSERVABILITY_DATABASE_URL must use PostgreSQL");
  const username = decodeURIComponent(parsed.username);
  const deployerRole = username.match(
    /^content_deployer(?:\.([a-z0-9]{20}))?$/i,
  );
  if (!deployerRole)
    fail("CONTENT_OBSERVABILITY_DATABASE_URL must use content_deployer");
  const directRef = parsed.hostname.match(
    /^db\.([a-z0-9]{20})\.supabase\.co$/i,
  )?.[1];
  if ((directRef || deployerRole[1] || "") !== projectRef)
    fail(
      "CONTENT_OBSERVABILITY_DATABASE_URL does not resolve to CONTENT_DATABASE_PROJECT_REF",
    );
  matches("CLOUDFLARE_ACCOUNT_ID", env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT_ID);
  matches("CLOUDFLARE_ZONE_ID", env.CLOUDFLARE_ZONE_ID, ACCOUNT_ID);
  secret(
    "CLOUDFLARE_ANALYTICS_API_TOKEN",
    env.CLOUDFLARE_ANALYTICS_API_TOKEN,
    32,
  );
  const validateEndpoints = (label, value, expectedPath) => {
    const entries = required(label, value)
      .split(",")
      .map((entry) => httpsUrl(label, entry.trim()));
    if (
      entries.length < 2 ||
      new Set(entries.map((url) => url.origin)).size < 2
    )
      fail(`${label} requires two distinct origins`);
    if (
      entries.some(
        (url) =>
          (expectedPath.startsWith("/")
            ? url.pathname !== expectedPath
            : !url.pathname.endsWith(expectedPath)) || url.search,
      )
    ) {
      fail(`${label} contains an unexpected endpoint path`);
    }
  };
  validateEndpoints(
    "CONTENT_CURRENT_URLS",
    env.CONTENT_CURRENT_URLS,
    "/v1/current",
  );
  validateEndpoints(
    "CONTENT_STATIC_MANIFEST_URLS",
    env.CONTENT_STATIC_MANIFEST_URLS,
    "/release-manifests/site-route-manifest.json",
  );
  const hitMinimum = Number(env.CONTENT_API_CACHE_HIT_MINIMUM ?? "0.5");
  const sampleMinimum = Number(env.CONTENT_API_CACHE_SAMPLE_MINIMUM ?? "100");
  const startedAtText = required(
    "CONTENT_OBSERVABILITY_STARTED_AT",
    env.CONTENT_OBSERVABILITY_STARTED_AT,
  );
  const startedAt = Date.parse(startedAtText);
  if (
    !Number.isFinite(hitMinimum) ||
    hitMinimum < 0 ||
    hitMinimum > 1 ||
    !Number.isSafeInteger(sampleMinimum) ||
    sampleMinimum < 1
  ) {
    fail("content API cache thresholds are invalid");
  }
  if (
    !Number.isFinite(startedAt) ||
    new Date(startedAt).toISOString() !== startedAtText
  ) {
    fail("CONTENT_OBSERVABILITY_STARTED_AT must be an exact UTC ISO timestamp");
  }
  return {
    profile: "workflow-observability",
    projectRef,
    startedAt: startedAtText,
  };
}

function validateRecoveryEnvironment(env, profile) {
  const variable =
    profile === "workflow-backup"
      ? "CONTENT_BACKUP_DATABASE_URL"
      : "CONTENT_AUDIT_DATABASE_URL";
  const projectRef = matches(
    "CONTENT_DATABASE_PROJECT_REF",
    env.CONTENT_DATABASE_PROJECT_REF,
    /^[a-z0-9]{20}$/,
  );
  validateContentDatabaseTopology(env, projectRef);
  const connection = backupConnectionFromDatabaseUrl(variable, env[variable]);
  if (!connection.projectRef || connection.projectRef !== projectRef)
    fail(`${variable} does not resolve to CONTENT_DATABASE_PROJECT_REF`);
  matches("AGE_RECIPIENT", env.AGE_RECIPIENT, /^age1[0-9a-z]{40,100}$/);
  matches("CLOUDFLARE_ACCOUNT_ID", env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT_ID);
  secret(
    "CLOUDFLARE_R2_LOCK_READ_TOKEN",
    env.CLOUDFLARE_R2_LOCK_READ_TOKEN,
    32,
  );
  secret("AWS_ACCESS_KEY_ID", env.AWS_ACCESS_KEY_ID, 24);
  secret("AWS_SECRET_ACCESS_KEY", env.AWS_SECRET_ACCESS_KEY, 32);
  return { profile, projectRef };
}

function validateRecoveryMonitorEnvironment(env) {
  const projectRef = matches(
    "CONTENT_DATABASE_PROJECT_REF",
    env.CONTENT_DATABASE_PROJECT_REF,
    /^[a-z0-9]{20}$/,
  );
  validateContentDatabaseTopology(env, projectRef);
  matches("CLOUDFLARE_ACCOUNT_ID", env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT_ID);
  secret(
    "SUPABASE_MANAGEMENT_API_TOKEN",
    env.SUPABASE_MANAGEMENT_API_TOKEN,
    32,
  );
  secret("AWS_ACCESS_KEY_ID", env.AWS_ACCESS_KEY_ID, 24);
  secret("AWS_SECRET_ACCESS_KEY", env.AWS_SECRET_ACCESS_KEY, 32);
  const callback = httpsUrl(
    "CONTENT_RECOVERY_CALLBACK_URL",
    env.CONTENT_RECOVERY_CALLBACK_URL,
  );
  if (callback.pathname !== "/internal/recovery-health" || callback.search) {
    fail(
      "CONTENT_RECOVERY_CALLBACK_URL must be the exact /internal/recovery-health endpoint",
    );
  }
  secret(
    "CONTENT_RECOVERY_CALLBACK_SECRET",
    env.CONTENT_RECOVERY_CALLBACK_SECRET,
    32,
  );
  return { profile: "workflow-recovery-monitor", projectRef };
}

function validateObservationArchiveEnvironment(env) {
  const projectRef = matches(
    "CONTENT_DATABASE_PROJECT_REF",
    env.CONTENT_DATABASE_PROJECT_REF,
    /^[a-z0-9]{20}$/,
  );
  validateContentDatabaseTopology(env, projectRef);
  const databaseUrl = required(
    "CONTENT_OBSERVABILITY_DATABASE_URL",
    env.CONTENT_OBSERVABILITY_DATABASE_URL,
  );
  const parsed = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol))
    fail("CONTENT_OBSERVABILITY_DATABASE_URL must use PostgreSQL");
  const username = decodeURIComponent(parsed.username);
  const deployerRole = username.match(
    /^content_deployer(?:\.([a-z0-9]{20}))?$/i,
  );
  if (!deployerRole)
    fail("CONTENT_OBSERVABILITY_DATABASE_URL must use content_deployer");
  const directRef = parsed.hostname.match(
    /^db\.([a-z0-9]{20})\.supabase\.co$/i,
  )?.[1];
  if ((directRef || deployerRole[1] || "") !== projectRef)
    fail(
      "CONTENT_OBSERVABILITY_DATABASE_URL does not resolve to CONTENT_DATABASE_PROJECT_REF",
    );
  const startDate = matches(
    "CONTENT_OBSERVATION_START_DATE",
    env.CONTENT_OBSERVATION_START_DATE,
    /^\d{4}-\d{2}-\d{2}$/,
  );
  if (
    new Date(`${startDate}T00:00:00.000Z`).toISOString().slice(0, 10) !==
    startDate
  )
    fail("CONTENT_OBSERVATION_START_DATE is not a real date");
  matches("CLOUDFLARE_ACCOUNT_ID", env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT_ID);
  secret(
    "CLOUDFLARE_R2_LOCK_READ_TOKEN",
    env.CLOUDFLARE_R2_LOCK_READ_TOKEN,
    32,
  );
  secret("AWS_ACCESS_KEY_ID", env.AWS_ACCESS_KEY_ID, 24);
  secret("AWS_SECRET_ACCESS_KEY", env.AWS_SECRET_ACCESS_KEY, 32);
  return { profile: "workflow-observation-window", projectRef, startDate };
}

function validateRuntimePreflightEnvironment(env) {
  matches("EXACT_CODE_SHA", env.EXACT_CODE_SHA, SHA1);
  matches("CLOUDFLARE_ACCOUNT_ID", env.CLOUDFLARE_ACCOUNT_ID, ACCOUNT_ID);
  secret(
    "CLOUDFLARE_R2_LOCK_READ_TOKEN",
    env.CLOUDFLARE_R2_LOCK_READ_TOKEN,
    32,
  );
  return { profile: "workflow-runtime-preflight" };
}

function validateCodeReleaseEnvironment(env) {
  matches("EXACT_CODE_SHA", env.EXACT_CODE_SHA, SHA1);
  httpsUrl("CODE_RELEASE_ORIGIN", env.CODE_RELEASE_ORIGIN, {
    originOnly: true,
  });
  secret("CODE_RELEASE_SECRET", env.CODE_RELEASE_SECRET, 32);
  const currentUrls = required("CONTENT_CURRENT_URLS", env.CONTENT_CURRENT_URLS)
    .split(",")
    .map((value) => httpsUrl("CONTENT_CURRENT_URLS", value.trim()));
  if (currentUrls.length < 2)
    fail("CONTENT_CURRENT_URLS must contain at least two verifier origins");
  if (new Set(currentUrls.map((url) => url.origin)).size < 2)
    fail("CONTENT_CURRENT_URLS must contain distinct verifier origins");
  if (
    currentUrls.some(
      (url) => url.pathname !== "/v1/current" || url.search || url.hash,
    )
  ) {
    fail("CONTENT_CURRENT_URLS must contain exact /v1/current endpoints");
  }
  const waitTimeout = Number(
    required(
      "CODE_RELEASE_WAIT_TIMEOUT_SECONDS",
      env.CODE_RELEASE_WAIT_TIMEOUT_SECONDS,
    ),
  );
  if (!Number.isInteger(waitTimeout) || waitTimeout < 60 || waitTimeout > 7200)
    fail("CODE_RELEASE_WAIT_TIMEOUT_SECONDS must be between 60 and 7200");
  return { profile: "workflow-code-release" };
}

export function validateWorkflowEnvironment(profile, env) {
  if (profile === "workflow-release") return validateReleaseEnvironment(env);
  if (profile === "workflow-editorial-preview")
    return validateEditorialEnvironment(env);
  if (profile === "workflow-backup" || profile === "workflow-audit") {
    return validateRecoveryEnvironment(env, profile);
  }
  if (profile === "workflow-recovery-monitor") {
    return validateRecoveryMonitorEnvironment(env);
  }
  if (profile === "workflow-runtime-preflight") {
    return validateRuntimePreflightEnvironment(env);
  }
  if (profile === "workflow-code-release") {
    return validateCodeReleaseEnvironment(env);
  }
  if (profile === "workflow-observability") {
    return validateObservabilityEnvironment(env);
  }
  if (profile === "workflow-observation-window") {
    return validateObservationArchiveEnvironment(env);
  }
  fail(`unknown profile ${profile}`);
}

function run(argv = process.argv.slice(2)) {
  const [profile] = argv;
  const result =
    profile === "wrangler"
      ? validateWranglerDocuments(
          Object.fromEntries(
            WRANGLER_FILES.map((name) => [name, readFileSync(name, "utf8")]),
          ),
        )
      : validateWorkflowEnvironment(profile, process.env);
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    run();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
