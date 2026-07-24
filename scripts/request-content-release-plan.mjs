import { createHmac } from "node:crypto";

const callbackUrl = process.env.CONTENT_DEPLOY_CALLBACK_URL;
const secret = process.env.CONTENT_DEPLOY_CALLBACK_SECRET;
const body = JSON.stringify({
  site_release_id: process.env.SITE_RELEASE_ID,
  dispatch_id: process.env.DISPATCH_ID,
  attempt_token: process.env.DEPLOYMENT_ATTEMPT_TOKEN,
  execution_generation: Number(
    process.env.DEPLOYMENT_EXECUTION_GENERATION || 0,
  ),
});
if (!callbackUrl || !secret) {
  throw new Error("Content release plan environment is incomplete");
}
const signature = createHmac("sha256", secret).update(body).digest("hex");
const url = new URL("/internal/deployment-plan", callbackUrl);
const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Content-Signature": signature,
  },
  body,
});
const responseBody = await response.text();
if (!response.ok) {
  throw new Error(
    `Content release plan request failed with ${response.status}: ${responseBody
      .trim()
      .slice(0, 1024)}`,
  );
}
const plan = JSON.parse(responseBody);
if (!plan || typeof plan !== "object") {
  throw new Error("Content release plan response is invalid");
}
process.stdout.write(`${JSON.stringify(plan)}\n`);
