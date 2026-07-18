import { execFileSync } from "node:child_process";

export const PINNED_TOOLCHAIN = Object.freeze({
  node_version: "v22.17.0",
  npm_version: "10.9.2",
  astro_version: "7.0.9",
  hugo_version: "0.147.9",
});
export const PINNED_BUILD_LOCALE = "C.UTF-8";
export const PINNED_BUILD_TIMEZONE = "UTC";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const SHA1 = /^[a-f0-9]{40}$/;
const CONTRACT_VERSION = /^[a-z0-9][a-z0-9._-]{0,127}$/i;

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error(`Invalid ${name}`);
  return number;
}

function contractVersion(value, name) {
  if (typeof value !== "string" || !CONTRACT_VERSION.test(value))
    throw new Error(`Invalid ${name}`);
  return value;
}

export function readNpmVersion() {
  const value = execFileSync("npm", ["--version"], {
    encoding: "utf8",
  }).trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(value))
    throw new Error(`Invalid npm version: ${value}`);
  return value;
}

export function contentContractFromManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
    throw new Error("Site manifest content contract is malformed");
  return {
    content_schema_version: positiveInteger(
      manifest.content_schema_version ?? manifest.schema_version,
      "content schema version",
    ),
    content_taxonomy_version: positiveInteger(
      manifest.content_taxonomy_version ?? manifest.taxonomy_version,
      "content taxonomy version",
    ),
    content_serializer_version: contractVersion(
      manifest.content_serializer_version ?? manifest.serializer_version,
      "content serializer version",
    ),
    content_search_contract_version: contractVersion(
      manifest.content_search_contract_version ??
        manifest.search_contract_version,
      "content search contract version",
    ),
    content_source_contract_version: contractVersion(
      manifest.content_source_contract_version ??
        manifest.source_contract_version ??
        manifest.daily_source_contract_version,
      "content source contract version",
    ),
  };
}

export function contentContractFromEnvironment(environment = process.env) {
  return contentContractFromManifest({
    content_schema_version: environment.CONTENT_SCHEMA_VERSION,
    content_taxonomy_version: environment.CONTENT_TAXONOMY_VERSION,
    content_serializer_version: environment.CONTENT_SERIALIZER_VERSION,
    content_search_contract_version:
      environment.CONTENT_SEARCH_CONTRACT_VERSION,
    content_source_contract_version:
      environment.CONTENT_SOURCE_CONTRACT_VERSION,
  });
}

export function assertPinnedToolchain(
  nodeVersion = process.version,
  npmVersion = readNpmVersion(),
) {
  if (nodeVersion !== PINNED_TOOLCHAIN.node_version)
    throw new Error(
      `Pinned builds require Node ${PINNED_TOOLCHAIN.node_version.slice(1)}, received ${nodeVersion.slice(1)}`,
    );
  if (npmVersion !== PINNED_TOOLCHAIN.npm_version)
    throw new Error(
      `Pinned builds require npm ${PINNED_TOOLCHAIN.npm_version}, received ${npmVersion}`,
    );
}

export function assertPinnedProcessEnvironment(environment = process.env) {
  if (environment.TZ !== PINNED_BUILD_TIMEZONE)
    throw new Error(`Pinned builds require TZ=${PINNED_BUILD_TIMEZONE}`);
  if (
    environment.LANG !== PINNED_BUILD_LOCALE ||
    environment.LC_ALL !== PINNED_BUILD_LOCALE
  )
    throw new Error(
      `Pinned builds require LANG and LC_ALL=${PINNED_BUILD_LOCALE}`,
    );
}

export function assertRouteBuildContract(
  build,
  { pinned = Boolean(build?.site_release_id), expected = null } = {},
) {
  if (!build || typeof build !== "object" || Array.isArray(build))
    throw new Error("Route manifest build contract is missing");
  if (
    !SHA1.test(String(build.code_sha || "")) ||
    build.source_sha !== build.code_sha
  )
    throw new Error("Route manifest code SHA is invalid");
  if (build.hash_algorithm !== "sha256-path-and-content-v1")
    throw new Error("Route manifest artifact hash algorithm is invalid");
  if (!SHA256.test(String(build.artifact_sha256 || "")))
    throw new Error("Route manifest artifact fingerprint is invalid");
  for (const [field, value] of Object.entries(PINNED_TOOLCHAIN)) {
    if (typeof build[field] !== "string" || !build[field])
      throw new Error(`Route manifest ${field} is missing`);
    if (pinned && build[field] !== value)
      throw new Error(`Route manifest ${field} is not pinned to ${value}`);
  }
  for (const [field, value] of [
    ["build_timezone", PINNED_BUILD_TIMEZONE],
    ["build_locale", PINNED_BUILD_LOCALE],
  ]) {
    if (typeof build[field] !== "string" || !build[field])
      throw new Error(`Route manifest ${field} is missing`);
    if (pinned && build[field] !== value)
      throw new Error(`Route manifest ${field} is not pinned to ${value}`);
  }
  if (!pinned) return null;
  if (!UUID.test(String(build.site_release_id || "")))
    throw new Error("Route manifest site release ID is invalid");
  if (!Number.isSafeInteger(build.site_release_sequence) || build.site_release_sequence < 1)
    throw new Error("Route manifest site release sequence is invalid");
  for (const field of ["content_sha256", "manifest_sha256"])
    if (!SHA256.test(String(build[field] || "")))
      throw new Error(`Route manifest ${field} is invalid`);
  if (
    typeof build.build_environment_version !== "string" ||
    !CONTRACT_VERSION.test(build.build_environment_version)
  )
    throw new Error("Route manifest build environment version is invalid");
  const content = contentContractFromManifest(build);
  if (expected) {
    for (const [field, value] of Object.entries(expected)) {
      if (build[field] !== value)
        throw new Error(`Route manifest ${field} differs from pinned input`);
    }
  }
  return content;
}
