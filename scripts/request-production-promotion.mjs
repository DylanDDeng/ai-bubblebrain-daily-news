import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_WAIT_TIMEOUT_MS = 45 * 60 * 1_000;
const DEFAULT_SUBMIT_TIMEOUT_MS = 16 * 60 * 1_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_CONSECUTIVE_STATUS_FAILURES = 6;

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function brokerError(prefix, response, responseBody) {
  const diagnosticBody = responseBody.trim().slice(0, 4096);
  return new Error(
    `${prefix} with ${response.status}${
      diagnosticBody ? `: ${diagnosticBody}` : ""
    }`,
  );
}

function signedHeaders(secret, body, now) {
  const timestamp = String(Math.floor(now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}\n${body}`)
    .digest("hex");
  return {
    "Content-Type": "application/json",
    "X-Content-Timestamp": timestamp,
    "X-Content-Signature": signature,
  };
}

async function signedPost({
  brokerUrl,
  path,
  secret,
  body,
  fetchImpl,
  now,
  requestTimeoutMs,
}) {
  return fetchImpl(new URL(path, brokerUrl), {
    method: "POST",
    headers: signedHeaders(secret, body, now),
    body,
    signal: AbortSignal.timeout(
      positiveInteger(requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS),
    ),
  });
}

export async function requestProductionPromotion({
  brokerUrl,
  secret,
  body,
  fetchImpl = fetch,
  now = Date.now,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  waitTimeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
  submitTimeoutMs = DEFAULT_SUBMIT_TIMEOUT_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}) {
  const promotion = JSON.parse(body);
  const siteReleaseId = String(promotion.site_release_id || "");
  if (!UUID.test(siteReleaseId)) {
    throw new Error("Production promotion site_release_id is invalid");
  }
  const submitted = await signedPost({
    brokerUrl,
    path: "/v1/promote",
    secret,
    body,
    fetchImpl,
    now,
    // During the compatibility rollout the old Broker may hold this request
    // for its full 15-minute synchronous wait. Keep a bounded but larger
    // submit timeout until every Broker speaks the asynchronous protocol.
    requestTimeoutMs: submitTimeoutMs,
  });
  const submittedBody = await submitted.text();
  if (!submitted.ok) {
    throw brokerError(
      "Production Broker rejected promotion",
      submitted,
      submittedBody,
    );
  }
  // Backward compatibility: the old Broker waits for the Durable Object and
  // returns the final 200 response directly.
  if (submitted.status !== 202) return submittedBody;

  let accepted;
  try {
    accepted = JSON.parse(submittedBody);
  } catch {
    throw new Error("Production Broker returned an invalid operation response");
  }
  const operationId = String(accepted.operation_id || "");
  if (
    !UUID.test(operationId) ||
    String(accepted.site_release_id || "") !== siteReleaseId
  ) {
    throw new Error("Production Broker returned an invalid operation identity");
  }

  const deadline =
    now() + positiveInteger(waitTimeoutMs, DEFAULT_WAIT_TIMEOUT_MS);
  const pollDelay = positiveInteger(pollIntervalMs, DEFAULT_POLL_INTERVAL_MS);
  let consecutiveFailures = 0;
  while (now() < deadline) {
    await sleep(Math.min(pollDelay, Math.max(1, deadline - now())));
    const statusBody = JSON.stringify({
      operation_id: operationId,
      site_release_id: siteReleaseId,
    });
    let statusResponse;
    try {
      statusResponse = await signedPost({
        brokerUrl,
        path: `/v1/operations/${operationId}`,
        secret,
        body: statusBody,
        fetchImpl,
        now,
        requestTimeoutMs: Math.min(
          positiveInteger(requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS),
          Math.max(1, deadline - now()),
        ),
      });
    } catch (error) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_STATUS_FAILURES) throw error;
      continue;
    }
    const responseBody = await statusResponse.text();
    if (statusResponse.status === 202) {
      consecutiveFailures = 0;
      let pending;
      try {
        pending = JSON.parse(responseBody);
      } catch {
        throw new Error(
          "Production Broker returned an invalid pending operation response",
        );
      }
      if (
        String(pending.operation_id || "") !== operationId ||
        String(pending.site_release_id || "") !== siteReleaseId ||
        !["queued", "running"].includes(String(pending.status || ""))
      ) {
        throw new Error(
          "Production Broker returned a mismatched operation status",
        );
      }
      continue;
    }
    if (
      statusResponse.headers.get("X-Content-Operation-Status") === "completed"
    ) {
      if (!statusResponse.ok) {
        throw brokerError(
          `Production Broker operation ${operationId} failed`,
          statusResponse,
          responseBody,
        );
      }
      return responseBody;
    }
    if (statusResponse.status === 429 || statusResponse.status >= 500) {
      consecutiveFailures += 1;
      if (consecutiveFailures < MAX_CONSECUTIVE_STATUS_FAILURES) continue;
    }
    throw brokerError(
      "Production Broker status request failed",
      statusResponse,
      responseBody,
    );
  }
  throw new Error(
    `Production Broker operation ${operationId} did not complete within ${Math.ceil(
      positiveInteger(waitTimeoutMs, DEFAULT_WAIT_TIMEOUT_MS) / 60_000,
    )} minutes`,
  );
}

async function main() {
  const brokerUrl = process.env.PRODUCTION_BROKER_URL;
  const secret = process.env.PRODUCTION_BROKER_HMAC_SECRET;
  if (!brokerUrl || !secret)
    throw new Error("Production Broker environment is incomplete");

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  const result = await requestProductionPromotion({
    brokerUrl,
    secret,
    body,
    pollIntervalMs: positiveInteger(
      process.env.PRODUCTION_BROKER_POLL_INTERVAL_MS,
      DEFAULT_POLL_INTERVAL_MS,
    ),
    waitTimeoutMs: positiveInteger(
      process.env.PRODUCTION_BROKER_WAIT_TIMEOUT_MS,
      DEFAULT_WAIT_TIMEOUT_MS,
    ),
    submitTimeoutMs: positiveInteger(
      process.env.PRODUCTION_BROKER_SUBMIT_TIMEOUT_MS,
      DEFAULT_SUBMIT_TIMEOUT_MS,
    ),
    requestTimeoutMs: positiveInteger(
      process.env.PRODUCTION_BROKER_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
  });
  process.stdout.write(result);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
