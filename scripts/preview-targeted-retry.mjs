export const DEFAULT_PREVIEW_RETRY_DELAYS_MS = Object.freeze([15_000, 30_000]);

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
