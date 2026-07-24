import { readFile } from "node:fs/promises";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GIT_SHA = /^[0-9a-f]{40}$/i;
const ACTIONS = new Set([
  "inspect_latest",
  "inspect",
  "dead_letter_superseded",
  "reset_dead_letter_slot",
  "apply_slot_rollover_migration",
]);

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

const action = required("EMERGENCY_ACTION");
const projectRef = required("CONTENT_DATABASE_PROJECT_REF");
const token = required("SUPABASE_MANAGEMENT_API_TOKEN");

if (!ACTIONS.has(action)) throw new Error("Unsupported emergency action");
if (!/^[a-z0-9]{20}$/.test(projectRef))
  throw new Error("Invalid Supabase project ref");

async function query(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Supabase database query failed (${response.status}): ${body.slice(0, 500)}`,
    );
  }
  const parsed = JSON.parse(body);
  if (!Array.isArray(parsed)) throw new Error("Unexpected database query result");
  return parsed;
}

if (action === "apply_slot_rollover_migration") {
  const migrationUrl = new URL(
    "../supabase/migrations/20260724000100_terminal_publication_slot_rollover.sql",
    import.meta.url,
  );
  const migration = await readFile(migrationUrl, "utf8");
  await query(migration);
  const rows = await query(`
    select jsonb_build_object(
      'owner', pg_get_userbyid(procedure.proowner),
      'ingestor_execute', has_function_privilege(
        'content_ingestor',
        'private.prepare_ingestion_publication_slot_v1(uuid,text,text)',
        'execute'
      ),
      'editor_execute', has_function_privilege(
        'content_editor',
        'private.prepare_ingestion_publication_slot_v1(uuid,text,text)',
        'execute'
      ),
      'backup_execute', has_function_privilege(
        'content_backup',
        'private.prepare_ingestion_publication_slot_v1(uuid,text,text)',
        'execute'
      ),
      'terminal_guard', position(
        'Publication slot release is still active'
        in pg_get_functiondef(procedure.oid)
      ) > 0
    ) as result
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname = 'prepare_ingestion_publication_slot_v1'
  `);
  if (rows.length !== 1 || !rows[0]?.result)
    throw new Error("Slot rollover migration verification returned no function");
  const verification = rows[0].result;
  if (
    verification.owner !== "content_rpc_owner" ||
    verification.ingestor_execute !== true ||
    verification.editor_execute !== false ||
    verification.backup_execute !== false ||
    verification.terminal_guard !== true
  ) {
    throw new Error("Slot rollover migration verification failed");
  }
  console.log(JSON.stringify({ phase: "migration_verified", ...verification }));
  process.exit(0);
}

if (action === "inspect_latest") {
  const rows = await query(`
    with latest as (
      select jsonb_build_object(
        'outbox_id', outbox.id,
        'site_release_id', outbox.site_release_id,
        'dispatch_id', outbox.dispatch_id,
        'status', outbox.status,
        'attempts', outbox.attempts,
        'max_attempts', outbox.max_attempts,
        'next_attempt_at', outbox.next_attempt_at,
        'lease_expires_at', outbox.lease_expires_at,
        'last_error', outbox.last_error,
        'updated_at', outbox.updated_at,
        'release_sequence', release.sequence,
        'code_sha', coalesce(artifact.code_sha, outbox.payload ->> 'code_sha'),
        'source_code_sha', outbox.payload ->> 'source_code_sha',
        'mode', outbox.payload ->> 'mode',
        'head_claimed', head.reservation_id is not null
      ) as item
      from private.content_outbox outbox
      join private.site_releases release on release.id = outbox.site_release_id
      left join private.release_artifacts artifact on artifact.site_release_id = release.id
      left join private.release_head_claims head
        on head.reservation_id = release.id
      order by outbox.updated_at desc
      limit 12
    ),
    attempts as (
      select jsonb_build_object(
        'id', attempt.id,
        'report_date', attempt.report_date,
        'batch_id', attempt.batch_id,
        'attempt_number', attempt.attempt_number,
        'trigger_kind', attempt.trigger_kind,
        'status', attempt.status,
        'error_code', attempt.error_code,
        'error_detail', attempt.error_detail,
        'started_at', attempt.started_at,
        'finished_at', attempt.finished_at
      ) as item
      from private.publication_attempts attempt
      order by coalesce(attempt.finished_at, attempt.started_at) desc
      limit 12
    )
    select jsonb_build_object(
      'current', jsonb_build_object(
        'site_release_id', current_release.id,
        'release_sequence', current_release.sequence,
        'code_sha', current_artifact.code_sha
      ),
      'latest_outbox', coalesce(
        (select jsonb_agg(item) from latest),
        '[]'::jsonb
      ),
      'latest_attempts', coalesce(
        (select jsonb_agg(item) from attempts),
        '[]'::jsonb
      )
    ) as result
    from private.release_current_pointer pointer
    join private.site_releases current_release
      on current_release.id = pointer.target_site_release_id
    join private.release_artifacts current_artifact
      on current_artifact.site_release_id = current_release.id
  `);
  if (rows.length !== 1 || !rows[0]?.result)
    throw new Error("Expected one release state result");
  console.log(JSON.stringify(rows[0].result));
  process.exit(0);
}

const siteReleaseId = required("SITE_RELEASE_ID");
const dispatchId = required("DISPATCH_ID");
const expectedCodeSha = required("EXPECTED_CODE_SHA").toLowerCase();
const supersededBySha = String(process.env.SUPERSEDED_BY_SHA || "")
  .trim()
  .toLowerCase();

if (!UUID.test(siteReleaseId)) throw new Error("Invalid site release ID");
if (!UUID.test(dispatchId)) throw new Error("Invalid dispatch ID");
if (!GIT_SHA.test(expectedCodeSha)) throw new Error("Invalid expected code SHA");
if (
  action === "dead_letter_superseded" &&
  !GIT_SHA.test(supersededBySha)
) {
  throw new Error("A valid superseding code SHA is required");
}

if (action === "reset_dead_letter_slot") {
  const reportDate = required("REPORT_DATE");
  const batchId = required("BATCH_ID");
  const expectedCurrentReleaseId = required("EXPECTED_CURRENT_RELEASE_ID");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate))
    throw new Error("Invalid report date");
  if (!["morning", "afternoon", "night", "lateNight", "lateNightSupplement"].includes(batchId))
    throw new Error("Invalid batch ID");
  if (!UUID.test(expectedCurrentReleaseId))
    throw new Error("Invalid expected current release ID");
  if (expectedCurrentReleaseId === siteReleaseId)
    throw new Error("Refusing to reset the current production release");

  const stateRows = await query(`
    select jsonb_build_object(
      'report_date', slot.report_date,
      'batch_id', slot.batch_id,
      'slot_site_release_id', slot.site_release_id,
      'slot_reservation_id', slot.reservation_id,
      'dispatch_id', outbox.dispatch_id,
      'outbox_status', outbox.status,
      'code_sha', artifact.code_sha,
      'head_claimed', head.reservation_id is not null,
      'current_site_release_id', pointer.target_site_release_id
    ) as result
    from private.publication_slots slot
    join private.content_outbox outbox
      on outbox.site_release_id = slot.site_release_id
    join private.release_artifacts artifact
      on artifact.site_release_id = slot.site_release_id
    left join private.release_head_claims head
      on head.reservation_id = slot.site_release_id
    cross join private.release_current_pointer pointer
    where slot.report_date = ${sqlLiteral(reportDate)}::date
      and slot.batch_id = ${sqlLiteral(batchId)}
      and slot.site_release_id = ${sqlLiteral(siteReleaseId)}::uuid
      and outbox.dispatch_id = ${sqlLiteral(dispatchId)}::uuid
  `);
  if (stateRows.length !== 1 || !stateRows[0]?.result)
    throw new Error("Expected exactly one matching dead-letter publication slot");
  const before = stateRows[0].result;
  if (before.outbox_status !== "dead_letter")
    throw new Error("Publication slot outbox is not dead-lettered");
  if (before.head_claimed)
    throw new Error("Publication slot still owns the release head");
  if (String(before.code_sha).toLowerCase() !== expectedCodeSha)
    throw new Error("Publication slot code SHA mismatch");
  if (before.current_site_release_id !== expectedCurrentReleaseId)
    throw new Error("Current production release changed");
  console.log(JSON.stringify({ phase: "before_slot_reset", ...before }));

  const resetRows = await query(`
    with target as materialized (
      select slot.report_date, slot.batch_id, slot.site_release_id
      from private.publication_slots slot
      join private.content_outbox outbox
        on outbox.site_release_id = slot.site_release_id
      join private.release_artifacts artifact
        on artifact.site_release_id = slot.site_release_id
      cross join private.release_current_pointer pointer
      where slot.report_date = ${sqlLiteral(reportDate)}::date
        and slot.batch_id = ${sqlLiteral(batchId)}
        and slot.site_release_id = ${sqlLiteral(siteReleaseId)}::uuid
        and outbox.dispatch_id = ${sqlLiteral(dispatchId)}::uuid
        and outbox.status = 'dead_letter'
        and artifact.code_sha = ${sqlLiteral(expectedCodeSha)}
        and pointer.target_site_release_id = ${sqlLiteral(expectedCurrentReleaseId)}::uuid
        and pointer.target_site_release_id <> slot.site_release_id
        and not exists (
          select 1 from private.release_head_claims head
          where head.reservation_id = slot.site_release_id
        )
      for update of slot
    ),
    audit as (
      insert into private.release_deployment_attempts(
        site_release_id, dispatch_id, event_type, evidence
      )
      select target.site_release_id, ${sqlLiteral(dispatchId)}::uuid, 'failed',
        jsonb_build_object(
          'recovery', 'dead_letter_publication_slot_reset',
          'report_date', target.report_date,
          'batch_id', target.batch_id,
          'current_site_release_id', ${sqlLiteral(expectedCurrentReleaseId)}
        )
      from target
      returning site_release_id
    ),
    deleted as (
      delete from private.publication_slots slot
      using target
      where slot.report_date = target.report_date
        and slot.batch_id = target.batch_id
      returning slot.report_date, slot.batch_id, slot.site_release_id
    )
    select jsonb_build_object(
      'report_date', deleted.report_date,
      'batch_id', deleted.batch_id,
      'site_release_id', deleted.site_release_id,
      'audit_recorded', exists(select 1 from audit)
    ) as result
    from deleted
  `);
  if (resetRows.length !== 1 || !resetRows[0]?.result?.audit_recorded)
    throw new Error("Guarded publication slot reset did not affect exactly one row");
  console.log(JSON.stringify({ phase: "after_slot_reset", ...resetRows[0].result }));
  process.exit(0);
}

function inspectionSql() {
  return `
    select jsonb_build_object(
      'outbox_id', outbox.id,
      'site_release_id', outbox.site_release_id,
      'dispatch_id', outbox.dispatch_id,
      'status', outbox.status,
      'attempts', outbox.attempts,
      'max_attempts', outbox.max_attempts,
      'lease_expires_at', outbox.lease_expires_at,
      'next_attempt_at', outbox.next_attempt_at,
      'last_error', outbox.last_error,
      'release_sequence', release.sequence,
      'code_sha', artifact.code_sha,
      'head_claimed', head.reservation_id is not null,
      'active_sibling_count', (
        select count(*)
        from private.content_outbox sibling
        where sibling.site_release_id = outbox.site_release_id
          and sibling.id <> outbox.id
          and sibling.status not in ('deployed', 'dead_letter')
          and not (
            sibling.status = 'preview_verified'
            and sibling.payload ->> 'mode' = 'shadow'
          )
      ),
      'current_site_release_id', pointer.target_site_release_id,
      'current_release_sequence', current_release.sequence,
      'current_code_sha', current_artifact.code_sha
    ) as result
    from private.content_outbox outbox
    join private.site_releases release on release.id = outbox.site_release_id
    join private.release_artifacts artifact on artifact.site_release_id = release.id
    left join private.release_head_claims head
      on head.reservation_id = release.id
    cross join private.release_current_pointer pointer
    join private.site_releases current_release
      on current_release.id = pointer.target_site_release_id
    join private.release_artifacts current_artifact
      on current_artifact.site_release_id = current_release.id
    where outbox.site_release_id = ${sqlLiteral(siteReleaseId)}::uuid
      and outbox.dispatch_id = ${sqlLiteral(dispatchId)}::uuid
  `;
}

function oneInspection(rows) {
  if (rows.length !== 1 || !rows[0]?.result)
    throw new Error("Expected exactly one matching outbox row");
  return rows[0].result;
}

function assertTarget(state, { terminal = false } = {}) {
  if (state.site_release_id !== siteReleaseId)
    throw new Error("Release identity mismatch");
  if (state.dispatch_id !== dispatchId)
    throw new Error("Dispatch identity mismatch");
  if (String(state.code_sha).toLowerCase() !== expectedCodeSha)
    throw new Error("Code SHA mismatch");
  if (state.current_site_release_id === siteReleaseId)
    throw new Error("Refusing to alter the current production release");
  if (Number(state.active_sibling_count) !== 0)
    throw new Error("Release has another active outbox");
  if (terminal) {
    if (state.status !== "dead_letter")
      throw new Error("Outbox did not reach dead_letter");
    if (state.head_claimed)
      throw new Error("Release head claim was not released");
    return;
  }
  if (!state.head_claimed)
    throw new Error("Target release does not own the release head");
  if (["deployed", "dead_letter"].includes(state.status))
    throw new Error(`Refusing to alter terminal outbox status ${state.status}`);
}

const before = oneInspection(await query(inspectionSql()));
assertTarget(before, { terminal: action === "inspect" && before.status === "dead_letter" });
console.log(JSON.stringify({ phase: "before", ...before }));

if (action === "inspect") process.exit(0);

const reason = `superseded_by_main_${supersededBySha}`;
const mutation = await query(`
  with target as materialized (
    select outbox.id, outbox.site_release_id, outbox.dispatch_id
    from private.content_outbox outbox
    join private.release_artifacts artifact
      on artifact.site_release_id = outbox.site_release_id
    join private.release_head_claims head
      on head.reservation_id = outbox.site_release_id
    where outbox.site_release_id = ${sqlLiteral(siteReleaseId)}::uuid
      and outbox.dispatch_id = ${sqlLiteral(dispatchId)}::uuid
      and artifact.code_sha = ${sqlLiteral(expectedCodeSha)}
      and outbox.status not in ('deployed', 'dead_letter')
      and not exists (
        select 1 from private.release_current_pointer pointer
        where pointer.target_site_release_id = outbox.site_release_id
      )
      and not exists (
        select 1
        from private.content_outbox sibling
        where sibling.site_release_id = outbox.site_release_id
          and sibling.id <> outbox.id
          and sibling.status not in ('deployed', 'dead_letter')
          and not (
            sibling.status = 'preview_verified'
            and sibling.payload ->> 'mode' = 'shadow'
          )
      )
    for update of outbox
  ),
  attempt as (
    insert into private.release_deployment_attempts(
      site_release_id, dispatch_id, event_type, evidence
    )
    select site_release_id, dispatch_id, 'failed',
      jsonb_build_object(
        'error', ${sqlLiteral(reason)},
        'recovery', 'manual_superseded_release_terminalization',
        'superseded_by_code_sha', ${sqlLiteral(supersededBySha)}
      )
    from target
    returning site_release_id
  ),
  updated as (
    update private.content_outbox outbox
    set status = 'dead_letter',
      lease_expires_at = null,
      dead_lettered_at = coalesce(outbox.dead_lettered_at, clock_timestamp()),
      last_error = ${sqlLiteral(reason)},
      updated_at = clock_timestamp()
    from target
    where outbox.id = target.id
    returning outbox.id, outbox.site_release_id, outbox.dispatch_id, outbox.status
  )
  select jsonb_build_object(
    'outbox_id', updated.id,
    'site_release_id', updated.site_release_id,
    'dispatch_id', updated.dispatch_id,
    'status', updated.status,
    'attempt_recorded', exists(select 1 from attempt)
  ) as result
  from updated
`);

if (mutation.length !== 1 || mutation[0]?.result?.status !== "dead_letter")
  throw new Error("Guarded mutation did not update exactly one outbox");

const after = oneInspection(await query(inspectionSql()));
assertTarget(after, { terminal: true });
if (after.current_site_release_id !== before.current_site_release_id)
  throw new Error("Current production pointer changed unexpectedly");
console.log(JSON.stringify({ phase: "after", ...after }));
