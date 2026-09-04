import { describe, expect, it } from "vitest";

import { expectedPreviewMediaType } from "../../scripts/preview-media-types.mjs";

describe("Preview media-type contract", () => {
  it.each([
    "font/ttf",
    "font/woff",
    "font/woff2",
  ])("accepts generated font asset type %s", (contentType) => {
    expect(expectedPreviewMediaType(contentType)).toBe(contentType);
  });

  it.each([
    "image/avif",
    "image/gif",
    "image/jpeg",
    "image/webp",
  ])("accepts tutorial media type %s", (contentType) => {
    expect(expectedPreviewMediaType(contentType)).toBe(contentType);
  });

  it("fails closed for an undeclared media type", () => {
    expect(expectedPreviewMediaType("application/x-unknown")).toBeUndefined();
  });
});
