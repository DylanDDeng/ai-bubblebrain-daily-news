const PREVIEW_MEDIA_TYPES = new Set([
  "application/javascript",
  "application/json",
  "application/octet-stream",
  "application/xml",
  "font/ttf",
  "font/woff",
  "font/woff2",
  "image/gif",
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/vnd.microsoft.icon",
  "image/webp",
  "text/css",
  "text/html",
  "text/plain",
  "video/mp4",
]);

export function expectedPreviewMediaType(contentType) {
  return PREVIEW_MEDIA_TYPES.has(contentType) ? contentType : undefined;
}
