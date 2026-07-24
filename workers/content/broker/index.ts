import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { Buffer } from "node:buffer";
import { openContentDatabase, type ContentSql } from "../shared/db";

type Env = {
  CONTENT_DB?: { connectionString?: string };
  CONTENT_DATABASE_URL?: string;
  ARTIFACTS: R2Bucket;
  PRODUCTION_COORDINATOR: DurableObjectNamespace;
  WORKFLOW_HMAC_SECRET: string;
  CONTROL_BROKER_SECRET: string;
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_ZONE_ID: string;
  CONTENT_API_PURGE_URLS: string;
  PAGES_PROJECT: string;
  PRODUCTION_BRANCH: string;
  PRODUCTION_VERIFY_URLS: string;
  TRANSFORMED_HTML_VERIFY_URLS?: string;
  VERIFY_MIN_ENDPOINTS?: string;
  VERIFY_MIN_EXACT_ENDPOINTS?: string;
  MAX_PRODUCTION_INCONSISTENCY_MS?: string;
};

type JsonRecord = Record<string, unknown>;
type CoordinatorOperationKind = "promote" | "rollback" | "reconcile";
type CoordinatorOperation = {
  id: string;
  kind: CoordinatorOperationKind;
  payload: JsonRecord | null;
  status: "queued" | "running" | "completed";
  attempts: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  response_status?: number;
  response_body?: string;
};
type CompletedCoordinatorOperation = {
  id: string;
  completed_at: string;
};
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
type VerificationFailure = {
  origin: string;
  phase: "release_identity" | "critical_artifact";
  path: string;
  status: number | null;
  error_type?: string;
  observed_site_release_id?: string | null;
  observed_site_release_sequence?: number | null;
  observed_code_sha?: string | null;
  observed_sha256?: string | null;
};
type VerificationDependencies = {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  maximumAttempts?: number;
  stabilityOffsetsMs?: number[];
};
type VerificationProbeResult =
  | { ok: true; evidence: JsonRecord }
  | { ok: false; failure: VerificationFailure };

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

function coordinatorPayloadIdentity(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(coordinatorPayloadIdentity).join(",")}]`;
  }
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${coordinatorPayloadIdentity(record[key])}`,
    )
    .join(",")}}`;
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
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    "base64",
  );
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
  for (let offset = 0; offset + 512 <= bytes.length;) {
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
    build.content_search_contract_version === context.search_contract_version &&
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
  // The workflow SHA-verifies each object after its conditional R2 upload,
  // and an indefinite object lock prevents replacement. The database-bound
  // inventory also requires object_key=assets/sha256/<sha>. Rehashing every
  // small asset again here can exceed the Free-plan CPU budget before Pages
  // receives the already verified bytes, so deployment verifies the immutable
  // object identity and length without repeating hundreds of digests.
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

class ProductionConvergenceError extends Error {
  readonly code = "production_convergence_timeout";
  readonly elapsedMs: number;
  readonly maximumInconsistencyMs: number;
  readonly failures: VerificationFailure[];

  constructor(
    elapsedMs: number,
    maximumInconsistencyMs: number,
    failures: VerificationFailure[],
  ) {
    const summary = failures
      .map(
        (failure) =>
          `${failure.origin}${failure.path} (${failure.phase}, status ${failure.status ?? "request_error"})`,
      )
      .join(", ");
    super(
      `Production deployment did not converge within ${maximumInconsistencyMs}ms: ${summary || "verification completed after the hard deadline"}`,
    );
    this.name = "ProductionConvergenceError";
    this.elapsedMs = elapsedMs;
    this.maximumInconsistencyMs = maximumInconsistencyMs;
    this.failures = failures;
  }
}

class ProductionStabilityError extends Error {
  readonly code = "production_stability_failed";
  readonly offsetMs: number;
  readonly failures: VerificationFailure[];

  constructor(offsetMs: number, failures: VerificationFailure[]) {
    const summary = failures
      .map(
        (failure) =>
          `${failure.origin}${failure.path} (${failure.phase}, status ${failure.status ?? "request_error"})`,
      )
      .join(", ");
    super(
      `Production deployment drifted during the ${offsetMs}ms stability probe: ${summary || "verification failed"}`,
    );
    this.name = "ProductionStabilityError";
    this.offsetMs = offsetMs;
    this.failures = failures;
  }
}

class ProductionVerificationTimeoutError extends Error {
  readonly code = "production_verification_timeout";
  readonly elapsedMs: number;
  readonly maximumOperationMs: number;

  constructor(elapsedMs: number, maximumOperationMs: number) {
    super(
      `Production verification exceeded its ${maximumOperationMs}ms operation budget`,
    );
    this.name = "ProductionVerificationTimeoutError";
    this.elapsedMs = elapsedMs;
    this.maximumOperationMs = maximumOperationMs;
  }
}

function errorDiagnostics(error: unknown): JsonRecord {
  if (error instanceof ProductionConvergenceError) {
    return {
      errorType: error.name,
      errorCode: error.code,
      elapsedMs: error.elapsedMs,
      maximumInconsistencyMs: error.maximumInconsistencyMs,
      failures: error.failures,
    };
  }
  if (error instanceof ProductionStabilityError) {
    return {
      errorType: error.name,
      errorCode: error.code,
      offsetMs: error.offsetMs,
      failures: error.failures,
    };
  }
  if (error instanceof ProductionVerificationTimeoutError) {
    return {
      errorType: error.name,
      errorCode: error.code,
      elapsedMs: error.elapsedMs,
      maximumOperationMs: error.maximumOperationMs,
    };
  }
  return {
    errorType: error instanceof Error ? error.name : "Error",
    errorMessage:
      error instanceof Error ? error.message.slice(0, 512) : "Unknown error",
  };
}

async function probeDeploymentOrigin(
  base: string,
  context: ArtifactContext,
  criticalFiles: Array<TarFile & { sha256: string }>,
  allowHtmlTransform: boolean,
  attempt: number,
  remainingMs: number,
  fetcher: typeof fetch,
): Promise<VerificationProbeResult> {
  const origin = new URL(base).origin;
  const manifestUrl = new URL(`/${ROUTE_MANIFEST}`, origin);
  manifestUrl.searchParams.set(
    "release_probe",
    `${context.site_release_id}-${attempt}`,
  );
  let manifestResponse: Response;
  try {
    manifestResponse = await fetcher(manifestUrl, {
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, remainingMs))),
    });
  } catch (error) {
    return {
      ok: false,
      failure: {
        origin,
        phase: "release_identity",
        path: `/${ROUTE_MANIFEST}`,
        status: null,
        error_type: error instanceof Error ? error.name : "Error",
      },
    };
  }
  const manifest = manifestResponse.ok
    ? await manifestResponse.json().catch(() => null)
    : null;
  if (!manifestResponse.ok || !expectedRouteBuild(manifest, context)) {
    const build = (manifest as JsonRecord | null)?.build as
      JsonRecord | undefined;
    return {
      ok: false,
      failure: {
        origin,
        phase: "release_identity",
        path: `/${ROUTE_MANIFEST}`,
        status: manifestResponse.status,
        observed_site_release_id:
          typeof build?.site_release_id === "string"
            ? build.site_release_id
            : null,
        observed_site_release_sequence: Number.isSafeInteger(
          Number(build?.site_release_sequence),
        )
          ? Number(build?.site_release_sequence)
          : null,
        observed_code_sha:
          typeof build?.code_sha === "string" ? build.code_sha : null,
      },
    };
  }

  const criticalResults = await Promise.all(
    criticalFiles.map(async (file): Promise<VerificationFailure | null> => {
      const path = deployedRoute(file.path);
      const criticalUrl = new URL(path, origin);
      criticalUrl.searchParams.set(
        "release_probe",
        `${context.site_release_id}-${attempt}`,
      );
      let response: Response;
      try {
        response = await fetcher(criticalUrl, {
          headers: { "Cache-Control": "no-cache" },
          signal: AbortSignal.timeout(
            Math.max(1, Math.min(15_000, remainingMs)),
          ),
        });
      } catch (error) {
        return {
          origin,
          phase: "critical_artifact",
          path,
          status: null,
          error_type: error instanceof Error ? error.name : "Error",
        };
      }
      const exactBytesRequired =
        !allowHtmlTransform || !file.path.endsWith(".html");
      if (response.ok && !exactBytesRequired) return null;
      const bytes = response.ok
        ? new Uint8Array(await response.arrayBuffer())
        : null;
      const observedHash = bytes ? await sha256(bytes) : null;
      return bytes && observedHash === file.sha256
        ? null
        : {
            origin,
            phase: "critical_artifact",
            path,
            status: response.status,
            observed_sha256: observedHash,
          };
    }),
  );
  const failure = criticalResults.find(
    (result): result is VerificationFailure => result !== null,
  );
  if (failure) return { ok: false, failure };
  return {
    ok: true,
    evidence: {
      url: origin,
      colo: manifestResponse.headers.get("cf-ray")?.split("-").at(-1) || null,
      attempts: attempt,
      available_paths: criticalFiles.map((file) => deployedRoute(file.path)),
      exact_paths: criticalFiles
        .filter((file) => !allowHtmlTransform || !file.path.endsWith(".html"))
        .map((file) => deployedRoute(file.path)),
      edge_transformed_html_paths: criticalFiles
        .filter((file) => allowHtmlTransform && file.path.endsWith(".html"))
        .map((file) => deployedRoute(file.path)),
    },
  };
}

export async function verifyDeployment(
  context: ArtifactContext,
  deploymentUrl: string,
  env: Env,
  bundle: ArtifactBundle,
  windowStartedAt = Date.now(),
  dependencies: VerificationDependencies = {},
): Promise<JsonRecord> {
  const now = dependencies.now || Date.now;
  const sleep =
    dependencies.sleep ||
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const fetcher = dependencies.fetch || fetch;
  const maximumAttempts = dependencies.maximumAttempts;
  if (
    maximumAttempts !== undefined &&
    (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1)
  ) {
    throw new Error("Maximum verification attempts is invalid");
  }
  const maximumInconsistencyMs = Number(
    env.MAX_PRODUCTION_INCONSISTENCY_MS || "240000",
  );
  if (
    !Number.isSafeInteger(maximumInconsistencyMs) ||
    maximumInconsistencyMs < 10_000 ||
    maximumInconsistencyMs > 300_000
  ) {
    throw new Error("Production inconsistency limit is invalid");
  }
  const remainingWindow = (): number => {
    const remaining = maximumInconsistencyMs - (now() - windowStartedAt);
    if (remaining <= 0) {
      throw new Error("Production inconsistency window exceeded");
    }
    return remaining;
  };
  const configured = env.PRODUCTION_VERIFY_URLS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const configuredOrigins = configured.map((value) => new URL(value).origin);
  const bases = [
    ...new Set([new URL(deploymentUrl).origin, ...configuredOrigins]),
  ];
  const minimum = Number(env.VERIFY_MIN_ENDPOINTS || "2");
  if (!Number.isSafeInteger(minimum) || minimum < 2) {
    throw new Error("Minimum production verifier count is invalid");
  }
  if (bases.length < minimum)
    throw new Error("Multi-endpoint production verification is not configured");
  const transformedHtmlOrigins = new Set(
    String(env.TRANSFORMED_HTML_VERIFY_URLS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => new URL(value).origin),
  );
  if (
    [...transformedHtmlOrigins].some(
      (origin) => !configuredOrigins.includes(origin),
    )
  ) {
    throw new Error(
      "HTML-transform verifier origin is not explicitly configured",
    );
  }
  const minimumExact = Number(env.VERIFY_MIN_EXACT_ENDPOINTS || "2");
  if (!Number.isSafeInteger(minimumExact) || minimumExact < 2) {
    throw new Error("Minimum exact-byte verifier count is invalid");
  }
  if (
    bases.filter((base) => !transformedHtmlOrigins.has(new URL(base).origin))
      .length < minimumExact
  ) {
    throw new Error("Multi-endpoint exact-byte verification is not configured");
  }
  remainingWindow();
  const criticalFiles = await Promise.all(
    (await criticalArtifactFiles(bundle, env)).map(async (file) => ({
      ...file,
      sha256: await sha256(file.bytes),
    })),
  );
  const evidenceByOrigin = new Map<string, JsonRecord>();
  const attemptsByOrigin = new Map(bases.map((base) => [base, 0]));
  let failures: VerificationFailure[] = [];
  let round = 0;
  while (evidenceByOrigin.size < bases.length) {
    const remaining = maximumInconsistencyMs - (now() - windowStartedAt);
    if (remaining <= 0) break;
    const pending = bases.filter((base) => !evidenceByOrigin.has(base));
    const results = await Promise.all(
      pending.map(async (base) => {
        const attempt = (attemptsByOrigin.get(base) || 0) + 1;
        attemptsByOrigin.set(base, attempt);
        return {
          base,
          result: await probeDeploymentOrigin(
            base,
            context,
            criticalFiles,
            transformedHtmlOrigins.has(new URL(base).origin),
            attempt,
            remaining,
            fetcher,
          ),
        };
      }),
    );
    failures = [];
    for (const { base, result } of results) {
      if (result.ok) evidenceByOrigin.set(base, result.evidence);
      else failures.push(result.failure);
    }
    if (evidenceByOrigin.size === bases.length) break;
    if (maximumAttempts !== undefined && round + 1 >= maximumAttempts) break;
    const remainingAfterProbe =
      maximumInconsistencyMs - (now() - windowStartedAt);
    if (remainingAfterProbe <= 0) break;
    const delay = Math.min(250 * 2 ** Math.min(round, 3), 2_000);
    await sleep(Math.min(delay, remainingAfterProbe));
    round += 1;
  }
  const convergenceElapsedMs = Math.max(0, now() - windowStartedAt);
  if (
    evidenceByOrigin.size !== bases.length ||
    convergenceElapsedMs > maximumInconsistencyMs
  ) {
    throw new ProductionConvergenceError(
      convergenceElapsedMs,
      maximumInconsistencyMs,
      failures,
    );
  }
  const stabilityOffsets = dependencies.stabilityOffsetsMs ?? [
    15_000, 45_000, 120_000,
  ];
  if (
    stabilityOffsets.some(
      (offset, index) =>
        !Number.isSafeInteger(offset) ||
        offset <= 0 ||
        (index > 0 && offset <= stabilityOffsets[index - 1]),
    )
  ) {
    throw new Error("Production stability offsets are invalid");
  }
  const firstConvergedAt = now();
  // The inconsistency deadline governs how long a new release may take to
  // converge for the first time. Stability probes intentionally run after
  // that point and therefore need a separate bounded operation budget.
  const finalStabilityOffset = stabilityOffsets.at(-1) || 0;
  const maximumOperationMs =
    maximumInconsistencyMs + finalStabilityOffset + 30_000;
  const remainingOperation = (): number => {
    const elapsed = now() - windowStartedAt;
    const remaining = maximumOperationMs - elapsed;
    if (remaining <= 0) {
      throw new ProductionVerificationTimeoutError(
        Math.max(0, elapsed),
        maximumOperationMs,
      );
    }
    return remaining;
  };
  const stabilityRounds: JsonRecord[] = [];
  for (const offsetMs of stabilityOffsets) {
    const targetTime = firstConvergedAt + offsetMs;
    const delay = targetTime - now();
    if (delay > 0) {
      const remaining = remainingOperation();
      if (delay >= remaining) {
        throw new ProductionVerificationTimeoutError(
          Math.max(0, now() - windowStartedAt),
          maximumOperationMs,
        );
      }
      await sleep(delay);
    }
    const remaining = remainingOperation();
    const stableResults = await Promise.all(
      bases.map(async (base) => {
        const attempt = (attemptsByOrigin.get(base) || 0) + 1;
        attemptsByOrigin.set(base, attempt);
        return {
          base,
          result: await probeDeploymentOrigin(
            base,
            context,
            [],
            transformedHtmlOrigins.has(new URL(base).origin),
            attempt,
            remaining,
            fetcher,
          ),
        };
      }),
    );
    const stabilityFailures = stableResults.flatMap(({ result }) =>
      result.ok ? [] : [result.failure],
    );
    if (stabilityFailures.length > 0) {
      throw new ProductionStabilityError(offsetMs, stabilityFailures);
    }
    stabilityRounds.push({
      offset_ms: offsetMs,
      verified_at: new Date(now()).toISOString(),
      endpoints: stableResults.map(({ result }) =>
        result.ok ? result.evidence : null,
      ),
    });
  }
  const stableVerifiedAt = new Date(now()).toISOString();
  const stabilityElapsedMs = Math.max(0, now() - firstConvergedAt);
  const operationElapsedMs = Math.max(0, now() - windowStartedAt);
  remainingOperation();
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
    convergence_elapsed_ms: convergenceElapsedMs,
    stability_elapsed_ms: stabilityElapsedMs,
    operation_elapsed_ms: operationElapsedMs,
    maximum_operation_ms: maximumOperationMs,
    stable_verified_at: stableVerifiedAt,
    stability_offsets: stabilityOffsets,
    stability_rounds: stabilityRounds,
    maximum_inconsistency_ms: maximumInconsistencyMs,
    endpoints: bases.map((base) => evidenceByOrigin.get(base)),
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

export function validatePromotion(
  value: JsonRecord,
): asserts value is JsonRecord & ArtifactContext {
  if (
    !UUID.test(String(value.dispatch_id)) ||
    !UUID.test(String(value.site_release_id)) ||
    !UUID.test(String(value.attempt_token)) ||
    !Number.isSafeInteger(value.execution_generation) ||
    Number(value.execution_generation) < 1 ||
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

export function isCommittedPromotionContext(
  context: ArtifactContext,
  targetSiteReleaseId: string,
  expectedPointerGeneration: number,
): boolean {
  return (
    context.current_site_release_id === targetSiteReleaseId &&
    Number(context.pointer_generation) === expectedPointerGeneration + 1
  );
}

async function rollbackPagesDeployment(
  deploymentId: string,
  env: Env,
): Promise<{ id: string; url: string }> {
  if (!UUID.test(deploymentId))
    throw new Error("Current Pages deployment identity is invalid");
  const api = "https://api.cloudflare.com/client/v4";
  const result = await cfApi<JsonRecord>(
    `${api}/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/pages/projects/${encodeURIComponent(env.PAGES_PROJECT)}/deployments/${deploymentId}/rollback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
    env.CLOUDFLARE_API_TOKEN,
  );
  const id = String(result.id || "");
  const url = String(result.url || "");
  if (!UUID.test(id) || !/^https:\/\//.test(url)) {
    throw new Error("Pages repair returned an unexpected deployment");
  }
  return { id, url };
}

type CurrentRepairDependencies = {
  loadArtifact?: typeof artifactFiles;
  latestDeployment?: typeof latestProductionDeployment;
  verify?: typeof verifyDeployment;
  rollbackDeployment?: typeof rollbackPagesDeployment;
  purge?: typeof purgeContentCaches;
};

export async function verifyOrRepairCurrentDeployment(
  context: ArtifactContext,
  sql: ContentSql,
  env: Env,
  dependencies: CurrentRepairDependencies = {},
): Promise<JsonRecord> {
  const loadArtifact = dependencies.loadArtifact || artifactFiles;
  const latestDeployment =
    dependencies.latestDeployment || latestProductionDeployment;
  const verify = dependencies.verify || verifyDeployment;
  const rollbackDeployment =
    dependencies.rollbackDeployment || rollbackPagesDeployment;
  const purge = dependencies.purge || purgeContentCaches;
  const pointer = await rpc(
    sql,
    sql<JsonRecord[]>`
      select private.get_current_pages_deployment_v1(
        ${context.site_release_id}::uuid
      ) as result
    `,
  );
  const expectedGeneration = Number(pointer.pointer_generation);
  const expectedDeploymentId = String(pointer.pages_deployment_id || "");
  const repairStillCurrent = async (): Promise<boolean> => {
    const refreshed = await rpc(
      sql,
      sql<JsonRecord[]>`
        select private.get_current_pages_deployment_v1(
          ${context.site_release_id}::uuid
        ) as result
      `,
    );
    return (
      Number(refreshed.pointer_generation) === expectedGeneration &&
      String(refreshed.pages_deployment_id || "") === expectedDeploymentId
    );
  };
  const superseded = (): JsonRecord => ({
    healthy: false,
    repaired: false,
    superseded: true,
    site_release_id: context.site_release_id,
    pointer_generation: expectedGeneration,
  });
  const files = await loadArtifact(context, env);
  const latest = await latestDeployment(env);
  try {
    const evidence = await verify(context, latest.url, env, files, undefined, {
      maximumAttempts: 1,
    });
    if (latest.id !== expectedDeploymentId) {
      if (!(await repairStillCurrent())) return superseded();
      await purge(env);
      await rpc(
        sql,
        sql<JsonRecord[]>`
          select private.record_current_pages_repair_v1(
            ${context.site_release_id}::uuid,
            ${expectedGeneration},
            ${latest.id},
            ${sql.json({
              ...evidence,
              repair_mode: "adopt_exact_deployment",
            })}
          ) as result
        `,
      );
      return {
        healthy: true,
        repaired: true,
        repair_mode: "adopt_exact_deployment",
        deployment_id: latest.id,
        evidence,
      };
    }
    return {
      healthy: true,
      repaired: false,
      deployment_id: latest.id,
      evidence,
    };
  } catch (error) {
    console.warn(
      "[ContentBroker] current pointer drifted from Pages; repairing exact deployment",
      {
        siteReleaseId: context.site_release_id,
        expectedDeploymentId,
        latestDeploymentId: latest.id,
        ...errorDiagnostics(error),
      },
    );
  }

  if (!(await repairStillCurrent())) return superseded();
  const repairStartedAt = Date.now();
  const repaired = await rollbackDeployment(expectedDeploymentId, env);
  const evidence = await verify(
    context,
    repaired.url,
    env,
    files,
    repairStartedAt,
  );
  await purge(env);
  await rpc(
    sql,
    sql<JsonRecord[]>`
      select private.record_current_pages_repair_v1(
        ${context.site_release_id}::uuid,
        ${expectedGeneration},
        ${repaired.id},
        ${sql.json({ ...evidence, repair_mode: "rollback_exact_deployment" })}
      ) as result
    `,
  );
  return {
    healthy: true,
    repaired: true,
    repair_mode: "rollback_exact_deployment",
    deployment_id: repaired.id,
    evidence,
  };
}

type PromotionDependencies = {
  openDatabase?: typeof openContentDatabase;
  loadArtifact?: typeof artifactFiles;
  upload?: typeof uploadPages;
  verify?: typeof verifyDeployment;
  purge?: typeof purgeContentCaches;
};

export async function performPromotion(
  body: JsonRecord,
  env: Env,
  dependencies: PromotionDependencies = {},
): Promise<Response> {
  const sql = (dependencies.openDatabase || openContentDatabase)(
    env,
    "content-production-broker",
  );
  let deploymentChanged = false;
  let authorization: JsonRecord | null = null;
  let context: ArtifactContext | null = null;
  let promotionStage = "load_context";
  try {
    context = await deployContext(sql, String(body.site_release_id));
    promotionStage = "compare_request";
    comparePromotion(context, body);
    promotionStage = "authorize_attempt";
    authorization = await rpc(
      sql,
      sql<JsonRecord[]>`
      select private.authorize_attempt_production_promotion_v1(
        ${context.site_release_id}::uuid,
        ${String(body.dispatch_id)}::uuid,
        ${String(body.attempt_token)}::uuid,
        ${Number(body.execution_generation)},
        ${Number(context.pointer_generation)},
        ${`broker:${String(body.dispatch_id)}:${String(body.attempt_token)}`},
        900,
        600
      ) as result
    `,
    );
    if (authorization.already_committed === true) {
      return json({
        ok: true,
        idempotent: true,
        site_release_id: context.site_release_id,
        generation: Number(authorization.expected_pointer_generation),
      });
    }
    const token = Number(authorization.fencing_token);
    const generation = Number(authorization.expected_pointer_generation);
    promotionStage = "mark_deploying";
    await sql`select private.mark_promotion_deploying_v1(${context.site_release_id}::uuid, ${token}, ${generation})`;
    promotionStage = "load_artifact";
    const files = await (dependencies.loadArtifact || artifactFiles)(
      context,
      env,
    );
    const deploymentStartedAt = Date.now();
    promotionStage = "upload_pages";
    const deployment = await (dependencies.upload || uploadPages)(
      files,
      context,
      env,
    );
    deploymentChanged = true;
    promotionStage = "mark_verifying";
    await sql`select private.mark_promotion_verifying_v1(
      ${context.site_release_id}::uuid, ${token}, ${generation}, ${deployment.id}
    )`;
    promotionStage = "verify_deployment";
    const evidence = await (dependencies.verify || verifyDeployment)(
      context,
      deployment.url,
      env,
      files,
      deploymentStartedAt,
    );
    promotionStage = "purge_caches";
    await (dependencies.purge || purgeContentCaches)(env);
    promotionStage = "commit_promotion";
    const committed = await rpc(
      sql,
      sql<JsonRecord[]>`
      select private.commit_attempt_production_promotion_v1(
        ${context.site_release_id}::uuid,
        ${String(body.dispatch_id)}::uuid,
        ${String(body.attempt_token)}::uuid,
        ${Number(body.execution_generation)},
        ${token}, ${generation}, ${deployment.id},
        ${context.manifest_sha256}, ${context.artifact_sha256}, ${context.build_environment_version},
        ${sql.json(evidence)}
      ) as result
    `,
    );
    return json({ ok: true, deployment_id: deployment.id, ...committed });
  } catch (error) {
    if (
      promotionStage === "commit_promotion" &&
      deploymentChanged &&
      authorization &&
      context
    ) {
      const generation = Number(authorization.expected_pointer_generation);
      try {
        const committedContext = await deployContext(
          sql,
          context.site_release_id,
        );
        if (
          isCommittedPromotionContext(
            committedContext,
            context.site_release_id,
            generation,
          )
        ) {
          return json({
            ok: true,
            idempotent: true,
            site_release_id: context.site_release_id,
            commit_response_recovered: true,
          });
        }
      } catch {
        // The commit result is ambiguous. Leave the verified target deployment
        // in place so the fenced reconciler can finish or recover it safely.
      }
      console.error("[ContentBroker] promotion commit result is ambiguous", {
        stage: promotionStage,
        ...errorDiagnostics(error),
      });
      return json(
        {
          error: "promotion_commit_ambiguous",
          stage: promotionStage,
          diagnostics: errorDiagnostics(error),
        },
        503,
      );
    }
    if (authorization && context) {
      const token = Number(authorization.fencing_token);
      const generation = Number(authorization.expected_pointer_generation);
      if (!deploymentChanged) {
        try {
          await sql`select private.finish_production_recovery_v1(
            ${context.site_release_id}::uuid, ${token}, ${generation}, true,
            ${sql.json({ production_unchanged: true })}
          )`;
        } catch {
          await sql`select private.finish_production_recovery_v1(
            ${context.site_release_id}::uuid, ${token}, ${generation}, false,
            ${sql.json({ recovery_failed: true })}
          )`.catch(() => undefined);
        }
      } else {
        // Once Pages may have changed, this execution never performs a cached
        // predecessor upload. The durable coordinator will run a fresh,
        // fenced reconcile after the lease expires.
        console.warn(
          "[ContentBroker] promotion requires fresh reconcile; cached compensation suppressed",
          {
            siteReleaseId: context.site_release_id,
            stage: promotionStage,
          },
        );
      }
    }
    console.error("[ContentBroker] promotion failed", {
      stage: promotionStage,
      ...errorDiagnostics(error),
    });
    return json(
      {
        error: "promotion_failed",
        stage: promotionStage,
        diagnostics: errorDiagnostics(error),
      },
      503,
    );
  } finally {
    await sql.end({ timeout: 2 });
  }
}

type RollbackDependencies = {
  openDatabase?: typeof openContentDatabase;
  loadArtifact?: typeof artifactFiles;
  upload?: typeof uploadPages;
  verify?: typeof verifyDeployment;
  latestDeployment?: typeof latestProductionDeployment;
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
    const verify = dependencies.verify || verifyDeployment;
    let deployment: ProductionDeployment | { id: string; url: string };
    let evidence: JsonRecord;
    try {
      const latest = await (
        dependencies.latestDeployment || latestProductionDeployment
      )(env);
      evidence = await verify(context, latest.url, env, artifact, undefined, {
        maximumAttempts: 1,
      });
      deployment = latest;
    } catch {
      const deploymentStartedAt = Date.now();
      deployment = await (dependencies.upload || uploadPages)(
        artifact,
        context,
        env,
      );
      evidence = await verify(
        context,
        deployment.url,
        env,
        artifact,
        deploymentStartedAt,
      );
    }
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

type ProductionDeployment = {
  id: string;
  url: string;
  commitHash: string;
  commitMessage: string;
};

async function latestProductionDeployment(
  env: Env,
): Promise<ProductionDeployment> {
  const api = "https://api.cloudflare.com/client/v4";
  const result = await cfApi<JsonRecord[]>(
    `${api}/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/pages/projects/${encodeURIComponent(env.PAGES_PROJECT)}/deployments?env=production&page=1&per_page=1`,
    { method: "GET" },
    env.CLOUDFLARE_API_TOKEN,
  );
  const id = String(result[0]?.id || "");
  const url = String(result[0]?.url || "");
  const trigger = result[0]?.deployment_trigger as JsonRecord | undefined;
  const metadata = trigger?.metadata as JsonRecord | undefined;
  const commitHash = String(metadata?.commit_hash || "");
  const commitMessage = String(metadata?.commit_message || "");
  if (
    !UUID.test(id) ||
    !/^https:\/\//.test(url) ||
    !SHA1.test(commitHash) ||
    !commitMessage
  ) {
    throw new Error("No production Pages deployment is available");
  }
  return { id, url, commitHash, commitMessage };
}

export function deploymentMatchesContext(
  deployment: ProductionDeployment,
  context: ArtifactContext,
): boolean {
  return (
    deployment.commitHash === context.code_sha &&
    deployment.commitMessage ===
      `content release ${context.site_release_sequence}`
  );
}

type ReconcileDependencies = {
  openDatabase?: typeof openContentDatabase;
  loadArtifact?: typeof artifactFiles;
  upload?: typeof uploadPages;
  verify?: typeof verifyDeployment;
  latestDeployment?: typeof latestProductionDeployment;
  rollbackDeployment?: typeof rollbackPagesDeployment;
  purge?: typeof purgeContentCaches;
};

export async function reconcileProduction(
  env: Env,
  dependencies: ReconcileDependencies = {},
): Promise<"empty" | "committed" | "restored" | "superseded"> {
  const sql = (dependencies.openDatabase || openContentDatabase)(
    env,
    "content-production-reconciler",
  );
  const loadArtifact = dependencies.loadArtifact || artifactFiles;
  const upload = dependencies.upload || uploadPages;
  const verify = dependencies.verify || verifyDeployment;
  const purge = dependencies.purge || purgeContentCaches;
  try {
    const rows = await sql<
      JsonRecord[]
    >`select private.begin_production_reconcile_v1() as result`;
    const reconciliation = rows[0]?.result as JsonRecord | null;
    if (!reconciliation) {
      const currentRows = await sql<
        JsonRecord[]
      >`select private.get_current_release_v1() as result`;
      const currentPointer = currentRows[0]?.result as JsonRecord | null;
      const currentReleaseId = String(currentPointer?.site_release_id || "");
      if (!UUID.test(currentReleaseId)) return "empty";
      const current = await deployContext(sql, currentReleaseId);
      const currentResult = await verifyOrRepairCurrentDeployment(
        current,
        sql,
        env,
        {
          loadArtifact,
          latestDeployment:
            dependencies.latestDeployment || latestProductionDeployment,
          verify,
          rollbackDeployment:
            dependencies.rollbackDeployment || rollbackPagesDeployment,
          purge,
        },
      );
      if (currentResult.superseded === true) return "superseded";
      return currentResult.repaired === true ? "restored" : "empty";
    }
    const slot = reconciliation.slot as JsonRecord;
    const target = reconciliation.target as unknown as ArtifactContext;
    const deployment = await (
      dependencies.latestDeployment || latestProductionDeployment
    )(env);
    const targetFiles = await loadArtifact(target, env);
    let targetEvidence: JsonRecord | null = null;
    try {
      // Recovery runs on the Free-plan 50-subrequest budget. Probe the
      // interrupted target once; if it has not already converged, preserve the
      // rest of this invocation for restoring and verifying last-known-good.
      targetEvidence = await verify(
        target,
        deployment.url,
        env,
        targetFiles,
        undefined,
        { maximumAttempts: 1 },
      );
    } catch (error) {
      console.warn("[ContentBroker] reconcile target did not verify", {
        ...errorDiagnostics(error),
      });
    }

    if (targetEvidence) {
      // A stale fence or pointer conflict after successful target verification
      // means another serialized operation won. It must never fall through to
      // a compensating upload based on a cached previous pointer.
      await purge(env);
      try {
        if (slot.operation === "forward") {
          await rpc(
            sql,
            sql<JsonRecord[]>`
          select private.commit_reconciled_production_promotion_v1(
            ${target.site_release_id}::uuid, ${Number(slot.fencing_token)},
            ${Number(slot.expected_pointer_generation)}, ${deployment.id},
            ${target.manifest_sha256}, ${target.artifact_sha256}, ${target.build_environment_version},
              ${sql.json({ ...targetEvidence, reconciled: true })}
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
              ${sql.json({ ...targetEvidence, reconciled: true })}
          ) as result
        `,
          );
        }
        return "committed";
      } catch (error) {
        console.warn(
          "[ContentBroker] reconcile commit was superseded; no compensating Pages write",
          {
            ...errorDiagnostics(error),
          },
        );
        return "superseded";
      }
    }

    // Refresh both the operation fence and the desired current pointer after
    // target verification fails. Never restore the pointer snapshot returned
    // by the initial reconcile claim.
    const refreshedRows = await sql<
      JsonRecord[]
    >`select private.get_promotion_reconcile_context_v1() as result`;
    const refreshed = refreshedRows[0]?.result as JsonRecord | null;
    const refreshedSlot = refreshed?.slot as JsonRecord | undefined;
    if (
      !refreshed ||
      Number(refreshedSlot?.fencing_token) !== Number(slot.fencing_token) ||
      Number(refreshedSlot?.expected_pointer_generation) !==
        Number(slot.expected_pointer_generation)
    ) {
      console.info(
        "[ContentBroker] reconcile recovery was superseded before Pages write",
      );
      return "superseded";
    }
    const current =
      (refreshed.current as unknown as ArtifactContext | null) || null;
    if (!current) {
      // A first-ever promotion can be terminated before Pages changes while
      // leaving the fenced slot in a deploying state. With no current
      // pointer there is nothing to restore; release the slot only after the
      // target failed verification against the latest production deployment.
      await sql`select private.finish_production_recovery_v1(
          ${target.site_release_id}::uuid, ${Number(slot.fencing_token)},
          ${Number(slot.expected_pointer_generation)}, true,
          ${sql.json({ production_unchanged: true, reconciled: true, no_current_release: true })}
        )`;
      return "restored";
    }
    const currentFiles = await loadArtifact(current, env);
    const reuseLatest = deploymentMatchesContext(deployment, current);
    const restorationStartedAt = reuseLatest ? undefined : Date.now();
    const restored = reuseLatest
      ? deployment
      : await upload(currentFiles, current, env);
    if (reuseLatest) {
      console.info(
        "[ContentBroker] reusing latest last-known-good deployment during recovery",
        {
          deploymentId: deployment.id,
          siteReleaseId: current.site_release_id,
          siteReleaseSequence: current.site_release_sequence,
        },
      );
    }
    const evidence = await verify(
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
  } finally {
    await sql.end({ timeout: 2 });
  }
}

const COORDINATOR_POLL_INTERVAL_MS = 1_000;
const COORDINATOR_WAIT_TIMEOUT_MS = 15 * 60 * 1_000;
const COORDINATOR_QUEUE_KEY = "production-operation-queue";
const COORDINATOR_ACTIVE_KEY = "production-operation-active";
const COORDINATOR_PENDING_RECONCILE_KEY =
  "production-operation-pending-reconcile";
const COORDINATOR_COMPLETED_KEY = "production-operation-completed";
const COORDINATOR_WATCHDOG_MS = 60_000;
const COORDINATOR_RETENTION_MS = 24 * 60 * 60 * 1_000;

function coordinatorOperationKey(id: string): string {
  return `production-operation:${id}`;
}

async function executeCoordinatorOperation(
  operation: CoordinatorOperation,
  env: Env,
): Promise<Response> {
  if (operation.kind === "promote") {
    if (!operation.payload)
      return json({ error: "coordinator_payload_missing" }, 500);
    return performPromotion(operation.payload, env);
  }
  if (operation.kind === "rollback") {
    if (!operation.payload)
      return json({ error: "coordinator_payload_missing" }, 500);
    return handleRollbackRequest(
      new Request("https://production-coordinator.internal/v1/rollback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Content-Control-Secret": env.CONTROL_BROKER_SECRET,
        },
        body: JSON.stringify(operation.payload),
      }),
      env,
    );
  }
  const result = await reconcileProduction(env);
  return json({ ok: true, result });
}

/**
 * The only runtime allowed to call production Pages mutation helpers.
 *
 * Fetch handlers only enqueue and inspect durable state. The alarm drains one
 * operation at a time, so promote, rollback, reconcile and repair work cannot
 * overlap even when ordinary Worker requests interleave across awaits.
 */
export class ProductionCoordinator {
  private alarmRunning = false;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
    private readonly execute: typeof executeCoordinatorOperation = executeCoordinatorOperation,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/internal/enqueue") {
      let input: JsonRecord;
      try {
        input = (await request.json()) as JsonRecord;
      } catch {
        return json({ error: "invalid_request" }, 400);
      }
      const kind = String(input.kind || "") as CoordinatorOperationKind;
      if (!["promote", "rollback", "reconcile"].includes(kind)) {
        return json({ error: "invalid_operation_kind" }, 400);
      }
      const payload =
        input.payload && typeof input.payload === "object"
          ? (input.payload as JsonRecord)
          : null;
      if (kind !== "reconcile" && !payload) {
        return json({ error: "operation_payload_required" }, 400);
      }
      // A deployment attempt is already a fenced UUID. Reuse it as the
      // promotion operation identity so a replayed signed request cannot
      // enqueue duplicate work if the original 202 response was lost.
      const promotionAttemptId =
        kind === "promote" && UUID.test(String(payload?.attempt_token || ""))
          ? String(payload?.attempt_token)
          : null;
      const id = promotionAttemptId || crypto.randomUUID();
      const now = new Date().toISOString();
      const operation: CoordinatorOperation = {
        id,
        kind,
        payload,
        status: "queued",
        attempts: 0,
        created_at: now,
        updated_at: now,
      };
      let acceptedId = id;
      let deduplicated = false;
      let idempotencyConflict = false;
      const retentionCutoff = Date.now() - COORDINATOR_RETENTION_MS;
      await this.state.storage.transaction(async (transaction) => {
        if (promotionAttemptId) {
          let existing = await transaction.get<CoordinatorOperation>(
            coordinatorOperationKey(id),
          );
          if (
            existing?.status === "completed" &&
            existing.completed_at &&
            Date.parse(existing.completed_at) < retentionCutoff
          ) {
            await transaction.delete(coordinatorOperationKey(id));
            const completed =
              (await transaction.get<CompletedCoordinatorOperation[]>(
                COORDINATOR_COMPLETED_KEY,
              )) || [];
            await transaction.put(
              COORDINATOR_COMPLETED_KEY,
              completed.filter((item) => item.id !== id),
            );
            existing = undefined;
          }
          if (existing) {
            if (
              existing.kind !== kind ||
              coordinatorPayloadIdentity(existing.payload) !==
                coordinatorPayloadIdentity(payload)
            ) {
              idempotencyConflict = true;
              return;
            }
            acceptedId = existing.id;
            deduplicated = true;
            return;
          }
        }
        if (kind === "reconcile") {
          const pendingId = await transaction.get<string>(
            COORDINATOR_PENDING_RECONCILE_KEY,
          );
          if (pendingId) {
            const pending = await transaction.get<CoordinatorOperation>(
              coordinatorOperationKey(pendingId),
            );
            if (pending && pending.status !== "completed") {
              acceptedId = pendingId;
              deduplicated = true;
              return;
            }
            await transaction.delete(COORDINATOR_PENDING_RECONCILE_KEY);
          }
        }
        const queue =
          (await transaction.get<string[]>(COORDINATOR_QUEUE_KEY)) || [];
        queue.push(id);
        await transaction.put(coordinatorOperationKey(id), operation);
        await transaction.put(COORDINATOR_QUEUE_KEY, queue);
        if (kind === "reconcile") {
          await transaction.put(COORDINATOR_PENDING_RECONCILE_KEY, id);
        }
      });
      if (idempotencyConflict) {
        return json({ error: "coordinator_idempotency_conflict" }, 409);
      }
      await this.pruneCompletedOperations();
      await this.state.storage.setAlarm(Date.now());
      return json({ ok: true, operation_id: acceptedId, deduplicated }, 202);
    }

    const match = /^\/internal\/operations\/([0-9a-f-]{36})$/i.exec(
      url.pathname,
    );
    if (request.method === "GET" && match) {
      const operation = await this.state.storage.get<CoordinatorOperation>(
        coordinatorOperationKey(match[1]),
      );
      return operation
        ? json({ ok: true, operation })
        : json({ error: "operation_not_found" }, 404);
    }
    return json({ error: "not_found" }, 404);
  }

  async alarm(): Promise<void> {
    if (this.alarmRunning) return;
    this.alarmRunning = true;
    try {
      let activeId = await this.state.storage.get<string>(
        COORDINATOR_ACTIVE_KEY,
      );
      const queue =
        (await this.state.storage.get<string[]>(COORDINATOR_QUEUE_KEY)) || [];
      if (!activeId) activeId = queue[0];
      if (!activeId) return;

      const key = coordinatorOperationKey(activeId);
      const operation = await this.state.storage.get<CoordinatorOperation>(key);
      if (!operation) {
        await this.finishMissingOperation(activeId);
        return;
      }
      if (operation.status === "completed") {
        await this.finishOperation(operation);
        return;
      }

      operation.status = "running";
      operation.attempts = Number(operation.attempts || 0) + 1;
      operation.updated_at = new Date().toISOString();
      await this.state.storage.put(COORDINATOR_ACTIVE_KEY, activeId);
      await this.state.storage.put(key, operation);
      // An alarm normally retries automatically after an uncaught runtime
      // failure. Persist an explicit watchdog as well so an isolate reset after
      // a Pages side effect cannot strand the active operation indefinitely.
      await this.state.storage.setAlarm(Date.now() + COORDINATOR_WATCHDOG_MS);

      let response: Response;
      try {
        response = await this.execute(operation, this.env);
      } catch (error) {
        console.error("[ContentBroker] coordinator operation failed", {
          operationId: operation.id,
          kind: operation.kind,
          ...errorDiagnostics(error),
        });
        response = json(
          {
            error: "coordinator_operation_failed",
            diagnostics: errorDiagnostics(error),
          },
          503,
        );
      }
      operation.status = "completed";
      operation.response_status = response.status;
      operation.response_body = await response.text();
      operation.completed_at = new Date().toISOString();
      operation.updated_at = operation.completed_at;
      await this.state.storage.put(key, operation);
      await this.finishOperation(operation);
    } finally {
      this.alarmRunning = false;
    }
  }

  private async finishOperation(
    operation: CoordinatorOperation,
  ): Promise<void> {
    let hasMore = false;
    await this.state.storage.transaction(async (transaction) => {
      const queue =
        (await transaction.get<string[]>(COORDINATOR_QUEUE_KEY)) || [];
      const remaining = queue.filter((candidate) => candidate !== operation.id);
      hasMore = remaining.length > 0;
      await transaction.put(COORDINATOR_QUEUE_KEY, remaining);
      await transaction.delete(COORDINATOR_ACTIVE_KEY);
      if (operation.kind === "reconcile") {
        const pending = await transaction.get<string>(
          COORDINATOR_PENDING_RECONCILE_KEY,
        );
        if (pending === operation.id) {
          await transaction.delete(COORDINATOR_PENDING_RECONCILE_KEY);
        }
      }
      const completed =
        (await transaction.get<CompletedCoordinatorOperation[]>(
          COORDINATOR_COMPLETED_KEY,
        )) || [];
      completed.push({
        id: operation.id,
        completed_at: operation.completed_at || new Date().toISOString(),
      });
      await transaction.put(COORDINATOR_COMPLETED_KEY, completed);
    });
    await this.pruneCompletedOperations();
    if (hasMore) {
      await this.state.storage.setAlarm(Date.now());
    }
  }

  private async finishMissingOperation(id: string): Promise<void> {
    let hasMore = false;
    await this.state.storage.transaction(async (transaction) => {
      const queue =
        (await transaction.get<string[]>(COORDINATOR_QUEUE_KEY)) || [];
      const remaining = queue.filter((candidate) => candidate !== id);
      hasMore = remaining.length > 0;
      await transaction.put(COORDINATOR_QUEUE_KEY, remaining);
      await transaction.delete(COORDINATOR_ACTIVE_KEY);
      const pending = await transaction.get<string>(
        COORDINATOR_PENDING_RECONCILE_KEY,
      );
      if (pending === id) {
        await transaction.delete(COORDINATOR_PENDING_RECONCILE_KEY);
      }
    });
    if (hasMore) {
      await this.state.storage.setAlarm(Date.now());
    }
  }

  private async pruneCompletedOperations(): Promise<void> {
    const cutoff = Date.now() - COORDINATOR_RETENTION_MS;
    await this.state.storage.transaction(async (transaction) => {
      const completed =
        (await transaction.get<CompletedCoordinatorOperation[]>(
          COORDINATOR_COMPLETED_KEY,
        )) || [];
      const retained: CompletedCoordinatorOperation[] = [];
      for (const item of completed) {
        if (Date.parse(item.completed_at) >= cutoff) {
          retained.push(item);
        } else {
          await transaction.delete(coordinatorOperationKey(item.id));
        }
      }
      await transaction.put(COORDINATOR_COMPLETED_KEY, retained);
    });
  }
}

async function enqueueCoordinatorOperation(
  env: Env,
  kind: CoordinatorOperationKind,
  payload: JsonRecord | null = null,
) {
  if (!env.PRODUCTION_COORDINATOR) {
    return {
      response: json({ error: "production_coordinator_unavailable" }, 503),
      stub: null,
      operationId: null,
    };
  }
  const id = env.PRODUCTION_COORDINATOR.idFromName(
    `pages-project:${env.PAGES_PROJECT}`,
  );
  const stub = env.PRODUCTION_COORDINATOR.get(id);
  const enqueued = await stub.fetch(
    new Request("https://production-coordinator.internal/internal/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, payload }),
    }),
  );
  if (!enqueued.ok) {
    return { response: enqueued, stub: null, operationId: null };
  }
  const accepted = (await enqueued.json()) as JsonRecord;
  const operationId = String(accepted.operation_id || "");
  if (!UUID.test(operationId)) {
    return {
      response: json({ error: "invalid_coordinator_response" }, 503),
      stub: null,
      operationId: null,
    };
  }
  return {
    response: json(accepted, enqueued.status),
    stub,
    operationId,
  };
}

async function submitCoordinatorOperation(
  env: Env,
  kind: CoordinatorOperationKind,
  payload: JsonRecord | null = null,
): Promise<Response> {
  const enqueued = await enqueueCoordinatorOperation(env, kind, payload);
  if (!enqueued.stub || !enqueued.operationId) return enqueued.response;
  const { stub, operationId } = enqueued;

  const deadline = Date.now() + COORDINATOR_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await stub.fetch(
      new Request(
        `https://production-coordinator.internal/internal/operations/${operationId}`,
      ),
    );
    if (!status.ok) return status;
    const result = (await status.json()) as {
      operation?: CoordinatorOperation;
    };
    if (result.operation?.status === "completed") {
      return new Response(result.operation.response_body || "", {
        status: result.operation.response_status || 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
    await new Promise((resolve) =>
      setTimeout(resolve, COORDINATOR_POLL_INTERVAL_MS),
    );
  }
  return json(
    { error: "coordinator_wait_timeout", operation_id: operationId },
    504,
  );
}

async function handleCoordinatorOperationStatusRequest(
  request: Request,
  env: Env,
  operationId: string,
): Promise<Response> {
  let body: JsonRecord;
  try {
    body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await verifyWorkflowRequest(request, env),
      ),
    ) as JsonRecord;
  } catch {
    return json({ error: "unauthorized_or_invalid" }, 401);
  }
  const requestedOperationId = String(body.operation_id || "");
  const siteReleaseId = String(body.site_release_id || "");
  if (
    !UUID.test(operationId) ||
    requestedOperationId !== operationId ||
    !UUID.test(siteReleaseId)
  ) {
    return json({ error: "invalid_request" }, 400);
  }
  if (!env.PRODUCTION_COORDINATOR) {
    return json({ error: "production_coordinator_unavailable" }, 503);
  }
  const id = env.PRODUCTION_COORDINATOR.idFromName(
    `pages-project:${env.PAGES_PROJECT}`,
  );
  const stub = env.PRODUCTION_COORDINATOR.get(id);
  const status = await stub.fetch(
    new Request(
      `https://production-coordinator.internal/internal/operations/${operationId}`,
    ),
  );
  if (!status.ok) {
    return status.status === 404
      ? json({ error: "operation_not_found" }, 404)
      : json({ error: "coordinator_status_unavailable" }, 503);
  }
  const result = (await status.json()) as {
    operation?: CoordinatorOperation;
  };
  const operation = result.operation;
  if (
    !operation ||
    operation.id !== operationId ||
    operation.kind !== "promote" ||
    String(operation.payload?.site_release_id || "") !== siteReleaseId
  ) {
    // Do not disclose whether an operation exists when the caller cannot
    // prove the release identity that was present in the signed promotion.
    return json({ error: "operation_not_found" }, 404);
  }
  if (operation.status !== "completed") {
    return json(
      {
        ok: true,
        operation_id: operation.id,
        site_release_id: siteReleaseId,
        status: operation.status,
        attempts: operation.attempts,
      },
      202,
    );
  }
  return new Response(operation.response_body || "", {
    status: operation.response_status || 500,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Operation-Status": "completed",
      "X-Content-Operation-Id": operation.id,
    },
  });
}

async function handlePromotionRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: JsonRecord;
  try {
    body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await verifyWorkflowRequest(request, env),
      ),
    ) as JsonRecord;
    validatePromotion(body);
  } catch {
    return json({ error: "unauthorized_or_invalid" }, 401);
  }
  const enqueued = await enqueueCoordinatorOperation(env, "promote", body);
  if (!enqueued.stub || !enqueued.operationId) return enqueued.response;
  return json(
    {
      ok: true,
      operation_id: enqueued.operationId,
      site_release_id: String(body.site_release_id),
      status: "queued",
    },
    202,
  );
}

async function handleCoordinatedRollbackRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  if (
    !bytesEqual(
      request.headers.get("X-Content-Control-Secret") || "",
      env.CONTROL_BROKER_SECRET,
    )
  ) {
    return json({ error: "unauthorized" }, 401);
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_REQUEST_BYTES)
    return json({ error: "payload_too_large" }, 413);
  let payload: JsonRecord;
  try {
    payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as JsonRecord;
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  return submitCoordinatorOperation(env, "rollback", payload);
}

async function handleCoordinatedReconcileRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  if (
    !bytesEqual(
      request.headers.get("X-Content-Control-Secret") || "",
      env.CONTROL_BROKER_SECRET,
    )
  ) {
    return json({ error: "unauthorized" }, 401);
  }
  return submitCoordinatorOperation(env, "reconcile");
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method !== "POST")
      return Promise.resolve(json({ error: "method_not_allowed" }, 405));
    if (path === "/v1/promote") return handlePromotionRequest(request, env);
    const operationMatch = /^\/v1\/operations\/([0-9a-f-]{36})$/i.exec(path);
    if (operationMatch) {
      return handleCoordinatorOperationStatusRequest(
        request,
        env,
        operationMatch[1],
      );
    }
    if (path === "/v1/rollback")
      return handleCoordinatedRollbackRequest(request, env);
    if (path === "/v1/reconcile")
      return handleCoordinatedReconcileRequest(request, env);
    return Promise.resolve(json({ error: "not_found" }, 404));
  },
  scheduled(
    _controller: ScheduledController,
    env: Env,
    context: ExecutionContext,
  ): void {
    context.waitUntil(
      enqueueCoordinatorOperation(env, "reconcile")
        .then(({ response }) => {
          if (!response.ok) {
            throw new Error(
              `Production reconcile enqueue failed with ${response.status}`,
            );
          }
        })
        .catch((error) => {
          console.error("[ContentBroker] reconcile enqueue failed", {
            ...errorDiagnostics(error),
          });
        }),
    );
  },
};
