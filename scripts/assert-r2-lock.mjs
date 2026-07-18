#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function assertR2Lock(
  payload,
  objectKey,
  minimumRetentionSeconds,
  now = Date.now(),
  requireIndefinite = false,
) {
  if (
    !payload ||
    payload.success !== true ||
    !Array.isArray(payload.result?.rules)
  ) {
    throw new Error("R2 bucket lock API response is not successful");
  }
  if (
    !objectKey ||
    !Number.isSafeInteger(minimumRetentionSeconds) ||
    minimumRetentionSeconds <= 0
  ) {
    throw new Error("R2 bucket lock assertion input is invalid");
  }
  const minimumDate = now + minimumRetentionSeconds * 1000;
  const rule = payload.result.rules.find((candidate) => {
    if (!candidate || candidate.enabled !== true) return false;
    const prefix = typeof candidate.prefix === "string" ? candidate.prefix : "";
    if (!objectKey.startsWith(prefix)) return false;
    const condition = candidate.condition;
    if (!condition || typeof condition !== "object") return false;
    if (requireIndefinite) return condition.type === "Indefinite";
    if (condition.type === "Indefinite") return true;
    if (condition.type === "Age") {
      return (
        Number.isSafeInteger(condition.maxAgeSeconds) &&
        condition.maxAgeSeconds >= minimumRetentionSeconds
      );
    }
    if (condition.type === "Date") {
      const retentionDate = Date.parse(condition.date);
      return Number.isFinite(retentionDate) && retentionDate >= minimumDate;
    }
    return false;
  });
  if (!rule) {
    throw new Error(
      requireIndefinite
        ? `no enabled indefinite R2 lock rule covers ${objectKey}`
        : `no enabled R2 lock rule covers ${objectKey} for ${minimumRetentionSeconds} seconds`,
    );
  }
  return {
    verified: true,
    rule_id: String(rule.id || ""),
    prefix: typeof rule.prefix === "string" ? rule.prefix : "",
    condition: rule.condition,
    minimum_retention_seconds: minimumRetentionSeconds,
    required_condition: requireIndefinite ? "Indefinite" : "minimum-retention",
    checked_at: new Date(now).toISOString(),
  };
}

function run(argv = process.argv.slice(2)) {
  const [path, objectKey, seconds] = argv;
  const requireIndefinite = seconds === "indefinite";
  const minimum = requireIndefinite ? 1 : Number(seconds);
  const payload = JSON.parse(readFileSync(path, "utf8"));
  process.stdout.write(
    `${JSON.stringify(assertR2Lock(payload, objectKey, minimum, Date.now(), requireIndefinite))}\n`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    run();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
