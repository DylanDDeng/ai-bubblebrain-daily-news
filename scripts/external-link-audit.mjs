import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent } from "undici";

export const EXTERNAL_LINK_OUTCOMES = [
  "success",
  "confirmed-dead",
  "reachable-restricted",
  "transient-upstream",
  "transport-unknown",
  "circuit-open",
  "policy-failure",
  "incomplete",
];

export const DEFAULT_EXTERNAL_LINK_BUDGETS = {
  min_direct_coverage_ratio: 0.9,
  min_success_ratio: 0.25,
  max_transport_unknown_ratio: 0.05,
  max_transient_upstream_ratio: 0.05,
  max_circuit_open_ratio: 0.1,
  max_incomplete: 0,
};

const HARD_TLS_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_REJECTED",
  "CERT_REVOKED",
  "CERT_SIGNATURE_FAILURE",
  "CERT_UNTRUSTED",
  "CERT_CHAIN_TOO_LONG",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "HOSTNAME_MISMATCH",
  "INVALID_CA",
  "INVALID_PURPOSE",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);
const TRANSIENT_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);
const URL_WAIVER_OUTCOMES = new Set(["confirmed-dead"]);
const ORIGIN_WAIVER_OUTCOMES = new Set([
  "transport-unknown",
  "transient-upstream",
  "circuit-open",
]);

class ExternalLinkPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ExternalLinkPolicyError";
    this.code = code;
  }
}

function ipv4Number(address) {
  return (
    address
      .split(".")
      .reduce((value, part) => (value << 8) + Number(part), 0) >>> 0
  );
}

function ipv4InCidr(address, base, bits) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(base) & mask);
}

function normalizedHostname(url) {
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

export function isPublicIpAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    return ![
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ].some(([base, bits]) => ipv4InCidr(address, base, bits));
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice("::ffff:".length);
      return isIP(mapped) === 4 && isPublicIpAddress(mapped);
    }
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      /^f[cd]/u.test(normalized) ||
      /^fe[89a-f]/u.test(normalized) ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8:")
    );
  }
  return false;
}

export function assertPublicHttpUrl(value) {
  const url = value instanceof URL ? new URL(value) : new URL(value);
  if (!/^https?:$/u.test(url.protocol)) {
    throw new ExternalLinkPolicyError(
      "unsupported_protocol",
      `External URL uses ${url.protocol}`,
    );
  }
  const hostname = normalizedHostname(url);
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new ExternalLinkPolicyError(
      "blocked_hostname",
      `External URL targets blocked hostname ${hostname || "(empty)"}`,
    );
  }
  if (isIP(hostname) && !isPublicIpAddress(hostname)) {
    throw new ExternalLinkPolicyError(
      "blocked_ip",
      `External URL targets non-public address ${hostname}`,
    );
  }
  return url;
}

async function assertPublicResolution(url, dnsCache) {
  assertPublicHttpUrl(url);
  const hostname = normalizedHostname(url);
  if (isIP(hostname)) return [{ address: hostname, family: isIP(hostname) }];
  let addresses = dnsCache.get(hostname);
  if (!addresses) {
    try {
      addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch (error) {
      if (error?.code === "ENOTFOUND") {
        throw new ExternalLinkPolicyError(
          "dns_not_found",
          `DNS name does not exist: ${hostname}`,
        );
      }
      throw error;
    }
    dnsCache.set(hostname, addresses);
  }
  if (addresses.length === 0) {
    throw new ExternalLinkPolicyError(
      "dns_empty",
      `DNS returned no addresses for ${hostname}`,
    );
  }
  const blocked = addresses.find(({ address }) => !isPublicIpAddress(address));
  if (blocked) {
    throw new ExternalLinkPolicyError(
      "blocked_resolution",
      `External URL resolves to non-public address ${blocked.address}`,
    );
  }
  return addresses;
}

function errorCode(error) {
  return error?.code ?? error?.cause?.code ?? error?.name ?? "UNKNOWN";
}

export function classifyExternalStatus(status) {
  if (status >= 200 && status < 400)
    return { outcome: "success", reason: "http_success" };
  if (status === 404 || status === 410)
    return { outcome: "confirmed-dead", reason: `http_${status}` };
  if (status >= 500)
    return { outcome: "transient-upstream", reason: `http_${status}` };
  return {
    outcome: "reachable-restricted",
    reason: `http_${status}`,
  };
}

function isDeterministicTlsCode(code) {
  return (
    HARD_TLS_CODES.has(code) ||
    /(?:^|_)CERT(?:_|$)|(?:^|_)CRL(?:_|$)|TLS_CERT|SELF_SIGNED|INVALID_CA|HOSTNAME_MISMATCH|UNABLE_TO_GET_CRL|^ERR_SSL_/u.test(
      code,
    )
  );
}

export function classifyExternalError(error) {
  const code = errorCode(error);
  if (
    error instanceof ExternalLinkPolicyError ||
    isDeterministicTlsCode(code)
  ) {
    return { outcome: "policy-failure", reason: code };
  }
  return {
    outcome: "transport-unknown",
    reason: TRANSIENT_CODES.has(code) ? code : `unclassified_${code}`,
  };
}

export function createPinnedLookup(addresses) {
  return (_hostname, options, callback) => {
    if (options?.all) {
      callback(null, addresses);
      return;
    }
    const selected =
      addresses.find(({ family }) =>
        options?.family ? family === options.family : true,
      ) ?? addresses[0];
    callback(null, selected.address, selected.family);
  };
}

function pinnedDispatcher(hostname, addresses, dispatcherCache) {
  const key = `${hostname}|${addresses
    .map(({ address, family }) => `${family}:${address}`)
    .join(",")}`;
  let dispatcher = dispatcherCache.get(key);
  if (!dispatcher) {
    dispatcher = new Agent({
      connect: {
        lookup: createPinnedLookup(addresses),
      },
    });
    dispatcherCache.set(key, dispatcher);
  }
  return dispatcher;
}

export async function closeExternalLinkDispatchers(dispatcherCache) {
  await Promise.all(
    [...dispatcherCache.values()].map((dispatcher) => dispatcher.close()),
  );
  dispatcherCache.clear();
}

function retryDelay(response, attempt) {
  if (response?.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 2000);
  }
  return 200 * 2 ** attempt + Math.floor(Math.random() * 100);
}

function shouldRetryStatus(status) {
  return status === 429 || status >= 500;
}

async function fetchWithRedirects(
  initialUrl,
  method,
  { fetchImpl, timeoutMs, maxRedirects, dnsCache, dispatcherCache },
) {
  let current = new URL(initialUrl);
  const redirects = [];
  for (let redirectCount = 0; ; redirectCount += 1) {
    const addresses = await assertPublicResolution(current, dnsCache);
    const dispatcher = pinnedDispatcher(
      normalizedHostname(current),
      addresses,
      dispatcherCache,
    );
    const response = await fetchImpl(current, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      dispatcher,
      headers: {
        "user-agent": "bubble-external-link-verifier/2.0",
        ...(method === "GET" ? { range: "bytes=0-0" } : {}),
      },
    });
    if (response.status < 300 || response.status >= 400) {
      await response.body?.cancel();
      return { response, finalUrl: current.href, redirects };
    }
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) return { response, finalUrl: current.href, redirects };
    if (redirectCount >= maxRedirects) {
      throw new ExternalLinkPolicyError(
        "too_many_redirects",
        `External URL exceeded ${maxRedirects} redirects`,
      );
    }
    const next = assertPublicHttpUrl(new URL(location, current));
    redirects.push({
      status: response.status,
      from: current.href,
      to: next.href,
    });
    current = next;
  }
}

async function requestWithRetries(url, method, options, attempts) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await fetchWithRedirects(url, method, options);
      if (
        !shouldRetryStatus(result.response.status) ||
        attempt === attempts - 1
      )
        return { ...result, attemptCount: attempt + 1 };
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelay(result.response, attempt)),
      );
    } catch (error) {
      lastError = error;
      const classification = classifyExternalError(error);
      if (
        classification.outcome === "policy-failure" ||
        attempt === attempts - 1
      )
        throw Object.assign(error, { attemptCount: attempt + 1 });
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelay(null, attempt)),
      );
    }
  }
  throw lastError;
}

export async function probeExternalUrl(value, options = {}) {
  const {
    fetchImpl = fetch,
    timeoutMs = 10_000,
    maxRedirects = 8,
    attempts = 2,
    dnsCache = new Map(),
    dispatcherCache = new Map(),
  } = options;
  const ownsDispatcherCache = !options.dispatcherCache;
  const started = Date.now();
  const url = String(value);
  const requestOptions = {
    fetchImpl,
    timeoutMs,
    maxRedirects,
    dnsCache,
    dispatcherCache,
  };
  try {
    const head = await requestWithRetries(
      url,
      "HEAD",
      requestOptions,
      attempts,
    );
    let final = head;
    const methods = [{ method: "HEAD", status: head.response.status }];
    if (head.response.status >= 400) {
      final = await requestWithRetries(url, "GET", requestOptions, attempts);
      methods.push({ method: "GET", status: final.response.status });
    }
    const classification = classifyExternalStatus(final.response.status);
    return {
      url,
      final_url: final.finalUrl,
      ...classification,
      status: final.response.status,
      methods,
      redirects: final.redirects,
      attempts: head.attemptCount + (final === head ? 0 : final.attemptCount),
      duration_ms: Date.now() - started,
      directly_probed: true,
    };
  } catch (error) {
    const classification = classifyExternalError(error);
    return {
      url,
      final_url: null,
      ...classification,
      status: null,
      methods: [],
      redirects: [],
      attempts: error?.attemptCount ?? 1,
      duration_ms: Date.now() - started,
      directly_probed: true,
      error_code: errorCode(error),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (ownsDispatcherCache)
      await closeExternalLinkDispatchers(dispatcherCache);
  }
}

async function mapWithConcurrency(values, concurrency, callback) {
  let cursor = 0;
  const results = [];
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;
      results[index] = await callback(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () =>
      worker(),
    ),
  );
  return results;
}

export async function auditExternalLinks(
  values,
  {
    probe = probeExternalUrl,
    deadlineMs = Date.now() + 15 * 60_000,
    originConcurrency = 6,
    perOriginConcurrency = 4,
    circuitFailureThreshold = 3,
  } = {},
) {
  const groups = new Map();
  for (const value of [...new Set(values)].sort()) {
    const origin = new URL(value).origin;
    if (!groups.has(origin)) groups.set(origin, []);
    groups.get(origin).push(value);
  }
  const circuits = [];
  const originEntries = [...groups.entries()];
  const groupedResults = await mapWithConcurrency(
    originEntries,
    originConcurrency,
    async ([origin, urls]) => {
      const results = [];
      const sentinelCount = Math.min(circuitFailureThreshold, urls.length);
      for (let index = 0; index < sentinelCount; index += 1) {
        if (Date.now() >= deadlineMs) break;
        results.push(await probe(urls[index]));
      }
      const transportSentinels =
        results.length === circuitFailureThreshold &&
        results.every((result) =>
          ["transport-unknown", "transient-upstream"].includes(result.outcome),
        );
      if (transportSentinels) {
        const circuitId = `origin-${circuits.length + 1}`;
        circuits.push({
          id: circuitId,
          origin,
          trigger_results: results.map((result) => ({
            url: result.url,
            outcome: result.outcome,
            reason: result.reason,
            status: result.status,
            error_code: result.error_code ?? null,
          })),
          skipped_count: urls.length - results.length,
        });
        for (const url of urls.slice(results.length)) {
          results.push({
            url,
            final_url: null,
            outcome: "circuit-open",
            reason: "origin_transport_circuit",
            status: null,
            attempts: 0,
            duration_ms: 0,
            directly_probed: false,
            circuit_id: circuitId,
          });
        }
        return results;
      }
      const remaining = urls.slice(results.length);
      const tail = await mapWithConcurrency(
        remaining,
        perOriginConcurrency,
        async (url) => {
          if (Date.now() >= deadlineMs) {
            return {
              url,
              final_url: null,
              outcome: "incomplete",
              reason: "global_deadline",
              status: null,
              attempts: 0,
              duration_ms: 0,
              directly_probed: false,
            };
          }
          return probe(url);
        },
      );
      return [...results, ...tail];
    },
  );
  return {
    results: groupedResults.flat().sort((a, b) => a.url.localeCompare(b.url)),
    circuits: circuits.sort((a, b) => a.origin.localeCompare(b.origin)),
  };
}

function validateWaiverMetadata(waiver, kind, index, now) {
  const label = `${kind}_waivers[${index}]`;
  if (!waiver || typeof waiver !== "object" || Array.isArray(waiver))
    throw new Error(`${label} must be an object`);
  for (const field of ["reason", "owner", "expires_on"]) {
    if (typeof waiver[field] !== "string" || !waiver[field].trim())
      throw new Error(`${label}.${field} must be a non-empty string`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(waiver.expires_on))
    throw new Error(`${label}.expires_on must use YYYY-MM-DD`);
  const expiresAt = Date.parse(`${waiver.expires_on}T23:59:59.999Z`);
  if (
    !Number.isFinite(expiresAt) ||
    new Date(expiresAt).toISOString().slice(0, 10) !== waiver.expires_on
  )
    throw new Error(`${label}.expires_on is not a real date`);
  if (!Array.isArray(waiver.outcomes) || waiver.outcomes.length === 0)
    throw new Error(`${label}.outcomes must be a non-empty array`);
  if (new Set(waiver.outcomes).size !== waiver.outcomes.length)
    throw new Error(`${label}.outcomes contains duplicates`);
  return {
    expired: expiresAt < now.getTime(),
    expiresAt,
  };
}

export function applyExternalLinkWaivers(
  audit,
  waiverConfig,
  now = new Date(),
) {
  if (waiverConfig?.schema_version !== 1)
    throw new Error("External link waiver policy must use schema_version 1");
  const urlWaivers = waiverConfig.url_waivers;
  const originWaivers = waiverConfig.origin_waivers;
  if (!Array.isArray(urlWaivers) || !Array.isArray(originWaivers))
    throw new Error(
      "External link waiver policy requires url_waivers and origin_waivers arrays",
    );

  const violations = [];
  const exact = new Map();
  const seenExactUrls = new Set();
  for (const [index, waiver] of urlWaivers.entries()) {
    const metadata = validateWaiverMetadata(waiver, "url", index, now);
    let normalized;
    try {
      normalized = assertPublicHttpUrl(waiver.url).href;
    } catch (error) {
      throw new Error(
        `url_waivers[${index}].url is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (normalized !== waiver.url)
      throw new Error(`url_waivers[${index}].url must be normalized exactly`);
    if (seenExactUrls.has(normalized))
      throw new Error(`Duplicate URL waiver for ${normalized}`);
    seenExactUrls.add(normalized);
    if (waiver.outcomes.some((outcome) => !URL_WAIVER_OUTCOMES.has(outcome)))
      throw new Error(
        `url_waivers[${index}] may only waive confirmed-dead`,
      );
    if (metadata.expired)
      violations.push(`URL waiver expired on ${waiver.expires_on}: ${waiver.url}`);
    else exact.set(normalized, waiver);
  }

  const origins = new Map();
  const seenOrigins = new Set();
  for (const [index, waiver] of originWaivers.entries()) {
    const metadata = validateWaiverMetadata(waiver, "origin", index, now);
    let normalized;
    try {
      normalized = assertPublicHttpUrl(waiver.origin).origin;
    } catch (error) {
      throw new Error(
        `origin_waivers[${index}].origin is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (normalized !== waiver.origin)
      throw new Error(
        `origin_waivers[${index}].origin must be a normalized origin without a trailing slash`,
      );
    if (seenOrigins.has(normalized))
      throw new Error(`Duplicate origin waiver for ${normalized}`);
    seenOrigins.add(normalized);
    if (
      waiver.outcomes.some((outcome) => !ORIGIN_WAIVER_OUTCOMES.has(outcome))
    )
      throw new Error(
        `origin_waivers[${index}] may only waive transient network outcomes`,
      );
    if (!Number.isSafeInteger(waiver.max_urls) || waiver.max_urls < 1)
      throw new Error(`origin_waivers[${index}].max_urls must be a positive integer`);
    if (metadata.expired)
      violations.push(
        `Origin waiver expired on ${waiver.expires_on}: ${waiver.origin}`,
      );
    else origins.set(normalized, waiver);
  }

  const originEligibleCounts = new Map();
  for (const result of audit.results) {
    const origin = new URL(result.url).origin;
    const waiver = origins.get(origin);
    if (waiver?.outcomes.includes(result.outcome))
      originEligibleCounts.set(origin, (originEligibleCounts.get(origin) ?? 0) + 1);
  }
  for (const [origin, count] of originEligibleCounts) {
    const waiver = origins.get(origin);
    if (count > waiver.max_urls)
      violations.push(
        `Origin waiver cap exceeded for ${origin}: ${count} > ${waiver.max_urls}`,
      );
  }

  const applied = [];
  const results = audit.results.map((result) => {
    const exactWaiver = exact.get(result.url);
    let waiver =
      exactWaiver?.outcomes.includes(result.outcome) ? exactWaiver : null;
    let kind = waiver ? "url" : null;
    let key = waiver ? result.url : null;
    if (!waiver) {
      const origin = new URL(result.url).origin;
      const originWaiver = origins.get(origin);
      const withinCap =
        (originEligibleCounts.get(origin) ?? 0) <= (originWaiver?.max_urls ?? 0);
      if (
        originWaiver?.outcomes.includes(result.outcome) &&
        withinCap
      ) {
        waiver = originWaiver;
        kind = "origin";
        key = origin;
      }
    }
    if (!waiver) return result;
    const evidence = {
      kind,
      key,
      owner: waiver.owner,
      reason: waiver.reason,
      expires_on: waiver.expires_on,
    };
    applied.push({ url: result.url, outcome: result.outcome, ...evidence });
    return { ...result, waiver: evidence };
  });

  return {
    ...audit,
    results,
    waiver_violations: violations,
    waiver_summary: {
      configured_url_waivers: urlWaivers.length,
      configured_origin_waivers: originWaivers.length,
      applied_count: applied.length,
      applied,
    },
  };
}

export function evaluateExternalLinkAudit(
  audit,
  budgets = DEFAULT_EXTERNAL_LINK_BUDGETS,
) {
  const counts = Object.fromEntries(
    EXTERNAL_LINK_OUTCOMES.map((outcome) => [outcome, 0]),
  );
  const reasons = {};
  for (const result of audit.results) {
    counts[result.outcome] += 1;
    reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
  }
  const total = audit.results.length;
  const evaluatedResults = audit.results.filter((result) => !result.waiver);
  const evaluatedCounts = Object.fromEntries(
    EXTERNAL_LINK_OUTCOMES.map((outcome) => [outcome, 0]),
  );
  for (const result of evaluatedResults) evaluatedCounts[result.outcome] += 1;
  const evaluatedTotal = evaluatedResults.length;
  const ratio = (count) => (evaluatedTotal === 0 ? 0 : count / evaluatedTotal);
  const direct = evaluatedResults.filter(
    (result) => result.directly_probed,
  ).length;
  const hardFailures =
    evaluatedCounts["confirmed-dead"] + evaluatedCounts["policy-failure"];
  const violations = [...(audit.waiver_violations ?? [])];
  if (hardFailures > 0)
    violations.push(`${hardFailures} confirmed-dead or policy-failure URLs`);
  if (evaluatedTotal === 0)
    violations.push("no unwaived URLs remain for evaluation");
  if (evaluatedCounts.success === 0)
    violations.push("no unwaived successful URLs");
  if (ratio(direct) < budgets.min_direct_coverage_ratio)
    violations.push(`direct coverage ${ratio(direct).toFixed(4)} below budget`);
  if (ratio(evaluatedCounts.success) < budgets.min_success_ratio)
    violations.push(
      `success ratio ${ratio(evaluatedCounts.success).toFixed(4)} below budget`,
    );
  if (
    ratio(evaluatedCounts["transport-unknown"]) >
    budgets.max_transport_unknown_ratio
  )
    violations.push("transport-unknown ratio exceeds budget");
  if (
    ratio(evaluatedCounts["transient-upstream"]) >
    budgets.max_transient_upstream_ratio
  )
    violations.push("transient-upstream ratio exceeds budget");
  if (ratio(evaluatedCounts["circuit-open"]) > budgets.max_circuit_open_ratio)
    violations.push("circuit-open ratio exceeds budget");
  if (evaluatedCounts.incomplete > budgets.max_incomplete)
    violations.push("incomplete URL count exceeds budget");
  const gate =
    hardFailures > 0
      ? "FAIL"
      : violations.length > 0
        ? "INCONCLUSIVE"
        : evaluatedCounts.success === evaluatedTotal
          ? "PASS"
          : "PASS_WITH_WARNINGS";
  return {
    gate,
    total,
    evaluated_total: evaluatedTotal,
    waived: total - evaluatedTotal,
    directly_probed: direct,
    direct_coverage_ratio: ratio(direct),
    success_ratio: ratio(evaluatedCounts.success),
    counts,
    evaluated_counts: evaluatedCounts,
    reasons,
    violations,
  };
}
