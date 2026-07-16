import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  applyExternalLinkWaivers,
  auditExternalLinks,
  closeExternalLinkDispatchers,
  DEFAULT_EXTERNAL_LINK_BUDGETS,
  evaluateExternalLinkAudit,
  probeExternalUrl,
} from "./external-link-audit.mjs";

const argumentsList = process.argv.slice(2);
const checkExternal = argumentsList.includes("--check-external");
const externalReportArgument = argumentsList.find((argument) =>
  argument.startsWith("--external-report="),
);
const externalWaiversArgument = argumentsList.find((argument) =>
  argument.startsWith("--external-waivers="),
);
const positional = argumentsList.filter(
  (argument) =>
    argument !== "--check-external" &&
    !argument.startsWith("--external-report=") &&
    !argument.startsWith("--external-waivers="),
);
const [baseArgument, expectedShaArgument, manifestPathArgument] = positional;
if (!baseArgument) {
  throw new Error(
    "Usage: node scripts/verify-preview.mjs <preview-origin> [expected-40-char-sha] [local-manifest] [--check-external] [--external-waivers=path] [--external-report=path]",
  );
}

const localManifestPath =
  manifestPathArgument ??
  "astro/dist/release-manifests/site-route-manifest.json";
const localManifestText = await readFile(localManifestPath, "utf8");
const localDistRoot = resolve(dirname(resolve(localManifestPath)), "..");
const localManifest = JSON.parse(localManifestText);
const expectedSha = (
  expectedShaArgument ??
  localManifest.build?.source_sha ??
  ""
).toLowerCase();
const externalReportPath = resolve(
  externalReportArgument?.slice("--external-report=".length) ||
    `output/external-link-audit-${expectedSha.slice(0, 12)}.json`,
);
const externalWaiversPath = resolve(
  externalWaiversArgument?.slice("--external-waivers=".length) ||
    "config/external-link-waivers.json",
);

const base = new URL(baseArgument);
if (!/^https?:$/.test(base.protocol))
  throw new Error(`Unsupported preview protocol: ${base.protocol}`);
base.pathname = "/";
base.search = "";
base.hash = "";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeJsonAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, path);
}

function tagAttribute(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

function htmlMetadata(html) {
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  const canonicalTag = links.find(
    (tag) => tagAttribute(tag, "rel") === "canonical",
  );
  return {
    canonical: canonicalTag ? tagAttribute(canonicalTag, "href") : null,
    hreflang: links
      .filter(
        (tag) =>
          tagAttribute(tag, "rel") === "alternate" &&
          tagAttribute(tag, "hreflang"),
      )
      .map((tag) => ({
        locale: tagAttribute(tag, "hreflang"),
        href: tagAttribute(tag, "href"),
      }))
      .sort((a, b) => a.locale.localeCompare(b.locale)),
  };
}

function expectedMediaType(contentType) {
  return {
    "application/javascript": "application/javascript",
    "application/json": "application/json",
    "application/octet-stream": "application/octet-stream",
    "application/xml": "application/xml",
    "image/png": "image/png",
    "image/svg+xml": "image/svg+xml",
    "image/vnd.microsoft.icon": "image/vnd.microsoft.icon",
    "text/html": "text/html",
    "text/plain": "text/plain",
    "text/css": "text/css",
    "video/mp4": "video/mp4",
  }[contentType];
}

async function fetchManual(route, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(new URL(route, base), {
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
        headers: { "user-agent": "bubble-preview-verifier/1.0" },
      });
      if (response.status !== 429 && response.status < 500) return response;
      if (attempt === attempts - 1) return response;
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, 250 * 2 ** attempt + Math.floor(Math.random() * 100)),
    );
  }
  throw lastError;
}

invariant(
  /^[\da-f]{40}$/.test(expectedSha),
  "Preview verification requires an immutable 40-character Git SHA",
);
invariant(
  localManifest.schema_version === 3 && Array.isArray(localManifest.records),
  "Invalid local route manifest",
);
invariant(
  localManifest.build?.source_sha === expectedSha,
  "Local manifest does not match the expected Git SHA",
);

const manifestResponse = await fetchManual(
  "/release-manifests/site-route-manifest.json",
);
invariant(
  manifestResponse.status === 200,
  `Preview manifest returned ${manifestResponse.status}`,
);
const deployedManifestText = await manifestResponse.text();
const manifest = JSON.parse(deployedManifestText);
invariant(
  manifest.schema_version === 3 && Array.isArray(manifest.records),
  "Invalid preview route manifest",
);
invariant(
  manifest.build?.source_sha === expectedSha,
  "Preview manifest source SHA does not match the release candidate",
);
invariant(
  manifest.build?.artifact_sha256 === localManifest.build?.artifact_sha256,
  "Preview artifact fingerprint differs from the locally verified release artifact",
);
invariant(
  deployedManifestText === localManifestText,
  `Preview manifest bytes differ from local manifest (${sha256(deployedManifestText)} != ${sha256(localManifestText)})`,
);

const canonicalOrigins = new Set(
  manifest.records
    .map((record) => record.canonical)
    .filter(Boolean)
    .map((value) => new URL(value).origin),
);
const failures = [];
const externalUrls = new Set();
let cursor = 0;
const concurrency = Math.min(12, manifest.records.length);

async function verifyRecord(record) {
  try {
    const response = await fetchManual(record.route);
    invariant(
      response.status === record.status,
      `${record.route}: expected ${record.status}, received ${response.status}`,
    );
    if (record.status === 301 || record.status === 308) {
      const location = response.headers.get("location");
      invariant(location, `${record.route}: redirect has no Location header`);
      const actualTarget = new URL(location, base);
      const expectedTarget = new URL(record.target, base);
      invariant(
        actualTarget.origin === base.origin,
        `${record.route}: redirect leaves preview origin`,
      );
      invariant(
        actualTarget.pathname === expectedTarget.pathname &&
          actualTarget.search === expectedTarget.search,
        `${record.route}: expected redirect ${expectedTarget.pathname}${expectedTarget.search}, received ${actualTarget.pathname}${actualTarget.search}`,
      );
      return;
    }

    const mediaType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    const expectedType = expectedMediaType(record.content_type);
    invariant(
      mediaType === expectedType,
      `${record.route}: expected ${expectedType}, received ${mediaType ?? "none"}`,
    );
    invariant(
      response.headers.get("x-content-type-options") === "nosniff",
      `${record.route}: nosniff header missing`,
    );

    if (
      [
        "application/octet-stream",
        "image/png",
        "image/vnd.microsoft.icon",
        "video/mp4",
      ].includes(record.content_type)
    ) {
      await response.body?.cancel();
      return;
    }

    if (/^\/data\/daily\/\d{4}-\d{2}-\d{2}\.json$/.test(record.route)) {
      const deployedBytes = Buffer.from(await response.arrayBuffer());
      const localBytes = await readFile(
        resolve(localDistRoot, record.output_path),
      );
      invariant(
        deployedBytes.equals(localBytes),
        `${record.route}: deployed JSON bytes differ from the release artifact`,
      );
      JSON.parse(deployedBytes.toString("utf8"));
      return;
    }

    const body = await response.text();

    if (record.content_type === "application/json") JSON.parse(body);
    if (record.content_type === "application/xml")
      invariant(
        body.startsWith("<?xml"),
        `${record.route}: XML declaration missing`,
      );
    if (record.content_type === "text/html") {
      invariant(
        /<!doctype html>/i.test(body),
        `${record.route}: HTML doctype missing`,
      );
      if (record.indexable) {
        const metadata = htmlMetadata(body);
        invariant(
          metadata.canonical === record.canonical,
          `${record.route}: canonical drifted in deployed HTML`,
        );
        invariant(
          JSON.stringify(metadata.hreflang) ===
            JSON.stringify(record.hreflang ?? []),
          `${record.route}: hreflang drifted in deployed HTML`,
        );
      }
      for (const tag of body.match(/<a\b[^>]*>/gi) ?? []) {
        const value = (tagAttribute(tag, "href") ?? "").trim();
        if (
          !value ||
          value.startsWith("#") ||
          /^(?:mailto|tel|data|blob|javascript):/i.test(value)
        )
          continue;
        let url;
        try {
          url = new URL(value, new URL(record.route, base));
        } catch {
          throw new Error(`invalid deployed URL attribute: ${value}`);
        }
        url.hash = "";
        if (url.origin !== base.origin && !canonicalOrigins.has(url.origin))
          externalUrls.add(url.href);
      }
    }
  } catch (error) {
    failures.push(
      `${record.route}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function routeWorker() {
  while (true) {
    const index = cursor++;
    if (index >= manifest.records.length) return;
    await verifyRecord(manifest.records[index]);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => routeWorker()));

const missingRoute = `/.well-known/phase4-missing-${Date.now()}`;
const missingResponse = await fetchManual(missingRoute);
invariant(
  missingResponse.status === 404,
  `Unknown route returned ${missingResponse.status}, expected 404`,
);
invariant(
  (await missingResponse.text()).includes("404"),
  "Custom 404 response does not identify itself",
);

const demo = manifest.records.find(
  (record) => record.status === 200 && record.route.startsWith("/eval-demos/"),
);
invariant(demo, "No sandboxed demo route exists in the preview contract");
const demoResponse = await fetchManual(demo.route);
const csp = demoResponse.headers.get("content-security-policy") ?? "";
invariant(
  csp.includes("sandbox") && !csp.includes("allow-same-origin"),
  "Demo CSP sandbox is missing or unsafe",
);
invariant(
  (demoResponse.headers.get("x-robots-tag") ?? "").includes("noindex"),
  "Demo noindex header is missing",
);
const referrerPolicies = (demoResponse.headers.get("referrer-policy") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
invariant(
  referrerPolicies.at(-1) === "no-referrer",
  "Demo no-referrer policy is missing",
);

let externalEvaluation = null;
if (checkExternal) {
  const urls = [...externalUrls].sort();
  const startedAt = new Date().toISOString();
  const waiverPolicyText = await readFile(externalWaiversPath, "utf8");
  const waiverPolicy = JSON.parse(waiverPolicyText);
  const dnsCache = new Map();
  const dispatcherCache = new Map();
  let audit;
  let evaluation;
  let fatalError = null;
  try {
    try {
      audit = await auditExternalLinks(urls, {
        probe: (url) => probeExternalUrl(url, { dnsCache, dispatcherCache }),
      });
    } finally {
      await closeExternalLinkDispatchers(dispatcherCache);
    }
  } catch (error) {
    fatalError = error instanceof Error ? error.message : String(error);
    audit = {
      results: urls.map((url) => ({
        url,
        final_url: null,
        outcome: "incomplete",
        reason: "audit_crashed",
        status: null,
        attempts: 0,
        duration_ms: 0,
        directly_probed: false,
      })),
      circuits: [],
    };
  }
  const initialResults = audit.results;
  const resultsByUrl = new Map(
    initialResults.map((result) => [result.url, result]),
  );
  const unexpectedUrls = [...resultsByUrl.keys()].filter(
    (url) => !externalUrls.has(url),
  );
  const cardinalityDrift =
    initialResults.length !== urls.length ||
    resultsByUrl.size !== urls.length ||
    unexpectedUrls.length > 0;
  audit.results = urls.map(
    (url) =>
      resultsByUrl.get(url) ?? {
        url,
        final_url: null,
        outcome: "incomplete",
        reason: "missing_audit_result",
        status: null,
        attempts: 0,
        duration_ms: 0,
        directly_probed: false,
      },
  );
  audit = applyExternalLinkWaivers(audit, waiverPolicy);
  evaluation = evaluateExternalLinkAudit(audit, DEFAULT_EXTERNAL_LINK_BUDGETS);
  if (fatalError) evaluation.violations.unshift(`Audit crashed: ${fatalError}`);
  if (cardinalityDrift)
    evaluation.violations.unshift(
      `Audit result cardinality drifted (${initialResults.length} results for ${urls.length} URLs)`,
    );
  if ((fatalError || cardinalityDrift) && evaluation.gate !== "FAIL")
    evaluation.gate = "INCONCLUSIVE";
  externalEvaluation = evaluation;
  const report = {
    schema_version: 1,
    preview_origin: base.origin,
    source_sha: expectedSha,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    policy: {
      hard_failures: [
        "GET-confirmed HTTP 404 or 410 without an active exact-URL waiver",
        "deterministic DNS or TLS failure",
        "non-public or unsupported redirect target",
      ],
      accepted_but_budgeted: [
        "reachable-restricted",
        "transient-upstream",
        "transport-unknown",
      ],
      inconclusive: ["circuit-open", "global deadline", "budget exceeded"],
      budgets: DEFAULT_EXTERNAL_LINK_BUDGETS,
      waiver_policy_path: externalWaiversPath,
      waiver_policy_sha256: sha256(waiverPolicyText),
    },
    configuration: {
      request_timeout_ms: 10_000,
      request_attempts: 2,
      maximum_redirects: 8,
      global_deadline_ms: 15 * 60_000,
      origin_concurrency: 6,
      per_origin_concurrency: 4,
      circuit_failure_threshold: 3,
    },
    evaluation,
    waiver_policy: waiverPolicy,
    waiver_summary: audit.waiver_summary,
    waiver_violations: audit.waiver_violations,
    circuits: audit.circuits,
    results: audit.results,
    fatal_error: fatalError,
  };
  await writeJsonAtomic(externalReportPath, report);
  console.log(
    `External link audit ${evaluation.gate}: ${evaluation.total} URLs, ${evaluation.waived} waived, ${evaluation.directly_probed} directly probed in the evaluated set, ${evaluation.evaluated_counts.success ?? 0} successful, report ${externalReportPath}`,
  );
  if (evaluation.violations.length > 0)
    console.error(`External link gate: ${evaluation.violations.join("; ")}`);
  if (evaluation.gate === "FAIL") process.exitCode = 1;
  if (evaluation.gate === "INCONCLUSIVE" && process.exitCode !== 1)
    process.exitCode = 2;
}

invariant(
  failures.length === 0,
  `Preview contract failures (${failures.length}):\n${failures.slice(0, 40).join("\n")}`,
);
console.log(
  !checkExternal ||
    externalEvaluation?.gate === "PASS" ||
    externalEvaluation?.gate === "PASS_WITH_WARNINGS"
    ? `Verified deployed preview ${base.origin} at ${expectedSha}: ${manifest.records.length} routes, redirects, headers, metadata, custom 404, and ${externalUrls.size} parsed external links${checkExternal ? ` (${externalEvaluation.gate})` : " (not requested)"}.`
    : `Preview route contract passed, but external link audit is ${externalEvaluation?.gate ?? "INCONCLUSIVE"}: ${base.origin} at ${expectedSha}.`,
);
