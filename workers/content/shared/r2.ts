import { equalBytes, sha256Hex } from "./canonical";

type R2ObjectBodyLike = { arrayBuffer(): Promise<ArrayBuffer> };
type R2BucketLike = {
  get(key: string): Promise<R2ObjectBodyLike | null>;
  put(
    key: string,
    value: Uint8Array,
    options?: {
      onlyIf?: { etagDoesNotMatch?: string };
      httpMetadata?: { contentType?: string };
    },
  ): Promise<unknown>;
};

export type ImmutableObject = {
  key: string;
  byteLength: number;
  sha256: string;
  reused: boolean;
};

async function read(
  bucket: R2BucketLike,
  key: string,
): Promise<Uint8Array | null> {
  const object = await bucket.get(key);
  return object ? new Uint8Array(await object.arrayBuffer()) : null;
}

export async function putVerifiedImmutable(
  bucket: R2BucketLike,
  prefix: string,
  extension: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<ImmutableObject> {
  const sha256 = await sha256Hex(bytes);
  const key = `${prefix}/sha256/${sha256}.${extension}`;
  const existing = await read(bucket, key);
  if (existing) {
    if (!equalBytes(existing, bytes))
      throw new Error(`Critical content-address collision at ${key}`);
    return { key, byteLength: bytes.byteLength, sha256, reused: true };
  }

  try {
    await bucket.put(key, bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType },
    });
  } catch (error) {
    const raced = await read(bucket, key);
    if (!raced || !equalBytes(raced, bytes)) throw error;
  }

  const verified = await read(bucket, key);
  if (
    !verified ||
    !equalBytes(verified, bytes) ||
    (await sha256Hex(verified)) !== sha256
  ) {
    throw new Error(`R2 verification failed for ${key}`);
  }
  return { key, byteLength: bytes.byteLength, sha256, reused: false };
}
