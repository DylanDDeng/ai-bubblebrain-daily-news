import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1280 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 8;
const CONTENT_ADDRESSED_ALGORITHM = "sha256-content-addressed-pages-v1";
const TRUSTED_VERIFICATION_PROFILE = "r2-full-get-sha256-indefinite-lock-v1";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safePath(path) {
  return Boolean(
    path &&
    !/[\u0000-\u001f\u007f]/.test(path) &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path
      .split("/")
      .some((part) => part === "." || part === ".." || part === ""),
  );
}

function positiveInteger(value, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 32) {
    throw new Error("Artifact upload concurrency must be between 1 and 32");
  }
  return parsed;
}

function parseInventoryBytes(bytes, label) {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_MANIFEST_BYTES) {
    throw new Error(`${label} inventory byte length is invalid`);
  }
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} inventory is malformed`);
  }
  if (
    manifest?.schema_version !== 1 ||
    manifest?.hash_algorithm !== CONTENT_ADDRESSED_ALGORITHM ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0 ||
    manifest.files.length > MAX_FILES ||
    manifest.file_count !== manifest.files.length
  ) {
    throw new Error(`${label} inventory contract is invalid`);
  }
  const seenPaths = new Set();
  let totalBytes = 0;
  for (const file of manifest.files) {
    if (
      !safePath(file?.path) ||
      seenPaths.has(file.path) ||
      !Number.isSafeInteger(file.byte_length) ||
      file.byte_length < 0 ||
      file.byte_length > MAX_FILE_BYTES ||
      !SHA256.test(file.sha256) ||
      file.object_key !== `assets/sha256/${file.sha256}`
    ) {
      throw new Error(`${label} inventory contains an invalid asset`);
    }
    seenPaths.add(file.path);
    totalBytes += file.byte_length;
  }
  if (
    totalBytes !== manifest.total_asset_bytes ||
    totalBytes > MAX_TOTAL_BYTES
  ) {
    throw new Error(`${label} inventory total byte length is invalid`);
  }
  return manifest;
}

export function trustedObjectKeys(trustedBaseline) {
  const descriptor = trustedBaseline?.descriptor;
  const bytes = trustedBaseline?.manifestBytes;
  if (!descriptor || !Buffer.isBuffer(bytes)) {
    throw new Error("Trusted baseline is incomplete");
  }
  const artifactSha256 = String(descriptor.artifact_sha256 || "");
  const artifactFingerprint = String(
    descriptor.artifact_fingerprint_sha256 || "",
  );
  const siteReleaseId = String(descriptor.site_release_id || "");
  if (
    descriptor.production_verified !== true ||
    descriptor.hash_algorithm !== CONTENT_ADDRESSED_ALGORITHM ||
    descriptor.verification_profile !== TRUSTED_VERIFICATION_PROFILE ||
    !SHA256.test(artifactSha256) ||
    descriptor.object_key !== `artifacts/sha256/${artifactSha256}.json` ||
    Number(descriptor.byte_length) !== bytes.byteLength ||
    !SHA256.test(artifactFingerprint) ||
    !UUID.test(siteReleaseId) ||
    !SHA256.test(String(descriptor.lock_evidence_sha256 || "")) ||
    !Number.isFinite(Date.parse(String(descriptor.r2_verified_at || ""))) ||
    sha256(bytes) !== artifactSha256
  ) {
    throw new Error("Trusted baseline provenance is invalid");
  }
  const manifest = parseInventoryBytes(bytes, "Trusted baseline");
  if (
    manifest.artifact_fingerprint_sha256 !== artifactFingerprint ||
    manifest.build?.artifact_sha256 !== artifactFingerprint ||
    manifest.build?.site_release_id !== siteReleaseId
  ) {
    throw new Error("Trusted baseline release identity is invalid");
  }
  return new Set(manifest.files.map((file) => file.object_key));
}

async function runPool(entries, concurrency, worker) {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, entries.length) },
    async () => {
      while (cursor < entries.length) {
        const index = cursor;
        cursor += 1;
        await worker(entries[index], index);
      }
    },
  );
  await Promise.all(runners);
}

function runCommand(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    const errors = [];
    let errorBytes = 0;
    child.stderr.on("data", (chunk) => {
      if (errorBytes < 64 * 1024) errors.push(chunk);
      errorBytes += chunk.byteLength;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) return resolvePromise();
      const detail = Buffer.concat(errors).toString("utf8").trim();
      reject(
        new Error(
          `${command} failed (${signal || code})${detail ? `: ${detail}` : ""}`,
        ),
      );
    });
  });
}

export class AwsCliObjectStore {
  constructor({ bucket, endpoint, aws = "aws" }) {
    if (!bucket || !endpoint) {
      throw new Error("R2 bucket and endpoint are required");
    }
    this.bucket = bucket;
    this.endpoint = endpoint;
    this.aws = aws;
  }

  commonArgs(key) {
    return [
      "--bucket",
      this.bucket,
      "--key",
      key,
      "--endpoint-url",
      this.endpoint,
      "--no-cli-pager",
    ];
  }

  async putIfAbsent(key, localPath) {
    await runCommand(this.aws, [
      "s3api",
      "put-object",
      ...this.commonArgs(key),
      "--body",
      localPath,
      "--if-none-match",
      "*",
    ]);
  }

  async get(key) {
    const chunks = [];
    await new Promise((resolvePromise, reject) => {
      const child = spawn(
        this.aws,
        [
          "s3",
          "cp",
          `s3://${this.bucket}/${key}`,
          "-",
          "--endpoint-url",
          this.endpoint,
          "--no-progress",
          "--no-cli-pager",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const errors = [];
      let errorBytes = 0;
      child.stdout.on("data", (chunk) => chunks.push(chunk));
      child.stderr.on("data", (chunk) => {
        if (errorBytes < 64 * 1024) errors.push(chunk);
        errorBytes += chunk.byteLength;
      });
      child.once("error", reject);
      child.once("close", (code, signal) => {
        if (code === 0) return resolvePromise();
        const detail = Buffer.concat(errors).toString("utf8").trim();
        reject(
          new Error(
            `aws get failed (${signal || code})${detail ? `: ${detail}` : ""}`,
          ),
        );
      });
    });
    return Buffer.concat(chunks);
  }
}

async function loadPlan(manifestPath, distRoot, expectedManifestSha256) {
  const manifestAbsolute = resolve(manifestPath);
  const manifestBytes = await readFile(manifestAbsolute);
  if (
    manifestBytes.byteLength === 0 ||
    manifestBytes.byteLength > MAX_MANIFEST_BYTES
  ) {
    throw new Error("Artifact inventory byte length is invalid");
  }
  const manifestSha256 = sha256(manifestBytes);
  if (expectedManifestSha256 && manifestSha256 !== expectedManifestSha256) {
    throw new Error("Artifact inventory SHA-256 does not match workflow state");
  }
  const manifest = parseInventoryBytes(manifestBytes, "Artifact");

  const root = await realpath(resolve(distRoot));
  const objects = new Map();
  for (const file of manifest.files) {
    const absolute = await realpath(resolve(root, file.path));
    const escaped = relative(root, absolute);
    if (escaped.startsWith(`..${sep}`) || escaped === "..") {
      throw new Error("Artifact asset escapes the distribution root");
    }
    const info = await stat(absolute);
    if (!info.isFile() || info.size !== file.byte_length) {
      throw new Error(`Artifact asset length changed: ${file.path}`);
    }
    const bytes = await readFile(absolute);
    if (sha256(bytes) !== file.sha256) {
      throw new Error(`Artifact asset SHA-256 changed: ${file.path}`);
    }
    const previous = objects.get(file.object_key);
    if (previous && previous.sha256 !== file.sha256) {
      throw new Error("Artifact object key collision in inventory");
    }
    if (!previous) {
      objects.set(file.object_key, {
        key: file.object_key,
        path: absolute,
        byteLength: file.byte_length,
        sha256: file.sha256,
      });
    }
  }
  return {
    manifest,
    manifestBytes,
    manifestPath: manifestAbsolute,
    manifestSha256,
    objects: [...objects.values()],
  };
}

async function putAndVerify(store, object) {
  const localBytes = object.bytes || (await readFile(object.path));
  if (
    localBytes.byteLength !== object.byteLength ||
    sha256(localBytes) !== object.sha256
  ) {
    throw new Error(`Artifact object changed before upload: ${object.key}`);
  }
  let putError = null;
  try {
    await store.putIfAbsent(object.key, object.path, localBytes);
  } catch (error) {
    putError = error;
  }
  let downloaded;
  try {
    downloaded = await store.get(object.key);
  } catch (getError) {
    if (putError) {
      throw new AggregateError(
        [putError, getError],
        `Immutable object write and verification failed: ${object.key}`,
      );
    }
    throw getError;
  }
  if (
    downloaded.byteLength !== object.byteLength ||
    sha256(downloaded) !== object.sha256 ||
    !Buffer.from(downloaded).equals(localBytes)
  ) {
    throw new Error(`Critical content-address collision at ${object.key}`);
  }
  return putError ? "reused" : "uploaded";
}

export async function uploadContentAddressedArtifact({
  manifestPath,
  distRoot,
  artifactObjectKey,
  expectedManifestSha256,
  store,
  incrementalReuseEnabled = false,
  trustedBaseline = null,
  concurrency = DEFAULT_CONCURRENCY,
  onProgress = () => {},
}) {
  if (
    !/^artifacts\/sha256\/[a-f0-9]{64}\.json$/.test(artifactObjectKey || "")
  ) {
    throw new Error("Artifact inventory object key is invalid");
  }
  const parsedKeySha256 = artifactObjectKey.slice(
    "artifacts/sha256/".length,
    -".json".length,
  );
  if (expectedManifestSha256 && parsedKeySha256 !== expectedManifestSha256) {
    throw new Error("Artifact inventory object key does not match its SHA-256");
  }
  const plan = await loadPlan(
    manifestPath,
    distRoot,
    expectedManifestSha256 || parsedKeySha256,
  );
  let trustedKeys = new Set();
  let trustedBaselineReason = incrementalReuseEnabled
    ? "baseline_unavailable"
    : "feature_disabled";
  if (incrementalReuseEnabled && trustedBaseline) {
    try {
      trustedKeys = trustedObjectKeys(trustedBaseline);
      trustedBaselineReason = "verified";
    } catch (error) {
      trustedBaselineReason =
        error instanceof Error ? error.message : "baseline_invalid";
    }
  }
  const limit = positiveInteger(concurrency, DEFAULT_CONCURRENCY);
  const results = { uploaded: 0, reused: 0, trusted_reused: 0 };
  let completed = 0;
  await runPool(plan.objects, limit, async (object) => {
    const disposition = trustedKeys.has(object.key)
      ? "trusted_reused"
      : await putAndVerify(store, object);
    results[disposition] += 1;
    completed += 1;
    onProgress({
      completed,
      total: plan.objects.length + 1,
      key: object.key,
      disposition,
    });
  });
  const inventoryDisposition = await putAndVerify(store, {
    key: artifactObjectKey,
    path: plan.manifestPath,
    bytes: plan.manifestBytes,
    byteLength: plan.manifestBytes.byteLength,
    sha256: plan.manifestSha256,
  });
  results[inventoryDisposition] += 1;
  onProgress({
    completed: plan.objects.length + 1,
    total: plan.objects.length + 1,
    key: artifactObjectKey,
    disposition: inventoryDisposition,
  });
  return {
    ...results,
    incremental_reuse_enabled: incrementalReuseEnabled,
    trusted_baseline_status: trustedBaselineReason,
    unique_asset_objects: plan.objects.length,
    inventory_object_key: artifactObjectKey,
    inventory_sha256: plan.manifestSha256,
    inventory_byte_length: plan.manifestBytes.byteLength,
    total_asset_bytes: plan.manifest.total_asset_bytes,
  };
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const manifestPath = process.argv[2] || "content-release-artifact.json";
  const distRoot = process.argv[3] || "astro/dist/client";
  const store = new AwsCliObjectStore({
    bucket: process.env.R2_ARTIFACT_BUCKET,
    endpoint: process.env.R2_ENDPOINT,
    aws: process.env.AWS_CLI || "aws",
  });
  const incrementalReuseEnabled =
    process.env.R2_INCREMENTAL_REUSE_ENABLED === "true";
  let trustedBaseline = null;
  if (
    incrementalReuseEnabled &&
    process.env.R2_TRUSTED_BASE_DESCRIPTOR_PATH &&
    process.env.R2_TRUSTED_BASE_MANIFEST_PATH
  ) {
    trustedBaseline = {
      descriptor: JSON.parse(
        await readFile(process.env.R2_TRUSTED_BASE_DESCRIPTOR_PATH, "utf8"),
      ),
      manifestBytes: await readFile(process.env.R2_TRUSTED_BASE_MANIFEST_PATH),
    };
  }
  const result = await uploadContentAddressedArtifact({
    manifestPath,
    distRoot,
    artifactObjectKey: process.env.ARTIFACT_OBJECT_KEY,
    expectedManifestSha256: process.env.ARTIFACT_SHA256,
    incrementalReuseEnabled,
    trustedBaseline,
    concurrency: process.env.R2_UPLOAD_CONCURRENCY || DEFAULT_CONCURRENCY,
    store,
    onProgress: ({ completed, total, disposition }) => {
      if (completed === total || completed % 100 === 0) {
        process.stderr.write(
          `Verified ${completed}/${total} immutable R2 objects (${disposition})\n`,
        );
      }
    },
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
