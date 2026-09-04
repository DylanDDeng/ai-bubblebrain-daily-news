import { describe, expect, it, vi } from "vitest";

import {
  expectedPreviewMediaType,
  verifyWithTargetedRetries,
} from "../../scripts/preview-media-types.mjs";

describe("Preview media-type contract", () => {
  it.each(["font/ttf", "font/woff", "font/woff2"])(
    "accepts generated font asset type %s",
    (contentType) => {
      expect(expectedPreviewMediaType(contentType)).toBe(contentType);
    },
  );

  it.each(["image/avif", "image/gif", "image/jpeg", "image/webp"])(
    "accepts tutorial media type %s",
    (contentType) => {
      expect(expectedPreviewMediaType(contentType)).toBe(contentType);
    },
  );

  it("fails closed for an undeclared media type", () => {
    expect(expectedPreviewMediaType("application/x-unknown")).toBeUndefined();
  });

  it("rechecks only transiently failing routes", async () => {
    const records = [{ route: "/ok" }, { route: "/temporary.avif" }];
    const verifyBatch = vi
      .fn()
      .mockResolvedValueOnce(
        new Map([
          ["/temporary.avif", { message: "received 500", retryable: true }],
        ]),
      )
      .mockResolvedValueOnce(new Map());
    const sleep = vi.fn().mockResolvedValue(undefined);

    const failures = await verifyWithTargetedRetries(records, verifyBatch, {
      delays: [15],
      sleep,
    });

    expect(failures.size).toBe(0);
    expect(verifyBatch).toHaveBeenNthCalledWith(2, [
      { route: "/temporary.avif" },
    ]);
    expect(sleep).toHaveBeenCalledWith(15);
  });

  it("does not retry deterministic contract failures", async () => {
    const records = [{ route: "/wrong-type" }];
    const verifyBatch = vi
      .fn()
      .mockResolvedValue(
        new Map([
          ["/wrong-type", { message: "wrong content type", retryable: false }],
        ]),
      );
    const sleep = vi.fn();

    const failures = await verifyWithTargetedRetries(records, verifyBatch, {
      delays: [15, 30],
      sleep,
    });

    expect(failures.size).toBe(1);
    expect(verifyBatch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("keeps a transient failure after exhausting targeted retries", async () => {
    const records = [{ route: "/temporary.avif" }];
    const transientFailure = new Map([
      ["/temporary.avif", { message: "received 500", retryable: true }],
    ]);
    const verifyBatch = vi.fn().mockResolvedValue(transientFailure);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const failures = await verifyWithTargetedRetries(records, verifyBatch, {
      delays: [15, 30],
      sleep,
    });

    expect(failures).toEqual(transientFailure);
    expect(verifyBatch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[15], [30]]);
  });
});
