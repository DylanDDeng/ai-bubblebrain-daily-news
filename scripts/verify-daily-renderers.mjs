import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import {
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
  return [...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g"))].map(
    (match) => match[1],
  );
}

function timelineNavHrefs(html) {
  const block =
    html.match(/<div class="timeline-date-nav"[\s\S]*?<\/div>/)?.[0] || "";
  return attributeValues(block, "href");
}

function timelineTimeLabels(html) {
  return [
    ...html.matchAll(
      /<article\b[^>]*class="[^"]*\btimeline-item\b[^"]*"[^>]*>[\s\S]*?<time(?: [^>]*)?>([^<]*)<\/time>/g,
    ),
  ].map((match) => match[1].trim());
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "bubble-renderer-parity-"));
const dataRoot = join(temporaryRoot, "data");
const dailyData = join(dataRoot, "daily");
const hugoOutput = join(temporaryRoot, "hugo");

try {
  await mkdir(dailyData, { recursive: true });
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  fixture.items[0].summary =
    "前文 [图片: https://proxy.example/very-long?x=1&y=2] https://raw.example/a，后文 " +
    "这是一段用于验证渐进展开和窄屏布局的长摘要。".repeat(18);
  await writeFile(
    join(dailyData, "2026-07-14.json"),
    `${JSON.stringify(fixture, null, 2)}\n`,
  );

  const bilingualFixture = structuredClone(fixture);
  bilingualFixture.date = "2026-01-08";
  await writeFile(
    join(dailyData, "2026-01-08.json"),
    `${JSON.stringify(bilingualFixture, null, 2)}\n`,
  );

  execFileSync("hugo", ["--destination", hugoOutput, "--cleanDestinationDir"], {
    cwd: repoRoot,
    env: { ...process.env, HUGO_DATADIR: dataRoot },
    stdio: "inherit",
  });
  execFileSync("npm", ["run", "build"], {
    cwd: astroRoot,
    env: { ...process.env, DAILY_DATA_DIR: dailyData },
    stdio: "inherit",
  });

  const astroOutput = join(astroRoot, "dist");
  const [hugoFiles, astroFiles] = await Promise.all([
    filesBelow(hugoOutput),
    filesBelow(astroOutput),
  ]);
  assert.deepEqual(
    dailyRoutes(astroFiles),
    dailyRoutes(hugoFiles),
    "Hugo and Astro daily route sets differ",
  );

  const legacyRedirectPath = join(
    "en",
    "daily",
    "2025",
    "12",
    "202-22",
    "index.html",
  );
  for (const html of await Promise.all([
    readFile(join(hugoOutput, legacyRedirectPath), "utf8"),
    readFile(join(astroOutput, legacyRedirectPath), "utf8"),
  ])) {
    assert.match(
      html,
      /\/en\/daily\/2025\/12\/2025-12-22\//,
      "legacy daily redirect target differs",
    );
  }

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
    assert.match(html, /type="module" src="\/js\/daily-timeline\.js"/);
  }
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
  }

  console.log(
    `Renderer parity verified across ${dailyRoutes(astroFiles).length} daily routes.`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
