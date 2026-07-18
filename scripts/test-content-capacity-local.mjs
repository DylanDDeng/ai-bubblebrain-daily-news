import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import postgres from "postgres";
import { createContentAddressedArtifact } from "./create-content-addressed-artifact.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const astroRoot = join(repoRoot, "astro");
const databaseUrl =
  process.env.CONTENT_TEST_DATABASE_URL ||
  "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres";
if (!databaseUrl.includes("127.0.0.1") && !databaseUrl.includes("localhost")) {
  throw new Error(
    "Refusing to run the destructive capacity projection against a remote database",
  );
}

const evidenceOutIndex = process.argv.indexOf("--evidence-out");
const evidenceOut =
  evidenceOutIndex >= 0 ? process.argv[evidenceOutIndex + 1] : null;
if (evidenceOutIndex >= 0 && !evidenceOut)
  throw new Error("--evidence-out requires a path");
const skipBuild = process.argv.includes("--skip-build");
const reuseLoaded = process.argv.includes("--reuse-loaded");
const DAYS = Number(process.env.CONTENT_CAPACITY_DAYS || 365);
const ITEMS_PER_DAY = Number(process.env.CONTENT_CAPACITY_ITEMS_PER_DAY || 200);
if (!Number.isInteger(DAYS) || DAYS < 1 || DAYS > 366)
  throw new Error("Invalid capacity day count");
if (
  !Number.isInteger(ITEMS_PER_DAY) ||
  ITEMS_PER_DAY < 1 ||
  ITEMS_PER_DAY > 1000
) {
  throw new Error("Invalid capacity item count");
}

const admin = postgres(databaseUrl, {
  max: 8,
  prepare: false,
  ssl: false,
  connect_timeout: 10,
  idle_timeout: 5,
});
const temporaryRoot = await mkdtemp(join(tmpdir(), "content-capacity-"));
const dataDirectory = join(temporaryRoot, "data");
const contentDirectory = join(temporaryRoot, "content");
const artifactPath = join(temporaryRoot, "content-capacity-artifact.json");
await mkdir(dataDirectory, { recursive: true });
await mkdir(contentDirectory, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nextDate(date, offset = 1) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  ];
}

function latencySummary(values) {
  return {
    samples: values.length,
    p50_ms: Number(percentile(values, 0.5).toFixed(3)),
    p95_ms: Number(percentile(values, 0.95).toFixed(3)),
    p99_ms: Number(percentile(values, 0.99).toFixed(3)),
    max_ms: Number(Math.max(...values).toFixed(3)),
  };
}

function capacityItem(date, index) {
  const seed = `${date}:${index}`;
  const sourceId = `capacity-${seed}`;
  const canonicalUrl = `https://capacity.example.invalid/${date}/${index}`;
  const identity = sha256(`source:aibase:${sourceId}`);
  const urlClaim = sha256(`url:${canonicalUrl}`);
  const generatedAt = `${date}T07:00:00.000Z`;
  const title =
    index === 0
      ? `大模型智能体平台发布 ${date}`
      : index === 1
        ? `人工智能芯片产业进展 ${date}`
        : index === 2
          ? `多模态生成模型研究 ${date}`
          : `AI 行业容量基准资讯 ${date} ${index}`;
  const byteLimitBoundary = nextDate("2027-01-01", Math.max(0, DAYS - 7));
  const fillerRepeats = date >= byteLimitBoundary ? 40 : 22;
  const filler =
    "用于一年容量投影的真实中文子串、排序、构建和网络字节基准。".repeat(
      fillerRepeats,
    );
  return {
    id: `n_${identity}`,
    event_id: `e_${identity}`,
    identity_version: 1,
    identity_strategy: "source_id",
    identity_claims: [`c_${identity}`, `c_${urlClaim}`].sort(),
    source_type: "aibase",
    content_type: "news",
    source_id: sourceId,
    title,
    url: canonicalUrl,
    canonical_url: canonicalUrl,
    source: {
      name: "Capacity Projection Source",
      id: sourceId,
      homepage: "https://capacity.example.invalid/",
    },
    published_at: generatedAt,
    published_date: date,
    ingested_at: generatedAt,
    time_precision: "exact",
    batch: ["morning", "afternoon", "night", "lateNight"][index % 4],
    summary: `${title}。${filler}`,
    category: "other",
    topic_ids: ["topic_other"],
    entity_ids: [],
    featured: index === 0,
    score: index === 0 ? 9.5 : null,
    reason: index === 0 ? "精确中文查询排序基准" : null,
    related_source_ids: [],
  };
}

function capacityDocument(date) {
  const generatedAt = `${date}T07:00:00.000Z`;
  const items = Array.from({ length: ITEMS_PER_DAY }, (_, index) =>
    capacityItem(date, index),
  );
  return {
    schema_version: 1,
    identity_version: 1,
    dedupe_version: 1,
    taxonomy_version: 1,
    classifier_version: 1,
    date,
    timezone: "Asia/Shanghai",
    generated_at: generatedAt,
    overview: {
      text: `一年容量投影 ${date}`,
      kind: "generated",
      provenance: { method: "template", model: null, prompt_version: null },
    },
    producer: {
      name: "bubble-brain-worker",
      version: "v1",
      commit_sha: null,
      dedupe_lookback_days: 7,
    },
    batches: ["morning", "afternoon", "night", "lateNight"].map((batchId) => ({
      id: batchId,
      label: batchId,
      status: "completed",
      generated_at: generatedAt,
      item_ids: items
        .filter((item) => item.batch === batchId)
        .map((item) => item.id),
    })),
    items,
  };
}

function reportBytes(document) {
  return Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
}

async function asRole(role, operation) {
  return admin.begin(async (sql) => {
    await sql.unsafe(`set local role ${role}`);
    return operation(sql);
  });
}

function rpc(rows) {
  if (!rows.length || !Object.hasOwn(rows[0], "result"))
    throw new Error("Capacity RPC returned no result");
  return rows[0].result;
}

async function ingest(document, bytes) {
  const hash = sha256(bytes);
  return rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
			select private.ingest_report_snapshot_v1(
				${sql.json(document)}, ${`report-snapshots/sha256/${hash}.json`},
				${bytes.byteLength}, ${hash}, 'daily-json-c14n-v1',
				'legacy_structured_import', null
			) as result
		`,
    ),
  );
}

async function createRelease(snapshotId, index) {
  const reservation = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
			select private.reserve_site_release_v1(${snapshotId}::uuid) as result
		`,
    ),
  );
  const manifest = sha256(`capacity-manifest:${index}`);
  const content = sha256(`capacity-content:${index}`);
  const artifact = sha256(`capacity-artifact:${index}`);
  const code = sha256(`capacity-code:${index}`).slice(0, 40);
  const dispatchId = randomUUID();
  const release = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
			select private.finalize_site_release_v1(
				${reservation.reservation_id}::uuid,
				${`site-manifests/sha256/${manifest}.json`}, 2048, ${manifest}, ${content},
				1, 1, 'daily-json-c14n-v1', 'search-v1', 'daily-source-v1',
				'2027-01-01'::date, array[]::date[], ${dispatchId}::uuid,
					${sql.json({
            dispatch_id: dispatchId,
            site_release_id: reservation.site_release_id,
            site_release_sequence: reservation.site_release_sequence,
            expected_predecessor_id: reservation.expected_predecessor_id,
            expected_content_sha: content,
            code_sha: code,
            build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
            mode: "production",
            capacity_projection: true,
            index,
          })}
				) as result
			`,
    ),
  );
  return { ...release, dispatchId, manifest, content, artifact, code };
}

async function promoteRelease(release, expectedGeneration) {
  await asRole(
    "content_deployer",
    (sql) => sql`
      select private.record_deployment_event_v1(
        ${release.site_release_id}::uuid, ${release.dispatchId}::uuid,
        'preview_verified', '{"route_parity":true}'::jsonb
      )
    `,
  );
  await asRole(
    "content_deployer",
    (sql) => sql`
      select private.register_release_artifact_v1(
        ${release.site_release_id}::uuid,
        ${`artifacts/sha256/${release.artifact}.json`}, 4096,
        ${release.artifact}, ${release.artifact}, 'sha256-content-addressed-pages-v1',
        ${release.code}, 'node22.17-astro7-hugo0.147.9-v1'
      )
    `,
  );
  const authorization = rpc(
    await asRole(
      "content_deployer",
      (sql) => sql`
        select private.authorize_production_promotion_v1(
          ${release.site_release_id}::uuid, ${expectedGeneration},
          ${`capacity:${release.site_release_sequence}`}, 600
        ) as result
      `,
    ),
  );
  await asRole(
    "content_deployer",
    (sql) => sql`
      select private.mark_promotion_deploying_v1(
        ${release.site_release_id}::uuid, ${authorization.fencing_token},
        ${expectedGeneration}
      )
    `,
  );
  await asRole(
    "content_deployer",
    (sql) => sql`
      select private.mark_promotion_verifying_v1(
        ${release.site_release_id}::uuid, ${authorization.fencing_token},
        ${expectedGeneration}, ${`capacity-${release.site_release_sequence}`}
      )
    `,
  );
  return rpc(
    await asRole(
      "content_deployer",
      (sql) => sql`
        select private.commit_production_promotion_v1(
          ${release.site_release_id}::uuid, ${authorization.fencing_token},
          ${expectedGeneration}, ${`capacity-${release.site_release_sequence}`},
          ${release.manifest}, ${release.artifact},
          'node22.17-astro7-hugo0.147.9-v1',
          '{"multi_edge_verified":true,"capacity_projection":true}'::jsonb
        ) as result
      `,
    ),
  );
}

async function timedSamples(samples, operation) {
  const values = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    await operation(index);
    values.push(performance.now() - started);
  }
  return values;
}

async function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd || repoRoot,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code !== 0) {
        rejectPromise(
          new Error(
            `${command} ${args.join(" ")} failed (${code})\n${stdout.slice(-4000)}\n${stderr.slice(-4000)}`,
          ),
        );
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

async function directoryMetrics(root) {
  const metrics = {
    files: 0,
    bytes: 0,
    largest_file_bytes: 0,
    largest_file: null,
  };
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const info = await stat(path);
        metrics.files += 1;
        metrics.bytes += info.size;
        if (info.size > metrics.largest_file_bytes) {
          metrics.largest_file_bytes = info.size;
          metrics.largest_file = path.slice(root.length + 1);
        }
      }
    }
  }
  await visit(root);
  return metrics;
}

function planNodes(plan, result = []) {
  if (!plan || typeof plan !== "object") return result;
  if (plan["Node Type"])
    result.push({
      node_type: plan["Node Type"],
      index_name: plan["Index Name"] || null,
      actual_rows: plan["Actual Rows"] ?? null,
    });
  for (const child of plan.Plans || []) planNodes(child, result);
  return result;
}

function dailyStub(date, english) {
  return `---
title: "${english ? "Capacity Daily" : "容量投影日报"} - ${date}"
date: ${date}T10:00:00+08:00
lastmod: ${date}T15:00:00+08:00
description: "One-year local capacity projection"
categories:
  - ${english ? "Daily" : "日报"}
tags:
  - AI
draft: false
---

${english ? "Pinned capacity projection content." : "固定版本容量投影内容。"}
`;
}

const evidence = {
  schema_version: 1,
  kind: "content-database-v4.1-one-year-local-projection",
  database: "local-supabase-only",
  started_at: new Date().toISOString(),
  workload: { days: DAYS, items_per_day: ITEMS_PER_DAY },
};
const overallStarted = performance.now();

try {
  await admin`
    update private.content_settings set enabled = true
    where setting_key in ('shadow_build', 'publication')
  `;
  const existing = await admin`
		select
			(select count(*)::integer from private.report_snapshots) as snapshots,
			(select count(*)::integer from private.report_snapshot_items) as snapshot_items,
			(select count(*)::integer from private.site_releases) as releases
	`;
  if (
    !reuseLoaded &&
    (existing[0].snapshots !== 0 || existing[0].releases !== 0)
  ) {
    throw new Error(
      "Capacity projection requires a clean local Supabase reset",
    );
  }
  if (
    reuseLoaded &&
    (existing[0].snapshots !== DAYS ||
      existing[0].snapshot_items !== DAYS * ITEMS_PER_DAY ||
      existing[0].releases !== DAYS)
  ) {
    throw new Error(
      "The reusable local capacity dataset does not match the requested workload",
    );
  }

  let exactReportBytes = 0;
  const loadStarted = performance.now();
  for (let day = 0; day < DAYS; day += 1) {
    const date = nextDate("2027-01-01", day);
    const document = capacityDocument(date);
    const bytes = reportBytes(document);
    exactReportBytes += bytes.byteLength;
    await writeFile(join(dataDirectory, `${date}.json`), bytes);
    await writeFile(
      join(contentDirectory, `${date}.md`),
      dailyStub(date, false),
      "utf8",
    );
    await writeFile(
      join(contentDirectory, `${date}.en.md`),
      dailyStub(date, true),
      "utf8",
    );
    if (!reuseLoaded) {
      const ingested = await ingest(document, bytes);
      const release = await createRelease(ingested.report_snapshot_id, day);
      const promoted = await promoteRelease(release, day);
      assert(
        promoted.generation === day + 1,
        `Capacity release ${day + 1} did not advance the public pointer`,
      );
    }
    if ((day + 1) % 30 === 0 || day + 1 === DAYS) {
      process.stderr.write(`capacity load: ${day + 1}/${DAYS} days\n`);
    }
  }
  const finalRelease = await admin`
		select id::text, sequence from private.site_releases order by sequence desc limit 1
	`;
  const finalReleaseId = finalRelease[0].id;
  await admin.unsafe("analyze private.report_snapshot_items");
  await admin.unsafe("analyze private.site_release_reports");
  const counts = await admin`
		select
			(select count(*)::integer from private.report_snapshots) as snapshots,
			(select count(*)::integer from private.report_snapshot_items) as snapshot_items,
			(select count(*)::integer from private.site_release_reports where site_release_id = ${finalReleaseId}::uuid) as release_reports,
			pg_database_size(current_database())::bigint as database_bytes
	`;
  evidence.dataset = {
    status: "passed",
    report_snapshots: counts[0].snapshots,
    report_item_placements: counts[0].snapshot_items,
    final_release_reports: counts[0].release_reports,
    exact_report_bytes: exactReportBytes,
    average_report_bytes: Math.round(exactReportBytes / DAYS),
    database_bytes: Number(counts[0].database_bytes),
    load_elapsed_ms: Math.round(performance.now() - loadStarted),
    reused_existing_local_dataset: reuseLoaded,
    final_site_release_id: finalReleaseId,
  };
  assert(counts[0].snapshots === DAYS, "Projection snapshot count mismatch");
  assert(
    counts[0].snapshot_items === DAYS * ITEMS_PER_DAY,
    "Projection item count mismatch",
  );
  assert(
    counts[0].release_reports === DAYS,
    "Final release does not cover the full projection year",
  );

  const reportDate = nextDate("2027-01-01", DAYS - 1);
  const itemId = capacityItem(reportDate, 0).id;
  const reportLatencies = await timedSamples(120, () =>
    asRole(
      "content_reader",
      (sql) => sql`
			select private.get_release_report_v1(${finalReleaseId}::uuid, ${reportDate}::date)
		`,
    ),
  );
  const itemLatencies = await timedSamples(120, () =>
    asRole(
      "content_reader",
      (sql) => sql`
			select private.get_release_item_v1(${finalReleaseId}::uuid, ${itemId})
		`,
    ),
  );
  const searchLatencies = await timedSamples(120, () =>
    asRole(
      "content_reader",
      (sql) => sql`
			select private.search_release_v1(${finalReleaseId}::uuid, '大模型智能体', 20, null)
		`,
    ),
  );
  evidence.rpc_latency = {
    local_projection_only: true,
    report: latencySummary(reportLatencies),
    item: latencySummary(itemLatencies),
    chinese_substring_search: latencySummary(searchLatencies),
    budgets_ms: { report_item_p95: 250, chinese_search_p95: 750 },
  };
  assert(
    evidence.rpc_latency.report.p95_ms <= 250,
    "Local report P95 exceeded the service budget",
  );
  assert(
    evidence.rpc_latency.item.p95_ms <= 250,
    "Local item P95 exceeded the service budget",
  );
  assert(
    evidence.rpc_latency.chinese_substring_search.p95_ms <= 750,
    "Local search P95 exceeded the service budget",
  );

  const chineseQueries = ["大模型智能体", "人工智能芯片", "多模态生成模型"];
  evidence.chinese_search = [];
  for (const query of chineseQueries) {
    const result = rpc(
      await asRole(
        "content_reader",
        (sql) => sql`
				select private.search_release_v1(${finalReleaseId}::uuid, ${query}, 20, null) as result
			`,
      ),
    );
    const expectedResults = Math.min(20, DAYS);
    assert(
      result.results.length === expectedResults,
      `Chinese query did not recall ${expectedResults} results: ${query}`,
    );
    assert(
      result.results.every((entry) => entry.item.title.includes(query)),
      `Chinese query ranking returned an irrelevant top-20 result: ${query}`,
    );
    evidence.chinese_search.push({
      query,
      result_count: result.results.length,
      top_title: result.results[0].item.title,
      top_rank: result.results[0].rank,
    });
  }

  const explain = await admin.unsafe(
    `explain (analyze, buffers, format json)
		 select sr.report_date, rsi.item_id
		 from private.site_release_reports sr
		 join private.report_snapshot_items rsi on rsi.report_snapshot_id = sr.report_snapshot_id
		 where sr.site_release_id = $1::uuid
		   and (
		     lower(rsi.materialized_document ->> 'title') like '%' || lower($2) || '%'
		     or lower(coalesce(rsi.materialized_document ->> 'summary', '')) like '%' || lower($2) || '%'
		     or lower(rsi.materialized_document ->> 'title') operator(public.%) lower($2)
		   )
		 limit 20`,
    [finalReleaseId, "大模型智能体"],
  );
  const plan = explain[0]["QUERY PLAN"][0];
  const nodes = planNodes(plan.Plan);
  const indexNames = nodes.map((node) => node.index_name).filter(Boolean);
  if (counts[0].snapshot_items >= 1000) {
    assert(
      indexNames.some((name) =>
        name.includes("report_snapshot_items_title_trgm_idx"),
      ),
      "Chinese substring plan did not use the title pg_trgm index",
    );
  }
  evidence.query_plan = {
    planning_time_ms: plan["Planning Time"],
    execution_time_ms: plan["Execution Time"],
    nodes,
    shared_hit_blocks: plan.Plan["Shared Hit Blocks"] ?? null,
  };

  const connectionClients = Array.from({ length: 20 }, () =>
    postgres(databaseUrl, {
      max: 1,
      prepare: false,
      ssl: false,
      connection: { application_name: "content-capacity-probe" },
    }),
  );
  const connectionWork = connectionClients.map((client) =>
    client.begin(async (sql) => {
      await sql.unsafe("set local role content_reader");
      return sql`
				select pg_sleep(0.25),
					private.search_release_v1(${finalReleaseId}::uuid, '大模型智能体', 20, null)
			`;
    }),
  );
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 80));
  const activeConnections = await admin`
		select count(*)::integer as count from pg_stat_activity
		where application_name = 'content-capacity-probe'
	`;
  await Promise.all(connectionWork);
  await Promise.all(
    connectionClients.map((client) => client.end({ timeout: 5 })),
  );
  evidence.connections = {
    probe_concurrency: 20,
    observed_peak_connections: activeConnections[0].count,
    role_connection_limit: 20,
  };
  assert(
    activeConnections[0].count === 20,
    "Connection probe did not observe all 20 clients",
  );

  if (!skipBuild) {
    const buildStarted = performance.now();
    const build = await run(
      "/usr/bin/time",
      ["-l", "npm", "run", "build:renderer"],
      {
        cwd: astroRoot,
        env: {
          DAILY_DATA_DIR: dataDirectory,
          DAILY_CONTENT_DIR: contentDirectory,
          CONTENT_RELEASE_ID: finalReleaseId,
          CONTENT_RELEASE_SEQUENCE: String(finalRelease[0].sequence),
          CONTENT_MANIFEST_SHA256: sha256("capacity-manifest-final"),
          CONTENT_ROOT_SHA256: sha256("capacity-content-final"),
          CONTENT_SCHEMA_VERSION: "1",
          CONTENT_TAXONOMY_VERSION: "1",
          CONTENT_SERIALIZER_VERSION: "daily-json-c14n-v1",
          CONTENT_SEARCH_CONTRACT_VERSION: "search-v1",
          CONTENT_SOURCE_CONTRACT_VERSION: "daily-source-v1",
          PUBLIC_CONTENT_API_ORIGIN: "https://content-api.bubblenews.today",
          SITE_DISPLAY_DATE: reportDate,
          BUILD_ENVIRONMENT_VERSION: "node22.17-astro7-hugo0.147.9-v1",
          TZ: "UTC",
          LANG: "C.UTF-8",
          LC_ALL: "C.UTF-8",
        },
      },
    );
    const rssMatch = /\s(\d+)\s+maximum resident set size/.exec(build.stderr);
    const distMetrics = await directoryMetrics(join(astroRoot, "dist"));
    const artifact = await createContentAddressedArtifact(
      join(astroRoot, "dist"),
      artifactPath,
    );
    const searchIndexPath = join(astroRoot, "dist", "search", "index.json");
    const searchBytes = await readFile(searchIndexPath);
    const searchIndex = JSON.parse(searchBytes.toString("utf8"));
    evidence.build = {
      status: "measured-local",
      wall_time_ms: Math.round(performance.now() - buildStarted),
      peak_rss_bytes: rssMatch ? Number(rssMatch[1]) : null,
      projected_r2_fetch_bytes: exactReportBytes,
      dist: distMetrics,
      content_addressed_manifest_bytes: artifact.artifact_byte_length,
      content_addressed_total_asset_bytes: artifact.manifest.total_asset_bytes,
      broker_peak_asset_bytes: artifact.largest_file_bytes,
      budgets: {
        ci_p95_ms: 8 * 60 * 1000,
        peak_rss_bytes: 4 * 1024 * 1024 * 1024,
        content_addressed_manifest_bytes: 2 * 1024 * 1024,
        total_asset_bytes: 1280 * 1024 * 1024,
        broker_peak_asset_bytes: 25 * 1024 * 1024,
      },
      log_tail: build.stdout.split("\n").slice(-20),
    };
    evidence.static_search = {
      status: "passed",
      bytes: searchBytes.byteLength,
      max_bytes: 8 * 1024 * 1024,
      report_days: searchIndex.report_dates.length,
      max_report_days: 7,
      item_count: searchIndex.item_count,
      truncated_by_bytes:
        searchIndex.item_count < Math.min(7, DAYS) * ITEMS_PER_DAY,
    };
    assert(
      searchBytes.byteLength <= 8 * 1024 * 1024,
      "Static search exceeded 8 MiB",
    );
    assert(
      searchIndex.report_dates.length <= 7,
      "Static search exceeded seven report days",
    );
    assert(
      evidence.build.wall_time_ms <= evidence.build.budgets.ci_p95_ms,
      "Projected build exceeded 8 minutes",
    );
    assert(
      evidence.build.peak_rss_bytes === null ||
        evidence.build.peak_rss_bytes <= evidence.build.budgets.peak_rss_bytes,
      "Projected build exceeded the 4 GiB RSS budget",
    );
    assert(
      evidence.build.content_addressed_manifest_bytes <=
        evidence.build.budgets.content_addressed_manifest_bytes,
      "Content-addressed artifact manifest exceeded 2 MiB",
    );
    assert(
      evidence.build.content_addressed_total_asset_bytes <=
        evidence.build.budgets.total_asset_bytes,
      "Projected Pages asset set exceeded 1.25 GiB",
    );
    assert(
      evidence.build.broker_peak_asset_bytes <=
        evidence.build.budgets.broker_peak_asset_bytes,
      "Projected Pages asset exceeded the 25 MiB streaming limit",
    );
  }

  const gib = 1024 ** 3;
  const reportGiB = exactReportBytes / gib;
  const artifactBudgetGiB = 150;
  evidence.cost_projection = {
    planning_assumptions_not_live_invoice_rates: true,
    r2: {
      end_of_year_report_gib: Number(reportGiB.toFixed(3)),
      end_of_year_manifest_gib_budget: Number(
        ((250 * 1024 * 1024) / gib).toFixed(3),
      ),
      end_of_year_artifact_gib_budget: artifactBudgetGiB,
      average_monthly_storage_gib: Number(
        ((reportGiB + 250 / 1024 + artifactBudgetGiB) / 2).toFixed(3),
      ),
      assumed_standard_storage_usd_per_gib_month: 0.015,
      estimated_average_storage_usd_per_month: Number(
        (((reportGiB + 250 / 1024 + artifactBudgetGiB) / 2) * 0.015).toFixed(2),
      ),
    },
    supabase: {
      projected_database_gib: Number(
        (Number(counts[0].database_bytes) / gib).toFixed(3),
      ),
      monthly_egress_warning_gib: 10,
      monthly_egress_hard_review_gib: 20,
      incremental_storage_and_egress_price_must_be_refreshed_before_procurement: true,
    },
    github_actions: {
      production_builds_per_year_budget: 4 * 365,
      projected_minutes_per_year: evidence.build
        ? Math.ceil((evidence.build.wall_time_ms / 60_000) * 4 * 365)
        : null,
    },
  };

  evidence.completed_at = new Date().toISOString();
  evidence.elapsed_ms = Math.round(performance.now() - overallStarted);
  evidence.status = "passed";
  const output = `${JSON.stringify(evidence, null, 2)}\n`;
  if (evidenceOut) await writeFile(evidenceOut, output, "utf8");
  process.stdout.write(output);
} finally {
  await admin.end({ timeout: 5 });
  await rm(temporaryRoot, { recursive: true, force: true });
}
