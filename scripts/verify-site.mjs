import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { XMLParser } from "fast-xml-parser";
import { assertRouteBuildContract } from "./content-route-build-contract.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const astroRoot = resolve(repoRoot, "astro");
const distRoot = resolve(astroRoot, "dist");
const siteOrigin = "https://bubblenews.today";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function artifactFingerprint(directory, excludedPath) {
  const aggregate = createHash("sha256");
  const files = (await walk(directory))
    .map((file) => ({
      file,
      path: relative(directory, file).replaceAll("\\", "/"),
    }))
    .filter((entry) => entry.path !== excludedPath)
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const entry of files) {
    aggregate.update(entry.path);
    aggregate.update("\0");
    aggregate.update(sha256(await readFile(entry.file)));
    aggregate.update("\n");
  }
  return aggregate.digest("hex");
}

function tagAttribute(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

function routeFromPath(path) {
  const normalized = path.replaceAll("\\", "/");
  if (normalized === "index.html") return "/";
  if (normalized.endsWith("/index.html"))
    return `/${normalized.slice(0, -"index.html".length)}`;
  return `/${normalized}`;
}

function pathFromRoute(route, contentType) {
  if (route === "/") return "index.html";
  if (contentType === "text/html" && route.endsWith("/"))
    return `${route.slice(1)}index.html`;
  return route.slice(1);
}

function relevantOutput(path) {
  return /\.(?:html|xml|json)$/.test(path) || path === "robots.txt";
}

function releaseOutput(path) {
  return (
    ![".DS_Store", "_headers", "_redirects"].includes(path) &&
    !path.endsWith("/.DS_Store")
  );
}

function extractLocalReferences(html, pageRoute) {
  const references = [];
  const add = (value) => {
    const normalized = value.trim();
    if (
      !normalized ||
      normalized.startsWith("#") ||
      /^(?:mailto|tel|data|blob|javascript):/i.test(normalized)
    )
      return;
    let url;
    try {
      url = new URL(normalized, new URL(pageRoute, siteOrigin));
    } catch {
      return;
    }
    if (url.origin === siteOrigin) references.push(url.pathname);
  };
  const markup = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<pre\b[\s\S]*?<\/pre>/gi, "")
    .replace(/<code\b[\s\S]*?<\/code>/gi, "");
  const attributes = markup.matchAll(
    /\b(?:href|src|action|poster|data|cite)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
  );
  for (const match of attributes) {
    add(match[1] ?? match[2] ?? match[3] ?? "");
  }
  for (const match of markup.matchAll(
    /\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
  )) {
    for (const candidate of (match[1] ?? match[2] ?? "").split(","))
      add(candidate.trim().split(/\s+/, 1)[0]);
  }
  for (const match of markup.matchAll(
    /<meta\b[^>]*http-equiv=["']?refresh["']?[^>]*content=["']([^"']+)["'][^>]*>/gi,
  )) {
    const target = match[1].match(/url\s*=\s*(.+)$/i)?.[1];
    if (target) add(target);
  }
  return references;
}

function headerBlock(text, routePattern) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === routePattern);
  invariant(start >= 0, `Missing Cloudflare header block: ${routePattern}`);
  const headers = new Map();
  for (const line of lines.slice(start + 1)) {
    if (!/^\s/.test(line)) break;
    const match = line.trim().match(/^([^:]+):\s*(.*)$/);
    if (match) headers.set(match[1].toLowerCase(), match[2]);
  }
  return headers;
}

function cspDirectives(value) {
  return new Map(
    value
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...tokens] = part.split(/\s+/);
        return [name, tokens];
      }),
  );
}

function rssIdentitySet(xml, route) {
  const identities = [];
  for (const item of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const link = item[1].match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim();
    const guid = item[1]
      .match(/<guid(?:\s[^>]*)?>([\s\S]*?)<\/guid>/i)?.[1]
      ?.trim();
    invariant(link && guid, `RSS item has no link/guid identity: ${route}`);
    identities.push(`${link}\n${guid}`);
  }
  return identities.sort();
}

const ownershipBytes = await readFile(
  resolve(astroRoot, "route-ownership.json"),
);
const rawPolicy = JSON.parse(
  await readFile(resolve(astroRoot, "raw-html-policy.json"), "utf8"),
);
const contractRelativePath = "release-manifests/site-route-manifest.json";
const contractPath = resolve(distRoot, contractRelativePath);
const legacyManifestPath = resolve(
  distRoot,
  "release-manifests",
  "legacy-compat-manifest.json",
);
invariant(
  await exists(contractPath),
  "Missing generated site route contract; run the Astro build first",
);
invariant(
  await exists(legacyManifestPath),
  "Missing generated Hugo compatibility manifest",
);

const contract = JSON.parse(await readFile(contractPath, "utf8"));
const legacyManifest = JSON.parse(await readFile(legacyManifestPath, "utf8"));
const pinnedContentBuild = Boolean(contract.build?.site_release_id);
invariant(
  contract.schema_version === 3 && Array.isArray(contract.records),
  "Invalid site route contract",
);
let expectedPinnedBuild = null;
if (pinnedContentBuild) {
  const input = JSON.parse(
    await readFile(resolve(astroRoot, ".content-release", "build-input.json"), "utf8"),
  );
  expectedPinnedBuild = {
    code_sha: input.code_sha,
    source_sha: input.code_sha,
    site_release_id: input.site_release_id,
    site_release_sequence: input.site_release_sequence,
    content_sha256: input.content_sha256,
    manifest_sha256: input.manifest_sha256,
    build_environment_version: input.build_environment_version,
    content_schema_version: input.content_schema_version,
    content_taxonomy_version: input.content_taxonomy_version,
    content_serializer_version: input.content_serializer_version,
    content_search_contract_version: input.content_search_contract_version,
    content_source_contract_version: input.content_source_contract_version,
  };
}
assertRouteBuildContract(contract.build, {
  pinned: pinnedContentBuild,
  expected: expectedPinnedBuild,
});
invariant(
  /^[\da-f]{40}$/.test(contract.build?.source_sha ?? ""),
  "Site contract has no immutable source SHA",
);
invariant(
  contract.build?.hash_algorithm === "sha256-path-and-content-v1",
  "Site contract uses an unknown artifact hash algorithm",
);
invariant(
  contract.build?.artifact_sha256 ===
    (await artifactFingerprint(distRoot, contractRelativePath)),
  "Site contract artifact fingerprint does not match dist",
);
invariant(
  legacyManifest.ownership_sha256 === sha256(ownershipBytes),
  "Route ownership drifted after the compatibility build",
);

const byRoute = new Map();
for (const record of contract.records) {
  invariant(
    /^\//.test(record.route),
    `Non-absolute contract route: ${record.route}`,
  );
  invariant(
    !byRoute.has(record.route),
    `A route has more than one declared status: ${record.route}`,
  );
  invariant(
    [200, 301, 308].includes(record.status),
    `Unsupported route status: ${record.route}`,
  );
  byRoute.set(record.route, record);
  if (record.status === 200) {
    const outputPath =
      record.output_path ?? pathFromRoute(record.route, record.content_type);
    invariant(
      await exists(resolve(distRoot, outputPath)),
      `Contract route has no output file: ${record.route}`,
    );
  }
}

const byOutputPath = new Map(
  contract.records
    .filter((record) => record.status === 200)
    .map((record) => [
      record.output_path ?? pathFromRoute(record.route, record.content_type),
      record,
    ]),
);

for (const file of await walk(distRoot)) {
  const path = relative(distRoot, file).replaceAll("\\", "/");
  if (!releaseOutput(path)) continue;
  invariant(
    byOutputPath.get(path)?.status === 200,
    `Output file is missing from the site contract: ${path}`,
  );
  invariant(
    !path.includes(".html/index.html"),
    `Nested .html route is forbidden: ${path}`,
  );
}

for (const record of contract.records.filter(
  (entry) => entry.status === 301 || entry.status === 308,
)) {
  invariant(
    byRoute.get(record.target)?.status === 200,
    `Redirect target is not a 200 route: ${record.route} -> ${record.target}`,
  );
}

const requiredRoutes = [
  "/",
  "/en/",
  "/daily/",
  "/en/daily/",
  "/search/",
  "/search/index.json",
  "/topics/",
  "/entities/",
  "/index.json",
  "/en/index.json",
  "/404",
  "/en/404",
  "/robots.txt",
  "/rss.xml",
  "/en/rss.xml",
  "/sitemap.xml",
  "/zh-cn/sitemap.xml",
  "/en/sitemap.xml",
];
for (const route of requiredRoutes)
  invariant(
    byRoute.get(route)?.status === 200,
    `Missing required 200 route: ${route}`,
  );

const dailyDataDirectory = pinnedContentBuild
  ? resolve(astroRoot, ".content-release", "data")
  : resolve(repoRoot, "data", "daily");
const dailyDataNames = (await readdir(dailyDataDirectory))
  .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
  .sort();
const publishedDailyRecords = contract.records.filter(
  (record) =>
    record.status === 200 &&
    /^\/data\/daily\/\d{4}-\d{2}-\d{2}\.json$/.test(record.route),
);
invariant(
  publishedDailyRecords.length === dailyDataNames.length,
  `Structured daily route count drifted (${publishedDailyRecords.length} routes for ${dailyDataNames.length} source files)`,
);
const searchIndex = JSON.parse(
  await readFile(resolve(distRoot, "search", "index.json"), "utf8"),
);
invariant(
  (searchIndex.site_release_id ?? null) ===
    (contract.build?.site_release_id ?? null),
  "Static search release identity differs from the route manifest",
);
if (pinnedContentBuild) {
  const searchHtml = await readFile(resolve(distRoot, "search", "index.html"), "utf8");
  invariant(
    searchHtml.includes(`data-content-release-id="${contract.build.site_release_id}"`) &&
      searchHtml.includes(
        'data-content-api-origin="https://content-api.bubblenews.today"',
      ),
    "Search HTML does not bind historical queries to the pinned release",
  );
}
const expectedSearchDates = dailyDataNames.map((name) =>
  name.slice(0, -".json".length),
);
// The static search index intentionally covers only the most recent report
// days (STATIC_SEARCH_MAX_REPORT_DAYS in astro/src/lib/searchIndex.ts — keep
// this value in sync). Search coverage invariants below apply to that window;
// JSON route and rendered-HTML checks still cover every published day.
const STATIC_SEARCH_MAX_REPORT_DAYS = 7;
const expectedSearchWindow = new Set(
  [...expectedSearchDates]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, STATIC_SEARCH_MAX_REPORT_DAYS),
);
const pinnedEnglishDailyRssIdentities = new Set(
  pinnedContentBuild
    ? expectedSearchDates.map((date) => {
        const url = `${siteOrigin}/en/daily/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}/`;
        return `${url}\n${url}`;
      })
    : [],
);
let expectedSearchItemCount = 0;
for (const name of dailyDataNames) {
  const route = `/data/daily/${name}`;
  const record = byRoute.get(route);
  invariant(
    record?.status === 200 &&
      record.owner === "astro" &&
      record.content_type === "application/json" &&
      record.output_path === `data/daily/${name}`,
    `Missing canonical structured daily route: ${route}`,
  );
  const source = await readFile(resolve(dailyDataDirectory, name));
  const output = await readFile(resolve(distRoot, record.output_path));
  invariant(
    source.equals(output),
    `Published structured daily JSON differs from its canonical source: ${route}`,
  );
  const report = JSON.parse(source.toString("utf8"));
  const date = name.slice(0, -".json".length);
  if (expectedSearchWindow.has(date)) {
    expectedSearchItemCount += report.items.length;
    const searchItems = searchIndex.items.filter((item) => item.date === date);
    const expectedSearchItems = new Map(
      report.items.map((item) => [
        `${date}:${item.id}`,
        `/daily/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}/#news-${item.id}`,
      ]),
    );
    invariant(
      searchIndex.report_dates.includes(date) &&
        searchItems.length === report.items.length &&
        expectedSearchItems.size === report.items.length,
      `Structured daily search coverage drifted: ${date}`,
    );
    const seenSearchKeys = new Set();
    for (const item of searchItems) {
      invariant(
        !seenSearchKeys.has(item.key) &&
          expectedSearchItems.get(item.key) === item.href,
        `Structured daily search item drifted: ${item.key}`,
      );
      seenSearchKeys.add(item.key);
    }
    invariant(
      seenSearchKeys.size === expectedSearchItems.size &&
        [...expectedSearchItems.keys()].every((key) => seenSearchKeys.has(key)),
      `Structured daily search keys drifted: ${date}`,
    );
  }
  const [year, month] = date.split("-");
  const dailyHtml = await readFile(
    resolve(distRoot, "daily", year, month, date, "index.html"),
    "utf8",
  );
  for (const item of report.items) {
    invariant(
      dailyHtml.includes(`id="news-${item.id}"`),
      `Structured daily item is missing from rendered HTML: ${date}:${item.id}`,
    );
  }
}
invariant(
  new Set(searchIndex.report_dates).size === searchIndex.report_dates.length &&
    searchIndex.report_dates.length === expectedSearchWindow.size &&
    [...expectedSearchWindow].every((date) =>
      searchIndex.report_dates.includes(date),
    ),
  "Structured daily search report dates drifted",
);
invariant(
  searchIndex.item_count === expectedSearchItemCount &&
    searchIndex.items.length === expectedSearchItemCount,
  `Structured daily search item count drifted (${searchIndex.items.length} items for ${expectedSearchItemCount} canonical items)`,
);

for (const [source, target] of [
  ["/index.xml", "/rss.xml"],
  ["/en/index.xml", "/en/rss.xml"],
  ["/en/daily/2025/12/202-22/", "/en/daily/2025/12/2025-12-22/"],
  ["/curations/amo-gemini/", "/curations/amo-bench/"],
  ["/en/curations/amo-gemini/", "/en/curations/amo-bench/"],
]) {
  const redirect = byRoute.get(source);
  invariant(
    redirect?.status === 301 && redirect.target === target,
    `Missing required redirect: ${source} -> ${target}`,
  );
}

for (const [source, target] of [
  ["/404.html", "/404"],
  ["/en/404.html", "/en/404"],
]) {
  const redirect = byRoute.get(source);
  invariant(
    redirect?.status === 308 && redirect.target === target,
    `Missing Pages clean-URL redirect: ${source}`,
  );
}

const xmlRecords = contract.records.filter(
  (record) =>
    record.status === 200 && record.content_type === "application/xml",
);
invariant(
  xmlRecords.length === 27,
  `Expected 27 XML routes, received ${xmlRecords.length}`,
);
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  allowBooleanAttributes: false,
});
for (const record of xmlRecords) {
  const body = await readFile(
    resolve(
      distRoot,
      record.output_path ?? pathFromRoute(record.route, record.content_type),
    ),
    "utf8",
  );
  invariant(
    body.startsWith("<?xml"),
    `XML declaration missing: ${record.route}`,
  );
  try {
    xmlParser.parse(body);
  } catch (error) {
    throw new Error(`Malformed XML at ${record.route}: ${error.message}`);
  }
}

for (const record of contract.records.filter(
  (entry) =>
    entry.status === 200 &&
    entry.content_type === "text/html" &&
    entry.owner !== "static",
)) {
  const expectedCanonical = new URL(record.route, siteOrigin).href;
  invariant(
    record.canonical === expectedCanonical,
    `Invalid canonical for ${record.route}: ${record.canonical ?? "missing"}`,
  );
  const alternates = record.hreflang ?? [];
  const languages = new Map(
    alternates.map((entry) => [entry.locale, entry.href]),
  );
  invariant(
    languages.size === alternates.length,
    `Duplicate hreflang locale for ${record.route}`,
  );
  const selfLanguage = record.route.startsWith("/en/") ? "en" : "zh-CN";
  invariant(
    languages.get(selfLanguage) === expectedCanonical,
    `Self hreflang is missing or invalid for ${record.route}`,
  );
  invariant(
    languages.has("x-default"),
    `x-default hreflang is missing for ${record.route}`,
  );
  for (const alternate of alternates) {
    const url = new URL(alternate.href);
    invariant(
      url.origin === siteOrigin,
      `hreflang leaves canonical origin for ${record.route}`,
    );
    const target = byRoute.get(url.pathname);
    invariant(
      target?.status === 200 && target.content_type === "text/html",
      `hreflang target is not a 200 HTML route: ${record.route} -> ${url.pathname}`,
    );
    if (
      alternate.locale === "x-default" ||
      alternate.href === expectedCanonical
    )
      continue;
    const reciprocal = (target.hreflang ?? []).find(
      (entry) => entry.locale === selfLanguage,
    );
    invariant(
      reciprocal?.href === expectedCanonical,
      `hreflang is not reciprocal: ${record.route} -> ${url.pathname}`,
    );
  }
}

for (const record of contract.records.filter(
  (entry) =>
    entry.status === 200 &&
    entry.content_type === "text/html" &&
    entry.owner !== "static",
)) {
  const html = await readFile(
    resolve(
      distRoot,
      record.output_path ?? pathFromRoute(record.route, record.content_type),
    ),
    "utf8",
  );
  const skipLink = (html.match(/<a\b[^>]*>/gi) ?? []).find(
    (tag) =>
      (tagAttribute(tag, "class") ?? "").split(/\s+/).includes("skip-link") &&
      tagAttribute(tag, "href") === "#main-content",
  );
  const mainTarget = (html.match(/<(?:main|div)\b[^>]*>/gi) ?? []).find(
    (tag) =>
      tagAttribute(tag, "id") === "main-content" &&
      tagAttribute(tag, "tabindex") === "-1",
  );
  invariant(skipLink, `Skip link missing: ${record.route}`);
  invariant(mainTarget, `Focusable main target missing: ${record.route}`);
  if (record.route === "/404" || record.route === "/en/404") {
    const robots = (html.match(/<meta\b[^>]*>/gi) ?? []).find(
      (tag) =>
        tagAttribute(tag, "name") === "robots" &&
        (tagAttribute(tag, "content") ?? "").includes("noindex"),
    );
    invariant(robots, `404 noindex missing: ${record.route}`);
  }
}

const allOutputPaths = new Set(
  (await walk(distRoot)).map((file) =>
    relative(distRoot, file).replaceAll("\\", "/"),
  ),
);
const contractRoutes = new Set(contract.records.map((record) => record.route));
const brokenReferences = [];
for (const record of contract.records.filter(
  (entry) =>
    entry.status === 200 &&
    entry.content_type === "text/html" &&
    entry.indexable,
)) {
  const html = await readFile(
    resolve(
      distRoot,
      record.output_path ?? pathFromRoute(record.route, record.content_type),
    ),
    "utf8",
  );
  for (const pathname of extractLocalReferences(html, record.route)) {
    let decoded = pathname;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {}
    const path = decoded.replace(/^\//, "");
    const routeExists =
      contractRoutes.has(decoded) ||
      contractRoutes.has(decoded.endsWith("/") ? decoded : `${decoded}/`);
    const fileExists =
      allOutputPaths.has(path) ||
      allOutputPaths.has(`${path.replace(/\/$/, "")}/index.html`);
    if (!routeExists && !fileExists)
      brokenReferences.push(`${record.route} -> ${decoded}`);
  }
}
invariant(
  brokenReferences.length === 0,
  `Broken internal references:\n${brokenReferences.slice(0, 30).join("\n")}`,
);

for (const entry of legacyManifest.copied) {
  const path = resolve(distRoot, entry.path);
  invariant(
    await exists(path),
    `Compatibility file disappeared: ${entry.path}`,
  );
  invariant(
    sha256(await readFile(path)) === entry.sha256,
    `Compatibility file hash drifted: ${entry.path}`,
  );
  if (entry.kind === "page") {
    invariant(
      byRoute.get(entry.route)?.owner === "hugo_compat",
      `Compatibility owner drifted: ${entry.route}`,
    );
  }
}

const specializedMarkers = new Map([
  [
    "ai-tools/image-compress/index.html",
    ['id="imgc-input"', "heic2any", "jszip"],
  ],
  [
    "model-evals/index.html",
    ['id="eval-search"', "model-evals.json", "<script"],
  ],
  [
    "highlights/index.html",
    ['id="highlight-search"', "highlights.json", "<script"],
  ],
]);
for (const [path, markers] of specializedMarkers) {
  const html = await readFile(resolve(distRoot, path), "utf8");
  for (const marker of markers)
    invariant(
      html.includes(marker),
      `Specialized Astro behavior is missing ${marker} in ${path}`,
    );
}

const demoRoot = resolve(repoRoot, rawPolicy.source_directory);
const demoFiles = (await walk(demoRoot))
  .filter((path) => path.endsWith(".html"))
  .sort();
invariant(rawPolicy.schema_version === 2, "Unsupported raw HTML policy schema");
invariant(
  demoFiles.length === rawPolicy.expected_html_files,
  "Raw HTML demo count drifted",
);
const aggregate = createHash("sha256");
for (const file of demoFiles) {
  const path = relative(demoRoot, file).replaceAll("\\", "/");
  const sourceHash = sha256(await readFile(file));
  aggregate.update(path);
  aggregate.update("\0");
  aggregate.update(sourceHash);
  aggregate.update("\n");
  const deployedPath = resolve(
    distRoot,
    rawPolicy.route_prefix.replace(/^\//, ""),
    path,
  );
  invariant(
    await exists(deployedPath),
    `Raw HTML demo missing from dist: ${path}`,
  );
  invariant(
    sha256(await readFile(deployedPath)) === sourceHash,
    `Raw HTML source/dist hash drifted: ${path}`,
  );
}
invariant(
  aggregate.digest("hex") === rawPolicy.aggregate_sha256,
  "Raw HTML hash inventory drifted",
);
const headers = await readFile(resolve(distRoot, "_headers"), "utf8");
const demoHeaders = headerBlock(headers, `${rawPolicy.route_prefix}*`);
for (const [name, expected] of Object.entries(rawPolicy.required_headers)) {
  invariant(
    demoHeaders.get(name.toLowerCase()) === expected,
    `Raw HTML security header drifted: ${name}`,
  );
}
const csp = cspDirectives(demoHeaders.get("content-security-policy") ?? "");
const sandbox = csp.get("sandbox");
invariant(
  sandbox?.includes("allow-scripts"),
  "Raw HTML CSP must permit sandboxed scripts",
);
invariant(
  !sandbox?.includes("allow-same-origin"),
  "Raw HTML CSP must not permit same-origin access",
);
for (const directive of [
  "default-src",
  "object-src",
  "base-uri",
  "form-action",
]) {
  invariant(
    csp.get(directive)?.includes("'none'"),
    `Raw HTML CSP must deny ${directive}`,
  );
}
invariant(
  rawPolicy.same_origin_access === false,
  "Raw HTML policy must keep same-origin access disabled",
);

const robots = await readFile(resolve(distRoot, "robots.txt"), "utf8");
invariant(
  robots.includes("Sitemap: https://bubblenews.today/sitemap.xml"),
  "robots.txt does not advertise the canonical sitemap",
);
invariant(
  demoHeaders.get("x-robots-tag") === "noindex, nofollow",
  "Executable demos are not explicitly noindex",
);

const temporaryRoot = await mkdtemp(resolve(tmpdir(), "bubble-site-verify-"));
try {
  const { stdout: version } = await execFileAsync("hugo", ["version"]);
  invariant(
    version.includes("v0.147.9"),
    `Hugo parity requires 0.147.9; received ${version.trim()}`,
  );
  await execFileAsync(
    "hugo",
    [
      "--source",
      repoRoot,
      "--destination",
      temporaryRoot,
      "--minify",
      "--panicOnWarning",
      "--printPathWarnings",
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  for (const record of xmlRecords.filter(
    (entry) => entry.route.endsWith("/rss.xml") || entry.route === "/rss.xml",
  )) {
    const outputPath =
      record.output_path ?? pathFromRoute(record.route, record.content_type);
    const hugoPath = resolve(temporaryRoot, outputPath);
    invariant(
      await exists(hugoPath),
      `Hugo RSS counterpart is missing: ${record.route}`,
    );
    const [astroRss, hugoRss] = await Promise.all([
      readFile(resolve(distRoot, outputPath), "utf8"),
      readFile(hugoPath, "utf8"),
    ]);
    const astroSet = rssIdentitySet(astroRss, record.route);
    const hugoSet = rssIdentitySet(hugoRss, record.route);
    const expectedSet = new Set(hugoSet);
    if (
      pinnedContentBuild &&
      (record.route === "/en/daily/rss.xml" || record.route === "/en/rss.xml")
    ) {
      for (const identity of pinnedEnglishDailyRssIdentities)
        expectedSet.add(identity);
    }
    const expectedIdentities = [...expectedSet].sort();
    invariant(
      JSON.stringify(astroSet) === JSON.stringify(expectedIdentities),
      `RSS accepted-set drift for ${record.route}: Astro ${astroSet.length}, expected ${expectedIdentities.length}`,
    );
  }
  const missingLegacyRoutes = [];
  for (const file of await walk(temporaryRoot)) {
    const path = relative(temporaryRoot, file).replaceAll("\\", "/");
    if (!relevantOutput(path)) continue;
    const route = routeFromPath(path);
    if (!byRoute.has(route)) missingLegacyRoutes.push(route);
  }
  invariant(
    missingLegacyRoutes.length === 0,
    `Hugo routes missing from Astro release contract:\n${missingLegacyRoutes.join("\n")}`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

console.log(
  `Verified ${contract.records.length} routes, ${xmlRecords.length} XML endpoints, ${legacyManifest.copied.length} compatibility files, and ${demoFiles.length} sandboxed demos.`,
);
