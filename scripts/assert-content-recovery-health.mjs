#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function assertContentRecoveryHealth(
  pitrPayload,
  objectListing,
  maximumBackupAgeSeconds,
  now = Date.now(),
) {
  if (pitrPayload?.pitr_enabled !== true) {
    throw new Error("Supabase PITR is not enabled");
  }
  if (
    !Number.isSafeInteger(maximumBackupAgeSeconds) ||
    maximumBackupAgeSeconds <= 0
  ) {
    throw new Error("maximum backup age is invalid");
  }
  const objects = Array.isArray(objectListing?.Contents)
    ? objectListing.Contents
    : [];
  const latest = objects
    .filter(
      (entry) =>
        entry &&
        typeof entry.Key === "string" &&
        typeof entry.LastModified === "string",
    )
    .map((entry) => ({ ...entry, timestamp: Date.parse(entry.LastModified) }))
    .filter(
      (entry) => Number.isFinite(entry.timestamp) && entry.timestamp <= now,
    )
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  if (!latest)
    throw new Error("no completed encrypted database backup was found");
  const ageSeconds = Math.floor((now - latest.timestamp) / 1000);
  if (ageSeconds > maximumBackupAgeSeconds) {
    throw new Error(
      `latest encrypted database backup is ${ageSeconds} seconds old`,
    );
  }
  return {
    healthy: true,
    checked_at: new Date(now).toISOString(),
    pitr_enabled: true,
    latest_backup_object_key: latest.Key,
    latest_backup_at: new Date(latest.timestamp).toISOString(),
    latest_backup_age_seconds: ageSeconds,
    maximum_backup_age_seconds: maximumBackupAgeSeconds,
  };
}

function run(argv = process.argv.slice(2)) {
  const [pitrPath, listingPath, maximumAge] = argv;
  const result = assertContentRecoveryHealth(
    JSON.parse(readFileSync(pitrPath, "utf8")),
    JSON.parse(readFileSync(listingPath, "utf8")),
    Number(maximumAge),
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
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
