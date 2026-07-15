import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const argumentsList = process.argv.slice(2);
const checkExternal = argumentsList.includes("--check-external");
const positional = argumentsList.filter(
  (argument) => argument !== "--check-external",
);
const [baseArgument, expectedShaArgument, manifestPathArgument] = positional;
if (!baseArgument) {
  throw new Error(
    "Usage: node scripts/verify-preview.mjs <preview-origin> [expected-40-char-sha] [local-manifest] [--check-external]",
  );
}

const localManifestPath =
  manifestPathArgument ??
  "astro/dist/release-manifests/site-route-manifest.json";
const localManifestText = await readFile(localManifestPath, "utf8");
const localManifest = JSON.parse(localManifestText);
const expectedSha = (
  expectedShaArgument ??
  localManifest.build?.source_sha ??
  ""
).toLowerCase();

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

async function fetchManual(route) {
  return fetch(new URL(route, base), {
    redirect: "manual",
    headers: { "user-agent": "bubble-preview-verifier/1.0" },
  });
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

async function checkExternalUrl(url) {
  const options = {
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
    headers: { "user-agent": "bubble-external-link-verifier/1.0" },
  };
  let response = await fetch(url, { ...options, method: "HEAD" });
  if (response.status === 405 || response.status === 501) {
    response = await fetch(url, {
      ...options,
      method: "GET",
      headers: { ...options.headers, range: "bytes=0-0" },
    });
  }
  if (
    response.status === 404 ||
    response.status === 410 ||
    response.status >= 500
  ) {
    throw new Error(`HTTP ${response.status}`);
  }
}

if (checkExternal) {
  const urls = [...externalUrls].sort();
  let externalCursor = 0;
  const externalFailures = [];
  async function externalWorker() {
    while (true) {
      const index = externalCursor++;
      if (index >= urls.length) return;
      try {
        await checkExternalUrl(urls[index]);
      } catch (error) {
        externalFailures.push(
          `${urls[index]}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(12, urls.length) }, () => externalWorker()),
  );
  invariant(
    externalFailures.length === 0,
    `External link failures (${externalFailures.length}):\n${externalFailures.slice(0, 40).join("\n")}`,
  );
}

invariant(
  failures.length === 0,
  `Preview contract failures (${failures.length}):\n${failures.slice(0, 40).join("\n")}`,
);
console.log(
  `Verified deployed preview ${base.origin} at ${expectedSha}: ${manifest.records.length} routes, redirects, headers, metadata, custom 404, and ${externalUrls.size} parsed external links${checkExternal ? " checked" : " (not requested)"}.`,
);
