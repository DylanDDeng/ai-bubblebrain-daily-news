#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

import { validateContentDatabaseTopology } from "./content-database-topology.mjs";

const KEY_ID = /^[A-Za-z0-9._-]{4,100}$/;
const PUBLIC_KEY = /^[A-Za-z0-9_-]{43}$/;

function projectRefFromDatabaseUrl(value) {
  const parsed = new URL(value);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("attestation rotation requires a PostgreSQL admin URL");
  }
  return (
    parsed.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/i)?.[1] ||
    decodeURIComponent(parsed.username).match(
      /^postgres\.([a-z0-9]{20})$/i,
    )?.[1] ||
    ""
  );
}

export function validateAttestationRotationEnvironment(env) {
  const databaseUrl = String(env.CONTENT_DATABASE_ADMIN_URL || "").trim();
  const projectRef = String(env.CONTENT_DATABASE_PROJECT_REF || "").trim();
  const newKeyId = String(env.ATTESTATION_ED25519_NEW_KEY_ID || "").trim();
  const newPublicKey = String(
    env.ATTESTATION_ED25519_NEW_PUBLIC_KEY || "",
  ).trim();
  const retireKeyId = String(
    env.ATTESTATION_ED25519_RETIRE_KEY_ID || "",
  ).trim();
  const actorSub = String(env.CONTENT_OWNER_ACCESS_SUB || "").trim();
  const reason = String(env.CONTENT_ATTESTATION_ROTATION_REASON || "").trim();
  if (!databaseUrl || !projectRef)
    throw new Error("database identity is missing");
  const detected = projectRefFromDatabaseUrl(databaseUrl);
  let topology = "local";
  if (projectRef === "local") {
    if (env.ALLOW_LOCAL_CONTENT_BOOTSTRAP !== "true")
      throw new Error("local rotation requires explicit opt-in");
  } else if (!/^[a-z0-9]{20}$/.test(projectRef) || detected !== projectRef) {
    throw new Error("database URL does not match the content project ref");
  } else {
    topology = validateContentDatabaseTopology(env, projectRef);
  }
  if (!KEY_ID.test(newKeyId) || !PUBLIC_KEY.test(newPublicKey)) {
    throw new Error("new Ed25519 key identity is invalid");
  }
  const publicKeyBytes = Buffer.from(newPublicKey, "base64url");
  if (publicKeyBytes.byteLength !== 32)
    throw new Error("new Ed25519 public key must be 32 bytes");
  if (retireKeyId && (!KEY_ID.test(retireKeyId) || retireKeyId === newKeyId)) {
    throw new Error("retired key identity is invalid");
  }
  if (!/^[A-Za-z0-9:_|.@/-]{3,512}$/.test(actorSub)) {
    throw new Error("owner subject is invalid");
  }
  if (reason.length < 10 || reason.length > 500) {
    throw new Error("rotation reason must contain 10 to 500 characters");
  }
  return {
    actorSub,
    databaseUrl,
    newKeyId,
    newPublicKey,
    publicKeyBytes,
    reason,
    retireKeyId: retireKeyId || null,
    projectRef,
    topology,
  };
}

async function rotate(env = process.env) {
  const input = validateAttestationRotationEnvironment(env);
  const sql = postgres(input.databaseUrl, {
    max: 1,
    prepare: false,
    ssl: input.projectRef === "local" ? false : "require",
  });
  try {
    return await sql.begin(async (transaction) => {
      const owners = await transaction`
        select p.display_email
        from private.admin_principals p
        join private.admin_role_bindings b on b.principal_id = p.access_sub
        where p.access_sub = ${input.actorSub}
          and p.status = 'active'
          and b.role = 'Owner'
          and b.valid_from <= clock_timestamp()
          and (b.valid_until is null or b.valid_until > clock_timestamp())
        limit 1
      `;
      if (owners.length !== 1)
        throw new Error("rotation actor is not an active Owner");

      const existing = await transaction`
        select public_key, status
        from private.content_attestation_keys
        where key_id = ${input.newKeyId}
        for update
      `;
      if (
        existing.length > 0 &&
        (!Buffer.isBuffer(existing[0].public_key) ||
          existing[0].public_key.compare(input.publicKeyBytes) !== 0)
      ) {
        throw new Error(
          "refusing to replace a public key under an existing key ID",
        );
      }
      if (existing[0]?.status === "retired") {
        throw new Error("retired key IDs cannot be reused");
      }

      let retiredPublicKey = null;
      if (input.retireKeyId) {
        const retired = await transaction`
          select public_key, status
          from private.content_attestation_keys
          where key_id = ${input.retireKeyId}
          for update
        `;
        if (retired.length !== 1 || retired[0].status !== "active") {
          throw new Error("the requested prior key is not active");
        }
        retiredPublicKey = retired[0].public_key;
      }

      await transaction`
        insert into private.content_attestation_keys(
          key_id, public_key, not_before, not_after, status
        ) values (
          ${input.newKeyId}, ${input.publicKeyBytes},
          clock_timestamp() - interval '1 minute',
          clock_timestamp() + interval '180 days', 'active'
        )
        on conflict (key_id) do update set
          not_after = greatest(
            private.content_attestation_keys.not_after,
            excluded.not_after
          )
      `;
      if (input.retireKeyId) {
        await transaction`
          update private.content_attestation_keys
          set status = 'retired', not_after = clock_timestamp()
          where key_id = ${input.retireKeyId} and status = 'active'
        `;
      }

      const action = input.retireKeyId
        ? "attestation.key.rotate"
        : "attestation.key.stage";
      const afterSha = createHash("sha256")
        .update(input.publicKeyBytes)
        .digest("hex");
      const beforeSha = retiredPublicKey
        ? createHash("sha256").update(retiredPublicKey).digest("hex")
        : null;
      const requestId = randomUUID();
      await transaction`
        insert into private.content_audit_log(
          actor_sub, actor_email, actor_role, action, reason, request_id,
          target, before_sha256, after_sha256, result
        ) values (
          ${input.actorSub}, ${owners[0].display_email}, 'Owner', ${action},
          ${input.reason}, ${requestId},
          ${transaction.json({
            new_key_id: input.newKeyId,
            retired_key_id: input.retireKeyId,
          })},
          ${beforeSha}, ${afterSha}, 'succeeded'
        )
      `;
      return {
        action,
        new_key_id: input.newKeyId,
        retired_key_id: input.retireKeyId,
        request_id: requestId,
      };
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.stdout.write(`${JSON.stringify(await rotate(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
