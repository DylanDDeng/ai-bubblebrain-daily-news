import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const ROUTE_MANIFEST = "release-manifests/site-route-manifest.json";
const MAX_FILES = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function extension(path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
}

function pagesAssetHash(path, bytes) {
  const input = new TextEncoder().encode(
    `${Buffer.from(bytes).toString("base64")}${extension(path)}`,
  );
  return bytesToHex(blake3(input)).slice(0, 32);
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

async function walk(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(root, absolute)));
    else if (entry.isFile()) files.push(absolute);
    else
      throw new Error(
        `Artifact contains an unsupported filesystem entry: ${absolute}`,
      );
  }
  return files;
}

export async function createContentAddressedArtifact(
  distRoot,
  outputPath = null,
) {
  const root = resolve(distRoot);
  const paths = (await walk(root))
    .map((absolute) => ({
      absolute,
      path: relative(root, absolute).replaceAll("\\", "/"),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (!paths.length || paths.length > MAX_FILES)
    throw new Error("Artifact file count is invalid");
  const identities = new Set();
  const files = [];
  let totalAssetBytes = 0;
  let largestFileBytes = 0;
  let largestFile = null;
  const fingerprint = createHash("sha256");
  for (const entry of paths) {
    if (!safePath(entry.path) || identities.has(entry.path)) {
      throw new Error(
        `Artifact contains an unsafe or duplicate path: ${entry.path}`,
      );
    }
    identities.add(entry.path);
    const info = await stat(entry.absolute);
    if (info.size > MAX_FILE_BYTES) {
      throw new Error(
        `Artifact file exceeds the Pages 25 MiB limit: ${entry.path}`,
      );
    }
    const bytes = await readFile(entry.absolute);
    const contentSha256 = sha256(bytes);
    if (entry.path !== ROUTE_MANIFEST) {
      fingerprint.update(entry.path);
      fingerprint.update("\0");
      fingerprint.update(contentSha256);
      fingerprint.update("\n");
    }
    files.push({
      path: entry.path,
      byte_length: bytes.byteLength,
      sha256: contentSha256,
      pages_hash: pagesAssetHash(entry.path, bytes),
      object_key: `assets/sha256/${contentSha256}`,
    });
    totalAssetBytes += bytes.byteLength;
    if (bytes.byteLength > largestFileBytes) {
      largestFileBytes = bytes.byteLength;
      largestFile = entry.path;
    }
  }
  const artifactFingerprint = fingerprint.digest("hex");
  const routeEntry = files.find((file) => file.path === ROUTE_MANIFEST);
  if (!routeEntry) throw new Error("Artifact route manifest is missing");
  const routeManifest = JSON.parse(
    await readFile(resolve(root, ROUTE_MANIFEST), "utf8"),
  );
  if (
    routeManifest?.build?.hash_algorithm !== "sha256-path-and-content-v1" ||
    routeManifest.build.artifact_sha256 !== artifactFingerprint
  ) {
    throw new Error(
      "Artifact route manifest fingerprint does not match the file inventory",
    );
  }
  const manifest = {
    schema_version: 1,
    hash_algorithm: "sha256-content-addressed-pages-v1",
    build: routeManifest.build,
    artifact_fingerprint_sha256: artifactFingerprint,
    file_count: files.length,
    total_asset_bytes: totalAssetBytes,
    files,
  };
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const artifactSha256 = sha256(bytes);
  const result = {
    manifest,
    bytes,
    artifact_sha256: artifactSha256,
    artifact_byte_length: bytes.byteLength,
    artifact_object_key: `artifacts/sha256/${artifactSha256}.json`,
    largest_file: largestFile,
    largest_file_bytes: largestFileBytes,
  };
  if (outputPath) await writeFile(resolve(outputPath), bytes);
  return result;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const distRoot =
    process.argv[2] ||
    resolve(dirname(fileURLToPath(import.meta.url)), "../astro/dist/client");
  const outputPath =
    process.argv[3] || resolve(process.cwd(), "content-release-artifact.json");
  const result = await createContentAddressedArtifact(distRoot, outputPath);
  process.stdout.write(
    `${JSON.stringify({
      artifact_sha256: result.artifact_sha256,
      artifact_byte_length: result.artifact_byte_length,
      artifact_object_key: result.artifact_object_key,
      hash_algorithm: result.manifest.hash_algorithm,
      file_count: result.manifest.file_count,
      total_asset_bytes: result.manifest.total_asset_bytes,
      largest_file: result.largest_file,
      largest_file_bytes: result.largest_file_bytes,
    })}\n`,
  );
}
