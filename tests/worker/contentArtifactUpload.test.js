import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createContentAddressedArtifact } from "../../scripts/create-content-addressed-artifact.mjs";
import { uploadContentAddressedArtifact } from "../../scripts/upload-content-addressed-artifact.mjs";

const temporaryDirectories = [];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

class MemoryObjectStore {
  objects = new Map();
  puts = [];
  gets = [];

  async putIfAbsent(key, _path, bytes) {
    this.puts.push(key);
    if (this.objects.has(key)) throw new Error("precondition failed");
    this.objects.set(key, Buffer.from(bytes));
  }

  async get(key) {
    this.gets.push(key);
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error("object missing");
    return Buffer.from(bytes);
  }
}

function trustedBaseline(artifact, overrides = {}) {
  return {
    descriptor: {
      production_verified: true,
      hash_algorithm: "sha256-content-addressed-pages-v1",
      verification_profile: "r2-full-get-sha256-indefinite-lock-v1",
      object_key: artifact.artifact_object_key,
      artifact_sha256: artifact.artifact_sha256,
      artifact_fingerprint_sha256:
        artifact.manifest.artifact_fingerprint_sha256,
      byte_length: artifact.bytes.byteLength,
      site_release_id: "22222222-2222-4222-8222-222222222222",
      lock_evidence_sha256: "f".repeat(64),
      r2_verified_at: "2026-07-24T20:00:00.000Z",
      ...overrides,
    },
    manifestBytes: artifact.bytes,
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "content-artifact-upload-"));
  temporaryDirectories.push(root);
  const dist = join(root, "dist");
  const releaseDirectory = join(dist, "release-manifests");
  await mkdir(releaseDirectory, { recursive: true });
  const page = Buffer.from("<h1>release</h1>\n");
  await writeFile(join(dist, "index.html"), page);
  const fingerprint = sha256(
    Buffer.from(`index.html\0${sha256(page)}\n`, "utf8"),
  );
  await writeFile(
    join(releaseDirectory, "site-route-manifest.json"),
    `${JSON.stringify({
      build: {
        hash_algorithm: "sha256-path-and-content-v1",
        artifact_sha256: fingerprint,
        site_release_id: "22222222-2222-4222-8222-222222222222",
      },
    })}\n`,
  );
  const manifestPath = join(root, "content-release-artifact.json");
  const artifact = await createContentAddressedArtifact(dist, manifestPath);
  return { root, dist, manifestPath, artifact };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("content-addressed artifact R2 upload", () => {
  it("conditionally writes and GET-verifies every asset and inventory", async () => {
    const value = await fixture();
    const store = new MemoryObjectStore();
    const options = {
      manifestPath: value.manifestPath,
      distRoot: value.dist,
      artifactObjectKey: value.artifact.artifact_object_key,
      expectedManifestSha256: value.artifact.artifact_sha256,
      store,
      concurrency: 2,
    };
    const first = await uploadContentAddressedArtifact(options);
    const second = await uploadContentAddressedArtifact(options);
    expect(first).toMatchObject({ uploaded: 3, reused: 0 });
    expect(second).toMatchObject({ uploaded: 0, reused: 3 });
    expect(sha256(store.objects.get(value.artifact.artifact_object_key))).toBe(
      value.artifact.artifact_sha256,
    );
  });

  it("fails closed when an existing immutable object has different bytes", async () => {
    const value = await fixture();
    const store = new MemoryObjectStore();
    const asset = value.artifact.manifest.files[0];
    store.objects.set(asset.object_key, Buffer.from("corrupt"));
    await expect(
      uploadContentAddressedArtifact({
        manifestPath: value.manifestPath,
        distRoot: value.dist,
        artifactObjectKey: value.artifact.artifact_object_key,
        expectedManifestSha256: value.artifact.artifact_sha256,
        store,
      }),
    ).rejects.toThrow("Critical content-address collision");
  });

  it("performs zero PUTs and GETs for object keys in a verified baseline", async () => {
    const value = await fixture();
    const store = new MemoryObjectStore();
    const options = {
      manifestPath: value.manifestPath,
      distRoot: value.dist,
      artifactObjectKey: value.artifact.artifact_object_key,
      expectedManifestSha256: value.artifact.artifact_sha256,
      store,
    };
    await uploadContentAddressedArtifact(options);
    store.puts = [];
    store.gets = [];

    const result = await uploadContentAddressedArtifact({
      ...options,
      incrementalReuseEnabled: true,
      trustedBaseline: trustedBaseline(value.artifact),
    });

    expect(result).toMatchObject({
      trusted_reused: 2,
      reused: 1,
      trusted_baseline_status: "verified",
    });
    expect(store.puts).toEqual([value.artifact.artifact_object_key]);
    expect(store.gets).toEqual([value.artifact.artifact_object_key]);
  });

  it("falls back to full verification when baseline provenance is incomplete", async () => {
    const value = await fixture();
    const store = new MemoryObjectStore();
    await uploadContentAddressedArtifact({
      manifestPath: value.manifestPath,
      distRoot: value.dist,
      artifactObjectKey: value.artifact.artifact_object_key,
      expectedManifestSha256: value.artifact.artifact_sha256,
      store,
    });
    store.puts = [];
    store.gets = [];

    const result = await uploadContentAddressedArtifact({
      manifestPath: value.manifestPath,
      distRoot: value.dist,
      artifactObjectKey: value.artifact.artifact_object_key,
      expectedManifestSha256: value.artifact.artifact_sha256,
      store,
      incrementalReuseEnabled: true,
      trustedBaseline: trustedBaseline(value.artifact, {
        production_verified: false,
      }),
    });

    expect(result.trusted_reused).toBe(0);
    expect(result.trusted_baseline_status).toBe(
      "Trusted baseline provenance is invalid",
    );
    expect(store.puts).toHaveLength(3);
    expect(store.gets).toHaveLength(3);
  });

  it("fully verifies an object absent from the verified baseline", async () => {
    const successor = await fixture();
    const baselineManifest = {
      ...successor.artifact.manifest,
      files: successor.artifact.manifest.files.filter(
        (file) => file.path !== "index.html",
      ),
    };
    baselineManifest.file_count = baselineManifest.files.length;
    baselineManifest.total_asset_bytes = baselineManifest.files.reduce(
      (total, file) => total + file.byte_length,
      0,
    );
    const baselineBytes = Buffer.from(
      `${JSON.stringify(baselineManifest, null, 2)}\n`,
    );
    const baseline = {
      manifest: baselineManifest,
      artifact_sha256: sha256(baselineBytes),
      artifact_object_key: `artifacts/sha256/${sha256(baselineBytes)}.json`,
      bytes: baselineBytes,
    };
    const store = new MemoryObjectStore();

    const result = await uploadContentAddressedArtifact({
      manifestPath: successor.manifestPath,
      distRoot: successor.dist,
      artifactObjectKey: successor.artifact.artifact_object_key,
      expectedManifestSha256: successor.artifact.artifact_sha256,
      store,
      incrementalReuseEnabled: true,
      trustedBaseline: trustedBaseline(baseline),
    });
    const newAsset = successor.artifact.manifest.files.find(
      (file) => file.path === "index.html",
    );

    expect(result.trusted_reused).toBe(1);
    expect(store.puts).toContain(newAsset.object_key);
    expect(store.gets).toContain(newAsset.object_key);
  });

  it("rejects local asset drift before writing any object", async () => {
    const value = await fixture();
    const store = new MemoryObjectStore();
    await writeFile(join(value.dist, "index.html"), "changed");
    await expect(
      uploadContentAddressedArtifact({
        manifestPath: value.manifestPath,
        distRoot: value.dist,
        artifactObjectKey: value.artifact.artifact_object_key,
        expectedManifestSha256: value.artifact.artifact_sha256,
        store,
      }),
    ).rejects.toThrow(/length changed|SHA-256 changed/);
    expect(store.objects.size).toBe(0);
  });
});
