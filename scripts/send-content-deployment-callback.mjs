import { createHmac } from "node:crypto";

const [eventType, evidenceText = "{}"] = process.argv.slice(2);
const callbackUrl = process.env.CONTENT_DEPLOY_CALLBACK_URL;
const secret = process.env.CONTENT_DEPLOY_CALLBACK_SECRET;
const siteReleaseId = process.env.SITE_RELEASE_ID;
const dispatchId = process.env.DISPATCH_ID;
const attemptToken = process.env.DEPLOYMENT_ATTEMPT_TOKEN;
const executionGeneration = Number(
  process.env.DEPLOYMENT_EXECUTION_GENERATION || 0,
);
if (!callbackUrl || !secret || !siteReleaseId || !dispatchId || !eventType) {
  throw new Error("Deployment callback environment is incomplete");
}
const evidence = JSON.parse(evidenceText);
const body = JSON.stringify({
  site_release_id: siteReleaseId,
  dispatch_id: dispatchId,
  ...(attemptToken
    ? {
        attempt_token: attemptToken,
        execution_generation: executionGeneration,
      }
    : {}),
  event_type: eventType,
  evidence,
});
const signature = createHmac("sha256", secret).update(body).digest("hex");
const response = await fetch(callbackUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Content-Signature": signature,
  },
  body,
});
if (!response.ok)
  throw new Error(`Deployment callback failed with ${response.status}`);
