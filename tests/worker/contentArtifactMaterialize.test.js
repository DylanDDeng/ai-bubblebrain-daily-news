import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createContentAddressedArtifact } from "../../scripts/create-content-addressed-artifact.mjs";
import { materializeContentAddressedArtifact } from "../../scripts/materialize-content-addressed-artifact.mjs";

const RELEASE_ID = "22222222-2222-4222-8222-222222222222";
const CODE_SHA = "b".repeat(40);
const CONTENT_SHA = "c".repeat(64);
const temporaryDirectories = [];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

class MemoryObjectStore {
  objects = new Map();
  reads = [];

  async get(key) {
    this.reads.push(key);
    const value = this.objects.get(key);
    if (!value) throw new Error(`missing object: ${key}`);
    return Buffer.from(value);
  }
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "content-artifact-materialize-"));
  temporaryDirectories.push(root);
  const source = join(root, "source");
  await mkdir(join(source, "release-manifests"), { recursive: true });
  const page = Buffer.from("<h1>release</h1>\n");
  await writeFile(join(source, "index.html"), page);
  const fingerprint = sha256(
    Buffer.from(`index.html\0${sha256(page)}\n`, "utf8"),
  );
  await writeFile(
    join(source, "release-manifests/site-route-manifest.json"),
    `${JSON.stringify({
      build: {
        hash_algorithm: "sha256-path-and-content-v1",
        artifact_sha256: fingerprint,
        site_release_id: RELEASE_ID,
        code_sha: CODE_SHA,
        content_sha256: CONTENT_SHA,
      },
    })}\n`,
  );
  const artifact = await createContentAddressedArtifact(source);
  const store = new MemoryObjectStore();
  store.objects.set(artifact.artifact_object_key, artifact.bytes);
  for (const file of artifact.manifest.files) {
    store.objects.set(file.object_key, await readFile(join(source, file.path)));
  }
  const descriptor = {
    site_release_id: RELEASE_ID,
    object_key: artifact.artifact_object_key,
    byte_length: artifact.bytes.byteLength,
    artifact_sha256: artifact.artifact_sha256,
    artifact_fingerprint_sha256: artifact.manifest.artifact_fingerprint_sha256,
    hash_algorithm: artifact.manifest.hash_algorithm,
    code_sha: CODE_SHA,
    content_sha256: CONTENT_SHA,
  };
  return {
    root,
    source,
    target: join(root, "target"),
    artifact,
    descriptor,
    store,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("content-addressed artifact materialization", () => {
  it("downloads and verifies the exact inventory and every asset", async () => {
    const value = await fixture();
    const result = await materializeContentAddressedArtifact({
      descriptor: value.descriptor,
      expectedSiteReleaseId: RELEASE_ID,
      expectedCodeSha: CODE_SHA,
      expectedContentSha256: CONTENT_SHA,
      targetRoot: value.target,
      store: value.store,
      concurrency: 2,
    });

    expect(result).toMatchObject({
      site_release_id: RELEASE_ID,
      artifact_sha256: value.artifact.artifact_sha256,
      file_count: 2,
      unique_object_reads: 2,
    });
    expect(await readFile(join(value.target, "index.html"), "utf8")).toBe(
      "<h1>release</h1>\n",
    );
    expect(value.store.reads).toHaveLength(3);
  });

  it("fails closed when inventory bytes do not match the descriptor", async () => {
    const value = await fixture();
    value.store.objects.set(
      value.artifact.artifact_object_key,
      Buffer.from("{}\n"),
    );
    await expect(
      materializeContentAddressedArtifact({
        descriptor: value.descriptor,
        expectedSiteReleaseId: RELEASE_ID,
        expectedCodeSha: CODE_SHA,
        expectedContentSha256: CONTENT_SHA,
        targetRoot: value.target,
        store: value.store,
      }),
    ).rejects.toThrow("inventory byte identity mismatch");
  });

  it("fails closed and preserves the previous target on corrupt assets", async () => {
    const value = await fixture();
    await mkdir(value.target, { recursive: true });
    await writeFile(join(value.target, "keep.txt"), "last known good\n");
    const index = value.artifact.manifest.files.find(
      (file) => file.path === "index.html",
    );
    value.store.objects.set(index.object_key, Buffer.from("corrupt"));

    await expect(
      materializeContentAddressedArtifact({
        descriptor: value.descriptor,
        expectedSiteReleaseId: RELEASE_ID,
        expectedCodeSha: CODE_SHA,
        expectedContentSha256: CONTENT_SHA,
        targetRoot: value.target,
        store: value.store,
      }),
    ).rejects.toThrow("asset identity mismatch");
    expect(await readFile(join(value.target, "keep.txt"), "utf8")).toBe(
      "last known good\n",
    );
  });

  it("rejects a descriptor for a different release identity", async () => {
    const value = await fixture();
    await expect(
      materializeContentAddressedArtifact({
        descriptor: value.descriptor,
        expectedSiteReleaseId: "33333333-3333-4333-8333-333333333333",
        expectedCodeSha: CODE_SHA,
        expectedContentSha256: CONTENT_SHA,
        targetRoot: value.target,
        store: value.store,
      }),
    ).rejects.toThrow("does not match workflow identity");
    expect(value.store.reads).toHaveLength(0);
  });
});
