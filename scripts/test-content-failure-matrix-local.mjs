import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import postgres from "postgres";

const databaseUrl =
  process.env.CONTENT_TEST_DATABASE_URL ||
  "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres";
if (!databaseUrl.includes("127.0.0.1") && !databaseUrl.includes("localhost")) {
  throw new Error(
    "Refusing to run the destructive failure matrix against a remote database",
  );
}

const evidenceOutIndex = process.argv.indexOf("--evidence-out");
const evidenceOut =
  evidenceOutIndex >= 0 ? process.argv[evidenceOutIndex + 1] : null;
if (evidenceOutIndex >= 0 && !evidenceOut)
  throw new Error("--evidence-out requires a path");

const fixture = JSON.parse(
  await readFile(
    new URL("../astro/tests/fixtures/daily-report.valid.json", import.meta.url),
    "utf8",
  ),
);
const admin = postgres(databaseUrl, {
  max: 60,
  prepare: false,
  ssl: false,
  connect_timeout: 10,
  idle_timeout: 5,
});
const allowedRoles = new Set([
  "content_ingestor",
  "content_editor",
  "content_controller",
  "content_reader",
  "content_deployer",
]);
const BUILD_ENV = "node22.17-astro7-hugo0.147.9-v1";
const ATTESTATION_KEY_ID = "local-failure-matrix-v1";
const {
  privateKey: ATTESTATION_PRIVATE_KEY,
  publicKey: ATTESTATION_PUBLIC_KEY_OBJECT,
} = generateKeyPairSync("ed25519");
const ATTESTATION_PUBLIC_KEY = Buffer.from(
  ATTESTATION_PUBLIC_KEY_OBJECT.export({ format: "jwk" }).x,
  "base64url",
);
const ACTOR_SUB = "local|failure-matrix-owner";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function reportObject(document) {
  const bytes = Buffer.from(
    `${JSON.stringify(canonicalize(document), null, 2)}\n`,
  );
  const hash = sha256(bytes);
  return {
    document,
    objectKey: `report-snapshots/sha256/${hash}.json`,
    byteLength: bytes.byteLength,
    byteSha256: hash,
  };
}

function syntheticDocument(date, variant, { stableIdentity = false } = {}) {
  const document = structuredClone(fixture);
  const identitySeed = stableIdentity ? `${date}:stable` : `${date}:${variant}`;
  const identityHash = sha256(`item:${identitySeed}`);
  const eventHash = sha256(`event:${identitySeed}`);
  const claimHash = sha256(`claim:${identitySeed}`);
  const generatedAt = `${date}T07:00:00.000Z`;
  const itemId = `n_${identityHash}`;
  document.date = date;
  document.generated_at = generatedAt;
  document.producer.version = `failure-matrix-${variant}`;
  document.overview.text = `Failure matrix report ${variant}`;
  document.items[0] = {
    ...document.items[0],
    id: itemId,
    event_id: `e_${eventHash}`,
    identity_claims: [`c_${claimHash}`],
    source_id: `failure-${identitySeed}`,
    title: `并发验证条目 ${variant}`,
    url: `https://example.invalid/failure/${encodeURIComponent(identitySeed)}`,
    canonical_url: `https://example.invalid/failure/${encodeURIComponent(identitySeed)}`,
    published_at: generatedAt,
    published_date: date,
    ingested_at: generatedAt,
    summary: `Failure matrix payload ${variant}`,
  };
  for (const batch of document.batches) {
    batch.generated_at = batch.status === "completed" ? generatedAt : null;
    batch.item_ids = batch.id === "afternoon" ? [itemId] : [];
  }
  return document;
}

async function asRole(role, operation) {
  if (!allowedRoles.has(role))
    throw new Error(`Refusing unknown test role: ${role}`);
  return admin.begin(async (sql) => {
    await sql.unsafe(`set local role ${role}`);
    return operation(sql);
  });
}

function rpc(rows) {
  if (!rows.length || !Object.hasOwn(rows[0], "result")) {
    throw new Error("Failure matrix RPC returned no result column");
  }
  return rows[0].result;
}

async function expectRejected(label, operation, expected) {
  try {
    await operation();
  } catch (error) {
    const message = String(error?.message || error);
    if (expected.test(message)) return message;
    throw new Error(`${label} failed with an unexpected error: ${message}`);
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function ingest(prepared) {
  return rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
			select private.ingest_report_snapshot_v1(
				${sql.json(prepared.document)}, ${prepared.objectKey}, ${prepared.byteLength},
				${prepared.byteSha256}, 'daily-json-c14n-v1', 'live_ingestion', null
			) as result
		`,
    ),
  );
}

async function reserveIngestionRelease(snapshotId, batchId, contentSha256) {
  return rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
        select private.reserve_ingestion_site_release_v1(
          ${snapshotId}::uuid, ${batchId}, ${contentSha256}, ${contentSha256},
          'local-failure-matrix', ${BUILD_ENV}
        ) as result
      `,
    ),
  );
}

async function finalizeReservedRelease(
  reservation,
  label,
  dispatchId,
  mode = "shadow",
  dispatchOverrides = {},
) {
  const manifestSha256 = sha256(`manifest:${label}`);
  const contentRootSha256 = sha256(`content:${label}`);
  return rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
        select private.finalize_site_release_v1(
          ${reservation.reservation_id}::uuid,
          ${`site-manifests/sha256/${manifestSha256}.json`}, 1024, ${manifestSha256},
          ${contentRootSha256}, 1, 1, 'daily-json-c14n-v1', 'search-v1', 'daily-source-v1',
          '2098-01-01'::date, array[]::date[], ${dispatchId}::uuid,
          ${sql.json({
            dispatch_id: dispatchId,
            site_release_id: reservation.site_release_id,
            site_release_sequence: reservation.site_release_sequence,
            expected_predecessor_id: reservation.expected_predecessor_id,
            expected_content_sha: contentRootSha256,
            code_sha: sha256(`code:${label}`).slice(0, 40),
            build_environment_version: BUILD_ENV,
            mode,
            ...dispatchOverrides,
          })}
        ) as result
      `,
    ),
  );
}

async function failIngestionAttempt(
  reportDate,
  batchId,
  inputSha256,
  errorCode,
  errorDetail,
) {
  return rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
        select private.fail_ingestion_publication_attempt_v1(
          ${reportDate}::date, ${batchId}, ${inputSha256},
          'local-failure-matrix', ${BUILD_ENV}, ${errorCode}, ${errorDetail}
        ) as result
      `,
    ),
  );
}

async function createRelease(snapshotId, label, mode = "shadow") {
  const reservation = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
			select private.reserve_site_release_v1(${snapshotId}::uuid) as result
		`,
    ),
  );
  const manifestSha256 = sha256(`manifest:${label}`);
  const contentSha256 = sha256(`content:${label}`);
  const artifactSha256 = sha256(`artifact:${label}`);
  const dispatchId = randomUUID();
  const release = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
			select private.finalize_site_release_v1(
				${reservation.reservation_id}::uuid,
				${`site-manifests/sha256/${manifestSha256}.json`}, 1024, ${manifestSha256},
				${contentSha256}, 1, 1, 'daily-json-c14n-v1', 'search-v1', 'daily-source-v1',
				'2098-01-01'::date, array[]::date[], ${dispatchId}::uuid,
				${sql.json({
          dispatch_id: dispatchId,
          site_release_id: reservation.site_release_id,
          site_release_sequence: reservation.site_release_sequence,
          expected_predecessor_id: reservation.expected_predecessor_id,
          expected_content_sha: contentSha256,
          code_sha: sha256(`code:${label}`).slice(0, 40),
          build_environment_version: BUILD_ENV,
          mode,
        })}
			) as result
		`,
    ),
  );
  return {
    ...release,
    dispatchId,
    manifestSha256,
    contentSha256,
    artifactSha256,
    label,
  };
}

async function prepareRelease(release) {
  await asRole(
    "content_deployer",
    (sql) => sql`
		select private.record_deployment_event_v1(
			${release.site_release_id}::uuid, ${release.dispatchId}::uuid,
			'preview_verified', '{"route_parity":true}'::jsonb
		)
	`,
  );
  await asRole(
    "content_deployer",
    (sql) => sql`
		select private.register_release_artifact_v1(
			${release.site_release_id}::uuid,
			${`artifacts/sha256/${release.artifactSha256}.json`}, 4096,
			${release.artifactSha256}, ${release.artifactSha256}, 'sha256-content-addressed-pages-v1',
			${sha256(`code:${release.label}`).slice(0, 40)}, ${BUILD_ENV}
		)
	`,
  );
}

async function authorizeForward(release, generation) {
  return rpc(
    await asRole(
      "content_deployer",
      (sql) => sql`
			select private.authorize_production_promotion_v1(
				${release.site_release_id}::uuid, ${generation}, ${`failure-matrix:${release.label}`}, 600
			) as result
		`,
    ),
  );
}

async function commitForward(
  release,
  authorization,
  generation,
  overrides = {},
) {
  const manifestSha256 = overrides.manifestSha256 ?? release.manifestSha256;
  const artifactSha256 = overrides.artifactSha256 ?? release.artifactSha256;
  const buildEnvironment = overrides.buildEnvironment ?? BUILD_ENV;
  const evidence = overrides.evidence ?? {
    multi_edge_verified: true,
    probes: 3,
  };
  const fencingToken = overrides.fencingToken ?? authorization.fencing_token;
  const expectedGeneration = overrides.expectedGeneration ?? generation;
  return rpc(
    await asRole(
      "content_deployer",
      (sql) => sql`
			select private.commit_production_promotion_v1(
				${release.site_release_id}::uuid, ${fencingToken}, ${expectedGeneration},
				${`pages-${release.label}`}, ${manifestSha256}, ${artifactSha256},
				${buildEnvironment}, ${sql.json(evidence)}
			) as result
		`,
    ),
  );
}

async function deployAndPromote(release, generation) {
  const authorization = await authorizeForward(release, generation);
  await asRole(
    "content_deployer",
    (sql) => sql`
		select private.mark_promotion_deploying_v1(
			${release.site_release_id}::uuid, ${authorization.fencing_token}, ${generation}
		)
	`,
  );
  await asRole(
    "content_deployer",
    (sql) => sql`
		select private.mark_promotion_verifying_v1(
			${release.site_release_id}::uuid, ${authorization.fencing_token}, ${generation},
			${`pages-${release.label}`}
		)
	`,
  );
  return {
    authorization,
    result: await commitForward(release, authorization, generation),
  };
}

function assertion({
  audience = "content-routine",
  action = "draft.create",
  bodySha256,
  authContext = audience === "content-control" ? "access+totp" : "access",
  issuedAt = new Date(),
  ttlMs = 60_000,
  jti = randomUUID(),
  requestContext,
  subject = ACTOR_SUB,
} = {}) {
  const payload = JSON.stringify({
    action,
    aud: audience,
    auth_context: authContext,
    body_sha256: bodySha256,
    exp: new Date(issuedAt.getTime() + ttlMs).toISOString(),
    iat: issuedAt.toISOString(),
    jti,
    key_id: ATTESTATION_KEY_ID,
    ...(requestContext === undefined
      ? {}
      : { request_context: requestContext }),
    sub: subject,
  });
  return {
    payload,
    signature: sign(
      null,
      Buffer.from(payload),
      ATTESTATION_PRIVATE_KEY,
    ).toString("hex"),
  };
}

async function authorizeRollback(
  targetRelease,
  generation,
  attestation,
  bodySha256,
) {
  return rpc(
    await asRole(
      "content_controller",
      (sql) => sql`
			select private.authorize_production_rollback_v1(
				${targetRelease.site_release_id}::uuid, ${generation}, 'failure-matrix:control',
				'failure matrix rollback drill', ${sql.json(attestation)}, ${bodySha256}
			) as result
		`,
    ),
  );
}

async function currentPointer() {
  const rows = await admin`
		select target_site_release_id::text, target_release_sequence, generation,
			manifest_sha256, artifact_sha256, build_environment_version
		from private.release_current_pointer where singleton
	`;
  return rows[0] || null;
}

const startedAt = new Date().toISOString();
const started = performance.now();
const evidence = {
  schema_version: 1,
  kind: "content-database-v4.1-local-failure-matrix",
  database: "local-supabase-only",
  started_at: startedAt,
  checks: {},
};

try {
  await admin`
		update private.content_settings set enabled = true
		where setting_key in (
			'database_mirror', 'shadow_build', 'publication',
			'admin_draft', 'admin_preview', 'admin_publish'
		)
	`;
  await admin`
		insert into private.content_attestation_keys(key_id, public_key, not_before, not_after)
		values (
			${ATTESTATION_KEY_ID}, ${ATTESTATION_PUBLIC_KEY},
			clock_timestamp() - interval '1 minute', clock_timestamp() + interval '1 day'
		)
	`;
  await admin`
		insert into private.admin_principals(access_sub, display_email)
		values (${ACTOR_SUB}, 'failure-matrix@example.invalid')
	`;
  await admin`
		insert into private.admin_role_bindings(principal_id, role)
		select ${ACTOR_SUB}, role from unnest(array['Editor','Owner']) role
	`;

  const identicalInput = reportObject(
    syntheticDocument("2098-01-01", "identical"),
  );
  const identicalStarted = performance.now();
  const identicalResults = await Promise.all(
    Array.from({ length: 50 }, () => ingest(identicalInput)),
  );
  const identicalIds = new Set(
    identicalResults.map((result) => result.report_snapshot_id),
  );
  assert(
    identicalIds.size === 1,
    "Identical concurrent ingestions created multiple snapshots",
  );
  assert(
    identicalResults.filter((result) => result.idempotent === false).length ===
      1,
    "Identical concurrent ingestions did not produce exactly one writer",
  );
  assert(
    identicalResults.filter((result) => result.idempotent === true).length ===
      49,
    "Identical concurrent ingestions did not produce 49 idempotent results",
  );
  evidence.checks.identical_ingestion_50 = {
    status: "passed",
    unique_snapshot_ids: identicalIds.size,
    non_idempotent: 1,
    idempotent: 49,
    elapsed_ms: Math.round(performance.now() - identicalStarted),
  };

  const deterministicSnapshotId = identicalResults[0].report_snapshot_id;
  const reservedOnce = await reserveIngestionRelease(
    deterministicSnapshotId,
    "morning",
    identicalInput.byteSha256,
  );
  const reservedAgain = await reserveIngestionRelease(
    deterministicSnapshotId,
    "morning",
    identicalInput.byteSha256,
  );
  assert(
    reservedAgain.reservation_id === reservedOnce.reservation_id &&
      reservedAgain.idempotent === true &&
      reservedAgain.finalized === false,
    "Retry before finalize did not reuse the deterministic reservation",
  );
  const startedAttempt = await admin`
    select id, trigger_kind, worker_version, status, finished_at
    from private.publication_attempts
    where report_date = '2098-01-01' and batch_id = 'morning'
      and input_sha256 = ${identicalInput.byteSha256}
  `;
  assert(
    startedAttempt.length === 1 &&
      startedAttempt[0].status === "started" &&
      startedAttempt[0].trigger_kind === "local-failure-matrix" &&
      startedAttempt[0].worker_version === BUILD_ENV &&
      startedAttempt[0].finished_at === null,
    "Publication reservation did not persist the started attempt identity",
  );
  const deterministicDispatchId = randomUUID();
  const wrongDispatchTuple = await expectRejected(
    "release finalization with a mismatched dispatch tuple",
    () =>
      finalizeReservedRelease(
        reservedOnce,
        "deterministic-slot",
        deterministicDispatchId,
        "shadow",
        { site_release_id: randomUUID() },
      ),
    /Content release dispatch identity mismatch/,
  );
  const deterministicRelease = await finalizeReservedRelease(
    reservedOnce,
    "deterministic-slot",
    deterministicDispatchId,
  );
  const reservedAfterCommit = await reserveIngestionRelease(
    deterministicSnapshotId,
    "morning",
    identicalInput.byteSha256,
  );
  assert(
    reservedAfterCommit.site_release_id ===
      deterministicRelease.site_release_id &&
      reservedAfterCommit.idempotent === true &&
      reservedAfterCommit.finalized === true,
    "Retry after DB commit did not reconcile to the finalized release",
  );
  const finalizeRetry = await finalizeReservedRelease(
    reservedAfterCommit,
    "deterministic-slot",
    randomUUID(),
  );
  assert(
    finalizeRetry.site_release_id === deterministicRelease.site_release_id &&
      finalizeRetry.idempotent === true,
    "Finalize retry created a second semantic release",
  );
  const deterministicOutboxCount = await admin`
    select count(*)::integer as count
    from private.content_outbox
    where site_release_id = ${deterministicRelease.site_release_id}::uuid
  `;
  assert(
    deterministicOutboxCount[0].count === 1,
    "Finalize retry created duplicate outbox work",
  );
  const succeededAttempt = await admin`
    select id, status, error_code, error_detail, finished_at
    from private.publication_attempts
    where report_date = '2098-01-01' and batch_id = 'morning'
      and input_sha256 = ${identicalInput.byteSha256}
  `;
  assert(
    succeededAttempt.length === 1 &&
      succeededAttempt[0].id === startedAttempt[0].id &&
      succeededAttempt[0].status === "succeeded" &&
      succeededAttempt[0].error_code === null &&
      succeededAttempt[0].error_detail === null &&
      succeededAttempt[0].finished_at !== null,
    "Publication finalization did not transition the same attempt to succeeded",
  );

  const failedRetryInput = reportObject(
    syntheticDocument("2098-01-03", "failed-attempt-retry"),
  );
  const failedRetrySnapshot = await ingest(failedRetryInput);
  const failedRetryReservation = await reserveIngestionRelease(
    failedRetrySnapshot.report_snapshot_id,
    "afternoon",
    failedRetryInput.byteSha256,
  );
  const recordedFailure = await failIngestionAttempt(
    "2098-01-03",
    "afternoon",
    failedRetryInput.byteSha256,
    "SyntheticFailure",
    "simulated mirror failure",
  );
  assert(
    recordedFailure.status === "failed",
    "Failed publication attempt was not persisted",
  );
  const failedRetryReservationAgain = await reserveIngestionRelease(
    failedRetrySnapshot.report_snapshot_id,
    "afternoon",
    failedRetryInput.byteSha256,
  );
  assert(
    failedRetryReservationAgain.reservation_id ===
      failedRetryReservation.reservation_id &&
      failedRetryReservationAgain.publication_attempt_id !==
        failedRetryReservation.publication_attempt_id &&
      failedRetryReservationAgain.publication_attempt_status === "started",
    "Retry did not append a new publication attempt while reusing the semantic reservation",
  );
  const failedRetryDispatchId = randomUUID();
  const failedRetryRelease = await finalizeReservedRelease(
    failedRetryReservationAgain,
    "failed-attempt-retry",
    failedRetryDispatchId,
  );
  const retriedAttempt = await admin`
    select status, error_code, error_detail, finished_at
    from private.publication_attempts
    where id = ${failedRetryReservationAgain.publication_attempt_id}::uuid
  `;
  assert(
    retriedAttempt[0].status === "succeeded" &&
      retriedAttempt[0].error_code === null &&
      retriedAttempt[0].error_detail === null &&
      retriedAttempt[0].finished_at !== null,
    "Failed publication retry did not transition to succeeded",
  );
  const attemptHistory = await admin`
    select attempt_number, status
    from private.publication_attempts
    where report_date = '2098-01-03' and batch_id = 'afternoon'
      and input_sha256 = ${failedRetryInput.byteSha256}
    order by attempt_number
  `;
  assert(
    attemptHistory.length === 2 &&
      attemptHistory[0].attempt_number === 1 &&
      attemptHistory[0].status === "failed" &&
      attemptHistory[1].attempt_number === 2 &&
      attemptHistory[1].status === "succeeded",
    "Publication attempt history was overwritten instead of appended",
  );
  const lateFailure = await failIngestionAttempt(
    "2098-01-03",
    "afternoon",
    failedRetryInput.byteSha256,
    "LostResponse",
    "success response was lost",
  );
  assert(
    lateFailure.status === "succeeded" && lateFailure.idempotent === true,
    "A late failure report downgraded a committed publication attempt",
  );
  await asRole(
    "content_deployer",
    (sql) => sql`
      select private.record_deployment_event_v1(
        ${failedRetryRelease.site_release_id}::uuid,
        ${failedRetryDispatchId}::uuid,
        'edge_verified', '{"synthetic_cleanup":true}'::jsonb
      )
    `,
  );

  const modeReservation = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
        select private.reserve_site_release_v1(${deterministicSnapshotId}::uuid) as result
      `,
    ),
  );
  await admin`update private.content_settings set enabled = false where setting_key = 'shadow_build'`;
  const shadowDisabled = await expectRejected(
    "shadow build mode while disabled",
    () =>
      finalizeReservedRelease(
        modeReservation,
        "mode-gate",
        randomUUID(),
        "shadow",
      ),
    /Content capability is disabled: shadow_build/,
  );
  await admin`
    update private.content_settings
    set enabled = case when setting_key = 'shadow_build' then true else false end
    where setting_key in ('shadow_build','publication')
  `;
  const productionDisabled = await expectRejected(
    "production mode while disabled",
    () =>
      finalizeReservedRelease(
        modeReservation,
        "mode-gate",
        randomUUID(),
        "production",
      ),
    /Content capability is disabled: publication/,
  );
  await admin`update private.content_settings set enabled = true where setting_key = 'publication'`;
  const invalidMode = await expectRejected(
    "invalid release dispatch mode",
    () =>
      finalizeReservedRelease(
        modeReservation,
        "mode-gate",
        randomUUID(),
        "invalid",
      ),
    /Invalid content release dispatch mode/,
  );
  const modeDispatchId = randomUUID();
  const modeRelease = await finalizeReservedRelease(
    modeReservation,
    "mode-gate",
    modeDispatchId,
    "shadow",
  );
  await asRole(
    "content_deployer",
    (sql) => sql`
      select private.record_deployment_event_v1(
        ${modeRelease.site_release_id}::uuid,
        ${modeDispatchId}::uuid,
        'edge_verified', '{"synthetic_cleanup":true}'::jsonb
      )
    `,
  );
  const conflictingSlotInput = reportObject(
    syntheticDocument("2098-01-01", "deterministic-slot-conflict"),
  );
  const conflictingSlotSnapshot = await ingest(conflictingSlotInput);
  const slotConflict = await expectRejected(
    "different payload in deterministic publication slot",
    () =>
      reserveIngestionRelease(
        conflictingSlotSnapshot.report_snapshot_id,
        "morning",
        conflictingSlotInput.byteSha256,
      ),
    /Ingestion publication slot CAS conflict/,
  );
  await asRole(
    "content_deployer",
    (sql) => sql`
      select private.record_deployment_event_v1(
        ${deterministicRelease.site_release_id}::uuid,
        ${deterministicDispatchId}::uuid,
        'edge_verified', '{"synthetic_cleanup":true}'::jsonb
      )
    `,
  );
  evidence.checks.ingestion_publication_slot = {
    status: "passed",
    reservation_reused_before_finalize: true,
    release_reconciled_after_commit: true,
    outbox_rows_after_retry: deterministicOutboxCount[0].count,
    different_payload_rejected: slotConflict,
    attempt_started_then_succeeded: true,
    failed_attempt_retried_with_append_only_history: true,
    late_failure_preserved_success: true,
    shadow_disabled_rejected: shadowDisabled,
    production_disabled_rejected: productionDisabled,
    invalid_mode_rejected: invalidMode,
    wrong_dispatch_tuple_rejected: wrongDispatchTuple,
  };

  const differentInputs = Array.from({ length: 50 }, (_, index) =>
    reportObject(
      syntheticDocument("2098-01-02", `different-${index}`, {
        stableIdentity: true,
      }),
    ),
  );
  const differentStarted = performance.now();
  const differentResults = await Promise.all(
    differentInputs.map((input) => ingest(input)),
  );
  const versions = differentResults
    .map((result) => result.report_version)
    .sort((a, b) => a - b);
  assert(
    versions.every((version, index) => version === index + 1),
    "Different concurrent ingestions did not serialize to versions 1..50",
  );
  assert(
    new Set(differentResults.map((result) => result.report_snapshot_id))
      .size === 50,
    "Different concurrent ingestions lost a snapshot",
  );
  evidence.checks.different_ingestion_50 = {
    status: "passed",
    unique_snapshot_ids: 50,
    version_min: versions[0],
    version_max: versions.at(-1),
    elapsed_ms: Math.round(performance.now() - differentStarted),
  };

  const snapshotA = identicalResults[0].report_snapshot_id;
  const releaseA = await createRelease(snapshotA, "A");
  const publicBeforePromotion = await asRole("content_reader", async (sql) => ({
    manifest: rpc(
      await sql`select private.get_release_manifest_v1(${releaseA.site_release_id}::uuid) as result`,
    ),
    report: rpc(
      await sql`select private.get_release_report_v1(${releaseA.site_release_id}::uuid, '2098-01-01'::date) as result`,
    ),
    item: rpc(
      await sql`select private.get_release_item_v1(${releaseA.site_release_id}::uuid, ${identicalInput.document.items[0].id}) as result`,
    ),
    search: rpc(
      await sql`select private.search_release_v1(${releaseA.site_release_id}::uuid, '并发', 20, null) as result`,
    ),
  }));
  assert(
    Object.values(publicBeforePromotion).every((value) => value === null),
    "Public reader exposed an unpromoted release",
  );
  const buildBeforePromotion = await asRole(
    "content_deployer",
    async (sql) => ({
      manifest: rpc(
        await sql`select private.get_build_release_manifest_v1(${releaseA.site_release_id}::uuid) as result`,
      ),
      report: rpc(
        await sql`select private.get_build_release_report_v1(${releaseA.site_release_id}::uuid, '2098-01-01'::date) as result`,
      ),
    }),
  );
  assert(
    buildBeforePromotion.manifest?.site_release_id ===
      releaseA.site_release_id &&
      buildBeforePromotion.report?.site_release_id === releaseA.site_release_id,
    "Authenticated build capability could not read an exact unpromoted release",
  );
  const claimFixtures = [];
  for (let index = 0; index < 12; index += 1) {
    const dispatchId = randomUUID();
    const payload = {
      dispatch_id: dispatchId,
      site_release_id: releaseA.site_release_id,
      site_release_sequence: releaseA.site_release_sequence,
      expected_predecessor_id: releaseA.expected_predecessor_id,
      expected_content_sha: releaseA.contentSha256,
      code_sha: sha256(`code:claim-${index}`).slice(0, 40),
      build_environment_version: BUILD_ENV,
      mode: "shadow",
    };
    await admin`
      insert into private.content_outbox(site_release_id, dispatch_id, payload)
      values (${releaseA.site_release_id}::uuid, ${dispatchId}::uuid, ${admin.json(payload)})
    `;
    claimFixtures.push({ ...releaseA, dispatchId, label: `claim-${index}` });
  }
  const claimResults = await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      asRole(
        "content_deployer",
        (sql) => sql`
				select private.claim_content_outbox_v1(${`failure-matrix-worker-${index}`}, 30) as result
			`,
      ).then(rpc),
    ),
  );
  const claimed = claimResults.filter(Boolean);
  assert(
    claimed.length === 13,
    `Expected 13 unique outbox claims, received ${claimed.length}`,
  );
  assert(
    new Set(claimed.map((claim) => claim.outbox_id)).size === 13,
    "Outbox claim was duplicated",
  );
  const reclaimTarget = claimed.find(
    (claim) => claim.dispatch_id !== releaseA.dispatchId,
  );
  await admin`
		update private.content_outbox set lease_expires_at = clock_timestamp() - interval '1 second'
		where id = ${reclaimTarget.outbox_id}::uuid
	`;
  const reclaimed = rpc(
    await asRole(
      "content_deployer",
      (sql) => sql`
			select private.claim_content_outbox_v1('failure-matrix-reclaimer', 30) as result
		`,
    ),
  );
  assert(
    reclaimed?.outbox_id === reclaimTarget.outbox_id,
    "Expired outbox lease was not reclaimed",
  );
  assert(
    reclaimed.attempt === reclaimTarget.attempt + 1,
    "Outbox reclaim did not increment attempt",
  );
  await admin`
    update private.content_outbox
    set attempts = max_attempts, status = 'claimed',
        lease_expires_at = clock_timestamp() - interval '1 second'
    where id = ${reclaimTarget.outbox_id}::uuid
  `;
  await asRole(
    "content_deployer",
    (sql) =>
      sql`select private.claim_content_outbox_v1('failure-matrix-dlq-sweeper', 30) as result`,
  );
  const exhaustedLease = await admin`
    select status, dead_lettered_at, lease_expires_at
    from private.content_outbox where id = ${reclaimTarget.outbox_id}::uuid
  `;
  assert(
    exhaustedLease[0].status === "dead_letter" &&
      exhaustedLease[0].dead_lettered_at !== null &&
      exhaustedLease[0].lease_expires_at === null,
    "Exhausted claimed lease was not swept to the DLQ",
  );
  evidence.checks.outbox_claims = {
    status: "passed",
    concurrent_workers: 50,
    unique_claims: 13,
    null_claims: 37,
    expired_lease_reclaimed: true,
    exhausted_claimed_lease_dead_lettered: true,
  };

  for (const release of claimFixtures) {
    await asRole(
      "content_deployer",
      (sql) => sql`
			select private.record_deployment_event_v1(
				${release.site_release_id}::uuid, ${release.dispatchId}::uuid,
				'edge_verified', '{"synthetic_cleanup":true}'::jsonb
			)
		`,
    );
  }
  await prepareRelease(releaseA);
  await asRole(
    "content_deployer",
    (sql) => sql`
		select private.record_deployment_event_v1(
			${releaseA.site_release_id}::uuid, ${releaseA.dispatchId}::uuid,
			'edge_verified', '{"multi_edge_verified":true}'::jsonb
		)
	`,
  );
  for (const staleEvent of ["building", "preview_verified", "failed"]) {
    await asRole(
      "content_deployer",
      (sql) => sql`
			select private.record_deployment_event_v1(
				${releaseA.site_release_id}::uuid, ${releaseA.dispatchId}::uuid,
				${staleEvent}, ${sql.json({ error: "late callback", github_run_id: 42 })}
			)
		`,
    );
  }
  const callbackState = await admin`
		select status, last_error from private.content_outbox
		where site_release_id = ${releaseA.site_release_id}::uuid
	`;
  assert(
    callbackState[0].status === "deployed",
    "Late callback regressed deployed outbox state",
  );
  assert(
    callbackState[0].last_error === null,
    "Late failure callback mutated terminal error state",
  );
  const unknownDispatchId = randomUUID();
  const wrongTupleMessage = await expectRejected(
    "wrong deployment callback tuple",
    () =>
      asRole(
        "content_deployer",
        (sql) => sql`
					select private.record_deployment_event_v1(
						${releaseA.site_release_id}::uuid, ${unknownDispatchId}::uuid,
						'building', '{}'::jsonb
					)
				`,
      ),
    /Deployment event identity mismatch/,
  );
  evidence.checks.callback_monotonicity = {
    status: "passed",
    terminal_state: callbackState[0].status,
    wrong_tuple_rejected: wrongTupleMessage,
  };

  const callbackLostRelease = await createRelease(
    snapshotA,
    "callback-lost-production",
    "production",
  );
  const callbackLostClaim = rpc(
    await asRole(
      "content_deployer",
      (sql) => sql`
        select private.claim_content_outbox_v1('callback-lost-first', 30) as result
      `,
    ),
  );
  assert(
    callbackLostClaim.site_release_id === callbackLostRelease.site_release_id,
    "Production callback-loss fixture was not claimed",
  );
  await asRole(
    "content_deployer",
    (sql) => sql`
      select private.record_deployment_event_v1(
        ${callbackLostRelease.site_release_id}::uuid,
        ${callbackLostRelease.dispatchId}::uuid,
        'preview_verified', '{"route_parity":true}'::jsonb
      )
    `,
  );
  await admin`
    update private.content_outbox
    set lease_expires_at = clock_timestamp() - interval '1 second'
    where site_release_id = ${callbackLostRelease.site_release_id}::uuid
  `;
  const callbackLostReclaim = rpc(
    await asRole(
      "content_deployer",
      (sql) => sql`
        select private.claim_content_outbox_v1('callback-lost-reconciler', 30) as result
      `,
    ),
  );
  assert(
    callbackLostReclaim.site_release_id ===
      callbackLostRelease.site_release_id &&
      callbackLostReclaim.attempt === callbackLostClaim.attempt + 1,
    "Expired production Preview was not reclaimable after callback loss",
  );
  await asRole(
    "content_deployer",
    (sql) => sql`
      select private.record_deployment_event_v1(
        ${callbackLostRelease.site_release_id}::uuid,
        ${callbackLostRelease.dispatchId}::uuid,
        'edge_verified', '{"multi_edge_verified":true,"reconciled":true}'::jsonb
      )
    `,
  );

  const shadowTerminalRelease = await createRelease(
    snapshotA,
    "callback-shadow-terminal",
    "shadow",
  );
  const shadowClaim = rpc(
    await asRole(
      "content_deployer",
      (sql) => sql`
        select private.claim_content_outbox_v1('shadow-terminal', 30) as result
      `,
    ),
  );
  assert(
    shadowClaim.site_release_id === shadowTerminalRelease.site_release_id,
    "Shadow terminal fixture was not claimed",
  );
  await asRole(
    "content_deployer",
    (sql) => sql`
      select private.record_deployment_event_v1(
        ${shadowTerminalRelease.site_release_id}::uuid,
        ${shadowTerminalRelease.dispatchId}::uuid,
        'preview_verified', '{"route_parity":true}'::jsonb
      )
    `,
  );
  await admin`
    update private.content_outbox
    set lease_expires_at = clock_timestamp() - interval '1 second'
    where site_release_id = ${shadowTerminalRelease.site_release_id}::uuid
  `;
  const shadowTerminalReclaim = rpc(
    await asRole(
      "content_deployer",
      (sql) => sql`
        select private.claim_content_outbox_v1('shadow-terminal-reconciler', 30) as result
      `,
    ),
  );
  assert(
    shadowTerminalReclaim === null,
    "A completed shadow Preview was incorrectly re-dispatched",
  );
  evidence.checks.callback_loss_recovery = {
    status: "passed",
    production_preview_reclaimed_after_lease: true,
    production_attempts: callbackLostReclaim.attempt,
    shadow_preview_remained_terminal: true,
  };

  const authA = await authorizeForward(releaseA, 0);
  await expectRejected(
    "wrong forward fencing token",
    () =>
      asRole(
        "content_deployer",
        (sql) => sql`
				select private.mark_promotion_deploying_v1(
					${releaseA.site_release_id}::uuid, ${authA.fencing_token + 1}, 0
				)
			`,
      ),
    /Stale production fencing token/,
  );
  await asRole(
    "content_deployer",
    (sql) => sql`
		select private.mark_promotion_deploying_v1(
			${releaseA.site_release_id}::uuid, ${authA.fencing_token}, 0
		)
	`,
  );
  await asRole(
    "content_deployer",
    (sql) => sql`
		select private.mark_promotion_verifying_v1(
			${releaseA.site_release_id}::uuid, ${authA.fencing_token}, 0, 'pages-A'
		)
	`,
  );
  await expectRejected(
    "missing multi-edge evidence",
    () =>
      commitForward(releaseA, authA, 0, {
        evidence: { multi_edge_verified: false },
      }),
    /Multi-edge verifier evidence is required/,
  );
  await expectRejected(
    "wrong pointer generation",
    () => commitForward(releaseA, authA, 0, { expectedGeneration: 1 }),
    /Stale production fencing token|Pointer generation conflict/,
  );
  for (const [label, overrides] of [
    ["manifest", { manifestSha256: sha256("wrong-manifest") }],
    ["artifact", { artifactSha256: sha256("wrong-artifact") }],
    ["environment", { buildEnvironment: "wrong-environment" }],
  ]) {
    await expectRejected(
      `wrong ${label} evidence`,
      () => commitForward(releaseA, authA, 0, overrides),
      /Deployment evidence hash mismatch/,
    );
  }
  const committedA = await commitForward(releaseA, authA, 0);
  assert(committedA.generation === 1, "Release A did not commit generation 1");
  const publicAfterPromotion = rpc(
    await asRole(
      "content_reader",
      (sql) =>
        sql`select private.get_release_manifest_v1(${releaseA.site_release_id}::uuid) as result`,
    ),
  );
  assert(
    publicAfterPromotion?.site_release_id === releaseA.site_release_id,
    "Public reader could not read a production-verified release",
  );
  evidence.checks.release_read_isolation = {
    status: "passed",
    unpromoted_public_endpoints_denied: Object.keys(publicBeforePromotion),
    authenticated_build_access_preserved: true,
    production_verified_public_access_enabled: true,
  };

  const releaseB = await createRelease(snapshotA, "B");
  await prepareRelease(releaseB);
  const promotedB = await deployAndPromote(releaseB, 1);
  assert(
    promotedB.result.generation === 2,
    "Release B did not commit generation 2",
  );
  const pointerB = await currentPointer();
  assert(
    pointerB.target_site_release_id === releaseB.site_release_id,
    "Pointer did not target B",
  );

  const releaseC = await createRelease(snapshotA, "C");
  await prepareRelease(releaseC);
  const authC = await authorizeForward(releaseC, 2);
  const rollbackBody = sha256("rollback-A-from-B");
  await expectRejected(
    "forward-vs-rollback contention",
    () =>
      authorizeRollback(
        releaseA,
        2,
        assertion({
          audience: "content-control",
          action: "production.rollback",
          bodySha256: rollbackBody,
        }),
        rollbackBody,
      ),
    /Production promotion slot is busy/,
  );
  assert(
    (await currentPointer()).target_site_release_id ===
      releaseB.site_release_id,
    "Busy rollback moved pointer",
  );
  await admin`
		update private.production_promotion_slot
		set lease_expires_at = clock_timestamp() - interval '1 second'
		where project_key = 'bubble-brain-pages'
	`;
  await expectRejected(
    "expired C fencing token",
    () =>
      asRole(
        "content_deployer",
        (sql) => sql`
				select private.mark_promotion_deploying_v1(
					${releaseC.site_release_id}::uuid, ${authC.fencing_token}, 2
				)
			`,
      ),
    /Stale production fencing token/,
  );

  const rollbackAuth = await authorizeRollback(
    releaseA,
    2,
    assertion({
      audience: "content-control",
      action: "production.rollback",
      bodySha256: rollbackBody,
    }),
    rollbackBody,
  );
  assert(
    (await currentPointer()).target_site_release_id ===
      releaseB.site_release_id,
    "Rollback authorization moved pointer",
  );
  const activeLeaseReconcile = rpc(
    await asRole(
      "content_deployer",
      (sql) => sql`
			select private.begin_production_reconcile_v1() as result
		`,
    ),
  );
  assert(
    activeLeaseReconcile === null,
    "Active rollback lease was incorrectly claimable by reconciler",
  );
  await admin`
    update private.production_promotion_slot
    set lease_expires_at = clock_timestamp() - interval '1 second'
    where project_key = 'bubble-brain-pages'
  `;
  const reconcile = rpc(
    await asRole(
      "content_deployer",
      (sql) => sql`
        select private.begin_production_reconcile_v1() as result
      `,
    ),
  );
  assert(
    reconcile.slot.status === "rolling_back",
    "Rollback reconcile did not retain rolling_back state",
  );
  assert(
    reconcile.current.site_release_id === releaseB.site_release_id,
    "Reconcile did not identify B as current",
  );
  await asRole(
      "content_deployer",
      (sql) => sql`
		select private.finish_production_recovery_v1(
			${releaseA.site_release_id}::uuid, ${reconcile.slot.fencing_token}, 2, true,
			'{"restored_site_release":"B","multi_edge_verified":true}'::jsonb
		)
	`,
  );
  assert(
    (await currentPointer()).target_site_release_id ===
      releaseB.site_release_id,
    "Recovery completion moved pointer",
  );

  const rollbackAuth2 = await authorizeRollback(
    releaseA,
    2,
    assertion({
      audience: "content-control",
      action: "production.rollback",
      bodySha256: rollbackBody,
    }),
    rollbackBody,
  );
  await expectRejected(
    "rollback without multi-edge evidence",
    () =>
      asRole(
        "content_deployer",
        (sql) => sql`
				select private.commit_production_rollback_v1(
					${releaseA.site_release_id}::uuid, ${rollbackAuth2.fencing_token}, 2,
					'pages-rollback-A', '{"multi_edge_verified":false}'::jsonb
				) as result
			`,
      ),
    /Invalid rollback evidence or fencing token/,
  );
  const rolledBack = rpc(
    await asRole(
      "content_deployer",
      (sql) => sql`
			select private.commit_production_rollback_v1(
				${releaseA.site_release_id}::uuid, ${rollbackAuth2.fencing_token}, 2,
				'pages-rollback-A', '{"multi_edge_verified":true,"probes":3}'::jsonb
			) as result
		`,
    ),
  );
  assert(
    rolledBack.generation === 3,
    "Rollback did not increment pointer generation to 3",
  );
  assert(
    (await currentPointer()).target_site_release_id ===
      releaseA.site_release_id,
    "Rollback did not target A",
  );
  await expectRejected(
    "late C promotion commit",
    () => commitForward(releaseC, authC, 2),
    /Stale production fencing token|Pointer generation conflict/,
  );
  await expectRejected(
    "late B promotion commit",
    () => commitForward(releaseB, promotedB.authorization, 1),
    /Stale production fencing token|Pointer generation conflict/,
  );

  const releaseD = await createRelease(snapshotA, "D-after-rollback");
  await prepareRelease(releaseD);
  const promotedD = await deployAndPromote(releaseD, 3);
  assert(
    promotedD.result.generation === 4,
    "Post-rollback forward release did not commit generation 4",
  );
  assert(
    releaseD.site_release_sequence > releaseC.site_release_sequence,
    "Post-rollback forward release did not retain monotonic release sequence",
  );
  evidence.checks.release_ordering_and_recovery = {
    status: "passed",
    generations: { A: 1, B: 2, rollback_to_A: 3, D: 4 },
    forward_rollback_contention_rejected: true,
    expired_C_token_rejected: true,
    rollback_reconcile_restored_B: true,
    late_B_C_commits_rejected: true,
    post_rollback_sequence: releaseD.site_release_sequence,
  };

  const draftBody = sha256("draft-create-body");
  const createDraft = (attestation, suppliedBody = draftBody) =>
    asRole(
      "content_editor",
      (sql) => sql`
			select private.create_editorial_draft_v1(
				${releaseD.site_release_id}::uuid, ${randomUUID()}::uuid,
				${sql.json(attestation)}, ${suppliedBody}
			) as result
		`,
    );
  const validBase = {
    audience: "content-routine",
    action: "draft.create",
    bodySha256: draftBody,
  };
  const forged = assertion(validBase);
  forged.signature = "0".repeat(128);
  await expectRejected(
    "forged attestation",
    () => createDraft(forged),
    /Invalid attestation signature/,
  );
  await expectRejected(
    "wrong attestation audience",
    () => createDraft(assertion({ ...validBase, audience: "content-control" })),
    /Attestation request binding mismatch/,
  );
  await expectRejected(
    "wrong attestation action",
    () => createDraft(assertion({ ...validBase, action: "draft.update" })),
    /Attestation request binding mismatch/,
  );
  await expectRejected(
    "wrong attestation body",
    () => createDraft(assertion(validBase), sha256("different-body")),
    /Attestation request binding mismatch/,
  );
  await expectRejected(
    "wrong routine auth context",
    () => createDraft(assertion({ ...validBase, authContext: "access+totp" })),
    /Attestation authentication context mismatch/,
  );
  await expectRejected(
    "expired attestation",
    () =>
      createDraft(
        assertion({
          ...validBase,
          issuedAt: new Date(Date.now() - 120_000),
          ttlMs: 60_000,
        }),
      ),
    /Expired attestation/,
  );
  await expectRejected(
    "24-hour attestation",
    () => createDraft(assertion({ ...validBase, ttlMs: 24 * 60 * 60 * 1000 })),
    /Expired attestation/,
  );
  const replayAssertion = assertion(validBase);
  const firstDraft = rpc(await createDraft(replayAssertion));
  assert(firstDraft.draft_id, "Valid attestation did not create a draft");
  await expectRejected(
    "replayed attestation",
    () => createDraft(replayAssertion),
    /Attestation replay rejected/,
  );

  const draftItemRows = await admin`
		select snapshot_item.item_id, snapshot_item.revision_id::text, snapshot_item.override_id::text
		from private.site_release_reports release_report
		join private.report_snapshot_items snapshot_item
		  on snapshot_item.report_snapshot_id = release_report.report_snapshot_id
		where release_report.site_release_id = ${releaseD.site_release_id}::uuid
		order by release_report.report_date, snapshot_item.ordinal
		limit 1
	`;
  const draftItem = draftItemRows[0];
  assert(draftItem?.item_id, "Current release has no editable draft item");
  const updateDraft = (expectedRowVersion, title, label, base = draftItem) => {
    const bodySha256 = sha256(`draft-update:${label}`);
    return asRole(
      "content_editor",
      (sql) => sql`
			select private.upsert_editorial_draft_item_v1(
				${firstDraft.draft_id}::uuid, ${base.item_id}, ${base.revision_id}::uuid,
				${base.override_id || null}::uuid, ${sql.json({ title })},
				${expectedRowVersion}, ${`failure matrix ${label}`}, ${randomUUID()}::uuid,
				${sql.json(
          assertion({
            audience: "content-routine",
            action: "draft.update",
            bodySha256,
          }),
        )}, ${bodySha256}
			) as result
		`,
    ).then(rpc);
  };
  const concurrentEdits = await Promise.allSettled([
    updateDraft(firstDraft.row_version, "Browser A title", "browser-a"),
    updateDraft(firstDraft.row_version, "Browser B title", "browser-b"),
  ]);
  const editWinners = concurrentEdits.filter(
    (result) => result.status === "fulfilled",
  );
  const editLosers = concurrentEdits.filter(
    (result) => result.status === "rejected",
  );
  assert(
    editWinners.length === 1 && editLosers.length === 1,
    "Concurrent browser edits did not produce one CAS winner",
  );
  assert(
    /Draft ownership, state, or row version conflict/.test(
      String(editLosers[0].reason?.message || editLosers[0].reason),
    ),
    "Concurrent browser loser was not rejected by row-version CAS",
  );
  const winningEdit = editWinners[0].value;
  const previewBody = sha256("draft-preview-before-base-change");
  const preview = rpc(
    await asRole(
      "content_editor",
      (sql) => sql`
			select private.request_preview_build_v1(
				${firstDraft.draft_id}::uuid, ${winningEdit.row_version}, ${randomUUID()}::uuid,
				${sql.json(
          assertion({
            audience: "content-routine",
            action: "preview.build",
            bodySha256: previewBody,
          }),
        )}, ${previewBody}
			) as result
		`,
    ),
  );
  const registeredPreview = rpc(
    await asRole(
      "content_deployer",
      (sql) => sql`
			select private.register_preview_build_v1(
				${firstDraft.draft_id}::uuid, ${preview.preview_sha256}, ${sha256("draft-preview-artifact")},
				'https://failure-matrix-preview.invalid', '{"route_parity":true}'::jsonb
			) as result
		`,
    ),
  );

  const changedDocument = structuredClone(identicalInput.document);
  changedDocument.producer.version = "failure-matrix-revision-change";
  changedDocument.overview.text =
    "Failure matrix revision changed after Preview";
  changedDocument.items[0].title = "Cron changed title after Preview";
  const changedSnapshot = await ingest(reportObject(changedDocument));
  const releaseE = await createRelease(
    changedSnapshot.report_snapshot_id,
    "E-base-changed",
  );
  await prepareRelease(releaseE);
  const promotedE = await deployAndPromote(releaseE, 4);
  assert(
    promotedE.result.generation === 5,
    "Changed base release did not commit generation 5",
  );

  const stalePublishBody = sha256("stale-preview-publish");
  await expectRejected(
    "publish after base release changed",
    () =>
      asRole(
        "content_controller",
        (sql) => sql`
				select private.request_editorial_publish_v1(
					${firstDraft.draft_id}::uuid, ${registeredPreview.preview_build_id}::uuid,
					${registeredPreview.row_version}, 'failure matrix stale preview publish',
					${randomUUID()}::uuid,
					${sql.json(
            assertion({
              audience: "content-control",
              action: "draft.publish",
              bodySha256: stalePublishBody,
            }),
          )}, ${stalePublishBody}
				) as result
			`,
      ),
    /Draft Preview is stale or not publishable/,
  );
  const rebaseDraft = (expectedRowVersion, label) => {
    const bodySha256 = sha256(`draft-rebase:${label}`);
    return asRole(
      "content_editor",
      (sql) => sql`
			select private.rebase_editorial_draft_v1(
				${firstDraft.draft_id}::uuid, ${releaseE.site_release_id}::uuid,
				${expectedRowVersion}, ${randomUUID()}::uuid,
				${sql.json(
          assertion({
            audience: "content-routine",
            action: "draft.rebase",
            bodySha256,
          }),
        )}, ${bodySha256}
			) as result
		`,
    ).then(rpc);
  };
  const conflictedRebase = await rebaseDraft(
    registeredPreview.row_version,
    "detect-conflict",
  );
  assert(
    conflictedRebase.status === "stale" &&
      conflictedRebase.row_version === registeredPreview.row_version + 1 &&
      conflictedRebase.conflicts.length === 1,
    "Rebase conflict did not mark stale with a new row version and field diff",
  );
  const currentDraftItemRows = await admin`
		select snapshot_item.item_id, snapshot_item.revision_id::text, snapshot_item.override_id::text
		from private.site_release_reports release_report
		join private.report_snapshot_items snapshot_item
		  on snapshot_item.report_snapshot_id = release_report.report_snapshot_id
		where release_report.site_release_id = ${releaseE.site_release_id}::uuid
		  and snapshot_item.item_id = ${draftItem.item_id}
		order by release_report.report_date desc
		limit 1
	`;
  const currentDraftItem = currentDraftItemRows[0];
  assert(
    currentDraftItem?.revision_id,
    "Rebase target item revision is missing",
  );
  const rebasedEdit = await updateDraft(
    conflictedRebase.row_version,
    "Browser A title",
    "resolve-rebase-conflict",
    currentDraftItem,
  );
  const completedRebase = await rebaseDraft(
    rebasedEdit.row_version,
    "complete-rebase",
  );
  assert(
    completedRebase.status === "draft" &&
      completedRebase.conflicts.length === 0 &&
      completedRebase.row_version === rebasedEdit.row_version + 1,
    "Explicit rebase did not converge after conflict resolution",
  );
  const publishPreviewBody = sha256("draft-preview-for-kill-switches");
  const publishPreview = rpc(
    await asRole(
      "content_editor",
      (sql) => sql`
        select private.request_preview_build_v1(
          ${firstDraft.draft_id}::uuid, ${completedRebase.row_version}, ${randomUUID()}::uuid,
          ${sql.json(
            assertion({
              audience: "content-routine",
              action: "preview.build",
              bodySha256: publishPreviewBody,
            }),
          )}, ${publishPreviewBody}
        ) as result
      `,
    ),
  );
  const publishPreviewBuild = rpc(
    await asRole(
      "content_deployer",
      (sql) => sql`
        select private.register_preview_build_v1(
          ${firstDraft.draft_id}::uuid, ${publishPreview.preview_sha256},
          ${sha256("draft-publish-preview-artifact")},
          'https://failure-matrix-publish-preview.invalid',
          '{"route_parity":true}'::jsonb
        ) as result
      `,
    ),
  );
  const publishBody = sha256("draft-publish-kill-switches");
  await expectRejected(
    "Routine connection attempts verified Preview publish",
    () =>
      asRole(
        "content_editor",
        (sql) => sql`
          select private.request_editorial_publish_v1(
            ${firstDraft.draft_id}::uuid, ${publishPreviewBuild.preview_build_id}::uuid,
            ${publishPreviewBuild.row_version}, 'routine credential must not publish',
            ${randomUUID()}::uuid,
            ${sql.json(
              assertion({
                audience: "content-control",
                action: "draft.publish",
                bodySha256: publishBody,
              }),
            )}, ${publishBody}
          ) as result
        `,
      ),
    /permission denied for function request_editorial_publish_v1/,
  );
  const publishRequest = rpc(
    await asRole(
      "content_controller",
      (sql) => sql`
        select private.request_editorial_publish_v1(
          ${firstDraft.draft_id}::uuid, ${publishPreviewBuild.preview_build_id}::uuid,
          ${publishPreviewBuild.row_version}, 'failure matrix publish kill switch checks',
          ${randomUUID()}::uuid,
          ${sql.json(
            assertion({
              audience: "content-control",
              action: "draft.publish",
              bodySha256: publishBody,
            }),
          )}, ${publishBody}
        ) as result
      `,
    ),
  );
  for (const settingKey of ["admin_publish", "publication"]) {
    await admin`
      update private.content_settings set enabled = false where setting_key = ${settingKey}
    `;
    await expectRejected(
      `editorial claim after ${settingKey} kill switch`,
      () =>
        asRole(
          "content_ingestor",
          (sql) =>
            sql`select private.claim_editorial_publish_request_v1('editorial-kill-switch', 300)`,
        ),
      new RegExp(`Content capability is disabled: ${settingKey}`),
    );
    await admin`
      update private.content_settings set enabled = true where setting_key = ${settingKey}
    `;
  }
  const editorialWorker = "failure-matrix-editorial";
  const claimedEditorial = rpc(
    await asRole(
      "content_ingestor",
      (sql) =>
        sql`select private.claim_editorial_publish_request_v1(${editorialWorker}, 600) as result`,
    ),
  );
  assert(
    claimedEditorial.id === publishRequest.publish_request_id,
    "Editorial publish request claim identity mismatch",
  );
  for (const settingKey of ["admin_publish", "publication"]) {
    await admin`
      update private.content_settings set enabled = false where setting_key = ${settingKey}
    `;
    await expectRejected(
      `editorial stage after ${settingKey} kill switch`,
      () =>
        asRole(
          "content_ingestor",
          (sql) => sql`
            select private.stage_editorial_release_v1(
              ${claimedEditorial.id}::uuid, '[]'::jsonb
            )
          `,
        ),
      new RegExp(`Content capability is disabled: ${settingKey}`),
    );
    await admin`
      update private.content_settings set enabled = true where setting_key = ${settingKey}
    `;
  }
  const editorialInput = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
        select private.get_editorial_publish_input_v1(${claimedEditorial.id}::uuid) as result
      `,
    ),
  );
  const editorialReportObjects = [];
  for (const reference of editorialInput.reports) {
    const baseRows = await admin`
      select parsed_document from private.report_snapshots
      where id = ${reference.report_snapshot_id}::uuid
    `;
    const document = structuredClone(baseRows[0].parsed_document);
    const changedItem = document.items.find(
      (item) => item.id === draftItem.item_id,
    );
    assert(changedItem, "Editorial materialization target disappeared");
    changedItem.title = "Browser A title";
    const prepared = reportObject(document);
    editorialReportObjects.push({
      report_date: document.date,
      object_key: prepared.objectKey,
      byte_length: prepared.byteLength,
      byte_sha256: prepared.byteSha256,
      parsed_document: document,
    });
  }
  const editorialReservation = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
        select private.stage_editorial_release_v1(
          ${claimedEditorial.id}::uuid, ${sql.json(editorialReportObjects)}
        ) as result
      `,
    ),
  );
  const editorialManifestHash = sha256("editorial-kill-switch-manifest");
  const editorialContentHash = sha256("editorial-kill-switch-content");
  const editorialDispatchId = randomUUID();
  const editorialDispatch = {
    dispatch_id: editorialDispatchId,
    site_release_id: editorialReservation.site_release_id,
    site_release_sequence: editorialReservation.site_release_sequence,
    expected_predecessor_id: editorialReservation.expected_predecessor_id,
    expected_content_sha: editorialContentHash,
    code_sha: editorialInput.code_sha,
    build_environment_version: editorialInput.build_environment_version,
    mode: "production",
  };
  for (const settingKey of ["admin_publish", "publication"]) {
    await admin`
      update private.content_settings set enabled = false where setting_key = ${settingKey}
    `;
    await expectRejected(
      `editorial finalize after ${settingKey} kill switch`,
      () =>
        asRole(
          "content_ingestor",
          (sql) => sql`
            select private.finalize_editorial_release_v1(
              ${claimedEditorial.id}::uuid,
              ${`site-manifests/sha256/${editorialManifestHash}.json`}, 1024,
              ${editorialManifestHash}, ${editorialContentHash},
              ${editorialDispatchId}::uuid, ${sql.json(editorialDispatch)}
            )
          `,
        ),
      new RegExp(`Content capability is disabled: ${settingKey}`),
    );
    await admin`
      update private.content_settings set enabled = true where setting_key = ${settingKey}
    `;
  }
  await asRole(
    "content_ingestor",
    (sql) => sql`
      select private.fail_editorial_publish_request_v1(
        ${claimedEditorial.id}::uuid, ${editorialWorker}, 'kill_switch_drill_complete'
      )
    `,
  );
  evidence.checks.editorial_concurrency_and_rebase = {
    status: "passed",
    concurrent_browser_winners: 1,
    concurrent_browser_conflicts: 1,
    stale_preview_publish_rejected: true,
    stale_rebase_conflicts: conflictedRebase.conflicts.length,
    conflict_incremented_row_version: true,
    explicit_rebase_completed: true,
    post_request_kill_switches: {
      claim: ["admin_publish", "publication"],
      stage: ["admin_publish", "publication"],
      finalize: ["admin_publish", "publication"],
    },
    current_release_generation: promotedE.result.generation,
  };

  const hidePlacementRows = await admin`
    select release_report.report_date::text, snapshot_item.item_id,
      snapshot_item.revision_id::text, snapshot_item.override_id::text
    from private.site_release_reports release_report
    join private.report_snapshot_items snapshot_item
      on snapshot_item.report_snapshot_id = release_report.report_snapshot_id
    where release_report.site_release_id = ${releaseE.site_release_id}::uuid
    order by release_report.report_date, snapshot_item.ordinal
    limit 1
  `;
  const hidePlacement = hidePlacementRows[0];
  const hideDraftBody = sha256("report-hide-draft-create");
  const hideDraft = rpc(
    await asRole(
      "content_editor",
      (sql) => sql`
        select private.create_editorial_draft_v1(
          ${releaseE.site_release_id}::uuid, ${randomUUID()}::uuid,
          ${sql.json(
            assertion({
              audience: "content-routine",
              action: "draft.create",
              bodySha256: hideDraftBody,
            }),
          )}, ${hideDraftBody}
        ) as result
      `,
    ),
  );
  const hideUpdateBody = sha256("report-hide-draft-update");
  const hideUpdate = rpc(
    await asRole(
      "content_editor",
      (sql) => sql`
        select private.upsert_editorial_draft_item_v1(
          ${hideDraft.draft_id}::uuid, ${hidePlacement.item_id},
          ${hidePlacement.revision_id}::uuid, ${hidePlacement.override_id || null}::uuid,
          ${sql.json({ report_hidden: true, report_date: hidePlacement.report_date })},
          ${hideDraft.row_version}, 'hide only this report placement', ${randomUUID()}::uuid,
          ${sql.json(
            assertion({
              audience: "content-routine",
              action: "draft.update",
              bodySha256: hideUpdateBody,
            }),
          )}, ${hideUpdateBody}
        ) as result
      `,
    ),
  );
  const hidePreviewBody = sha256("report-hide-preview");
  const hidePreview = rpc(
    await asRole(
      "content_editor",
      (sql) => sql`
        select private.request_preview_build_v1(
          ${hideDraft.draft_id}::uuid, ${hideUpdate.row_version}, ${randomUUID()}::uuid,
          ${sql.json(
            assertion({
              audience: "content-routine",
              action: "preview.build",
              bodySha256: hidePreviewBody,
            }),
          )}, ${hidePreviewBody}
        ) as result
      `,
    ),
  );
  const hidePreviewBuild = rpc(
    await asRole(
      "content_deployer",
      (sql) => sql`
        select private.register_preview_build_v1(
          ${hideDraft.draft_id}::uuid, ${hidePreview.preview_sha256},
          ${sha256("report-hide-preview-artifact")},
          'https://failure-matrix-report-hide.invalid', '{"route_parity":true}'::jsonb
        ) as result
      `,
    ),
  );
  const hidePublishBody = sha256("report-hide-publish");
  const hidePublish = rpc(
    await asRole(
      "content_controller",
      (sql) => sql`
        select private.request_editorial_publish_v1(
          ${hideDraft.draft_id}::uuid, ${hidePreviewBuild.preview_build_id}::uuid,
          ${hidePreviewBuild.row_version}, 'publish report scoped hide release',
          ${randomUUID()}::uuid,
          ${sql.json(
            assertion({
              audience: "content-control",
              action: "draft.publish",
              bodySha256: hidePublishBody,
            }),
          )}, ${hidePublishBody}
        ) as result
      `,
    ),
  );
  const claimedHide = rpc(
    await asRole(
      "content_ingestor",
      (sql) =>
        sql`select private.claim_editorial_publish_request_v1('report-hide-worker', 600) as result`,
    ),
  );
  assert(
    claimedHide.id === hidePublish.publish_request_id,
    "Report hide publish request was not claimed",
  );
  const hideInput = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
        select private.get_editorial_publish_input_v1(${claimedHide.id}::uuid) as result
      `,
    ),
  );
  assert(
    hideInput.reports.length === 1 &&
      hideInput.reports[0].report_date === hidePlacement.report_date,
    "Report hide materializer input escaped its target date",
  );
  const hideBaseRows = await admin`
    select parsed_document from private.report_snapshots
    where id = ${hideInput.reports[0].report_snapshot_id}::uuid
  `;
  const hiddenDocument = structuredClone(hideBaseRows[0].parsed_document);
  hiddenDocument.items = hiddenDocument.items
    .filter((item) => item.id !== hidePlacement.item_id)
    .map((item) => ({
      ...item,
      related_source_ids: Array.isArray(item.related_source_ids)
        ? item.related_source_ids.filter((id) => id !== hidePlacement.item_id)
        : item.related_source_ids,
    }));
  for (const batch of hiddenDocument.batches) {
    batch.item_ids = batch.item_ids.filter(
      (id) => id !== hidePlacement.item_id,
    );
  }
  hiddenDocument.overview = {
    text: "本期日报已根据报告级隐藏请求更新。",
    kind: "fallback",
    provenance: { method: "template", model: null, prompt_version: null },
  };
  const hiddenObject = reportObject(hiddenDocument);
  const hideReservation = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
        select private.stage_editorial_release_v1(
          ${claimedHide.id}::uuid,
          ${sql.json([
            {
              report_date: hidePlacement.report_date,
              object_key: hiddenObject.objectKey,
              byte_length: hiddenObject.byteLength,
              byte_sha256: hiddenObject.byteSha256,
              parsed_document: hiddenDocument,
            },
          ])}
        ) as result
      `,
    ),
  );
  const hideStagedOverrides = await admin`
    select count(*)::integer as count from private.editorial_staged_overrides
    where publish_request_id = ${claimedHide.id}::uuid
  `;
  assert(
    hideStagedOverrides[0].count === 0,
    "Report hide incorrectly created a global editorial override",
  );
  const hideManifestHash = sha256("report-hide-manifest");
  const hideContentHash = sha256("report-hide-content");
  const hideDispatchId = randomUUID();
  const hideRelease = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
        select private.finalize_editorial_release_v1(
          ${claimedHide.id}::uuid,
          ${`site-manifests/sha256/${hideManifestHash}.json`}, 1024,
          ${hideManifestHash}, ${hideContentHash}, ${hideDispatchId}::uuid,
          ${sql.json({
            dispatch_id: hideDispatchId,
            site_release_id: hideReservation.site_release_id,
            site_release_sequence: hideReservation.site_release_sequence,
            expected_predecessor_id: hideReservation.expected_predecessor_id,
            expected_content_sha: hideContentHash,
            code_sha: hideInput.code_sha,
            build_environment_version: hideInput.build_environment_version,
            mode: "production",
          })}
        ) as result
      `,
    ),
  );
  const hideScopeState = await admin`
    select
      (select count(*)::integer
       from private.site_release_reports release_report
       join private.report_snapshot_items snapshot_item
         on snapshot_item.report_snapshot_id = release_report.report_snapshot_id
       where release_report.site_release_id = ${hideRelease.site_release_id}::uuid
         and release_report.report_date = ${hidePlacement.report_date}::date
         and snapshot_item.item_id = ${hidePlacement.item_id}) as hidden_release_refs,
      (select count(*)::integer
       from private.site_release_reports release_report
       join private.report_snapshot_items snapshot_item
         on snapshot_item.report_snapshot_id = release_report.report_snapshot_id
       where release_report.site_release_id = ${releaseE.site_release_id}::uuid
         and release_report.report_date = ${hidePlacement.report_date}::date
         and snapshot_item.item_id = ${hidePlacement.item_id}) as base_release_refs,
      (select count(*)::integer from private.content_audit_log
       where action = 'draft.publish.finalize'
         and target ->> 'site_release_id' = ${hideRelease.site_release_id}) as finalize_audit_rows
  `;
  assert(
    hideScopeState[0].hidden_release_refs === 0 &&
      hideScopeState[0].base_release_refs === 1 &&
      hideScopeState[0].finalize_audit_rows === 1,
    "Report hide did not remain scoped, immutable, and audited",
  );
  evidence.checks.report_scoped_hide_release = {
    status: "passed",
    target_report_date: hidePlacement.report_date,
    hidden_release_refs: 0,
    base_release_refs: 1,
    staged_global_overrides: 0,
    finalize_audit_rows: 1,
  };
  await asRole(
    "content_deployer",
    (sql) => sql`
      select private.record_deployment_event_v1(
        ${hideRelease.site_release_id}::uuid, ${hideDispatchId}::uuid,
        'edge_verified', '{"synthetic_cleanup":true}'::jsonb
      )
    `,
  );

  const controlBody = sha256("routine-control-denial");
  await expectRejected(
    "Routine role calling Control RPC",
    () =>
      asRole(
        "content_editor",
        (sql) => sql`
				select private.authorize_production_rollback_v1(
					${releaseA.site_release_id}::uuid, 4, 'routine-must-fail',
					'failure matrix permission check',
					${sql.json(
            assertion({
              audience: "content-control",
              action: "production.rollback",
              bodySha256: controlBody,
            }),
          )},
					${controlBody}
				)
			`,
      ),
    /permission denied for function authorize_production_rollback_v1/,
  );
  const reconcileBody = sha256("production-reconcile-attestation");
  await expectRejected(
    "production reconciliation without fresh TOTP",
    () =>
      asRole(
        "content_controller",
        (sql) => sql`
          select private.authorize_production_reconcile_v1(
            'failure matrix reconciliation authorization',
            'RECONCILE PRODUCTION', ${randomUUID()}::uuid,
            ${sql.json(
              assertion({
                audience: "content-control",
                action: "production.reconcile",
                bodySha256: reconcileBody,
                authContext: "access",
              }),
            )}, ${reconcileBody}
          )
        `,
      ),
    /Attestation authentication context mismatch/,
  );
  const reconciliation = rpc(
    await asRole(
      "content_controller",
      (sql) => sql`
        select private.authorize_production_reconcile_v1(
          'failure matrix reconciliation authorization',
          'RECONCILE PRODUCTION', ${randomUUID()}::uuid,
          ${sql.json(
            assertion({
              audience: "content-control",
              action: "production.reconcile",
              bodySha256: reconcileBody,
              authContext: "access+totp",
            }),
          )}, ${reconcileBody}
        ) as result
      `,
    ),
  );
  const reconciliationAudit = await admin`
    select count(*)::integer as count
    from private.content_audit_log
    where action = 'production.reconcile.authorize'
  `;
  assert(
    reconciliation.authorized === true && reconciliationAudit[0].count === 1,
    "Production reconciliation was not freshly attested and audited exactly once",
  );
  evidence.checks.attestation_and_role_separation = {
    status: "passed",
    signature_algorithm: "Ed25519",
    database_key_material: "public-only",
    forged_signature_rejected: true,
    request_binding_rejected: ["audience", "action", "body_sha256"],
    auth_context_rejected: true,
    expired_and_24_hour_rejected: true,
    replay_rejected: true,
    routine_publish_execute_denied: true,
    routine_control_execute_denied: true,
    production_reconcile_totp_required: true,
    production_reconcile_audited: true,
  };

  await admin`
    update private.content_settings set enabled = true
    where setting_key = 'global_suppression'
  `;
  const suppressedItemId = identicalInput.document.items[0].id;
  const suppressionBody = sha256("global-suppression-request");
  const suppressionRequest = rpc(
    await asRole(
      "content_controller",
      (sql) => sql`
        select private.global_suppress_item_v1(
          ${suppressedItemId}, 'failure matrix global suppression',
          ${`SUPPRESS ${suppressedItemId}`}, ${randomUUID()}::uuid,
          ${sql.json(
            assertion({
              audience: "content-control",
              action: "global.suppress",
              bodySha256: suppressionBody,
            }),
          )}, ${suppressionBody}
        ) as result
      `,
    ),
  );
  assert(
    suppressionRequest.status === "queued" &&
      suppressionRequest.active === false,
    "Global suppression was incorrectly reported active before a release existed",
  );
  await admin`
    update private.content_settings set enabled = false where setting_key = 'publication'
  `;
  await expectRejected(
    "suppression materializer after publication kill switch",
    () =>
      asRole(
        "content_ingestor",
        (sql) =>
          sql`select private.claim_global_suppression_request_v1('suppression-disabled', 300)`,
      ),
    /Content capability is disabled: publication/,
  );
  await admin`
    update private.content_settings set enabled = true where setting_key = 'publication'
  `;
  const suppressionWorker = "failure-matrix-suppression";
  const claimedSuppression = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
        select private.claim_global_suppression_request_v1(${suppressionWorker}, 600) as result
      `,
    ),
  );
  const suppressionInput = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
        select private.get_global_suppression_input_v1(
          ${claimedSuppression.id}::uuid
        ) as result
      `,
    ),
  );
  const suppressionReportObjects = [];
  for (const reference of suppressionInput.reports) {
    const baseRows = await admin`
      select parsed_document
      from private.report_snapshots
      where id = ${reference.report_snapshot_id}::uuid
    `;
    const document = structuredClone(baseRows[0].parsed_document);
    document.items = document.items
      .filter((item) => item.id !== suppressedItemId)
      .map((item) => ({
        ...item,
        related_source_ids: item.related_source_ids.filter(
          (id) => id !== suppressedItemId,
        ),
      }));
    for (const batch of document.batches) {
      batch.item_ids = batch.item_ids.filter((id) => id !== suppressedItemId);
    }
    document.overview = {
      text: "本期日报已根据全局内容下架请求更新。",
      kind: "fallback",
      provenance: { method: "template", model: null, prompt_version: null },
    };
    const prepared = reportObject(document);
    suppressionReportObjects.push({
      report_date: document.date,
      object_key: prepared.objectKey,
      byte_length: prepared.byteLength,
      byte_sha256: prepared.byteSha256,
      parsed_document: document,
    });
  }
  let suppressionReservation = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
        select private.stage_global_suppression_release_v1(
          ${claimedSuppression.id}::uuid, ${sql.json(suppressionReportObjects)}
        ) as result
      `,
    ),
  );
  const abandonedSuppressionReservationId =
    suppressionReservation.reservation_id;
  await asRole(
    "content_ingestor",
    (sql) => sql`
      select private.fail_global_suppression_request_v1(
        ${claimedSuppression.id}::uuid, ${suppressionWorker}, 'simulated_failure_after_stage'
      )
    `,
  );
  const retriedSuppression = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
        select private.claim_global_suppression_request_v1(
          'failure-matrix-suppression-retry', 600
        ) as result
      `,
    ),
  );
  assert(
    retriedSuppression.id === claimedSuppression.id,
    "Failed suppression request was not reclaimed for retry",
  );
  suppressionReservation = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
        select private.stage_global_suppression_release_v1(
          ${claimedSuppression.id}::uuid, ${sql.json(suppressionReportObjects)}
        ) as result
      `,
    ),
  );
  const abandonedSuppressionReservation = await admin`
    select status from private.site_release_reservations
    where id = ${abandonedSuppressionReservationId}::uuid
  `;
  assert(
    abandonedSuppressionReservation[0].status === "abandoned" &&
      suppressionReservation.reservation_id !==
        abandonedSuppressionReservationId,
    "Suppression retry reused an abandoned staged reservation",
  );
  const suppressionManifestHash = sha256("global-suppression-manifest");
  const suppressionContentHash = sha256("global-suppression-content");
  const suppressionDispatchId = randomUUID();
  const suppressionRelease = rpc(
    await asRole(
      "content_ingestor",
      (sql) => sql`
        select private.finalize_global_suppression_release_v1(
          ${claimedSuppression.id}::uuid,
          ${`site-manifests/sha256/${suppressionManifestHash}.json`}, 1024,
          ${suppressionManifestHash}, ${suppressionContentHash},
          ${suppressionDispatchId}::uuid,
          ${sql.json({
            dispatch_id: suppressionDispatchId,
            site_release_id: suppressionReservation.site_release_id,
            site_release_sequence: suppressionReservation.site_release_sequence,
            expected_predecessor_id:
              suppressionReservation.expected_predecessor_id,
            expected_content_sha: suppressionContentHash,
            code_sha: suppressionInput.code_sha,
            build_environment_version:
              suppressionInput.build_environment_version,
            mode: "production",
          })}
        ) as result
      `,
    ),
  );
  const suppressionState = await admin`
    select suppression.active, request.status,
      (select count(*)::integer from private.content_outbox
       where site_release_id = ${suppressionRelease.site_release_id}::uuid) as outbox_count,
      (select count(*)::integer
       from private.site_release_reports release_report
       join private.report_snapshot_items snapshot_item
         on snapshot_item.report_snapshot_id = release_report.report_snapshot_id
       where release_report.site_release_id = ${suppressionRelease.site_release_id}::uuid
         and snapshot_item.item_id = ${suppressedItemId}) as suppressed_refs,
      (select count(*)::integer from private.content_audit_log
       where action in ('global.suppress','global.suppress.fail','global.suppress.finalize')
         and target ->> 'item_id' = ${suppressedItemId}) as audit_rows
    from private.global_suppressions suppression
    join private.global_suppression_requests request
      on request.suppression_id = suppression.id
    where request.id = ${claimedSuppression.id}::uuid
  `;
  assert(
    suppressionState[0].active === true &&
      suppressionState[0].status === "completed" &&
      suppressionState[0].outbox_count === 1 &&
      suppressionState[0].suppressed_refs === 0 &&
      suppressionState[0].audit_rows === 3,
    "Global suppression did not produce one audited immutable release without the item",
  );
  await expectRejected(
    "reintroduction of globally suppressed content",
    () => ingest(identicalInput),
    /Daily report contains a globally suppressed item/,
  );
  evidence.checks.global_suppression_release = {
    status: "passed",
    publication_kill_switch_blocked_claim: true,
    queued_before_materialization: true,
    staged_failure_retried_with_new_reservation: true,
    immutable_release_created: suppressionRelease.site_release_id,
    suppressed_release_refs: 0,
    outbox_rows: 1,
    audit_rows: 3,
    reintroduction_rejected: true,
  };

  const suppressionOutboxRows = await admin`
    select id::text from private.content_outbox
    where dispatch_id = ${suppressionDispatchId}::uuid
  `;
  const suppressionOutboxId = suppressionOutboxRows[0].id;
  await asRole(
    "content_deployer",
    (sql) => sql`
      select private.record_deployment_event_v1(
        ${suppressionRelease.site_release_id}::uuid,
        ${suppressionDispatchId}::uuid,
        'failed',
        ${sql.json({ error: "failure_matrix_manual_retry_fixture" })}
      )
    `,
  );
  const retryBodyHash = sha256("operations-manual-retry");
  const retryResult = rpc(
    await asRole(
      "content_controller",
      (sql) => sql`
        select private.retry_content_outbox_v1(
          ${suppressionOutboxId}::uuid,
          'failure matrix manual retry after incident review',
          ${`RETRY ${suppressionOutboxId}`},
          ${randomUUID()}::uuid,
          ${sql.json(
            assertion({
              audience: "content-control",
              action: "operations.retry",
              bodySha256: retryBodyHash,
            }),
          )},
          ${retryBodyHash}
        ) as result
      `,
    ),
  );
  assert(
    retryResult.outbox_id === suppressionOutboxId &&
      retryResult.dispatch_id === suppressionDispatchId &&
      retryResult.status === "queued",
    "Manual retry did not preserve the outbox and dispatch identity",
  );
  await expectRejected(
    "routine credential manual retry",
    () =>
      asRole(
        "content_editor",
        (sql) => sql`
          select private.retry_content_outbox_v1(
            ${suppressionOutboxId}::uuid, 'forbidden routine retry',
            ${`RETRY ${suppressionOutboxId}`}, ${randomUUID()}::uuid,
            '{}'::jsonb, ${retryBodyHash}
          )
        `,
      ),
    /permission denied for function retry_content_outbox_v1/,
  );
  await asRole(
    "content_deployer",
    (sql) => sql`
      select private.record_deployment_event_v1(
        ${suppressionRelease.site_release_id}::uuid,
        ${suppressionDispatchId}::uuid,
        'failed',
        ${sql.json({ error: "failure_matrix_retry_exhausted_fixture" })}
      )
    `,
  );

  const rebuildBodyHash = sha256("operations-same-release-rebuild");
  const rebuildKey = randomUUID();
  const rebuild = () =>
    asRole(
      "content_controller",
      (sql) => sql`
        select private.rebuild_content_release_v1(
          ${suppressionRelease.site_release_id}::uuid,
          'failure matrix same release rebuild after verifier review',
          ${`REBUILD ${suppressionRelease.site_release_id}`},
          ${rebuildKey}::uuid,
          ${sql.json(
            assertion({
              audience: "content-control",
              action: "operations.rebuild",
              bodySha256: rebuildBodyHash,
            }),
          )},
          ${rebuildBodyHash}
        ) as result
      `,
    );
  const rebuildResult = rpc(await rebuild());
  const rebuildRetryResult = rpc(await rebuild());
  assert(
    rebuildResult.outbox_id === rebuildRetryResult.outbox_id &&
      rebuildResult.dispatch_id === rebuildRetryResult.dispatch_id &&
      rebuildResult.dispatch_id !== suppressionDispatchId,
    "Same-release rebuild was not idempotent or reused the old dispatch identity",
  );

  const adminRead = async (route, arguments_, subject = ACTOR_SUB) => {
    const requestContext = { route, arguments: arguments_ };
    const bodyHash = sha256(`admin-read:${JSON.stringify(requestContext)}`);
    return rpc(
      await asRole(
        "content_editor",
        (sql) => sql`
          select private.read_admin_v1(
            'content-routine', ${route}, ${sql.json(arguments_)},
            ${sql.json(
              assertion({
                audience: "content-routine",
                action: "admin.read",
                bodySha256: bodyHash,
                requestContext,
                subject,
              }),
            )},
            ${bodyHash}
          ) as result
        `,
      ),
    );
  };
  const contentView = await adminRead("/v1/content", {
    after: null,
    limit: 100,
  });
  const operationsView = await adminRead("/v1/operations", { limit: 100 });
  const verifierDiff = await adminRead("/v1/operations/verifier-diff", {
    site_release_id: suppressionRelease.site_release_id,
  });
  const unboundReadDenied = await expectRejected(
    "unbound Access principal Admin read",
    () => adminRead("/v1/dashboard", {}, "unbound-access-subject"),
    /lacks the required role/,
  );
  const directReadDenied = await expectRejected(
    "direct Admin implementation RPC",
    () =>
      asRole(
        "content_editor",
        (sql) => sql`select private.list_admin_operations_v1(100)`,
      ),
    /permission denied for function list_admin_operations_v1/,
  );
  const operationsState = await admin`
    select
      (select count(*)::integer from private.content_outbox
       where site_release_id = ${suppressionRelease.site_release_id}::uuid) as outbox_count,
      (select count(*)::integer from private.content_audit_log
       where action = 'operations.retry') as retry_audits,
      (select count(*)::integer from private.content_audit_log
       where action = 'operations.rebuild') as rebuild_audits,
      (select count(*)::integer from private.release_deployment_attempts
       where site_release_id = ${suppressionRelease.site_release_id}::uuid
         and evidence ->> 'kind' in ('manual_retry', 'manual_rebuild')) as manual_events
  `;
  assert(
    contentView.some((item) => item.id === suppressedItemId) &&
      operationsView.outbox.some(
        (outbox) =>
          outbox.site_release_id === suppressionRelease.site_release_id,
      ) &&
      verifierDiff.site_release_id === suppressionRelease.site_release_id &&
      operationsState[0].outbox_count === 2 &&
      operationsState[0].retry_audits === 1 &&
      operationsState[0].rebuild_audits === 1 &&
      operationsState[0].manual_events === 2,
    "Admin operations were not least-privilege, idempotent and audited",
  );
  evidence.checks.admin_operations = {
    status: "passed",
    content_inventory_readable: true,
    operations_inventory_readable: true,
    verifier_diff_readable: true,
    unbound_principal_read_denied: unboundReadDenied,
    direct_read_rpc_denied: directReadDenied,
    manual_retry_preserved_dispatch_identity: true,
    routine_retry_denied: true,
    same_release_rebuild_idempotent: true,
    rebuild_created_new_dispatch_identity: true,
    retry_audit_rows: 1,
    rebuild_audit_rows: 1,
    manual_attempt_events: 2,
  };

  const finalPointer = await currentPointer();
  evidence.final_pointer = finalPointer;
  evidence.completed_at = new Date().toISOString();
  evidence.elapsed_ms = Math.round(performance.now() - started);
  evidence.status = "passed";
  const output = `${JSON.stringify(evidence, null, 2)}\n`;
  if (evidenceOut) await writeFile(evidenceOut, output, "utf8");
  process.stdout.write(output);
} finally {
  await admin.end({ timeout: 5 });
}
