import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleRollbackRequest,
  pagesAssetHash,
  parseContentAddressedArtifact,
  parseDeterministicTar,
  purgeContentCaches,
  uploadPages,
  verifyDeployment,
} from "./index";

const encoder = new TextEncoder();
const databaseContentContract = {
  schema_version: 1,
  taxonomy_version: 1,
  serializer_version: "daily-json-c14n-v1",
  search_contract_version: "search-v1",
  source_contract_version: "daily-source-v1",
};
const routeContentContract = {
  content_schema_version: 1,
  content_taxonomy_version: 1,
  content_serializer_version: "daily-json-c14n-v1",
  content_search_contract_version: "search-v1",
  content_source_contract_version: "daily-source-v1",
  node_version: "v22.17.0",
  npm_version: "10.9.2",
  astro_version: "7.0.9",
  hugo_version: "0.147.9",
  build_timezone: "UTC",
  build_locale: "C.UTF-8",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function octal(value: number, width: number): Uint8Array {
  return encoder.encode(`${value.toString(8).padStart(width - 1, "0")}\0`);
}

function tar(entries: Array<{ path: string; body: string }>): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const body = encoder.encode(entry.body);
    const header = new Uint8Array(512);
    header.set(encoder.encode(entry.path), 0);
    header.set(octal(0o644, 8), 100);
    header.set(octal(0, 8), 108);
    header.set(octal(0, 8), 116);
    header.set(octal(body.byteLength, 12), 124);
    header.set(octal(0, 12), 136);
    header.fill(32, 148, 156);
    header[156] = 48;
    header.set(encoder.encode("ustar\0"), 257);
    header.set(encoder.encode("00"), 263);
    const checksum = header.reduce((sum, value) => sum + value, 0);
    header.set(
      encoder.encode(`${checksum.toString(8).padStart(6, "0")}\0 `),
      148,
    );
    chunks.push(
      header,
      body,
      new Uint8Array((512 - (body.byteLength % 512)) % 512),
    );
  }
  chunks.push(new Uint8Array(1024));
  const output = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

describe("production artifact tar", () => {
  it("parses only checksum-valid regular files", () => {
    const files = parseDeterministicTar(
      tar([
        { path: "./index.html", body: "<h1>release</h1>" },
        { path: "./release-manifests/site-route-manifest.json", body: "{}" },
      ]),
    );
    expect(files.map((file) => file.path)).toEqual([
      "index.html",
      "release-manifests/site-route-manifest.json",
    ]);
    expect(new TextDecoder().decode(files[0].bytes)).toBe("<h1>release</h1>");
  });

  it("rejects traversal paths before upload", () => {
    expect(() =>
      parseDeterministicTar(tar([{ path: "../escape.html", body: "x" }])),
    ).toThrow("unsafe path");
  });

  it("binds the Pages asset hash to bytes and extension", () => {
    const bytes = encoder.encode("same bytes");
    const html = pagesAssetHash({ path: "index.html", bytes });
    expect(html).toMatch(/^[a-f0-9]{32}$/);
    expect(pagesAssetHash({ path: "index.html", bytes })).toBe(html);
    expect(pagesAssetHash({ path: "index.txt", bytes })).not.toBe(html);
  });
});

describe("content-addressed production artifact", () => {
  const fingerprint =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const context = {
    ...databaseContentContract,
    site_release_id: "019f6e2d-013f-7ea0-933e-b996531a9341",
    site_release_sequence: 7,
    manifest_sha256: "a".repeat(64),
    content_sha256: "b".repeat(64),
    artifact_object_key: `artifacts/sha256/${"c".repeat(64)}.json`,
    artifact_byte_length: 1,
    artifact_sha256: "c".repeat(64),
    artifact_fingerprint_sha256: fingerprint,
    artifact_hash_algorithm: "sha256-content-addressed-pages-v1",
    code_sha: "d".repeat(40),
    build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
  };
  function manifest(overrides: Record<string, unknown> = {}): Uint8Array {
    return encoder.encode(
      JSON.stringify({
        schema_version: 1,
        hash_algorithm: "sha256-content-addressed-pages-v1",
        build: {
          ...routeContentContract,
          code_sha: context.code_sha,
          source_sha: context.code_sha,
          site_release_id: context.site_release_id,
          site_release_sequence: context.site_release_sequence,
          content_sha256: context.content_sha256,
          manifest_sha256: context.manifest_sha256,
          build_environment_version: context.build_environment_version,
          hash_algorithm: "sha256-path-and-content-v1",
          artifact_sha256: fingerprint,
        },
        artifact_fingerprint_sha256: fingerprint,
        file_count: 1,
        total_asset_bytes: 2,
        files: [
          {
            path: "release-manifests/site-route-manifest.json",
            byte_length: 2,
            sha256: "e".repeat(64),
            pages_hash: "f".repeat(32),
            object_key: `assets/sha256/${"e".repeat(64)}`,
          },
        ],
        ...overrides,
      }),
    );
  }

  it("accepts a bounded path/hash inventory bound to the release identity", async () => {
    await expect(
      parseContentAddressedArtifact(manifest(), context),
    ).resolves.toMatchObject({
      file_count: 1,
      total_asset_bytes: 2,
    });
  });

  it("rejects missing or database-drifted content contract metadata", async () => {
    const missing = JSON.parse(new TextDecoder().decode(manifest()));
    delete missing.build.content_taxonomy_version;
    await expect(
      parseContentAddressedArtifact(
        encoder.encode(JSON.stringify(missing)),
        context,
      ),
    ).rejects.toThrow("identity mismatch");

    await expect(
      parseContentAddressedArtifact(manifest(), {
        ...context,
        serializer_version: "daily-json-c14n-v2",
      }),
    ).rejects.toThrow("identity mismatch");
  });

  it("rejects unsafe paths and inconsistent totals", async () => {
    await expect(
      parseContentAddressedArtifact(
        manifest({
          files: [
            {
              path: "../escape.html",
              byte_length: 2,
              sha256: "e".repeat(64),
              pages_hash: "f".repeat(32),
              object_key: `assets/sha256/${"e".repeat(64)}`,
            },
          ],
        }),
        context,
      ),
    ).rejects.toThrow("asset is invalid");
    await expect(
      parseContentAddressedArtifact(
        manifest({ total_asset_bytes: 3 }),
        context,
      ),
    ).rejects.toThrow("totals are invalid");
  });
});

describe("content-addressed Pages upload", () => {
  const pageBytes = encoder.encode("<h1>release</h1>");
  const context = {
    ...databaseContentContract,
    site_release_id: "019f6e2d-013f-7ea0-933e-b996531a9341",
    site_release_sequence: 7,
    manifest_sha256: "a".repeat(64),
    content_sha256: "b".repeat(64),
    artifact_object_key: `artifacts/sha256/${"c".repeat(64)}.json`,
    artifact_byte_length: 1,
    artifact_sha256: "c".repeat(64),
    artifact_fingerprint_sha256: "e".repeat(64),
    artifact_hash_algorithm: "sha256-content-addressed-pages-v1",
    code_sha: "d".repeat(40),
    build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
  };

  function setup(storedPageBytes = pageBytes) {
    const routeBytes = encoder.encode("{}");
    const pageHash = pagesAssetHash({ path: "index.html", bytes: pageBytes });
    const routeHash = pagesAssetHash({
      path: "release-manifests/site-route-manifest.json",
      bytes: routeBytes,
    });
    const pageSha = createHash("sha256").update(pageBytes).digest("hex");
    const routeSha = createHash("sha256").update(routeBytes).digest("hex");
    const files = [
      {
        path: "index.html",
        byte_length: pageBytes.byteLength,
        sha256: pageSha,
        pages_hash: pageHash,
        object_key: `assets/sha256/${pageSha}`,
      },
      {
        path: "release-manifests/site-route-manifest.json",
        byte_length: routeBytes.byteLength,
        sha256: routeSha,
        pages_hash: routeHash,
        object_key: `assets/sha256/${routeSha}`,
      },
    ];
    const requests: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = String(input);
        requests.push({ url, init });
        let result: unknown;
        if (url.endsWith("/upload-token")) result = { jwt: "pages-jwt" };
        else if (url.endsWith("/check-missing")) result = [pageHash];
        else if (url.endsWith("/assets/upload")) result = {};
        else if (url.endsWith("/upsert-hashes")) result = {};
        else if (url.endsWith("/deployments")) {
          result = {
            id: "123e4567-e89b-42d3-a456-426614174000",
            url: "https://release.pages.dev",
          };
        } else throw new Error(`Unexpected URL: ${url}`);
        return new Response(JSON.stringify({ success: true, result }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    const get = vi.fn(async (key: string) => {
      const value = key.endsWith(pageSha) ? storedPageBytes : routeBytes;
      return {
        size: value.byteLength,
        arrayBuffer: async () => value.slice().buffer,
      };
    });
    return {
      bundle: {
        kind: "content-addressed" as const,
        manifest: {
          schema_version: 1 as const,
          hash_algorithm: "sha256-content-addressed-pages-v1" as const,
          build: {},
          artifact_fingerprint_sha256: "e".repeat(64),
          file_count: files.length,
          total_asset_bytes: files.reduce(
            (sum, file) => sum + file.byte_length,
            0,
          ),
          files,
        },
      },
      env: {
        ARTIFACTS: { get },
        PAGES_PROJECT: "production-project",
        CLOUDFLARE_ACCOUNT_ID: "account-id",
        CLOUDFLARE_API_TOKEN: "api-token",
        PRODUCTION_BRANCH: "main",
      },
      get,
      requests,
      pageHash,
    };
  }

  it("fetches and verifies only missing R2 assets before direct upload", async () => {
    const value = setup();
    await expect(
      uploadPages(value.bundle, context, value.env as never),
    ).resolves.toEqual({
      id: "123e4567-e89b-42d3-a456-426614174000",
      url: "https://release.pages.dev",
    });
    expect(value.get).toHaveBeenCalledTimes(1);
    expect(value.get).toHaveBeenCalledWith(
      `assets/sha256/${createHash("sha256").update(pageBytes).digest("hex")}`,
    );
    const upload = value.requests.find(({ url }) =>
      url.endsWith("/assets/upload"),
    );
    expect(JSON.parse(String(upload?.init.body))).toEqual([
      expect.objectContaining({ key: value.pageHash, base64: true }),
    ]);
  });

  it("stops before Pages upload when an R2 asset fails byte verification", async () => {
    const corrupt = pageBytes.slice();
    corrupt[0] ^= 1;
    const value = setup(corrupt);
    await expect(
      uploadPages(value.bundle, context, value.env as never),
    ).rejects.toThrow("asset hash mismatch");
    expect(
      value.requests.some(({ url }) => url.endsWith("/assets/upload")),
    ).toBe(false);
  });
});

describe("production convergence verification", () => {
  const context = {
    ...databaseContentContract,
    site_release_id: "019f6e2d-013f-7ea0-933e-b996531a9341",
    site_release_sequence: 7,
    manifest_sha256: "a".repeat(64),
    content_sha256: "b".repeat(64),
    artifact_object_key: `artifacts/sha256/${"c".repeat(64)}.json`,
    artifact_byte_length: 1,
    artifact_sha256: "c".repeat(64),
    artifact_fingerprint_sha256: "e".repeat(64),
    artifact_hash_algorithm: "sha256-content-addressed-pages-v1",
    code_sha: "d".repeat(40),
    build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
  };
  const files = [
    { path: "index.html", bytes: encoder.encode("<h1>home</h1>") },
    {
      path: "daily/2026/07/2026-07-17/index.html",
      bytes: encoder.encode("<h1>daily</h1>"),
    },
    {
      path: "data/daily/2026-07-17.json",
      bytes: encoder.encode('{"date":"2026-07-17"}'),
    },
    {
      path: "search/index.json",
      bytes: encoder.encode('{"items":[]}'),
    },
  ];

  function build() {
    return {
      ...routeContentContract,
      code_sha: context.code_sha,
      source_sha: context.code_sha,
      site_release_id: context.site_release_id,
      site_release_sequence: context.site_release_sequence,
      content_sha256: context.content_sha256,
      manifest_sha256: context.manifest_sha256,
      artifact_sha256: context.artifact_fingerprint_sha256,
      build_environment_version: context.build_environment_version,
    };
  }

  function setup(corruptSearch = false, delayedManifestAttempts = 0) {
    const manifestAttempts = new Map<string, number>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname === "/release-manifests/site-route-manifest.json") {
          const attempts = (manifestAttempts.get(url.origin) || 0) + 1;
          manifestAttempts.set(url.origin, attempts);
          const delayed =
            url.origin === "https://www.example.test" &&
            attempts <= delayedManifestAttempts;
          return new Response(JSON.stringify({
            build: delayed
              ? {
                  ...build(),
                  site_release_id: "019f6e2d-013f-7ea0-933e-b996531a9340",
                  site_release_sequence: context.site_release_sequence - 1,
                  code_sha: "f".repeat(40),
                  source_sha: "f".repeat(40),
                }
              : build(),
          }), {
            status: 200,
            headers: { "Content-Type": "application/json", "cf-ray": "id-IAD" },
          });
        }
        const path =
          url.pathname === "/"
            ? "index.html"
            : url.pathname.endsWith("/")
              ? `${url.pathname.slice(1)}index.html`
              : url.pathname.slice(1);
        const file = files.find((candidate) => candidate.path === path);
        const bytes =
          corruptSearch &&
          url.origin === "https://www.example.test" &&
          path === "search/index.json"
            ? encoder.encode("corrupt")
            : file?.bytes;
        return bytes ? new Response(bytes, { status: 200 }) : new Response(null, { status: 404 });
      }),
    );
    return {
      env: {
        PRODUCTION_VERIFY_URLS: "https://www.example.test",
        VERIFY_MIN_ENDPOINTS: "2",
      } as never,
      manifestAttempts,
    };
  }

  function controlledClock(startedAt = 1_000_000) {
    let current = startedAt;
    return {
      startedAt,
      advance: (milliseconds: number) => {
        current += milliseconds;
      },
      dependencies: {
        now: () => current,
        sleep: async (milliseconds: number) => {
          current += milliseconds;
        },
      },
    };
  }

  it("requires exact HTML, daily JSON and search bytes on every origin", async () => {
    const value = setup();
    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        value.env,
        { kind: "tar", files },
      ),
    ).resolves.toMatchObject({
      multi_edge_verified: true,
      maximum_inconsistency_ms: 240000,
      convergence_elapsed_ms: expect.any(Number),
      site_release_id: context.site_release_id,
      site_release_sequence: context.site_release_sequence,
      manifest_sha256: context.manifest_sha256,
      content_sha256: context.content_sha256,
      artifact_sha256: context.artifact_sha256,
      artifact_fingerprint_sha256: context.artifact_fingerprint_sha256,
      code_sha: context.code_sha,
      build_environment_version: context.build_environment_version,
      endpoints: [
        { exact_paths: ["/", "/daily/2026/07/2026-07-17/", "/data/daily/2026-07-17.json", "/search/index.json"] },
        { exact_paths: ["/", "/daily/2026/07/2026-07-17/", "/data/daily/2026-07-17.json", "/search/index.json"] },
      ],
    });
  });

  it("continues beyond the legacy eight probes until a delayed edge converges", async () => {
    const value = setup(false, 9);
    const clock = controlledClock();
    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        { ...value.env, MAX_PRODUCTION_INCONSISTENCY_MS: "20000" },
        { kind: "tar", files },
        clock.startedAt,
        clock.dependencies,
      ),
    ).resolves.toMatchObject({
      multi_edge_verified: true,
      endpoints: expect.arrayContaining([
        expect.objectContaining({
          url: "https://www.example.test",
          attempts: 10,
        }),
      ]),
    });
    expect(value.manifestAttempts.get("https://deploy.pages.dev")).toBe(1);
    expect(value.manifestAttempts.get("https://www.example.test")).toBe(10);
  });

  it("fails closed when a custom-domain search artifact drifts", async () => {
    const value = setup(true);
    const clock = controlledClock();
    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        { ...value.env, MAX_PRODUCTION_INCONSISTENCY_MS: "10000" },
        { kind: "tar", files },
        clock.startedAt,
        clock.dependencies,
      ),
    ).rejects.toThrow("search/index.json");
  });

  it("rejects a probe that finishes after the hard convergence deadline", async () => {
    const value = setup();
    const clock = controlledClock();
    const fetcher = vi.mocked(fetch);
    let advanced = false;
    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        { ...value.env, MAX_PRODUCTION_INCONSISTENCY_MS: "10000" },
        { kind: "tar", files },
        clock.startedAt,
        {
          ...clock.dependencies,
          fetch: async (input, init) => {
            const response = await fetcher(input, init);
            if (!advanced) {
              advanced = true;
              clock.advance(10_001);
            }
            return response;
          },
        },
      ),
    ).rejects.toThrow("within 10000ms");
  });

  it("rejects an unsafe inconsistency-window configuration", async () => {
    const value = setup();
    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        {
          ...value.env,
          MAX_PRODUCTION_INCONSISTENCY_MS: "0",
        },
        { kind: "tar", files },
      ),
    ).rejects.toThrow("inconsistency limit is invalid");
  });

  it("fails before probing when the measured inconsistency window is exhausted", async () => {
    const value = setup();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    await expect(
      verifyDeployment(
        context,
        "https://deploy.pages.dev",
        value.env,
        { kind: "tar", files },
        Date.now() - 240_001,
      ),
    ).rejects.toThrow("inconsistency window exceeded");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("production rollback handler", () => {
  it("loads the exact fenced context, deploys it, and commits through the rollback RPC", async () => {
    const targetId = "123e4567-e89b-42d3-a456-426614174000";
    const context = {
      ...databaseContentContract,
      site_release_id: targetId,
      site_release_sequence: 7,
      manifest_sha256: "a".repeat(64),
      content_sha256: "b".repeat(64),
      artifact_object_key: `artifacts/sha256/${"c".repeat(64)}.json`,
      artifact_byte_length: 1,
      artifact_sha256: "c".repeat(64),
      artifact_fingerprint_sha256: "e".repeat(64),
      artifact_hash_algorithm: "sha256-content-addressed-pages-v1",
      code_sha: "d".repeat(40),
      build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
    };
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      queries.push(query);
      if (query.includes("get_authorized_rollback_context_v1")) {
        return [{ result: context }];
      }
      if (query.includes("commit_production_rollback_v1")) {
        return [{ result: { site_release_id: targetId, generation: 8 } }];
      }
      throw new Error(`Unexpected SQL: ${query}`);
    });
    const end = vi.fn(async () => undefined);
    Object.assign(sql, {
      json: vi.fn((value: unknown) => value),
      end,
    });
    const loadArtifact = vi.fn(
      async () => ({ kind: "tar", files: [] }) as never,
    );
    const upload = vi.fn(async () => ({
      id: "123e4567-e89b-42d3-a456-426614174000",
      url: "https://rollback.pages.dev",
    }));
    const verify = vi.fn(async () => ({ multi_edge_verified: true }));
    const purge = vi.fn(async () => ({
      urls: ["https://content-api.example.test/v1/current"],
    }));
    const request = new Request("https://broker.test/v1/rollback", {
      method: "POST",
      headers: { "X-Content-Control-Secret": "control-secret" },
      body: JSON.stringify({
        target_site_release_id: targetId,
        fencing_token: 9,
        expected_pointer_generation: 7,
      }),
    });

    const response = await handleRollbackRequest(
      request,
      { CONTROL_BROKER_SECRET: "control-secret" } as never,
      {
        openDatabase: vi.fn(() => sql as never),
        loadArtifact,
        upload,
        verify,
        purge,
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      site_release_id: targetId,
      generation: 8,
    });
    expect(loadArtifact).toHaveBeenCalledWith(context, expect.anything());
    expect(upload).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledOnce();
    expect(purge).toHaveBeenCalledOnce();
    expect(queries).toHaveLength(2);
    expect(queries.join("\n")).not.toContain("sql<JsonRecord");
    expect(end).toHaveBeenCalledWith({ timeout: 2 });
  });

  it("does not commit or report rollback success when cache purge fails", async () => {
    const targetId = "123e4567-e89b-42d3-a456-426614174000";
    const context = {
      ...databaseContentContract,
      site_release_id: targetId,
      site_release_sequence: 7,
      manifest_sha256: "a".repeat(64),
      content_sha256: "b".repeat(64),
      artifact_object_key: `artifacts/sha256/${"c".repeat(64)}.json`,
      artifact_byte_length: 1,
      artifact_sha256: "c".repeat(64),
      artifact_fingerprint_sha256: "e".repeat(64),
      artifact_hash_algorithm: "sha256-content-addressed-pages-v1",
      code_sha: "d".repeat(40),
      build_environment_version: "node22.17-astro7-hugo0.147.9-v1",
    };
    const queries: string[] = [];
    const end = vi.fn(async () => undefined);
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join("?");
      queries.push(query);
      if (query.includes("get_authorized_rollback_context_v1")) {
        return [{ result: context }];
      }
      throw new Error("Rollback commit must not run after purge failure");
    });
    Object.assign(sql, {
      json: vi.fn((value: unknown) => value),
      end,
    });
    const request = new Request("https://broker.test/v1/rollback", {
      method: "POST",
      headers: { "X-Content-Control-Secret": "control-secret" },
      body: JSON.stringify({
        target_site_release_id: targetId,
        fencing_token: 9,
        expected_pointer_generation: 7,
      }),
    });

    const response = await handleRollbackRequest(
      request,
      { CONTROL_BROKER_SECRET: "control-secret" } as never,
      {
        openDatabase: vi.fn(() => sql as never),
        loadArtifact: vi.fn(async () => ({ kind: "tar", files: [] }) as never),
        upload: vi.fn(async () => ({
          id: "123e4567-e89b-42d3-a456-426614174000",
          url: "https://rollback.pages.dev",
        })),
        verify: vi.fn(async () => ({ multi_edge_verified: true })),
        purge: vi.fn(async () => {
          throw new Error("purge failed");
        }),
      },
    );

    expect(response.status).toBe(503);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("get_authorized_rollback_context_v1");
    expect(end).toHaveBeenCalledOnce();
  });
});

describe("production cache purge", () => {
  it("purges only explicitly configured HTTPS current-pointer URLs", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ success: true, result: { id: "purge" } }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      CLOUDFLARE_ZONE_ID: "a".repeat(32),
      CLOUDFLARE_API_TOKEN: "purge-token",
      CONTENT_API_PURGE_URLS:
        "https://content-api.example.test/v1/current,https://api.example.test/v1/current",
    } as never;

    await expect(purgeContentCaches(env)).resolves.toEqual({
      urls: [
        "https://content-api.example.test/v1/current",
        "https://api.example.test/v1/current",
      ],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/zones/${"a".repeat(32)}/purge_cache`);
    expect(JSON.parse(String(init?.body))).toEqual({
      files: [
        "https://content-api.example.test/v1/current",
        "https://api.example.test/v1/current",
      ],
    });
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer purge-token",
    );
  });

  it("fails closed before the Cloudflare API when purge configuration is missing or unsafe", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      purgeContentCaches({
        CLOUDFLARE_ZONE_ID: "placeholder",
        CONTENT_API_PURGE_URLS: "http://content-api.example.test/v1/current",
      } as never),
    ).rejects.toThrow("cache purge is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
