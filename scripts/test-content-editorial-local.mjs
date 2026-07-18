import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import postgres from "postgres";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}
function canonicalJsonBytes(value) {
  return new TextEncoder().encode(
    `${JSON.stringify(canonicalize(value), null, 2)}\n`,
  );
}
async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

const databaseUrl =
  process.env.CONTENT_TEST_DATABASE_URL ||
  "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres";
if (
  !databaseUrl.includes("127.0.0.1") &&
  process.env.ALLOW_REMOTE_CONTENT_TEST !== "true"
) {
  throw new Error(
    "Refusing to run destructive editorial integration setup against a remote database",
  );
}

const admin = postgres(databaseUrl, { max: 1, prepare: false, ssl: false });
async function role(name) {
  const connection = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    ssl: false,
  });
  await connection.unsafe(`set role ${name}`);
  return connection;
}
const ingestor = await role("content_ingestor");
const editor = await role("content_editor");
const controller = await role("content_controller");
const deployer = await role("content_deployer");
const actorSub = "local|content-owner";
const keyId = "local-editorial-test-v1";
const {
  privateKey: attestationPrivateKey,
  publicKey: attestationPublicKeyObject,
} = generateKeyPairSync("ed25519");
const attestationPublicKey = Buffer.from(
  attestationPublicKeyObject.export({ format: "jwk" }).x,
  "base64url",
);
const BUILD_ENV = "node22.17-astro7-hugo0.147.9-v1";

function attestation(action, audience, bodySha256) {
  const issued = new Date();
  const payload = JSON.stringify({
    action,
    aud: audience,
    auth_context: audience === "content-control" ? "access+totp" : "access",
    body_sha256: bodySha256,
    exp: new Date(issued.getTime() + 60_000).toISOString(),
    iat: issued.toISOString(),
    jti: randomUUID(),
    key_id: keyId,
    sub: actorSub,
  });
  return {
    payload,
    signature: sign(null, Buffer.from(payload), attestationPrivateKey).toString(
      "hex",
    ),
  };
}

async function rpc(sql, query) {
  const rows = await query;
  if (!rows[0]?.result) throw new Error("Integration RPC returned no result");
  return rows[0].result;
}

try {
  await admin`
		update private.content_settings set enabled = true
		where setting_key in ('shadow_build','publication','admin_draft','admin_preview','admin_publish')
	`;
  const snapshotRows = await admin`
		select id, parsed_document from private.report_snapshots order by report_date desc limit 1
	`;
  if (!snapshotRows.length)
    throw new Error(
      "Run the structured history importer before this integration test",
    );
  const baseSnapshot = snapshotRows[0];
  const reservation = await rpc(
    ingestor,
    ingestor`
		select private.reserve_site_release_v1(${baseSnapshot.id}::uuid) as result
	`,
  );
  const baseManifestHash = "b".repeat(64);
  const baseContentHash = "c".repeat(64);
  const baseDispatchId = randomUUID();
  const baseRelease = await rpc(
    ingestor,
    ingestor`
		select private.finalize_site_release_v1(
			${reservation.reservation_id}::uuid,
			${`site-manifests/sha256/${baseManifestHash}.json`}, 100, ${baseManifestHash}, ${baseContentHash},
			1, 1, 'daily-json-c14n-v1', 'search-v1', 'daily-source-v1', '2026-07-16'::date,
			array[]::date[], ${baseDispatchId}::uuid,
			${ingestor.json({
        dispatch_id: baseDispatchId,
        site_release_id: reservation.site_release_id,
        site_release_sequence: reservation.site_release_sequence,
        expected_predecessor_id: reservation.expected_predecessor_id,
        expected_content_sha: baseContentHash,
        code_sha: "e".repeat(40),
        build_environment_version: BUILD_ENV,
        mode: "shadow",
      })}
		) as result
	`,
  );
  await admin`
		insert into private.content_attestation_keys(key_id, public_key, not_before, not_after)
		values (${keyId}, ${attestationPublicKey}, clock_timestamp() - interval '1 minute', clock_timestamp() + interval '1 day')
	`;
  await admin`
		insert into private.admin_principals(access_sub, display_email) values (${actorSub}, 'local@example.invalid')
	`;
  await admin`
		insert into private.admin_role_bindings(principal_id, role)
		select ${actorSub}, value from unnest(array['Viewer','Editor','Publisher','Owner']) value
	`;
  const artifactHash = "d".repeat(64);
  await deployer`
		select private.register_release_artifact_v1(
			${baseRelease.site_release_id}::uuid, ${`artifacts/sha256/${artifactHash}.tar`}, 1024,
			${artifactHash}, ${artifactHash}, 'sha256-deterministic-tar-v1', ${"e".repeat(40)}, ${BUILD_ENV}
		)
	`;
  await deployer`
		select private.record_deployment_event_v1(
			${baseRelease.site_release_id}::uuid, ${baseDispatchId}::uuid, 'preview_verified',
			'{"route_parity":true}'::jsonb
		)
	`;
  const promotion = await rpc(
    deployer,
    deployer`
		select private.authorize_production_promotion_v1(${baseRelease.site_release_id}::uuid, 0, 'local-test', 600) as result
	`,
  );
  await deployer`select private.mark_promotion_deploying_v1(
		${baseRelease.site_release_id}::uuid, ${promotion.fencing_token}, 0
	)`;
  await deployer`select private.mark_promotion_verifying_v1(
		${baseRelease.site_release_id}::uuid, ${promotion.fencing_token}, 0, 'local-pages-deployment'
	)`;
  await deployer`
		select private.commit_production_promotion_v1(
			${baseRelease.site_release_id}::uuid, ${promotion.fencing_token}, 0, 'local-pages-deployment',
			${baseManifestHash}, ${artifactHash}, ${BUILD_ENV}, '{"multi_edge_verified":true}'::jsonb
		)
	`;

  const createHash = "1".repeat(64);
  const createKey = randomUUID();
  const draft = await rpc(
    editor,
    editor`
		select private.create_editorial_draft_v1(
			${baseRelease.site_release_id}::uuid, ${createKey}::uuid,
			${editor.json(attestation("draft.create", "content-routine", createHash))}, ${createHash}
		) as result
	`,
  );
  const item = await admin`
		select si.item_id, si.revision_id, si.override_id
		from private.site_release_reports sr
		join private.report_snapshot_items si on si.report_snapshot_id = sr.report_snapshot_id
		where sr.site_release_id = ${baseRelease.site_release_id}::uuid
		order by sr.report_date desc, si.ordinal limit 1
	`;
  const updateHash = "2".repeat(64);
  const updated = await rpc(
    editor,
    editor`
		select private.upsert_editorial_draft_item_v1(
			${draft.draft_id}::uuid, ${item[0].item_id}, ${item[0].revision_id}::uuid,
			${item[0].override_id}::uuid, ${editor.json({ title: "Editorial integration title" })},
			${draft.row_version}, 'local integration editorial reason', ${randomUUID()}::uuid,
			${editor.json(attestation("draft.update", "content-routine", updateHash))}, ${updateHash}
		) as result
	`,
  );
  const previewHash = "3".repeat(64);
  const preview = await rpc(
    editor,
    editor`
		select private.request_preview_build_v1(
			${draft.draft_id}::uuid, ${updated.row_version}, ${randomUUID()}::uuid,
			${editor.json(attestation("preview.build", "content-routine", previewHash))}, ${previewHash}
		) as result
	`,
  );
  const registered = await rpc(
    deployer,
    deployer`
		select private.register_preview_build_v1(
			${draft.draft_id}::uuid, ${preview.preview_sha256}, ${"4".repeat(64)},
			'https://preview.invalid', '{"route_parity":true}'::jsonb
		) as result
	`,
  );
  const publishHash = "5".repeat(64);
  const publish = await rpc(
    controller,
    controller`
		select private.request_editorial_publish_v1(
			${draft.draft_id}::uuid, ${registered.preview_build_id}::uuid, ${registered.row_version},
			'publish local editorial integration result', ${randomUUID()}::uuid,
			${controller.json(attestation("draft.publish", "content-control", publishHash))}, ${publishHash}
		) as result
	`,
  );
  const workerId = `local:${randomUUID()}`;
  const claimed = await rpc(
    ingestor,
    ingestor`
		select private.claim_editorial_publish_request_v1(${workerId}, 600) as result
	`,
  );
  if (claimed.id !== publish.publish_request_id)
    throw new Error("Editorial request claim mismatch");
  const input = await rpc(
    ingestor,
    ingestor`
		select private.get_editorial_publish_input_v1(${claimed.id}::uuid) as result
	`,
  );
  const reportObjects = [];
  for (const report of input.reports) {
    const rows =
      await admin`select parsed_document from private.report_snapshots where id = ${report.report_snapshot_id}::uuid`;
    const document = structuredClone(rows[0].parsed_document);
    for (const reportItem of document.items) {
      if (reportItem.id === item[0].item_id)
        reportItem.title = "Editorial integration title";
    }
    const bytes = canonicalJsonBytes(document);
    const hash = await sha256Hex(bytes);
    reportObjects.push({
      report_date: report.report_date,
      object_key: `report-snapshots/sha256/${hash}.json`,
      byte_length: bytes.byteLength,
      byte_sha256: hash,
      parsed_document: document,
    });
  }
  for (const invalidObjects of [[], [reportObjects[0], reportObjects[0]]]) {
    let rejected = false;
    try {
      await ingestor`
				select private.stage_editorial_release_v1(
					${claimed.id}::uuid, ${ingestor.json(invalidObjects)}
				)
			`;
    } catch (error) {
      rejected = error?.message?.includes(
        "Editorial report object coverage mismatch",
      );
    }
    if (!rejected)
      throw new Error(
        "Editorial staging accepted missing or duplicate report dates",
      );
  }
  const staged = await rpc(
    ingestor,
    ingestor`
		select private.stage_editorial_release_v1(${claimed.id}::uuid, ${ingestor.json(reportObjects)}) as result
	`,
  );
  const repeatedStage = await rpc(
    ingestor,
    ingestor`
		select private.stage_editorial_release_v1(${claimed.id}::uuid, ${ingestor.json(reportObjects)}) as result
	`,
  );
  if (
    !repeatedStage.idempotent ||
    repeatedStage.reservation_id !== staged.reservation_id
  ) {
    throw new Error("Editorial staging is not idempotent after reservation");
  }
  const editorialManifestHash = await sha256Hex(canonicalJsonBytes(staged));
  const editorialContentHash = await sha256Hex(
    canonicalJsonBytes({ reports: staged.reports }),
  );
  const editorialDispatchId = randomUUID();
  const finalized = await rpc(
    ingestor,
    ingestor`
		select private.finalize_editorial_release_v1(
			${claimed.id}::uuid, ${`site-manifests/sha256/${editorialManifestHash}.json`}, 200,
			${editorialManifestHash}, ${editorialContentHash}, ${editorialDispatchId}::uuid,
			${ingestor.json({
        dispatch_id: editorialDispatchId,
        site_release_id: staged.site_release_id,
        site_release_sequence: staged.site_release_sequence,
        expected_predecessor_id: staged.expected_predecessor_id,
        expected_content_sha: editorialContentHash,
        code_sha: "e".repeat(40),
        build_environment_version: BUILD_ENV,
        mode: "production",
      })}
		) as result
	`,
  );
  const repeatedFinalize = await rpc(
    ingestor,
    ingestor`
		select private.finalize_editorial_release_v1(
			${claimed.id}::uuid, ${`site-manifests/sha256/${editorialManifestHash}.json`}, 200,
			${editorialManifestHash}, ${editorialContentHash}, ${editorialDispatchId}::uuid,
			${ingestor.json({})}
		) as result
	`,
  );
  if (
    !repeatedFinalize.idempotent ||
    repeatedFinalize.site_release_id !== finalized.site_release_id
  ) {
    throw new Error(
      "Editorial finalization is not idempotent after completion",
    );
  }
  const checks = await admin`
		select
			(select status from private.editorial_drafts where id = ${draft.draft_id}::uuid) as draft_status,
			(select status from private.editorial_publish_requests where id = ${claimed.id}::uuid) as request_status,
			(select count(*) from private.editorial_overrides where item_id = ${item[0].item_id} and status = 'active') as active_overrides,
			(select count(*) from private.site_release_reports where site_release_id = ${finalized.site_release_id}::uuid) as report_count,
			(select count(*)
			 from private.site_release_reports release_report
			 join private.report_snapshot_items snapshot_item
			   on snapshot_item.report_snapshot_id = release_report.report_snapshot_id
			 join private.editorial_overrides active_override
			   on active_override.id = snapshot_item.override_id and active_override.status = 'active'
			 where release_report.site_release_id = ${baseRelease.site_release_id}::uuid) as base_active_override_links,
			(select count(*)
			 from private.site_release_reports release_report
			 join private.report_snapshot_items snapshot_item
			   on snapshot_item.report_snapshot_id = release_report.report_snapshot_id
			 join private.editorial_overrides active_override
			   on active_override.id = snapshot_item.override_id and active_override.status = 'active'
			 where release_report.site_release_id = ${finalized.site_release_id}::uuid) as editorial_active_override_links
	`;
  if (
    checks[0].draft_status !== "published" ||
    checks[0].request_status !== "completed" ||
    Number(checks[0].active_overrides) !== 1 ||
    Number(checks[0].report_count) < 1 ||
    Number(checks[0].base_active_override_links) !== 0 ||
    Number(checks[0].editorial_active_override_links) !== 1
  ) {
    throw new Error("Editorial release state did not converge");
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        base_site_release_id: baseRelease.site_release_id,
        editorial_site_release_id: finalized.site_release_id,
        draft_status: checks[0].draft_status,
        request_status: checks[0].request_status,
        active_overrides: Number(checks[0].active_overrides),
        report_count: Number(checks[0].report_count),
        base_active_override_links: Number(
          checks[0].base_active_override_links,
        ),
        editorial_active_override_links: Number(
          checks[0].editorial_active_override_links,
        ),
        missing_and_duplicate_report_dates_rejected: true,
        stage_idempotent: repeatedStage.idempotent,
        finalize_idempotent: repeatedFinalize.idempotent,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await Promise.all([
    admin.end(),
    ingestor.end(),
    editor.end(),
    controller.end(),
    deployer.end(),
  ]);
}
