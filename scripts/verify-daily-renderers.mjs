import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const astroRoot = join(repoRoot, "astro");
const fixturePath = join(
  astroRoot,
  "tests",
  "fixtures",
  "daily-report.valid.json",
);

async function filesBelow(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(root, path)));
    else files.push(relative(root, path).split(sep).join("/"));
  }
  return files;
}

function dailyRoutes(files) {
  return files
    .filter((path) => /^(?:en\/)?daily\/.+\/index\.html$/.test(path))
    .sort();
}

function attributeValues(html, attribute) {
  return [
    ...html.matchAll(
      new RegExp(
        `${attribute}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^\\s>]+))`,
        "gi",
      ),
    ),
  ].map((match) => match[1] ?? match[2] ?? match[3]);
}

function timelineNavHrefs(html) {
  const block =
    html.match(/<nav class="timeline-date-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  return attributeValues(block, "href");
}

function assertTimelineAccessibilityStructure(html, renderer) {
  assert.match(
    html,
    /<nav\b[^>]*class="[^"]*\btimeline-date-nav\b[^"]*"[^>]*aria-label="[^"]+"[^>]*>/i,
    `${renderer} timeline date navigation must be a named nav landmark`,
  );
  assert.match(
    html,
    /<section\b[^>]*class="[^"]*\btimeline-toolbar\b[^"]*"[^>]*aria-label="[^"]+"[^>]*>/i,
    `${renderer} timeline filters must be a named region`,
  );
  assert.match(
    html,
    /<span\b[^>]*class="[^"]*\btimeline-rail\b[^"]*"[^>]*aria-hidden="true"[^>]*><\/span>/i,
    `${renderer} timeline rail must be a hidden decorative element`,
  );
  assert.doesNotMatch(
    html,
    /<(?:div|span)\b[^>]*class="[^"]*\b(?:timeline-date-nav|timeline-toolbar)\b[^"]*"[^>]*aria-label=/i,
    `${renderer} must not put accessible names on generic timeline containers`,
  );
}

function timelineTimeLabels(html) {
  return [
    ...html.matchAll(
      /<article\b[^>]*class="[^"]*\btimeline-item\b[^"]*"[^>]*>[\s\S]*?<time(?: [^>]*)?>([^<]*)<\/time>/g,
    ),
  ].map((match) => match[1].trim());
}

function assertSafeLegacyDaily(html, renderer, route) {
  assert.doesNotMatch(
    html,
    /\[(?:图片|image|视频|video)\s*:/iu,
    `${renderer} retained media transport metadata for ${route}`,
  );
  assert.doesNotMatch(
    html,
    /https?:\/\/[^\s<"']*(?:…|%E2%80%A6|&hellip;|\.{3,})[^\s<"']*/iu,
    `${renderer} retained a bare truncated URL for ${route}`,
  );
  const visibleText = html
    .replace(/<[^>]+>/gu, " ")
    .replaceAll("&hellip;", "…");
  assert.doesNotMatch(
    visibleText,
    /https?:\/\/\S*(?:…|%E2%80%A6)\S*/iu,
    `${renderer} retained a visually truncated URL for ${route}`,
  );
  assert.doesNotMatch(
    visibleText,
    /https?:\/\/\S*(?:%5D|\])\(https?:\/\/\S+/iu,
    `${renderer} retained a duplicated Markdown URL for ${route}`,
  );
  for (const href of attributeValues(html, "href")) {
    assert.doesNotMatch(
      href,
      /…|%E2%80%A6/iu,
      `${renderer} retained a truncated URL for ${route}: ${href}`,
    );
  }
}

function legacyContentSemantics(html, label) {
  const match = html.match(
    /<div\b[^>]*class="[^"]*\b(?:article-content|legacy-content)\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  );
  assert.ok(match, `${label} legacy daily content block is missing`);
  const block = match[1];
  const text = block
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&(?:quot|ldquo|rdquo);/g, '"')
    .replace(/&(?:apos|lsquo|rsquo);|&#39;/g, "'")
    .replaceAll("&hellip;", "…")
    .replaceAll("&mdash;", "—")
    .replaceAll("&ndash;", "–")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/g, (_match, value) =>
      String.fromCodePoint(Number(value)),
    )
    .replace(/&#x([\da-f]+);/gi, (_match, value) =>
      String.fromCodePoint(Number.parseInt(value, 16)),
    )
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function legacyBlockCounts(html) {
  return Object.fromEntries(
    ["li", "h2", "h3", "blockquote"].map((tag) => [
      tag,
      (html.match(new RegExp(`<${tag}\\b`, "gi")) ?? []).length,
    ]),
  );
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "bubble-renderer-parity-"));
const dataRoot = join(temporaryRoot, "data");
const dailyData = join(dataRoot, "daily");
const knowledgeData = join(dataRoot, "knowledge");
const hugoOutput = join(temporaryRoot, "hugo");
const hugoSanitizerRoot = join(temporaryRoot, "hugo-sanitizer");
const hugoSanitizerOutput = join(hugoSanitizerRoot, "public");

try {
  await mkdir(dailyData, { recursive: true });
  await mkdir(knowledgeData, { recursive: true });
  await copyFile(
    join(repoRoot, "data", "knowledge", "taxonomy.json"),
    join(knowledgeData, "taxonomy.json"),
  );
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  fixture.items[0].summary =
    "前文 [图片: https://proxy.example/very-long?x=1&y=2] https://raw.example/a，后文 " +
    "这是一段用于验证渐进展开和窄屏布局的长摘要。".repeat(18);
  await writeFile(
    join(dailyData, "2026-07-14.json"),
    `${JSON.stringify(fixture, null, 2)}\n`,
  );

  await mkdir(join(hugoSanitizerRoot, "content"), { recursive: true });
  await mkdir(join(hugoSanitizerRoot, "layouts", "partials"), {
    recursive: true,
  });
  await copyFile(
    join(repoRoot, "layouts", "partials", "legacy-daily-content.html"),
    join(hugoSanitizerRoot, "layouts", "partials", "legacy-daily-content.html"),
  );
  await writeFile(
    join(hugoSanitizerRoot, "hugo.toml"),
    "[markup.goldmark.renderer]\nunsafe = true\n",
  );
  await writeFile(
    join(hugoSanitizerRoot, "layouts", "index.html"),
    '{{ partial "legacy-daily-content.html" . }}\n',
  );
  await writeFile(
    join(hugoSanitizerRoot, "content", "_index.md"),
    `---
title: sanitizer fixture
---
<p>before ([ https://first.example/story](https://second.example/target) ) after</p>
<p>multi https://one.example/a](https://two.example/a) middle https://three.example/b](https://four.example/b) done</p>
<p>anchor before ([ <a href="https://first.example/story%5D(https://second.example/target)">https://first.example/story](https://second.example/target)</a> ) anchor after</p>
<p>ordinary before ( <a href="https://ordinary.example/story%5D(https://different.example/target)">https://ordinary.example/story](https://different.example/target)</a> ) ordinary after</p>
<p>bare ordinary before ( https://bare.example/story](https://different.example/target) ) bare ordinary after</p>
<p><a href="https://example.com/redirect?value=%5D(https://other.example)">legitimate query</a></p>
<div data-link="https://attr.example/a%5D(https://attr.example/b)">attribute sentinel</div>
<p>truncated before <a href="https://short.example/pa">https://short.example/pa</a>... truncated after</p>
<p>ordinary before <a href="https://ordinary.example/story">ordinary label</a>... ordinary after</p>
<p>prose before <a href="https://zenodo.example/record%EF%BC%8C%E8%80%8C%E6%AD%A3%E6%96%87">https://zenodo.example/record，而正文</a> prose after</p>
<p>combined before <a href="https://example.com/path%E3%80%82%E6%AD%A3%E6%96%87">https://example.com/path。正文</a>… combined after</p>
	`,
  );
  execFileSync(
    "hugo",
    ["--source", hugoSanitizerRoot, "--destination", hugoSanitizerOutput],
    { stdio: "inherit" },
  );
  const sanitizerHtml = await readFile(
    join(hugoSanitizerOutput, "index.html"),
    "utf8",
  );
  assert.match(sanitizerHtml, /<p>before\s+after<\/p>/u);
  assert.match(sanitizerHtml, /<p>multi\s+middle\s+done<\/p>/u);
  assert.match(sanitizerHtml, /<p>anchor before\s+anchor after<\/p>/u);
  assert.match(
    sanitizerHtml,
    /<p>ordinary before \(\s+\) ordinary after<\/p>/u,
  );
  assert.match(
    sanitizerHtml,
    /<p>bare ordinary before \(\s+\) bare ordinary after<\/p>/u,
  );
  assert.match(
    sanitizerHtml,
    /<a href="https:\/\/example\.com\/redirect\?value=%5D\(https:\/\/other\.example\)">legitimate query<\/a>/u,
  );
  assert.match(
    sanitizerHtml,
    /data-link="https:\/\/attr\.example\/a%5D\(https:\/\/attr\.example\/b\)"/u,
  );
  assert.doesNotMatch(sanitizerHtml, /first\.example\/story/iu);
  assert.match(sanitizerHtml, /<p>truncated before\s+truncated after<\/p>/u);
  assert.match(
    sanitizerHtml,
    /<p>ordinary before <a href="https:\/\/ordinary\.example\/story">ordinary label<\/a> ordinary after<\/p>/u,
  );
  assert.match(
    sanitizerHtml,
    /<p>prose before https:\/\/zenodo\.example\/record，而正文 prose after<\/p>/u,
  );
  assert.doesNotMatch(sanitizerHtml, /href="https:\/\/zenodo\.example/iu);
  assert.match(
    sanitizerHtml,
    /<p>combined before https:\/\/example\.com\/path。正文 combined after<\/p>/u,
  );
  assert.doesNotMatch(
    sanitizerHtml,
    /href="https:\/\/example\.com\/path%E3%80%82/iu,
  );

  execFileSync("hugo", ["--destination", hugoOutput, "--cleanDestinationDir"], {
    cwd: repoRoot,
    env: { ...process.env, HUGO_DATADIR: dataRoot },
    stdio: "inherit",
  });
  execFileSync("npm", ["run", "build"], {
    cwd: astroRoot,
    env: {
      ...process.env,
      DAILY_DATA_DIR: dailyData,
      STRUCTURED_CUTOVER_DATE: "2026-07-14",
    },
    stdio: "inherit",
  });

  const astroOutput = join(astroRoot, "dist");
  const [hugoFiles, astroFiles] = await Promise.all([
    filesBelow(hugoOutput),
    filesBelow(astroOutput),
  ]);
  const legacyRedirectPath = join(
    "en",
    "daily",
    "2025",
    "12",
    "202-22",
    "index.html",
  );
  assert.deepEqual(
    dailyRoutes(astroFiles),
    dailyRoutes(hugoFiles).filter((path) => path !== legacyRedirectPath),
    "Hugo and Astro daily route sets differ",
  );

  const [hugoLegacyRedirect, astroRedirects] = await Promise.all([
    readFile(join(hugoOutput, legacyRedirectPath), "utf8"),
    readFile(join(astroOutput, "_redirects"), "utf8"),
  ]);
  assert.match(
    hugoLegacyRedirect,
    /\/en\/daily\/2025\/12\/2025-12-22\//,
    "legacy Hugo daily redirect target differs",
  );
  assert.match(
    astroRedirects,
    /^\/en\/daily\/2025\/12\/202-22\/ \/en\/daily\/2025\/12\/2025-12-22\/ 301$/m,
    "Astro must replace the malformed legacy page with a real permanent redirect",
  );

  const structuredPath = join(
    "daily",
    "2026",
    "07",
    "2026-07-14",
    "index.html",
  );
  const [hugoStructured, astroStructured] = await Promise.all([
    readFile(join(hugoOutput, structuredPath), "utf8"),
    readFile(join(astroOutput, structuredPath), "utf8"),
  ]);
  for (const html of [hugoStructured, astroStructured]) {
    assert.match(html, /data-daily-timeline/);
    assert.match(html, /示例 AI 资讯/);
    assert.doesNotMatch(html, /proxy\.example|raw\.example/);
    assert.match(
      html,
      /type="module" src="\/js\/daily-timeline\.js(?:\?v=[0-9a-f]{10})?"/,
    );
  }
  // Astro busts the shared timeline asset cache with a build-time content
  // hash query; Hugo keeps the plain URL because it no longer serves
  // production traffic.
  assert.match(
    astroStructured,
    /href="\/css\/daily-timeline\.css\?v=[0-9a-f]{10}"/,
    "Astro timeline stylesheet must carry a content-hash cache buster",
  );
  assert.match(
    astroStructured,
    /type="module" src="\/js\/daily-timeline\.js\?v=[0-9a-f]{10}"/,
    "Astro timeline script must carry a content-hash cache buster",
  );
  assertTimelineAccessibilityStructure(hugoStructured, "Hugo");
  assertTimelineAccessibilityStructure(astroStructured, "Astro");
  for (const attribute of [
    "data-timeline-batch",
    "data-item-id",
    "data-content-type",
    "data-search",
  ]) {
    assert.deepEqual(
      attributeValues(astroStructured, attribute),
      attributeValues(hugoStructured, attribute),
      `${attribute} differs`,
    );
  }
  assert.deepEqual(
    timelineNavHrefs(astroStructured),
    timelineNavHrefs(hugoStructured),
    "date navigation differs",
  );
  assert.deepEqual(
    timelineTimeLabels(astroStructured),
    timelineTimeLabels(hugoStructured),
    "timeline time labels differ",
  );

  const historicalPath = join(
    "daily",
    "2026",
    "07",
    "2026-07-02",
    "index.html",
  );
  const englishPath = join(
    "en",
    "daily",
    "2026",
    "01",
    "2026-01-08",
    "index.html",
  );
  for (const path of [historicalPath, englishPath]) {
    const [hugoHtml, astroHtml] = await Promise.all([
      readFile(join(hugoOutput, path), "utf8"),
      readFile(join(astroOutput, path), "utf8"),
    ]);
    assert.match(hugoHtml, /data-legacy-daily/);
    assert.match(astroHtml, /data-legacy-daily/);
    assert.doesNotMatch(hugoHtml, /data-daily-timeline/);
    assert.doesNotMatch(astroHtml, /data-daily-timeline/);
  }

  for (const path of dailyRoutes(astroFiles)) {
    if (path === legacyRedirectPath || path === structuredPath) continue;
    const [hugoHtml, astroHtml] = await Promise.all([
      readFile(join(hugoOutput, path), "utf8"),
      readFile(join(astroOutput, path), "utf8"),
    ]);
    if (
      /data-daily-timeline/.test(astroHtml) ||
      /data-daily-timeline/.test(hugoHtml)
    ) {
      assert.match(
        astroHtml,
        /data-daily-timeline/,
        `Astro structured route drifted for ${path}`,
      );
      assert.match(
        hugoHtml,
        /data-daily-timeline/,
        `Hugo structured route drifted for ${path}`,
      );
      continue;
    }
    assertSafeLegacyDaily(hugoHtml, "Hugo", path);
    assertSafeLegacyDaily(astroHtml, "Astro", path);
    const astroText = legacyContentSemantics(astroHtml, `Astro ${path}`);
    const hugoText = legacyContentSemantics(hugoHtml, `Hugo ${path}`);
    const longestText = Math.max(astroText.length, hugoText.length, 1);
    assert.ok(
      Math.abs(astroText.length - hugoText.length) / longestText < 0.02,
      `legacy daily visible text length drifted by more than 2% for ${path}`,
    );
    assert.deepEqual(
      legacyBlockCounts(astroHtml),
      legacyBlockCounts(hugoHtml),
      `legacy daily block structure differs for ${path}`,
    );
    if (path === "daily/2026/06/2026-06-11/index.html") {
      for (const [renderer, text] of [
        ["Hugo", hugoText],
        ["Astro", astroText],
      ]) {
        assert.match(
          text,
          /as in the titl/u,
          `${renderer} removed prose after a nested image marker`,
        );
      }
    }
  }

  for (const asset of ["css/daily-timeline.css", "js/daily-timeline.js"]) {
    const [source, hugoAsset, astroAsset] = await Promise.all([
      readFile(join(repoRoot, "static", asset), "utf8"),
      readFile(join(hugoOutput, asset), "utf8"),
      readFile(join(astroOutput, asset), "utf8"),
    ]);
    assert.equal(hugoAsset, source, `Hugo ${asset} differs from shared source`);
    assert.equal(
      astroAsset,
      source,
      `Astro ${asset} differs from shared source`,
    );
    if (asset === "css/daily-timeline.css") {
      assert.match(
        source,
        /\.daily-timeline \.timeline-rail\s*\{/,
        "timeline rail styling must target the real decorative element",
      );
      assert.doesNotMatch(
        source,
        /\.daily-timeline \.timeline-items::before/,
        "timeline rail must not regress to an inaccessible pseudo-element",
      );
      const enterAnimation = source.match(
        /@keyframes timeline-enter\s*\{([\s\S]*?)\n\}/,
      )?.[1];
      assert.ok(enterAnimation, "timeline entry animation is missing");
      assert.doesNotMatch(
        enterAnimation,
        /\bopacity\s*:/,
        "timeline entry animation must not lower text contrast",
      );
    }
  }

  const migrationCss = await readFile(
    join(astroRoot, "src", "styles", "migration.css"),
    "utf8",
  );
  const bodyRule = migrationCss.match(/body\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(bodyRule, "Astro migration body rule is missing");
  assert.doesNotMatch(
    bodyRule,
    /gradient\s*\(/,
    "Astro body background must not lower timeline text contrast",
  );

  console.log(
    `Renderer parity verified across ${dailyRoutes(astroFiles).length} daily routes.`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
