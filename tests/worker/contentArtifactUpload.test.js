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

  async putIfAbsent(key, _path, bytes) {
    if (this.objects.has(key)) throw new Error("precondition failed");
    this.objects.set(key, Buffer.from(bytes));
  }

  async get(key) {
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error("object missing");
    return Buffer.from(bytes);
  }
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
