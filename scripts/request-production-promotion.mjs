import { createHmac } from "node:crypto";

const brokerUrl = process.env.PRODUCTION_BROKER_URL;
const secret = process.env.PRODUCTION_BROKER_HMAC_SECRET;
if (!brokerUrl || !secret)
  throw new Error("Production Broker environment is incomplete");

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const body = Buffer.concat(chunks).toString("utf8");
JSON.parse(body);
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac("sha256", secret)
  .update(`${timestamp}\n${body}`)
  .digest("hex");
const response = await fetch(new URL("/v1/promote", brokerUrl), {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Content-Timestamp": timestamp,
    "X-Content-Signature": signature,
  },
  body,
});
if (!response.ok) {
  throw new Error(
    `Production Broker rejected promotion with ${response.status}`,
  );
}
process.stdout.write(await response.text());
