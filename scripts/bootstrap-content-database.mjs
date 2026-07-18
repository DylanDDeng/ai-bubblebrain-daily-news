import postgres from "postgres";

import { validateContentDatabaseTopology } from "./content-database-topology.mjs";

const databaseUrl = process.env.CONTENT_DATABASE_ADMIN_URL;
const projectRef = process.env.CONTENT_DATABASE_PROJECT_REF;
const keyId = process.env.ATTESTATION_ED25519_KEY_ID;
const publicKey = process.env.ATTESTATION_ED25519_PUBLIC_KEY;
const ownerSub = process.env.CONTENT_OWNER_ACCESS_SUB;
const ownerEmail = process.env.CONTENT_OWNER_DISPLAY_EMAIL || null;
const rolePasswords = {
  content_ingestor: process.env.CONTENT_INGESTOR_DATABASE_PASSWORD,
  content_editor: process.env.CONTENT_EDITOR_DATABASE_PASSWORD,
  content_controller: process.env.CONTENT_CONTROLLER_DATABASE_PASSWORD,
  content_reader: process.env.CONTENT_READER_DATABASE_PASSWORD,
  content_deployer: process.env.CONTENT_DEPLOYER_DATABASE_PASSWORD,
};

if (!databaseUrl || !projectRef || !keyId || !publicKey || !ownerSub) {
  throw new Error("Content database bootstrap environment is incomplete");
}
if (
  projectRef === "local" &&
  process.env.ALLOW_LOCAL_CONTENT_BOOTSTRAP !== "true"
) {
  throw new Error(
    "Local bootstrap requires ALLOW_LOCAL_CONTENT_BOOTSTRAP=true",
  );
}
const topology =
  projectRef === "local"
    ? "local"
    : validateContentDatabaseTopology(process.env, projectRef);
const publicKeyBytes = Buffer.from(publicKey || "", "base64url");
if (
  !/^[A-Za-z0-9._-]{4,100}$/.test(keyId) ||
  !/^[A-Za-z0-9_-]{43}$/.test(publicKey) ||
  publicKeyBytes.byteLength !== 32 ||
  !/^[A-Za-z0-9:_|.@/-]{3,512}$/.test(ownerSub)
) {
  throw new Error(
    "Content database bootstrap identity or Ed25519 public key is invalid",
  );
}
for (const [role, password] of Object.entries(rolePasswords)) {
  if (!password || password.length < 32 || password.length > 256) {
    throw new Error(`A 32+ character password is required for ${role}`);
  }
}

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  ssl: databaseUrl.includes("127.0.0.1") ? false : "require",
});
try {
  await sql.begin(async (transaction) => {
    for (const [role, password] of Object.entries(rolePasswords)) {
      const escaped = await transaction`
				select format('alter role %I password %L', ${role}, ${password}) as command
			`;
      await transaction.unsafe(escaped[0].command);
    }
    const existingKeys = await transaction`
			select encode(public_key, 'base64') as public_key_base64
			from private.content_attestation_keys
			where key_id = ${keyId}
		`;
    if (
      existingKeys.length > 0 &&
      Buffer.from(existingKeys[0].public_key_base64, "base64").compare(
        publicKeyBytes,
      ) !== 0
    ) {
      throw new Error(
        "Refusing to replace an attestation public key under an existing key ID",
      );
    }
    await transaction`
			insert into private.content_attestation_keys(
				key_id, public_key, not_before, not_after, status
			) values (
				${keyId}, ${publicKeyBytes}, clock_timestamp() - interval '1 minute',
				clock_timestamp() + interval '180 days', 'active'
			)
			on conflict (key_id) do update set
				not_before = excluded.not_before,
				not_after = excluded.not_after,
				status = 'active'
		`;
    await transaction`
			insert into private.admin_principals(access_sub, display_email, status)
			values (${ownerSub}, ${ownerEmail}, 'active')
			on conflict (access_sub) do update set
				display_email = excluded.display_email,
				status = 'active',
				updated_at = clock_timestamp()
		`;
    await transaction`
			insert into private.admin_role_bindings(principal_id, role)
			select ${ownerSub}, desired.role_name
			from unnest(array['Viewer','Editor','Publisher','Owner']) desired(role_name)
			where not exists (
				select 1 from private.admin_role_bindings existing
				where existing.principal_id = ${ownerSub}
					and existing.role = desired.role_name
					and (existing.valid_until is null or existing.valid_until > clock_timestamp())
			)
		`;
  });
} finally {
  await sql.end({ timeout: 5 });
}

process.stdout.write(
  JSON.stringify(
    {
      project_ref: projectRef,
      topology,
      attestation_key_id: keyId,
      owner_sub: ownerSub,
      runtime_roles_rotated: Object.keys(rolePasswords),
      settings_enabled: false,
    },
    null,
    2,
  ),
);
process.stdout.write("\n");
