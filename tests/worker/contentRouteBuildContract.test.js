import { describe, expect, it } from "vitest";

import {
  assertPinnedProcessEnvironment,
  assertPinnedToolchain,
  assertRouteBuildContract,
  contentContractFromManifest,
} from "../../scripts/content-route-build-contract.mjs";

const contentContract = {
  content_schema_version: 1,
  content_taxonomy_version: 1,
  content_serializer_version: "daily-json-c14n-v1",
  content_search_contract_version: "search-v1",
  content_source_contract_version: "daily-source-v1",
};

function pinnedBuild(overrides = {}) {
  return {
    code_sha: "a".repeat(40),
    source_sha: "a".repeat(40),
    site_release_id: "11111111-1111-4111-8111-111111111111",
    site_release_sequence: 7,
    content_sha256: "b".repeat(64),
    manifest_sha256: "c".repeat(64),
    build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
    artifact_sha256: "d".repeat(64),
    hash_algorithm: "sha256-path-and-content-v1",
    node_version: "v22.17.0",
    npm_version: "10.9.2",
    astro_version: "7.0.9",
    hugo_version: "0.147.9",
    build_timezone: "UTC",
    build_locale: "C.UTF-8",
    ...contentContract,
    ...overrides,
  };
}

describe("content route build contract", () => {
  it("extracts the immutable site manifest versions into explicit content fields", () => {
    expect(
      contentContractFromManifest({
        schema_version: 1,
        taxonomy_version: 1,
        serializer_version: "daily-json-c14n-v1",
        search_contract_version: "search-v1",
        source_contract_version: "daily-source-v1",
      }),
    ).toEqual(contentContract);
  });

  it("fails closed when a pinned manifest omits or drifts a contract version", () => {
    expect(() =>
      assertRouteBuildContract(
        pinnedBuild({ content_taxonomy_version: undefined }),
        { pinned: true },
      ),
    ).toThrow("content taxonomy version");
    expect(() =>
      assertRouteBuildContract(pinnedBuild(), {
        pinned: true,
        expected: { content_serializer_version: "daily-json-c14n-v2" },
      }),
    ).toThrow("differs from pinned input");
  });

  it("requires the exact npm bundled into the pinned build environment", () => {
    expect(() => assertPinnedToolchain("v22.17.0", "10.9.1")).toThrow(
      "require npm 10.9.2",
    );
    expect(() => assertPinnedToolchain("v22.17.0", "10.9.2")).not.toThrow();
  });

  it("requires deterministic timezone and locale inputs", () => {
    expect(() =>
      assertPinnedProcessEnvironment({
        TZ: "UTC",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
      }),
    ).not.toThrow();
    expect(() =>
      assertPinnedProcessEnvironment({
        TZ: "America/New_York",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
      }),
    ).toThrow("TZ=UTC");
  });
});
