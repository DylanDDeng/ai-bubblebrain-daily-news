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

export const DEFAULT_PREVIEW_RETRY_DELAYS_MS = Object.freeze([15_000, 30_000]);

export function expectedPreviewMediaType(contentType) {
  return PREVIEW_MEDIA_TYPES.has(contentType) ? contentType : undefined;
}

export async function verifyWithTargetedRetries(
  records,
  verifyBatch,
  {
    delays = DEFAULT_PREVIEW_RETRY_DELAYS_MS,
    sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) {
  let failures = await verifyBatch(records);
  for (const delay of delays) {
    const retryableRecords = records.filter(
      (record) => failures.get(record.route)?.retryable === true,
    );
    if (retryableRecords.length === 0) break;
    await sleep(delay);
    const retryFailures = await verifyBatch(retryableRecords);
    for (const record of retryableRecords) {
      const failure = retryFailures.get(record.route);
      if (failure) failures.set(record.route, failure);
      else failures.delete(record.route);
    }
  }
  return failures;
}
