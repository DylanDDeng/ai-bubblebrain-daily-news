import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA1 = /^[a-f0-9]{40}$/;

function positiveInteger(value, fallback, label) {
  const normalized = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0)
    throw new Error(`${label} must be a positive integer`);
  return normalized;
}

function exactVerifierUrls(env, label, expectedPath) {
  const urls = String(env[label] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value));
  if (
    urls.length < 2 ||
    new Set(urls.map((url) => url.origin)).size < 2 ||
    urls.some(
      (url) =>
        url.protocol !== "https:" ||
        url.pathname !== expectedPath ||
        url.search ||
        url.hash ||
        url.username ||
        url.password,
    )
  ) {
    throw new Error(
      `${label} must contain at least two distinct exact HTTPS ${expectedPath} origins`,
    );
  }
  return urls;
}

function codeReleaseConfiguration(env) {
  const origin = env.CODE_RELEASE_ORIGIN?.trim();
  const secret = env.CODE_RELEASE_SECRET?.trim();
  const codeSha = env.EXACT_CODE_SHA?.trim().toLowerCase();
  if (!origin || !secret || !SHA1.test(codeSha || ""))
    throw new Error("Automatic code release configuration is incomplete");

  const requestUrl = new URL("/internal/code-release", origin);
  if (requestUrl.protocol !== "https:")
    throw new Error("Code release origin must use HTTPS");
  const currentUrls = exactVerifierUrls(
    env,
    "CONTENT_CURRENT_URLS",
    "/v1/current",
  );
  const siteIdentityUrls = exactVerifierUrls(
    env,
    "CONTENT_SITE_IDENTITY_URLS",
    "/release-manifests/site-route-manifest.json",
  );
  const siteProbesPerOrigin = positiveInteger(
    env.CODE_RELEASE_SITE_PROBES_PER_ORIGIN,
    3,
    "CODE_RELEASE_SITE_PROBES_PER_ORIGIN",
  );
  if (siteProbesPerOrigin > 5)
    throw new Error("CODE_RELEASE_SITE_PROBES_PER_ORIGIN must not exceed 5");
  return {
    codeSha,
    currentUrls,
    siteIdentityUrls,
    siteProbesPerOrigin,
    requestUrl,
    secret,
    requestAttempts: positiveInteger(
      env.CODE_RELEASE_REQUEST_MAX_ATTEMPTS,
      60,
      "CODE_RELEASE_REQUEST_MAX_ATTEMPTS",
    ),
    requestDelayMs: positiveInteger(
      env.CODE_RELEASE_REQUEST_DELAY_MS,
      30_000,
      "CODE_RELEASE_REQUEST_DELAY_MS",
    ),
    pollDelayMs: positiveInteger(
      env.CODE_RELEASE_POLL_DELAY_MS,
      15_000,
      "CODE_RELEASE_POLL_DELAY_MS",
    ),
    waitTimeoutMs:
      positiveInteger(
        env.CODE_RELEASE_WAIT_TIMEOUT_SECONDS,
        2700,
        "CODE_RELEASE_WAIT_TIMEOUT_SECONDS",
      ) * 1000,
  };
}

async function responseJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function requestRelease(configuration, dependencies) {
  const body = JSON.stringify({ code_sha: configuration.codeSha });
  const signature = createHmac("sha256", configuration.secret)
    .update(body)
    .digest("hex");
  for (
    let attempt = 1;
    attempt <= configuration.requestAttempts;
    attempt += 1
  ) {
    const response = await dependencies.fetch(configuration.requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Code-Release-Signature": signature,
      },
      body,
    });
    const result = await responseJson(response);

    if (response.ok) {
      if (result?.status === "no_changes") {
        dependencies.log(
          JSON.stringify({
            outcome: "no_op",
            code_sha: configuration.codeSha,
            changed_file_count: result.changed_file_count || 0,
          }),
        );
        return { outcome: "no_op" };
      }
      if (result?.status === "already_current")
        return { outcome: "already_current", siteReleaseId: null };
      if (
        result?.status === "queued" &&
        UUID.test(String(result.site_release_id || "")) &&
        String(result.code_sha || "") === configuration.codeSha
      ) {
        dependencies.log(
          JSON.stringify({
            outcome: "queued",
            site_release_id: result.site_release_id,
            code_sha: configuration.codeSha,
          }),
        );
        return {
          outcome: "queued",
          siteReleaseId: String(result.site_release_id),
        };
      }
      throw new Error(
        `Automatic code release returned an unexpected success: ${JSON.stringify(result)}`,
      );
    }

    if (
      response.status === 409 &&
      result?.error === "code_release_target_superseded" &&
      SHA1.test(String(result.current_main_sha || ""))
    ) {
      dependencies.log(
        JSON.stringify({
          outcome: "superseded",
          requested_code_sha: configuration.codeSha,
          current_main_sha: result.current_main_sha,
        }),
      );
      return { outcome: "superseded" };
    }
    if (![409, 503].includes(response.status) || result?.retryable !== true) {
      throw new Error(
        `Automatic code release was rejected (${response.status}): ${JSON.stringify(result)}`,
      );
    }
    if (attempt === configuration.requestAttempts) {
      throw new Error(
        `Automatic code release remained unavailable after ${configuration.requestAttempts} attempts`,
      );
    }
    dependencies.log(
      `Code release request is waiting for a safe production head (${attempt}/${configuration.requestAttempts})`,
    );
    await dependencies.sleep(configuration.requestDelayMs);
  }
  throw new Error("Automatic code release request exhausted unexpectedly");
}

function pointerMatches(pointer, codeSha, siteReleaseId) {
  return (
    pointer &&
    typeof pointer === "object" &&
    String(pointer.code_sha || "") === codeSha &&
    (!siteReleaseId || String(pointer.site_release_id || "") === siteReleaseId)
  );
}

function siteIdentityMatches(manifest, codeSha, siteReleaseId) {
  return pointerMatches(manifest?.build, codeSha, siteReleaseId);
}

async function observeJsonIdentity(
  url,
  configuration,
  siteReleaseId,
  dependencies,
  kind,
) {
  try {
    const response = await dependencies.fetch(url, {
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
    });
    const body = await responseJson(response);
    const identity = kind === "current" ? body : body?.build;
    return {
      kind,
      url: url.origin,
      ok: response.ok,
      site_release_id: identity?.site_release_id || null,
      code_sha: identity?.code_sha || null,
      matches:
        response.ok &&
        (kind === "current"
          ? pointerMatches(body, configuration.codeSha, siteReleaseId)
          : siteIdentityMatches(body, configuration.codeSha, siteReleaseId)),
    };
  } catch (error) {
    return {
      kind,
      url: url.origin,
      ok: false,
      error: error instanceof Error ? error.name : "Error",
      matches: false,
    };
  }
}

async function waitForCurrentPointer(
  configuration,
  siteReleaseId,
  dependencies,
) {
  const startedAt = dependencies.now();
  let lastObserved = [];
  while (dependencies.now() - startedAt < configuration.waitTimeoutMs) {
    const observations = await Promise.all([
      ...configuration.currentUrls.map((url) =>
        observeJsonIdentity(
          url,
          configuration,
          siteReleaseId,
          dependencies,
          "current",
        ),
      ),
      ...configuration.siteIdentityUrls.flatMap((url) =>
        Array.from({ length: configuration.siteProbesPerOrigin }, () =>
          observeJsonIdentity(
            url,
            configuration,
            siteReleaseId,
            dependencies,
            "site",
          ),
        ),
      ),
    ]);
    lastObserved = observations;
    if (observations.every((value) => value.matches)) {
      dependencies.log(
        JSON.stringify({
          outcome: "deployed",
          site_release_id: siteReleaseId || observations[0].site_release_id,
          code_sha: configuration.codeSha,
          verified_current_origins: configuration.currentUrls.map(
            (url) => url.origin,
          ),
          verified_site_origins: configuration.siteIdentityUrls.map(
            (url) => url.origin,
          ),
          site_probes_per_origin: configuration.siteProbesPerOrigin,
        }),
      );
      return {
        outcome: "deployed",
        siteReleaseId: siteReleaseId || observations[0].site_release_id,
      };
    }
    await dependencies.sleep(configuration.pollDelayMs);
  }
  throw new Error(
    `Automatic code release did not converge across current pointers and site identities before timeout: ${JSON.stringify(lastObserved)}`,
  );
}

export async function runCodeRelease(env = process.env, overrides = {}) {
  const dependencies = {
    fetch: overrides.fetch || globalThis.fetch,
    log: overrides.log || console.log,
    now: overrides.now || Date.now,
    sleep:
      overrides.sleep ||
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds))),
  };
  if (typeof dependencies.fetch !== "function")
    throw new Error("Fetch is unavailable");
  const configuration = codeReleaseConfiguration(env);
  const request = await requestRelease(configuration, dependencies);
  if (["no_op", "superseded"].includes(request.outcome)) return request;
  return waitForCurrentPointer(
    configuration,
    request.siteReleaseId,
    dependencies,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) await runCodeRelease();
