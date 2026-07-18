import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { openContentDatabase, type ContentSql } from "../shared/db";

type Env = {
  CONTENT_DB?: { connectionString?: string };
  CONTENT_DATABASE_URL?: string;
  ARTIFACTS: R2Bucket;
  WORKFLOW_HMAC_SECRET: string;
  CONTROL_BROKER_SECRET: string;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_ZONE_ID: string;
  CONTENT_API_PURGE_URLS: string;
  PAGES_PROJECT: string;
  PRODUCTION_BRANCH: string;
  PRODUCTION_VERIFY_URLS: string;
  VERIFY_MIN_ENDPOINTS?: string;
  MAX_PRODUCTION_INCONSISTENCY_MS?: string;
};

type JsonRecord = Record<string, unknown>;
type ArtifactContext = {
  site_release_id: string;
  site_release_sequence: number;
  expected_predecessor_id?: string | null;
  manifest_sha256: string;
  content_sha256: string;
  schema_version: number;
  taxonomy_version: number;
  serializer_version: string;
  search_contract_version: string;
  source_contract_version: string;
  artifact_object_key: string;
  artifact_byte_length: number;
  artifact_sha256: string;
  artifact_fingerprint_sha256: string;
  artifact_hash_algorithm: string;
  code_sha: string;
  build_environment_version: string;
  pointer_generation?: number;
  current_site_release_id?: string | null;
};
type TarFile = { path: string; bytes: Uint8Array };
type ContentAddressedAsset = {
  path: string;
  byte_length: number;
  sha256: string;
  pages_hash: string;
  object_key: string;
};
type ContentAddressedArtifact = {
  schema_version: 1;
  hash_algorithm: "sha256-content-addressed-pages-v1";
  build: JsonRecord;
  artifact_fingerprint_sha256: string;
  file_count: number;
  total_asset_bytes: number;
  files: ContentAddressedAsset[];
};
type ArtifactBundle =
  | { kind: "tar"; files: TarFile[] }
  | { kind: "content-addressed"; manifest: ContentAddressedArtifact };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const SHA1 = /^[a-f0-9]{40}$/;
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_ARTIFACT_BYTES = 96 * 1024 * 1024;
const MAX_ARTIFACT_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_CONTENT_ADDRESSED_BYTES = 1280 * 1024 * 1024;
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const MAX_UPLOAD_BATCH_BYTES = 4 * 1024 * 1024;
const MAX_ARTIFACT_FILES = 20_000;
const ROUTE_MANIFEST = "release-manifests/site-route-manifest.json";
const CONTRACT_VERSION = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const PINNED_TOOLCHAIN: JsonRecord = {
  node_version: "v22.17.0",
  npm_version: "10.9.2",
  astro_version: "7.0.9",
  hugo_version: "0.147.9",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function bytesEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  return bytesToHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  );
}

async function hmacHex(secret: string, bytes: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes)),
  );
}

function base64(bytes: Uint8Array): string {
  let result = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    result += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(result);
}

function tarText(bytes: Uint8Array, start: number, length: number): string {
  const end = bytes.subarray(start, start + length).indexOf(0);
  const slice = bytes.subarray(start, start + (end < 0 ? length : end));
  return new TextDecoder("utf-8", { fatal: true }).decode(slice);
}

function tarNumber(bytes: Uint8Array, start: number, length: number): number {
  const text = tarText(bytes, start, length).trim().replace(/\0/g, "");
  if (!/^[0-7]*$/.test(text))
    throw new Error("Artifact tar contains an invalid numeric field");
  return text ? Number.parseInt(text, 8) : 0;
}

function tarChecksum(bytes: Uint8Array, offset: number): number {
  let total = 0;
  for (let index = 0; index < 512; index += 1) {
    total += index >= 148 && index < 156 ? 32 : bytes[offset + index];
  }
  return total;
}

export function parseDeterministicTar(bytes: Uint8Array): TarFile[] {
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_ARTIFACT_BYTES ||
    bytes.byteLength % 512 !== 0
  ) {
    throw new Error("Artifact tar size is invalid");
  }
  const files: TarFile[] = [];
  const paths = new Set<string>();
  for (let offset = 0; offset + 512 <= bytes.length; ) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const expectedChecksum = tarNumber(bytes, offset + 148, 8);
    if (expectedChecksum !== tarChecksum(bytes, offset))
      throw new Error("Artifact tar checksum mismatch");
    const type = String.fromCharCode(bytes[offset + 156] || 48);
    const name = tarText(bytes, offset, 100);
    const prefix = tarText(bytes, offset + 345, 155);
    const size = tarNumber(bytes, offset + 124, 12);
    const rawPath = `${prefix ? `${prefix}/` : ""}${name}`
      .replace(/^\.\//, "")
      .replace(/\/$/, "");
    if (
      !rawPath ||
      rawPath.startsWith("/") ||
      rawPath.includes("\\") ||
      rawPath.split("/").some((part) => part === ".." || part === ".")
    ) {
      throw new Error("Artifact tar contains an unsafe path");
    }
    const bodyStart = offset + 512;
    const next = bodyStart + Math.ceil(size / 512) * 512;
    if (!Number.isSafeInteger(size) || size < 0 || next > bytes.length) {
      throw new Error("Artifact tar entry is truncated");
    }
    if (type === "0") {
      if (paths.has(rawPath))
        throw new Error("Artifact tar contains a duplicate path");
      paths.add(rawPath);
      files.push({
        path: rawPath,
        bytes: bytes.slice(bodyStart, bodyStart + size),
      });
      if (files.length > MAX_ARTIFACT_FILES)
        throw new Error("Artifact tar contains too many files");
    } else if (type !== "5") {
      throw new Error(`Artifact tar entry type is unsupported: ${type}`);
    }
    offset = next;
  }
  if (!files.length)
    throw new Error("Artifact tar contains no deployable files");
  return files;
}

function extension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
}

function safeArtifactPath(path: string): boolean {
  return Boolean(
    path &&
    !/[\u0000-\u001f\u007f]/.test(path) &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path
      .split("/")
      .some((part) => part === ".." || part === "." || part === ""),
  );
}

export function pagesAssetHash(file: TarFile): string {
  const input = new TextEncoder().encode(
    `${base64(file.bytes)}${extension(file.path)}`,
  );
  return bytesToHex(blake3(input)).slice(0, 32);
}

function contentType(path: string): string {
  const types: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    json: "application/json",
    xml: "application/xml",
    txt: "text/plain",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    ico: "image/vnd.microsoft.icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    mp4: "video/mp4",
    webm: "video/webm",
  };
  return types[extension(path).toLowerCase()] || "application/octet-stream";
}

async function inventoryFingerprint(
  files: ContentAddressedAsset[],
): Promise<string> {
  const encoder = new TextEncoder();
  const ordered = files
    .filter((file) => file.path !== ROUTE_MANIFEST)
    .sort((left, right) => left.path.localeCompare(right.path));
  const parts = ordered.map((file) =>
    encoder.encode(`${file.path}\0${file.sha256}\n`),
  );
  const aggregate = new Uint8Array(
    parts.reduce((sum, part) => sum + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    aggregate.set(part, offset);
    offset += part.byteLength;
  }
  return sha256(aggregate);
}

function matchesReleaseBuild(
  build: JsonRecord | undefined,
  context: ArtifactContext,
): boolean {
  return Boolean(
    build &&
    build.code_sha === context.code_sha &&
    build.source_sha === context.code_sha &&
    build.site_release_id === context.site_release_id &&
    Number(build.site_release_sequence) ===
      Number(context.site_release_sequence) &&
    build.content_sha256 === context.content_sha256 &&
    build.manifest_sha256 === context.manifest_sha256 &&
    build.artifact_sha256 === context.artifact_fingerprint_sha256 &&
    build.build_environment_version === context.build_environment_version &&
    Number(build.content_schema_version) === Number(context.schema_version) &&
    Number(build.content_taxonomy_version) ===
      Number(context.taxonomy_version) &&
    build.content_serializer_version === context.serializer_version &&
    build.content_search_contract_version ===
      context.search_contract_version &&
    build.content_source_contract_version === context.source_contract_version &&
    CONTRACT_VERSION.test(String(build.content_serializer_version || "")) &&
    CONTRACT_VERSION.test(
      String(build.content_search_contract_version || ""),
    ) &&
    CONTRACT_VERSION.test(
      String(build.content_source_contract_version || ""),
    ) &&
    Object.entries(PINNED_TOOLCHAIN).every(
      ([field, value]) => build[field] === value,
    ) &&
    build.build_timezone === "UTC" &&
    build.build_locale === "C.UTF-8",
  );
}

function matchesBuild(
  build: JsonRecord | undefined,
  context: ArtifactContext,
  artifactFingerprint: string,
): boolean {
  return Boolean(
    matchesReleaseBuild(build, context) &&
      build?.hash_algorithm === "sha256-path-and-content-v1" &&
      build.artifact_sha256 === artifactFingerprint &&
      context.artifact_fingerprint_sha256 === artifactFingerprint,
  );
}

export async function parseContentAddressedArtifact(
  bytes: Uint8Array,
  context: ArtifactContext,
): Promise<ContentAddressedArtifact> {
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_ARTIFACT_MANIFEST_BYTES
  ) {
    throw new Error("Content-addressed artifact manifest size is invalid");
  }
  let value: JsonRecord;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as JsonRecord;
  } catch {
    throw new Error("Content-addressed artifact manifest is malformed");
  }
  const files = value.files;
  if (
    value.schema_version !== 1 ||
    value.hash_algorithm !== "sha256-content-addressed-pages-v1" ||
    !Array.isArray(files) ||
    files.length === 0 ||
    files.length > MAX_ARTIFACT_FILES ||
    Number(value.file_count) !== files.length
  ) {
    throw new Error("Content-addressed artifact contract is invalid");
  }
  const paths = new Set<string>();
  let totalBytes = 0;
  const normalized: ContentAddressedAsset[] = [];
  for (const candidate of files as JsonRecord[]) {
    const path = String(candidate.path || "");
    const byteLength = Number(candidate.byte_length);
    const contentSha256 = String(candidate.sha256 || "");
    const pagesHash = String(candidate.pages_hash || "");
    const objectKey = String(candidate.object_key || "");
    if (
      !safeArtifactPath(path) ||
      paths.has(path) ||
      !Number.isSafeInteger(byteLength) ||
      byteLength < 0 ||
      byteLength > MAX_ASSET_BYTES ||
      !SHA256.test(contentSha256) ||
      !/^[a-f0-9]{32}$/.test(pagesHash) ||
      objectKey !== `assets/sha256/${contentSha256}`
    ) {
      throw new Error("Content-addressed artifact asset is invalid");
    }
    paths.add(path);
    totalBytes += byteLength;
    normalized.push({
      path,
      byte_length: byteLength,
      sha256: contentSha256,
      pages_hash: pagesHash,
      object_key: objectKey,
    });
  }
  if (
    totalBytes !== Number(value.total_asset_bytes) ||
    totalBytes > MAX_CONTENT_ADDRESSED_BYTES ||
    !paths.has(ROUTE_MANIFEST)
  ) {
    throw new Error("Content-addressed artifact totals are invalid");
  }
  const fingerprint = await inventoryFingerprint(normalized);
  if (
    value.artifact_fingerprint_sha256 !== fingerprint ||
    !matchesBuild(value.build as JsonRecord | undefined, context, fingerprint)
  ) {
    throw new Error("Content-addressed artifact identity mismatch");
  }
  return {
    schema_version: 1,
    hash_algorithm: "sha256-content-addressed-pages-v1",
    build: value.build as JsonRecord,
    artifact_fingerprint_sha256: fingerprint,
    file_count: normalized.length,
    total_asset_bytes: totalBytes,
    files: normalized,
  };
}

async function artifactFingerprint(files: TarFile[]): Promise<string> {
  const parts: Uint8Array[] = [];
  for (const file of [...files]
    .filter((entry) => entry.path !== ROUTE_MANIFEST)
    .sort((left, right) => left.path.localeCompare(right.path))) {
    parts.push(
      new TextEncoder().encode(`${file.path}\0${await sha256(file.bytes)}\n`),
    );
  }
  const length = parts.reduce((sum, value) => sum + value.byteLength, 0);
  const aggregate = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    aggregate.set(part, offset);
    offset += part.byteLength;
  }
  return sha256(aggregate);
}

export async function verifyArtifactBytes(
  bytes: Uint8Array,
  context: ArtifactContext,
): Promise<TarFile[]> {
  if (
    bytes.byteLength !== Number(context.artifact_byte_length) ||
    (await sha256(bytes)) !== context.artifact_sha256
  ) {
    throw new Error("Immutable artifact byte hash mismatch");
  }
  const files = parseDeterministicTar(bytes);
  const routeFile = files.find((file) => file.path === ROUTE_MANIFEST);
  if (!routeFile) throw new Error("Artifact route manifest is missing");
  const routeManifest = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(routeFile.bytes),
  );
  const build = routeManifest?.build;
  if (!matchesBuild(build, context, await artifactFingerprint(files))) {
    throw new Error("Artifact embedded release identity mismatch");
  }
  return files;
}

async function cfApi<T>(
  url: string,
  init: RequestInit,
  token?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    result?: T;
    errors?: unknown;
  } | null;
  if (!response.ok || !payload?.success) {
    throw new Error(`Cloudflare API request failed (${response.status})`);
  }
  return payload.result as T;
}

export async function purgeContentCaches(
  env: Env,
): Promise<{ urls: string[] }> {
  const zoneId = String(env.CLOUDFLARE_ZONE_ID || "").trim();
  const urls = [
    ...new Set(
      String(env.CONTENT_API_PURGE_URLS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  if (
    !/^[a-f0-9]{32}$/i.test(zoneId) ||
    urls.length === 0 ||
    urls.length > 30 ||
    urls.some((value) => {
      try {
        return new URL(value).protocol !== "https:";
      } catch {
        return true;
      }
    })
  ) {
    throw new Error("Production cache purge is not configured");
  }
  await cfApi<JsonRecord>(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: urls }),
    },
    env.CLOUDFLARE_API_TOKEN,
  );
  return { urls };
}

async function fetchContentAddressedAsset(
  asset: ContentAddressedAsset,
  env: Env,
): Promise<Uint8Array> {
  const object = await env.ARTIFACTS.get(asset.object_key);
  if (!object || object.size !== asset.byte_length) {
    throw new Error("Content-addressed artifact asset is unavailable");
  }
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (
    (await sha256(bytes)) !== asset.sha256 ||
    pagesAssetHash({ path: asset.path, bytes }) !== asset.pages_hash
  ) {
    throw new Error("Content-addressed artifact asset hash mismatch");
  }
  return bytes;
}

export async function uploadPages(
  bundle: ArtifactBundle,
  context: ArtifactContext,
  env: Env,
): Promise<{ id: string; url: string }> {
  const api = "https://api.cloudflare.com/client/v4";
  const project = encodeURIComponent(env.PAGES_PROJECT);
  const account = encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID);
  const tokenResult = await cfApi<{ jwt: string }>(
    `${api}/accounts/${account}/pages/projects/${project}/upload-token`,
    { method: "GET" },
    env.CLOUDFLARE_API_TOKEN,
  );
  const uploadJwt = tokenResult.jwt;
  type UploadAsset = {
    path: string;
    hash: string;
    byteLength: number;
    bytes?: Uint8Array;
    source?: ContentAddressedAsset;
  };
  const specialPaths = new Set(["_headers", "_redirects"]);
  const assets: UploadAsset[] =
    bundle.kind === "tar"
      ? bundle.files
          .filter(
            (file) =>
              !specialPaths.has(file.path) && !file.path.endsWith("/.DS_Store"),
          )
          .map((file) => ({
            path: file.path,
            hash: pagesAssetHash(file),
            byteLength: file.bytes.byteLength,
            bytes: file.bytes,
          }))
      : bundle.manifest.files
          .filter(
            (file) =>
              !specialPaths.has(file.path) && !file.path.endsWith("/.DS_Store"),
          )
          .map((file) => ({
            path: file.path,
            hash: file.pages_hash,
            byteLength: file.byte_length,
            source: file,
          }));
  const missing = await cfApi<string[]>(
    `${api}/pages/assets/check-missing`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashes: assets.map((file) => file.hash) }),
    },
    uploadJwt,
  );
  const missingSet = new Set(missing);
  const pending = assets.filter((file) => missingSet.has(file.hash));
  const batches: UploadAsset[][] = [];
  let batch: UploadAsset[] = [];
  let batchBytes = 0;
  for (const asset of pending) {
    if (
      batch.length > 0 &&
      (batch.length >= 40 ||
        batchBytes + asset.byteLength > MAX_UPLOAD_BATCH_BYTES)
    ) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(asset);
    batchBytes += asset.byteLength;
  }
  if (batch.length) batches.push(batch);
  for (const pendingBatch of batches) {
    const resolved = [];
    for (const file of pendingBatch) {
      const bytes =
        file.bytes ||
        (file.source && (await fetchContentAddressedAsset(file.source, env)));
      if (!bytes) throw new Error("Artifact asset bytes are unavailable");
      resolved.push({ ...file, bytes });
    }
    await cfApi(
      `${api}/pages/assets/upload`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          resolved.map((file) => ({
            key: file.hash,
            value: base64(file.bytes),
            metadata: { contentType: contentType(file.path) },
            base64: true,
          })),
        ),
      },
      uploadJwt,
    );
  }
  await cfApi(
    `${api}/pages/assets/upsert-hashes`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hashes: assets.map((file) => file.hash) }),
    },
    uploadJwt,
  ).catch(() => undefined);
  const form = new FormData();
  form.set(
    "manifest",
    JSON.stringify(
      Object.fromEntries(assets.map((file) => [`/${file.path}`, file.hash])),
    ),
  );
  form.set("branch", env.PRODUCTION_BRANCH);
  form.set("commit_hash", context.code_sha);
  form.set("commit_dirty", "false");
  form.set(
    "commit_message",
    `content release ${context.site_release_sequence}`,
  );
  const specialFiles: TarFile[] = [];
  if (bundle.kind === "tar") {
    specialFiles.push(
      ...bundle.files.filter((file) => specialPaths.has(file.path)),
    );
  } else {
    for (const asset of bundle.manifest.files.filter((file) =>
      specialPaths.has(file.path),
    )) {
      specialFiles.push({
        path: asset.path,
        bytes: await fetchContentAddressedAsset(asset, env),
      });
    }
  }
  for (const file of specialFiles) {
    form.set(
      file.path,
      new Blob([file.bytes], { type: "text/plain; charset=utf-8" }),
      file.path,
    );
  }
  const deployment = await cfApi<JsonRecord>(
    `${api}/accounts/${account}/pages/projects/${project}/deployments`,
    { method: "POST", body: form },
    env.CLOUDFLARE_API_TOKEN,
  );
  const id = String(deployment.id || "");
  const url = String(deployment.url || "");
  if (!UUID.test(id) || !/^https:\/\//.test(url))
    throw new Error("Cloudflare returned invalid deployment identity");
  return { id, url };
}

function expectedRouteBuild(value: unknown, context: ArtifactContext): boolean {
  const build = (value as JsonRecord | null)?.build as JsonRecord | undefined;
  return matchesReleaseBuild(build, context);
}

function deployedRoute(path: string): string {
  if (path === "index.html") return "/";
  if (path.endsWith("/index.html"))
    return `/${path.slice(0, -"index.html".length)}`;
  return `/${path}`;
}

async function criticalArtifactFiles(
  bundle: ArtifactBundle,
  env: Env,
): Promise<TarFile[]> {
  const inventory =
    bundle.kind === "tar"
      ? bundle.files.map((file) => file.path)
      : bundle.manifest.files.map((file) => file.path);
  const dailyJson = inventory
    .filter((path) => /^data\/daily\/\d{4}-\d{2}-\d{2}\.json$/.test(path))
    .sort()
    .at(-1);
  if (!dailyJson)
    throw new Error("Artifact has no release-pinned daily JSON to verify");
  const date = dailyJson.slice("data/daily/".length, -".json".length);
  const dailyHtml = `daily/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}/index.html`;
  const required = ["index.html", dailyHtml, dailyJson, "search/index.json"];
  const files: TarFile[] = [];
  for (const path of required) {
    if (bundle.kind === "tar") {
      const file = bundle.files.find((candidate) => candidate.path === path);
      if (!file) throw new Error(`Artifact critical path is missing: ${path}`);
      files.push(file);
      continue;
    }
    const asset = bundle.manifest.files.find(
      (candidate) => candidate.path === path,
    );
    if (!asset) throw new Error(`Artifact critical path is missing: ${path}`);
    files.push({ path, bytes: await fetchContentAddressedAsset(asset, env) });
  }
  return files;
}

export async function verifyDeployment(
  context: ArtifactContext,
  deploymentUrl: string,
  env: Env,
  bundle: ArtifactBundle,
  windowStartedAt = Date.now(),
): Promise<JsonRecord> {
  const maximumInconsistencyMs = Number(
    env.MAX_PRODUCTION_INCONSISTENCY_MS || "60000",
  );
  if (
    !Number.isSafeInteger(maximumInconsistencyMs) ||
    maximumInconsistencyMs < 10_000 ||
    maximumInconsistencyMs > 300_000
  ) {
    throw new Error("Production inconsistency limit is invalid");
  }
  const remainingWindow = (): number => {
    const remaining = maximumInconsistencyMs - (Date.now() - windowStartedAt);
    if (remaining <= 0) {
      throw new Error("Production inconsistency window exceeded");
    }
    return remaining;
  };
  const configured = env.PRODUCTION_VERIFY_URLS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const bases = [...new Set([deploymentUrl, ...configured])];
  const minimum = Math.max(2, Number(env.VERIFY_MIN_ENDPOINTS || "2"));
  if (bases.length < minimum)
    throw new Error("Multi-endpoint production verification is not configured");
  const criticalFiles = await criticalArtifactFiles(bundle, env);
  const evidence: JsonRecord[] = [];
  for (const base of bases) {
    remainingWindow();
    const url = new URL(`/${ROUTE_MANIFEST}`, base);
    let verified = false;
    let colo: string | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const remaining = remainingWindow();
      url.searchParams.set(
        "release_probe",
        `${context.site_release_id}-${attempt}`,
      );
      const response = await fetch(url, {
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(Math.min(15_000, remaining)),
      });
      if (
        response.ok &&
        expectedRouteBuild(await response.json().catch(() => null), context)
      ) {
        colo = response.headers.get("cf-ray")?.split("-").at(-1) || null;
        verified = true;
        break;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(250 * 2 ** attempt, 2_000)),
      );
    }
    if (!verified)
      throw new Error(
        `Production release identity did not converge at ${url.origin}`,
      );
    for (const file of criticalFiles) {
      const expectedHash = await sha256(file.bytes);
      let exact = false;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const remaining = remainingWindow();
        const criticalUrl = new URL(deployedRoute(file.path), base);
        criticalUrl.searchParams.set(
          "release_probe",
          `${context.site_release_id}-${attempt}`,
        );
        const response = await fetch(criticalUrl, {
          headers: { "Cache-Control": "no-cache" },
          signal: AbortSignal.timeout(Math.min(15_000, remaining)),
        });
        const bytes = response.ok
          ? new Uint8Array(await response.arrayBuffer())
          : null;
        if (bytes && (await sha256(bytes)) === expectedHash) {
          exact = true;
          break;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(250 * 2 ** attempt, 2_000)),
        );
      }
      if (!exact)
        throw new Error(
          `Production critical artifact did not converge at ${url.origin}: ${file.path}`,
        );
    }
    evidence.push({
      url: url.origin,
      colo,
      exact_paths: criticalFiles.map((file) => deployedRoute(file.path)),
    });
  }
  remainingWindow();
  return {
    multi_edge_verified: true,
    site_release_id: context.site_release_id,
    site_release_sequence: context.site_release_sequence,
    manifest_sha256: context.manifest_sha256,
    content_sha256: context.content_sha256,
    artifact_sha256: context.artifact_sha256,
    artifact_fingerprint_sha256: context.artifact_fingerprint_sha256,
    code_sha: context.code_sha,
    build_environment_version: context.build_environment_version,
    convergence_elapsed_ms: Math.max(0, Date.now() - windowStartedAt),
    maximum_inconsistency_ms: maximumInconsistencyMs,
    endpoints: evidence,
  };
}

async function rpc(
  sql: ContentSql,
  query: Promise<readonly JsonRecord[]>,
  field = "result",
): Promise<JsonRecord> {
  const rows = await query;
  const value = rows[0]?.[field];
  if (!value || typeof value !== "object")
    throw new Error(`Content RPC ${field} returned no result`);
  return value as JsonRecord;
}

async function deployContext(
  sql: ContentSql,
  releaseId: string,
): Promise<ArtifactContext> {
  return rpc(
    sql,
    sql<JsonRecord[]>`
    select private.get_production_deploy_context_v1(${releaseId}::uuid) as result
  `,
  ) as unknown as ArtifactContext;
}

async function artifactFiles(
  context: ArtifactContext,
  env: Env,
): Promise<ArtifactBundle> {
  const object = await env.ARTIFACTS.get(context.artifact_object_key);
  if (!object || object.size !== Number(context.artifact_byte_length))
    throw new Error("Immutable R2 artifact unavailable");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if ((await sha256(bytes)) !== context.artifact_sha256) {
    throw new Error("Immutable artifact byte hash mismatch");
  }
  if (context.artifact_hash_algorithm === "sha256-deterministic-tar-v1") {
    return { kind: "tar", files: await verifyArtifactBytes(bytes, context) };
  }
  if (context.artifact_hash_algorithm !== "sha256-content-addressed-pages-v1") {
    throw new Error("Unsupported immutable artifact algorithm");
  }
  const manifest = await parseContentAddressedArtifact(bytes, context);
  const routeAsset = manifest.files.find(
    (file) => file.path === ROUTE_MANIFEST,
  );
  if (!routeAsset)
    throw new Error("Content-addressed route manifest is missing");
  const routeBytes = await fetchContentAddressedAsset(routeAsset, env);
  let routeManifest: JsonRecord;
  try {
    routeManifest = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(routeBytes),
    ) as JsonRecord;
  } catch {
    throw new Error("Content-addressed route manifest is malformed");
  }
  if (
    !matchesBuild(
      routeManifest.build as JsonRecord | undefined,
      context,
      manifest.artifact_fingerprint_sha256,
    )
  ) {
    throw new Error("Content-addressed route manifest identity mismatch");
  }
  return { kind: "content-addressed", manifest };
}

function validatePromotion(
  value: JsonRecord,
): asserts value is JsonRecord & ArtifactContext {
  if (
    !UUID.test(String(value.dispatch_id)) ||
    !UUID.test(String(value.site_release_id)) ||
    !Number.isSafeInteger(value.site_release_sequence) ||
    (value.expected_predecessor_id !== null &&
      value.expected_predecessor_id !== undefined &&
      !UUID.test(String(value.expected_predecessor_id))) ||
    !SHA256.test(String(value.artifact_sha256)) ||
    !/^artifacts\/sha256\/[a-f0-9]{64}\.(tar|json)$/.test(
      String(value.artifact_object_key),
    ) ||
    !SHA1.test(String(value.code_sha)) ||
    !SHA256.test(String(value.content_sha256)) ||
    typeof value.build_environment_version !== "string"
  ) {
    throw new Error("Invalid production promotion request");
  }
}

async function verifyWorkflowRequest(
  request: Request,
  env: Env,
): Promise<Uint8Array> {
  const timestampText = request.headers.get("X-Content-Timestamp") || "";
  const supplied = request.headers.get("X-Content-Signature") || "";
  const timestamp = Number(timestampText);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(Date.now() / 1000 - timestamp) > 60 ||
    !SHA256.test(supplied)
  ) {
    throw new Error("Unauthorized workflow request");
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > MAX_REQUEST_BYTES)
    throw new Error("Production request is too large");
  const signed = new Uint8Array(
    new TextEncoder().encode(`${timestampText}\n`).byteLength + body.byteLength,
  );
  const prefix = new TextEncoder().encode(`${timestampText}\n`);
  signed.set(prefix);
  signed.set(body, prefix.byteLength);
  if (!bytesEqual(await hmacHex(env.WORKFLOW_HMAC_SECRET, signed), supplied)) {
    throw new Error("Unauthorized workflow request");
  }
  return body;
}

function comparePromotion(context: ArtifactContext, request: JsonRecord): void {
  const predecessor = request.expected_predecessor_id ?? null;
  if (
    context.site_release_id !== request.site_release_id ||
    Number(context.site_release_sequence) !==
      Number(request.site_release_sequence) ||
    (context.expected_predecessor_id ?? null) !== predecessor ||
    context.artifact_sha256 !== request.artifact_sha256 ||
    context.artifact_object_key !== request.artifact_object_key ||
    context.code_sha !== request.code_sha ||
    context.content_sha256 !== request.content_sha256 ||
    context.build_environment_version !== request.build_environment_version
  ) {
    throw new Error(
      "Promotion request does not match immutable database state",
    );
  }
}

async function promote(request: Request, env: Env): Promise<Response> {
  let body: JsonRecord;
  try {
    body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await verifyWorkflowRequest(request, env),
      ),
    );
    validatePromotion(body);
  } catch {
    return json({ error: "unauthorized_or_invalid" }, 401);
  }
  const sql = openContentDatabase(env, "content-production-broker");
  let deploymentChanged = false;
  let authorization: JsonRecord | null = null;
  let context: ArtifactContext | null = null;
  try {
    context = await deployContext(sql, String(body.site_release_id));
    comparePromotion(context, body);
    if (context.current_site_release_id === context.site_release_id) {
      return json({
        ok: true,
        idempotent: true,
        site_release_id: context.site_release_id,
      });
    }
    authorization = await rpc(
      sql,
      sql<JsonRecord[]>`
      select private.authorize_production_promotion_v1(
        ${context.site_release_id}::uuid, ${Number(context.pointer_generation)},
        ${`broker:${String(body.dispatch_id)}`}, 600
      ) as result
    `,
    );
    const token = Number(authorization.fencing_token);
    const generation = Number(authorization.expected_pointer_generation);
    await sql`select private.mark_promotion_deploying_v1(${context.site_release_id}::uuid, ${token}, ${generation})`;
    const files = await artifactFiles(context, env);
    const deploymentStartedAt = Date.now();
    const deployment = await uploadPages(files, context, env);
    deploymentChanged = true;
    await sql`select private.mark_promotion_verifying_v1(
      ${context.site_release_id}::uuid, ${token}, ${generation}, ${deployment.id}
    )`;
    const evidence = await verifyDeployment(
      context,
      deployment.url,
      env,
      files,
      deploymentStartedAt,
    );
    await purgeContentCaches(env);
    const committed = await rpc(
      sql,
      sql<JsonRecord[]>`
      select private.commit_production_promotion_v1(
        ${context.site_release_id}::uuid, ${token}, ${generation}, ${deployment.id},
        ${context.manifest_sha256}, ${context.artifact_sha256}, ${context.build_environment_version},
        ${sql.json(evidence)}
      ) as result
    `,
    );
    return json({ ok: true, deployment_id: deployment.id, ...committed });
  } catch (error) {
    if (authorization && context) {
      const token = Number(authorization.fencing_token);
      const generation = Number(authorization.expected_pointer_generation);
      try {
        if (deploymentChanged && context.current_site_release_id) {
          const previous = await deployContext(
            sql,
            context.current_site_release_id,
          );
          const previousFiles = await artifactFiles(previous, env);
          const restored = await uploadPages(previousFiles, previous, env);
          const recovery = await verifyDeployment(
            previous,
            restored.url,
            env,
            previousFiles,
          );
          await sql`select private.finish_production_recovery_v1(
            ${context.site_release_id}::uuid, ${token}, ${generation}, true,
            ${sql.json({ ...recovery, restored_site_release_id: previous.site_release_id, deployment_id: restored.id })}
          )`;
        } else {
          await sql`select private.finish_production_recovery_v1(
            ${context.site_release_id}::uuid, ${token}, ${generation}, true,
            ${sql.json({ production_unchanged: true })}
          )`;
        }
      } catch {
        await sql`select private.finish_production_recovery_v1(
          ${context.site_release_id}::uuid, ${token}, ${generation}, false,
          ${sql.json({ recovery_failed: true })}
        )`.catch(() => undefined);
      }
    }
    console.error("[ContentBroker] promotion failed", {
      errorType: error instanceof Error ? error.name : "Error",
    });
    return json({ error: "promotion_failed" }, 503);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

type RollbackDependencies = {
  openDatabase?: typeof openContentDatabase;
  loadArtifact?: typeof artifactFiles;
  upload?: typeof uploadPages;
  verify?: typeof verifyDeployment;
  purge?: typeof purgeContentCaches;
};

export async function handleRollbackRequest(
  request: Request,
  env: Env,
  dependencies: RollbackDependencies = {},
): Promise<Response> {
  if (
    !bytesEqual(
      request.headers.get("X-Content-Control-Secret") || "",
      env.CONTROL_BROKER_SECRET,
    )
  ) {
    return json({ error: "unauthorized" }, 401);
  }
  let body: JsonRecord;
  try {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > MAX_REQUEST_BYTES) throw new Error("too large");
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (
      !UUID.test(String(body.target_site_release_id)) ||
      !Number.isSafeInteger(body.fencing_token) ||
      !Number.isSafeInteger(body.expected_pointer_generation)
    )
      throw new Error("invalid");
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const sql = (dependencies.openDatabase || openContentDatabase)(
    env,
    "content-production-rollback",
  );
  try {
    const context = (await rpc(
      sql,
      sql<JsonRecord[]>`
      select private.get_authorized_rollback_context_v1(
        ${String(body.target_site_release_id)}::uuid, ${Number(body.fencing_token)},
        ${Number(body.expected_pointer_generation)}
      ) as result
    `,
    )) as unknown as ArtifactContext;
    const artifact = await (dependencies.loadArtifact || artifactFiles)(
      context,
      env,
    );
    const deploymentStartedAt = Date.now();
    const deployment = await (dependencies.upload || uploadPages)(artifact, context, env);
    const evidence = await (dependencies.verify || verifyDeployment)(
      context,
      deployment.url,
      env,
      artifact,
      deploymentStartedAt,
    );
    await (dependencies.purge || purgeContentCaches)(env);
    const committed = await rpc(
      sql,
      sql<JsonRecord[]>`
      select private.commit_production_rollback_v1(
        ${context.site_release_id}::uuid, ${Number(body.fencing_token)},
        ${Number(body.expected_pointer_generation)}, ${deployment.id}, ${sql.json(evidence)}
      ) as result
    `,
    );
    return json({ ok: true, deployment_id: deployment.id, ...committed });
  } catch (error) {
    console.error("[ContentBroker] rollback failed", {
      errorType: error instanceof Error ? error.name : "Error",
    });
    return json({ error: "rollback_failed" }, 503);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

async function latestProductionDeployment(
  env: Env,
): Promise<{ id: string; url: string }> {
  const api = "https://api.cloudflare.com/client/v4";
  const result = await cfApi<JsonRecord[]>(
    `${api}/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/pages/projects/${encodeURIComponent(env.PAGES_PROJECT)}/deployments?env=production&page=1&per_page=1`,
    { method: "GET" },
    env.CLOUDFLARE_API_TOKEN,
  );
  const id = String(result[0]?.id || "");
  const url = String(result[0]?.url || "");
  if (!UUID.test(id) || !/^https:\/\//.test(url))
    throw new Error("No production Pages deployment is available");
  return { id, url };
}

export async function reconcileProduction(
  env: Env,
): Promise<"empty" | "committed" | "restored"> {
  const sql = openContentDatabase(env, "content-production-reconciler");
  try {
    const rows = await sql<
      JsonRecord[]
    >`select private.begin_production_reconcile_v1() as result`;
    const reconciliation = rows[0]?.result as JsonRecord | null;
    if (!reconciliation) return "empty";
    const slot = reconciliation.slot as JsonRecord;
    const target = reconciliation.target as unknown as ArtifactContext;
    const current = reconciliation.current as unknown as ArtifactContext | null;
    const deployment = await latestProductionDeployment(env);
    try {
      const targetFiles = await artifactFiles(target, env);
      const evidence = await verifyDeployment(
        target,
        deployment.url,
        env,
        targetFiles,
      );
      await purgeContentCaches(env);
      if (slot.operation === "forward") {
        await rpc(
          sql,
          sql<JsonRecord[]>`
          select private.commit_production_promotion_v1(
            ${target.site_release_id}::uuid, ${Number(slot.fencing_token)},
            ${Number(slot.expected_pointer_generation)}, ${deployment.id},
            ${target.manifest_sha256}, ${target.artifact_sha256}, ${target.build_environment_version},
            ${sql.json({ ...evidence, reconciled: true })}
          ) as result
        `,
        );
      } else {
        await rpc(
          sql,
          sql<JsonRecord[]>`
          select private.commit_production_rollback_v1(
            ${target.site_release_id}::uuid, ${Number(slot.fencing_token)},
            ${Number(slot.expected_pointer_generation)}, ${deployment.id},
            ${sql.json({ ...evidence, reconciled: true })}
          ) as result
        `,
        );
      }
      return "committed";
    } catch {
      if (!current)
        throw new Error("Reconciler has no last-known-good artifact");
      const currentFiles = await artifactFiles(current, env);
      const restorationStartedAt = Date.now();
      const restored = await uploadPages(currentFiles, current, env);
      const evidence = await verifyDeployment(
        current,
        restored.url,
        env,
        currentFiles,
        restorationStartedAt,
      );
      await sql`select private.finish_production_recovery_v1(
        ${target.site_release_id}::uuid, ${Number(slot.fencing_token)},
        ${Number(slot.expected_pointer_generation)}, true,
        ${sql.json({ ...evidence, reconciled: true, restored_site_release_id: current.site_release_id, deployment_id: restored.id })}
      )`;
      return "restored";
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method !== "POST")
      return Promise.resolve(json({ error: "method_not_allowed" }, 405));
    if (path === "/v1/promote") return promote(request, env);
    if (path === "/v1/rollback") return handleRollbackRequest(request, env);
    if (path === "/v1/reconcile") {
      if (
        !bytesEqual(
          request.headers.get("X-Content-Control-Secret") || "",
          env.CONTROL_BROKER_SECRET,
        )
      ) {
        return Promise.resolve(json({ error: "unauthorized" }, 401));
      }
      return reconcileProduction(env)
        .then((result) => json({ ok: true, result }))
        .catch(() => json({ error: "reconcile_failed" }, 503));
    }
    return Promise.resolve(json({ error: "not_found" }, 404));
  },
  scheduled(
    _controller: ScheduledController,
    env: Env,
    context: ExecutionContext,
  ): void {
    context.waitUntil(
      reconcileProduction(env).catch((error) => {
        console.error("[ContentBroker] reconcile failed", {
          errorType: error instanceof Error ? error.name : "Error",
        });
      }),
    );
  },
};
