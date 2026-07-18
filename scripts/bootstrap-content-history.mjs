import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ACCEPTANCE = "I_ACCEPT_SUPERSEDING_UNPROMOTED_RELEASE";
const expectedReleaseId = process.env.EXPECTED_FAILED_RELEASE_ID;
const codeSha = process.env.EXACT_CODE_SHA;
if (
  process.env.ALLOW_PRODUCTION_CONTENT_HISTORY_BOOTSTRAP !== ACCEPTANCE ||
  !/^[0-9a-f-]{36}$/i.test(expectedReleaseId || "") ||
  !/^[0-9a-f]{40}$/.test(codeSha || "")
) {
  throw new Error(
    "Explicit production history bootstrap acceptance and identity are required",
  );
}

const root = resolve(import.meta.dirname, "..");
const temporaryRoot = mkdtempSync(join(tmpdir(), "content-history-bootstrap-"));
let ingestorRoleGranted = false;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(canonicalize(value), null, 2)}\n`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function command(arguments_, options = {}) {
  const result = spawnSync("npx", arguments_, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${arguments_.slice(0, 4).join(" ")} failed: ${(result.stderr || result.stdout).trim()}`,
    );
  }
  return result.stdout;
}

function query(sql) {
  const sqlFile = join(temporaryRoot, `${randomUUID()}.sql`);
  writeFileSync(sqlFile, `${sql.trim()}\n`);
  const output = command([
    "supabase",
    "db",
    "query",
    "--linked",
    "--output",
    "json",
    "--file",
    sqlFile,
  ]);
  const start = output.indexOf("{");
  if (start < 0) throw new Error("Supabase query returned no JSON result");
  return JSON.parse(output.slice(start)).rows;
}

function oneResult(sql) {
  const rows = query(sql);
  if (rows.length !== 1 || !rows[0].result)
    throw new Error("Expected one RPC result");
  return rows[0].result;
}

function ensureRemoteObject(bucket, key, bytes, contentType) {
  const localFile = join(temporaryRoot, sha256(bytes));
  const fetchedFile = `${localFile}.existing`;
  writeFileSync(localFile, bytes);
  const existing = spawnSync(
    "npx",
    [
      "wrangler",
      "r2",
      "object",
      "get",
      `${bucket}/${key}`,
      "--remote",
      "--file",
      fetchedFile,
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  if (existing.status === 0) {
    if (!readFileSync(fetchedFile).equals(bytes)) {
      throw new Error(`Immutable R2 collision for ${key}`);
    }
    return;
  }
  const diagnostic = `${existing.stdout || ""}\n${existing.stderr || ""}`;
  if (!/does not exist|not found/i.test(diagnostic)) {
    throw new Error(`Unable to inspect immutable R2 object ${key}`);
  }
  command([
    "wrangler",
    "r2",
    "object",
    "put",
    `${bucket}/${key}`,
    "--remote",
    "--file",
    localFile,
    "--content-type",
    contentType,
  ]);
}

function jsonSql(value, label) {
  const serialized = JSON.stringify(value);
  const tag = `$${label}_${sha256(Buffer.from(serialized)).slice(0, 16)}$`;
  if (serialized.includes(tag))
    throw new Error("Unexpected SQL dollar-quote collision");
  return `${tag}${serialized}${tag}::jsonb`;
}

function loadHistoricalReport(date) {
  const document = JSON.parse(
    readFileSync(join(root, "data", "daily", `${date}.json`), "utf8"),
  );
  if (document.date !== date)
    throw new Error(`Historical report date mismatch: ${date}`);
  const bytes = canonicalBytes(document);
  const hash = sha256(bytes);
  return {
    date,
    document,
    bytes,
    hash,
    objectKey: `report-snapshots/sha256/${hash}.json`,
  };
}

function ingest(report) {
  ensureRemoteObject(
    "bubble-content-report-snapshots",
    report.objectKey,
    report.bytes,
    "application/json; charset=utf-8",
  );
  return oneResult(`
    select private.ingest_report_snapshot_v1(
      ${jsonSql(report.document, `report_${report.date.replaceAll("-", "_")}`)},
      ${sqlLiteral(report.objectKey)}, ${report.bytes.byteLength}, ${sqlLiteral(report.hash)},
      'daily-json-c14n-v1', 'legacy_structured_import', null
    ) as result
  `);
}

function reserve(snapshotId) {
  return oneResult(
    `select private.reserve_site_release_v1(${sqlLiteral(snapshotId)}::uuid) as result`,
  );
}

function finalize(reservation, reportDocument, mode) {
  const reports = [...reservation.reports].sort((left, right) =>
    left.report_date.localeCompare(right.report_date),
  );
  const contract = {
    schema_version: reportDocument.schema_version,
    taxonomy_version: reportDocument.taxonomy_version,
    structured_cutover_date: "2026-07-16",
    source_contract_version: "daily-source-v1",
    serializer_version: "daily-json-c14n-v1",
    search_contract_version: "search-v1",
    no_report_days: [],
    reports,
  };
  const contentRootSha256 = sha256(canonicalBytes(contract));
  const manifest = {
    ...contract,
    site_release_id: reservation.site_release_id,
    site_release_sequence: reservation.site_release_sequence,
    expected_predecessor_id: reservation.expected_predecessor_id,
    content_root_sha256: contentRootSha256,
  };
  const manifestBytes = canonicalBytes(manifest);
  const manifestSha256 = sha256(manifestBytes);
  const manifestObjectKey = `site-manifests/sha256/${manifestSha256}.json`;
  ensureRemoteObject(
    "bubble-content-site-manifests",
    manifestObjectKey,
    manifestBytes,
    "application/json; charset=utf-8",
  );
  const dispatchId = randomUUID();
  const payload = {
    dispatch_id: dispatchId,
    site_release_id: reservation.site_release_id,
    site_release_sequence: reservation.site_release_sequence,
    expected_predecessor_id: reservation.expected_predecessor_id,
    expected_content_sha: contentRootSha256,
    code_sha: codeSha,
    build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
    mode,
  };
  const result = oneResult(`
    select private.finalize_site_release_v1(
      ${sqlLiteral(reservation.reservation_id)}::uuid,
      ${sqlLiteral(manifestObjectKey)}, ${manifestBytes.byteLength},
      ${sqlLiteral(manifestSha256)}, ${sqlLiteral(contentRootSha256)},
      ${Number(reportDocument.schema_version)}, ${Number(reportDocument.taxonomy_version)},
      'daily-json-c14n-v1', 'search-v1', 'daily-source-v1',
      '2026-07-16'::date, array[]::date[], ${sqlLiteral(dispatchId)}::uuid,
      ${jsonSql(payload, "dispatch")}
    ) as result
  `);
  return {
    ...result,
    dispatch_id: dispatchId,
    manifest_sha256: manifestSha256,
    reports,
  };
}

function supersedeOutboxes(releaseIds) {
  const identifiers = releaseIds
    .map((id) => `${sqlLiteral(id)}::uuid`)
    .join(", ");
  query(`
    with targets as (
      select site_release_id, dispatch_id
      from private.content_outbox
      where site_release_id in (${identifiers}) and status <> 'deployed'
    ), events as (
      insert into private.release_deployment_attempts(
        site_release_id, dispatch_id, event_type, evidence
      )
      select site_release_id, dispatch_id, 'failed',
        '{"error":"superseded_by_history_bootstrap"}'::jsonb
      from targets
    )
    update private.content_outbox
    set status = 'dead_letter', lease_expires_at = null,
      dead_lettered_at = coalesce(dead_lettered_at, clock_timestamp()),
      last_error = 'superseded_by_history_bootstrap', updated_at = clock_timestamp()
    where site_release_id in (${identifiers}) and status <> 'deployed'
    returning site_release_id, dispatch_id, status
  `);
}

try {
  const state = oneResult(`
    select jsonb_build_object(
      'pointer', (select target_site_release_id from private.release_current_pointer where singleton),
      'releases', (select coalesce(jsonb_agg(id order by sequence), '[]'::jsonb) from private.site_releases),
      'artifact_count', (select count(*) from private.release_artifacts),
      'current_user', current_user,
      'can_use_ingestor', pg_has_role(current_user, 'content_ingestor', 'USAGE'),
      'historical_snapshot_count', (
        select count(*) from private.report_snapshots where report_date in ('2026-07-16', '2026-07-17')
      )
    ) as result
  `);
  if (
    state.pointer !== null ||
    state.artifact_count !== 0 ||
    state.current_user !== "postgres" ||
    state.can_use_ingestor !== false ||
    state.historical_snapshot_count !== 0 ||
    state.releases.length !== 1 ||
    state.releases[0] !== expectedReleaseId
  ) {
    throw new Error(
      "Production state is not the expected unpromoted initial release",
    );
  }

  query("grant content_ingestor to postgres");
  ingestorRoleGranted = true;

  const firstReport = loadHistoricalReport("2026-07-16");
  const secondReport = loadHistoricalReport("2026-07-17");
  const firstSnapshot = ingest(firstReport);
  const secondSnapshot = ingest(secondReport);
  const intermediate = finalize(
    reserve(firstSnapshot.report_snapshot_id),
    firstReport.document,
    "shadow",
  );
  supersedeOutboxes([expectedReleaseId, intermediate.site_release_id]);
  const production = finalize(
    reserve(secondSnapshot.report_snapshot_id),
    secondReport.document,
    "production",
  );
  if (
    production.reports.map((report) => report.report_date).join(",") !==
    "2026-07-16,2026-07-17,2026-07-18"
  ) {
    throw new Error(
      "Bootstrapped production release does not contain all owned dates",
    );
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        imported_dates: [firstReport.date, secondReport.date],
        superseded_release_ids: [
          expectedReleaseId,
          intermediate.site_release_id,
        ],
        production_release_id: production.site_release_id,
        production_release_sequence: production.site_release_sequence,
        production_dispatch_id: production.dispatch_id,
        manifest_sha256: production.manifest_sha256,
        report_dates: production.reports.map((report) => report.report_date),
      },
      null,
      2,
    )}\n`,
  );
} finally {
  if (ingestorRoleGranted) {
    query("revoke content_ingestor from postgres");
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
}
