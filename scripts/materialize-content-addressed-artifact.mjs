import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AwsCliObjectStore } from "./upload-content-addressed-artifact.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const SHA1 = /^[a-f0-9]{40}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALGORITHM = "sha256-content-addressed-pages-v1";
const ROUTE_MANIFEST = "release-manifests/site-route-manifest.json";
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1280 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 8;

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

function positiveInteger(value) {
  const parsed = Number(value ?? DEFAULT_CONCURRENCY);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 32) {
    throw new Error(
      "Artifact materialization concurrency must be between 1 and 32",
    );
  }
  return parsed;
}

async function runPool(entries, concurrency, worker) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
      while (cursor < entries.length) {
        const index = cursor;
        cursor += 1;
        await worker(entries[index], index);
      }
    }),
  );
}

function validateDescriptor(descriptor, expected) {
  const artifactSha256 = String(descriptor?.artifact_sha256 || "");
  if (
    descriptor?.hash_algorithm !== ALGORITHM ||
    !UUID.test(String(descriptor?.site_release_id || "")) ||
    !SHA1.test(String(descriptor?.code_sha || "")) ||
    !SHA256.test(String(descriptor?.content_sha256 || "")) ||
    !SHA256.test(String(descriptor?.artifact_fingerprint_sha256 || "")) ||
    !Number.isSafeInteger(Number(descriptor?.byte_length)) ||
    Number(descriptor.byte_length) < 1 ||
    !SHA256.test(artifactSha256) ||
    descriptor.object_key !== `artifacts/sha256/${artifactSha256}.json`
  ) {
    throw new Error("Resume artifact descriptor is invalid");
  }
  if (
    descriptor.site_release_id !== expected.siteReleaseId ||
    descriptor.code_sha !== expected.codeSha ||
    descriptor.content_sha256 !== expected.contentSha256
  ) {
    throw new Error(
      "Resume artifact descriptor does not match workflow identity",
    );
  }
}

function parseInventory(bytes, descriptor) {
  if (
    bytes.byteLength !== Number(descriptor.byte_length) ||
    bytes.byteLength > MAX_MANIFEST_BYTES ||
    sha256(bytes) !== descriptor.artifact_sha256
  ) {
    throw new Error("Resume artifact inventory byte identity mismatch");
  }
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Resume artifact inventory is malformed");
  }
  if (
    manifest?.schema_version !== 1 ||
    manifest?.hash_algorithm !== ALGORITHM ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0 ||
    manifest.files.length > MAX_FILES ||
    manifest.file_count !== manifest.files.length ||
    manifest.artifact_fingerprint_sha256 !==
      descriptor.artifact_fingerprint_sha256 ||
    manifest.build?.site_release_id !== descriptor.site_release_id ||
    manifest.build?.code_sha !== descriptor.code_sha ||
    manifest.build?.content_sha256 !== descriptor.content_sha256 ||
    manifest.build?.artifact_sha256 !== descriptor.artifact_fingerprint_sha256
  ) {
    throw new Error("Resume artifact inventory contract is invalid");
  }

  const paths = new Set();
  let totalBytes = 0;
  for (const file of manifest.files) {
    if (
      !safePath(file?.path) ||
      paths.has(file.path) ||
      !Number.isSafeInteger(file.byte_length) ||
      file.byte_length < 0 ||
      file.byte_length > MAX_FILE_BYTES ||
      !SHA256.test(file.sha256) ||
      file.object_key !== `assets/sha256/${file.sha256}`
    ) {
      throw new Error("Resume artifact inventory contains an invalid asset");
    }
    paths.add(file.path);
    totalBytes += file.byte_length;
  }
  if (
    !paths.has(ROUTE_MANIFEST) ||
    totalBytes !== manifest.total_asset_bytes ||
    totalBytes > MAX_TOTAL_BYTES
  ) {
    throw new Error("Resume artifact inventory totals are invalid");
  }
  const fingerprint = createHash("sha256");
  for (const file of [...manifest.files]
    .filter((entry) => entry.path !== ROUTE_MANIFEST)
    .sort((left, right) => left.path.localeCompare(right.path))) {
    fingerprint.update(file.path);
    fingerprint.update("\0");
    fingerprint.update(file.sha256);
    fingerprint.update("\n");
  }
  if (fingerprint.digest("hex") !== descriptor.artifact_fingerprint_sha256) {
    throw new Error("Resume artifact path fingerprint mismatch");
  }
  return manifest;
}

export async function materializeContentAddressedArtifact({
  descriptor,
  expectedSiteReleaseId,
  expectedCodeSha,
  expectedContentSha256,
  targetRoot,
  store,
  concurrency = DEFAULT_CONCURRENCY,
}) {
  validateDescriptor(descriptor, {
    siteReleaseId: expectedSiteReleaseId,
    codeSha: expectedCodeSha,
    contentSha256: expectedContentSha256,
  });
  const inventoryBytes = await store.get(descriptor.object_key);
  const manifest = parseInventory(inventoryBytes, descriptor);
  const target = resolve(targetRoot);
  const temporary = `${target}.materializing-${randomUUID()}`;
  const backup = `${target}.previous-${randomUUID()}`;
  const objectReads = new Map();
  let targetMoved = false;
  try {
    await mkdir(temporary, { recursive: true });
    await runPool(
      manifest.files,
      positiveInteger(concurrency),
      async (file) => {
        let pending = objectReads.get(file.object_key);
        if (!pending) {
          pending = store.get(file.object_key);
          objectReads.set(file.object_key, pending);
        }
        const bytes = await pending;
        if (
          bytes.byteLength !== file.byte_length ||
          sha256(bytes) !== file.sha256
        ) {
          throw new Error(
            `Resume artifact asset identity mismatch: ${file.path}`,
          );
        }
        const destination = resolve(temporary, file.path);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, bytes, { flag: "wx" });
      },
    );
    const existing = await stat(target).catch(() => null);
    if (existing) {
      await rename(target, backup);
      targetMoved = true;
    }
    await rename(temporary, target);
    if (targetMoved) await rm(backup, { recursive: true, force: true });
    return {
      site_release_id: descriptor.site_release_id,
      artifact_sha256: descriptor.artifact_sha256,
      artifact_fingerprint_sha256: descriptor.artifact_fingerprint_sha256,
      file_count: manifest.file_count,
      total_asset_bytes: manifest.total_asset_bytes,
      unique_object_reads: objectReads.size,
      target_root: target,
    };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    if (targetMoved) {
      await rm(target, { recursive: true, force: true });
      await rename(backup, target);
    }
    throw error;
  }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const plan = JSON.parse(
    await readFile(
      process.argv[2] || resolve(process.cwd(), "server-resume-plan.json"),
      "utf8",
    ),
  );
  const descriptor = plan.artifact;
  const store = new AwsCliObjectStore({
    bucket: process.env.R2_ARTIFACT_BUCKET,
    endpoint: process.env.R2_ENDPOINT,
    aws: process.env.AWS_CLI || "aws",
  });
  const result = await materializeContentAddressedArtifact({
    descriptor,
    expectedSiteReleaseId: process.env.SITE_RELEASE_ID,
    expectedCodeSha: process.env.EXACT_CODE_SHA,
    expectedContentSha256: process.env.CONTENT_ROOT_SHA256,
    targetRoot: process.argv[3] || "astro/dist/client",
    store,
    concurrency: process.env.R2_MATERIALIZE_CONCURRENCY || DEFAULT_CONCURRENCY,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
