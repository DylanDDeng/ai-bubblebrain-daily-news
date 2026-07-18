import { describe, expect, it } from "vitest";
import { canonicalJsonBytes } from "./canonical";
import { putVerifiedImmutable } from "./r2";

class MemoryBucket {
  readonly objects = new Map<string, Uint8Array>();

  async get(key: string) {
    const bytes = this.objects.get(key);
    return bytes ? { arrayBuffer: async () => bytes.slice().buffer } : null;
  }

  async put(
    key: string,
    value: Uint8Array,
    options?: { onlyIf?: { etagDoesNotMatch?: string } },
  ) {
    if (options?.onlyIf?.etagDoesNotMatch === "*" && this.objects.has(key))
      throw new Error("precondition");
    this.objects.set(key, value.slice());
  }
}

describe("content-addressed R2 writes", () => {
  it("uses stable canonical bytes regardless of object insertion order", () => {
    expect(canonicalJsonBytes({ z: 1, a: { y: 2, x: 3 } })).toEqual(
      canonicalJsonBytes({ a: { x: 3, y: 2 }, z: 1 }),
    );
  });

  it("writes, downloads, hashes, and idempotently reuses exact bytes", async () => {
    const bucket = new MemoryBucket();
    const bytes = canonicalJsonBytes({ hello: "world" });
    const first = await putVerifiedImmutable(
      bucket,
      "report-snapshots",
      "json",
      bytes,
      "application/json",
    );
    const second = await putVerifiedImmutable(
      bucket,
      "report-snapshots",
      "json",
      bytes,
      "application/json",
    );
    expect(first.reused).toBe(false);
    expect(second).toMatchObject({
      key: first.key,
      sha256: first.sha256,
      reused: true,
    });
    expect(first.key).toBe(`report-snapshots/sha256/${first.sha256}.json`);
  });

  it("fails closed on an impossible content-address collision", async () => {
    const bucket = new MemoryBucket();
    const bytes = canonicalJsonBytes({ stable: true });
    const first = await putVerifiedImmutable(
      bucket,
      "site-manifests",
      "json",
      bytes,
      "application/json",
    );
    bucket.objects.set(first.key, canonicalJsonBytes({ corrupt: true }));
    await expect(
      putVerifiedImmutable(
        bucket,
        "site-manifests",
        "json",
        bytes,
        "application/json",
      ),
    ).rejects.toThrow("Critical content-address collision");
  });
});
