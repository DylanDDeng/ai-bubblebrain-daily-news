const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GIT_SHA = /^[0-9a-f]{40}$/i;
const ACTIONS = new Set(["inspect", "dead_letter_superseded"]);

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
const siteReleaseId = required("SITE_RELEASE_ID");
const dispatchId = required("DISPATCH_ID");
const expectedCodeSha = required("EXPECTED_CODE_SHA").toLowerCase();
const supersededBySha = String(process.env.SUPERSEDED_BY_SHA || "")
  .trim()
  .toLowerCase();

if (!ACTIONS.has(action)) throw new Error("Unsupported emergency action");
if (!/^[a-z0-9]{20}$/.test(projectRef))
  throw new Error("Invalid Supabase project ref");
if (!UUID.test(siteReleaseId)) throw new Error("Invalid site release ID");
if (!UUID.test(dispatchId)) throw new Error("Invalid dispatch ID");
if (!GIT_SHA.test(expectedCodeSha)) throw new Error("Invalid expected code SHA");
if (
  action === "dead_letter_superseded" &&
  !GIT_SHA.test(supersededBySha)
) {
  throw new Error("A valid superseding code SHA is required");
}

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
