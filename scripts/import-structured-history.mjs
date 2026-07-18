import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import postgres from "postgres";

const root = resolve(import.meta.dirname, "..");
const arguments_ = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  const next = process.argv[index + 1];
  if (key.startsWith("--") && next && !next.startsWith("--")) {
    arguments_.set(key, next);
    index += 1;
  } else if (key.startsWith("--")) {
    arguments_.set(key, true);
  } else {
    throw new Error(`Unexpected argument: ${key}`);
  }
}

const dataDirectory = resolve(
  root,
  String(arguments_.get("--data-dir") || "data/daily"),
);
const databaseUrl = String(
  arguments_.get("--database-url") || process.env.CONTENT_DATABASE_URL || "",
);
const databaseRole = arguments_.get("--database-role");
const localR2Directory = arguments_.get("--local-r2-dir")
  ? resolve(String(arguments_.get("--local-r2-dir")))
  : null;
const r2Bucket = String(
  arguments_.get("--r2-bucket") || "bubble-content-report-snapshots",
);
const apply = arguments_.has("--apply");
const evidencePath = arguments_.get("--evidence")
  ? resolve(String(arguments_.get("--evidence")))
  : null;
const DATE_FILE = /^\d{4}-\d{2}-\d{2}\.json$/;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function runWrangler(parts, tolerateFailure = false) {
  const result = spawnSync("npx", ["wrangler", ...parts], {
    cwd: root,
    encoding: "utf8",
    stdio: tolerateFailure ? "pipe" : "inherit",
  });
  if (!tolerateFailure && result.status !== 0)
    throw new Error(`Wrangler failed: ${parts.slice(0, 4).join(" ")}`);
  return result;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function putLocalExact(key, sourceBytes) {
  const target = resolve(localR2Directory, key);
  await mkdir(dirname(target), { recursive: true });
  if (await exists(target)) {
    const current = await readFile(target);
    if (!current.equals(sourceBytes))
      throw new Error(`Critical local R2 collision: ${key}`);
  } else {
    try {
      await writeFile(target, sourceBytes, { flag: "wx" });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  const verified = await readFile(target);
  if (!verified.equals(sourceBytes))
    throw new Error(`Local R2 read-after-write mismatch: ${key}`);
}

async function putRemoteExact(key, sourcePath, sourceBytes) {
  const temporary = await mkdtemp(resolve(tmpdir(), "content-import-"));
  const downloaded = resolve(temporary, "object.json");
  try {
    const get = runWrangler(
      [
        "r2",
        "object",
        "get",
        `${r2Bucket}/${key}`,
        "--file",
        downloaded,
        "--remote",
      ],
      true,
    );
    if (get.status === 0) {
      if (!(await readFile(downloaded)).equals(sourceBytes))
        throw new Error(`Critical R2 collision: ${key}`);
    } else {
      runWrangler([
        "r2",
        "object",
        "put",
        `${r2Bucket}/${key}`,
        "--file",
        sourcePath,
        "--content-type",
        "application/json; charset=utf-8",
        "--remote",
      ]);
    }
    await rm(downloaded, { force: true });
    runWrangler([
      "r2",
      "object",
      "get",
      `${r2Bucket}/${key}`,
      "--file",
      downloaded,
      "--remote",
    ]);
    if (!(await readFile(downloaded)).equals(sourceBytes))
      throw new Error(`R2 read-after-write mismatch: ${key}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const names = (await readdir(dataDirectory))
  .filter((name) => DATE_FILE.test(name))
  .sort();
if (!names.length) throw new Error("No structured daily reports were found");
const reports = [];
for (const name of names) {
  const path = resolve(dataDirectory, name);
  const bytes = await readFile(path);
  const document = JSON.parse(bytes.toString("utf8"));
  const date = basename(name, ".json");
  if (
    document.date !== date ||
    document.timezone !== "Asia/Shanghai" ||
    !Array.isArray(document.items) ||
    !Array.isArray(document.batches)
  ) {
    throw new Error(`Structured report identity is invalid: ${name}`);
  }
  const hash = sha256(bytes);
  reports.push({
    date,
    path,
    bytes,
    document,
    hash,
    key: `report-snapshots/sha256/${hash}.json`,
  });
}

if (!apply) {
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: "plan",
        report_count: reports.length,
        total_bytes: reports.reduce(
          (sum, report) => sum + report.bytes.byteLength,
          0,
        ),
        reports: reports.map(({ date, hash, key, bytes }) => ({
          date,
          byte_length: bytes.byteLength,
          byte_sha256: hash,
          object_key: key,
        })),
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}
if (!databaseUrl)
  throw new Error(
    "--database-url or CONTENT_DATABASE_URL is required with --apply",
  );
if (!localR2Directory && !r2Bucket)
  throw new Error("An R2 destination is required with --apply");

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  ssl: databaseUrl.includes("127.0.0.1") ? false : "require",
});
const evidence = [];
try {
  if (databaseRole) {
    if (!/^[a-z_][a-z0-9_]*$/.test(String(databaseRole)))
      throw new Error("Invalid database role");
    await sql.unsafe(`set role ${databaseRole}`);
  }
  for (const report of reports) {
    if (localR2Directory) await putLocalExact(report.key, report.bytes);
    else await putRemoteExact(report.key, report.path, report.bytes);
    const invoke = async () => {
      const rows = await sql`
				select private.ingest_report_snapshot_v1(
					${sql.json(report.document)}, ${report.key}, ${report.bytes.byteLength}, ${report.hash},
					'daily-exact-source-v1', 'legacy_structured_import', null
				) as result
			`;
      return rows[0].result;
    };
    const first = await invoke();
    const second = await invoke();
    if (
      first.report_snapshot_id !== second.report_snapshot_id ||
      second.idempotent !== true
    ) {
      throw new Error(`Idempotency verification failed for ${report.date}`);
    }
    evidence.push({
      date: report.date,
      report_snapshot_id: first.report_snapshot_id,
      report_version: first.report_version,
      byte_length: report.bytes.byteLength,
      byte_sha256: report.hash,
      object_key: report.key,
      second_import_idempotent: true,
    });
  }
} finally {
  await sql.end({ timeout: 5 });
}

const output = {
  mode: "applied",
  provenance_kind: "legacy_structured_import",
  report_count: evidence.length,
  total_bytes: reports.reduce(
    (sum, report) => sum + report.bytes.byteLength,
    0,
  ),
  raw_payload_sha256_policy: "null_when_historical_raw_payload_is_unavailable",
  reports: evidence,
};
if (evidencePath) {
  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(output, null, 2)}\n`, {
    flag: "wx",
  });
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
