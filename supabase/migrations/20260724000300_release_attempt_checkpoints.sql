begin;

alter table private.content_outbox
  add column if not exists attempt_token uuid;
alter table private.content_outbox
  add column if not exists execution_generation bigint not null default 0
  check (execution_generation >= 0);
create unique index if not exists content_outbox_attempt_token_idx
  on private.content_outbox (attempt_token)
  where attempt_token is not null;

alter table private.release_artifacts
  add column if not exists verification_profile text;
alter table private.release_artifacts
  add column if not exists r2_verified_at timestamptz;
alter table private.release_artifacts
  add column if not exists lock_evidence_sha256 text
  check (lock_evidence_sha256 ~ '^[a-f0-9]{64}$');

alter table private.release_deployment_attempts
  drop constraint if exists release_deployment_attempts_event_type_check;
alter table private.release_deployment_attempts
  add constraint release_deployment_attempts_event_type_check
  check (event_type in (
    'queued', 'building', 'artifact_registered', 'preview_verified',
    'preview_failed', 'production_deployed', 'edge_verified',
    'rollback_authorized', 'rollback_deployed', 'rollback_committed',
    'failed', 'heartbeat', 'stale_callback_ignored'
  ));

create table if not exists private.release_deployment_checkpoints (
  site_release_id uuid not null references private.site_releases(id),
  stage text not null check (stage in ('artifact_registered', 'preview_verified')),
  dispatch_id uuid not null,
  originating_attempt_token uuid not null,
  originating_execution_generation bigint not null
    check (originating_execution_generation > 0),
  artifact_sha256 text not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  content_sha256 text check (content_sha256 ~ '^[a-f0-9]{64}$'),
  code_sha text check (code_sha ~ '^[a-f0-9]{40}$'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  completed_at timestamptz not null default clock_timestamp(),
  check (
    stage <> 'preview_verified'
    or nullif(evidence ->> 'preview_url', '') is not null
  ),
  primary key (site_release_id, stage)
);

alter table private.release_deployment_checkpoints enable row level security;
alter table private.release_deployment_checkpoints force row level security;
drop policy if exists content_rpc_owner_all
  on private.release_deployment_checkpoints;
create policy content_rpc_owner_all
  on private.release_deployment_checkpoints
  for all to content_rpc_owner
  using (true) with check (true);
revoke all on table private.release_deployment_checkpoints
  from public, anon, authenticated, service_role, content_ingestor,
       content_editor, content_controller, content_reader, content_deployer;
grant select, insert, update on private.release_deployment_checkpoints
  to content_rpc_owner;
grant select on private.release_deployment_checkpoints to content_backup;

set local role content_rpc_owner;

create or replace function private.claim_content_outbox_v1(
  worker_id text,
  lease_seconds integer default 1800
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  claimed private.content_outbox%rowtype;
  next_token uuid := gen_random_uuid();
begin
  update private.content_outbox
  set status = 'dead_letter',
      lease_expires_at = null,
      attempt_token = null,
      dead_lettered_at = coalesce(dead_lettered_at, clock_timestamp()),
      last_error = coalesce(last_error, 'lease expired after maximum attempts'),
      updated_at = clock_timestamp()
  where attempts >= max_attempts
    and status in ('queued', 'failed', 'claimed', 'dispatched', 'building', 'promoting')
    and (lease_expires_at is null or lease_expires_at <= clock_timestamp());

  update private.content_outbox value
  set status = 'claimed',
      locked_by = worker_id,
      locked_at = clock_timestamp(),
      lease_expires_at = clock_timestamp()
        + make_interval(secs => least(greatest(lease_seconds, 300), 3600)),
      attempts = attempts + 1,
      attempt_token = next_token,
      execution_generation = execution_generation + 1,
      updated_at = clock_timestamp()
  where value.id = (
    select id
    from private.content_outbox
    where (
        status in ('queued', 'failed', 'claimed', 'dispatched', 'building', 'promoting')
        or (status = 'preview_verified' and payload ->> 'mode' = 'production')
      )
      and next_attempt_at <= clock_timestamp()
      and (lease_expires_at is null or lease_expires_at <= clock_timestamp())
      and attempts < max_attempts
    order by inserted_at
    for update skip locked
    limit 1
  )
  returning * into claimed;

  if not found then return null; end if;
  return jsonb_build_object(
    'outbox_id', claimed.id,
    'site_release_id', claimed.site_release_id,
    'dispatch_id', claimed.dispatch_id,
    'payload', claimed.payload,
    'lease_expires_at', claimed.lease_expires_at,
    'attempt', claimed.attempts,
    'attempt_token', claimed.attempt_token,
    'execution_generation', claimed.execution_generation
  );
end;
$$;

create or replace function private.get_content_release_resume_plan_v1(
  p_site_release_id uuid,
  p_dispatch_id uuid,
  p_attempt_token uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  outbox private.content_outbox%rowtype;
  release private.site_releases%rowtype;
  artifact private.release_artifacts%rowtype;
  predecessor private.release_artifacts%rowtype;
  resume_stage text;
begin
  select * into outbox
  from private.content_outbox value
  where value.site_release_id = p_site_release_id
    and value.dispatch_id = p_dispatch_id
    and value.attempt_token = p_attempt_token
    and value.lease_expires_at > clock_timestamp();
  if not found then raise exception 'Stale deployment attempt token'; end if;

  select * into release from private.site_releases where id = p_site_release_id;
  select * into artifact from private.release_artifacts
  where site_release_id = p_site_release_id;

  if exists (
    select 1
    from private.release_deployment_checkpoints checkpoint
    where checkpoint.site_release_id = p_site_release_id
      and checkpoint.stage = 'preview_verified'
      and checkpoint.dispatch_id = p_dispatch_id
      and checkpoint.artifact_sha256 = artifact.artifact_sha256
      and checkpoint.content_sha256 = release.content_root_sha256
      and checkpoint.code_sha = artifact.code_sha
      and checkpoint.evidence ->> 'resume_contract_version'
        = 'r2-materialize-v1'
      and exists (
        select 1
        from private.release_deployment_checkpoints artifact_checkpoint
        where artifact_checkpoint.site_release_id = p_site_release_id
          and artifact_checkpoint.stage = 'artifact_registered'
          and artifact_checkpoint.dispatch_id = p_dispatch_id
          and artifact_checkpoint.artifact_sha256 = artifact.artifact_sha256
          and artifact_checkpoint.content_sha256 = release.content_root_sha256
          and artifact_checkpoint.code_sha = artifact.code_sha
          and artifact_checkpoint.evidence ->> 'resume_contract_version'
            = 'r2-materialize-v1'
      )
  ) then
    resume_stage := 'promote';
  elsif artifact.site_release_id is not null and exists (
    select 1
    from private.release_deployment_checkpoints checkpoint
    where checkpoint.site_release_id = p_site_release_id
      and checkpoint.stage = 'artifact_registered'
      and checkpoint.dispatch_id = p_dispatch_id
      and checkpoint.artifact_sha256 = artifact.artifact_sha256
      and checkpoint.content_sha256 = release.content_root_sha256
      and checkpoint.code_sha = artifact.code_sha
      and checkpoint.evidence ->> 'resume_contract_version'
        = 'r2-materialize-v1'
  ) then
    resume_stage := 'preview';
  else
    resume_stage := 'build';
  end if;

  if release.expected_predecessor_id is not null then
    select * into predecessor
    from private.release_artifacts value
    where value.site_release_id = release.expected_predecessor_id
      and value.production_verified_at is not null
      and value.hash_algorithm = 'sha256-content-addressed-pages-v1'
      and value.verification_profile = 'r2-full-get-sha256-indefinite-lock-v1'
      and value.r2_verified_at is not null
      and value.lock_evidence_sha256 is not null;
  end if;

  return jsonb_build_object(
    'resume_stage', resume_stage,
    'preview_checkpoint', (
      select jsonb_build_object(
        'dispatch_id', checkpoint.dispatch_id,
        'preview_url', checkpoint.evidence ->> 'preview_url',
        'artifact_sha256', checkpoint.artifact_sha256,
        'content_sha256', checkpoint.content_sha256,
        'code_sha', checkpoint.code_sha,
        'evidence', checkpoint.evidence,
        'completed_at', checkpoint.completed_at
      )
      from private.release_deployment_checkpoints checkpoint
      where checkpoint.site_release_id = p_site_release_id
        and checkpoint.stage = 'preview_verified'
        and checkpoint.dispatch_id = p_dispatch_id
        and checkpoint.artifact_sha256 = artifact.artifact_sha256
        and checkpoint.content_sha256 = release.content_root_sha256
        and checkpoint.code_sha = artifact.code_sha
        and checkpoint.evidence ->> 'resume_contract_version'
          = 'r2-materialize-v1'
    ),
    'artifact', case when artifact.site_release_id is null then null else
      jsonb_build_object(
        'object_key', artifact.object_key,
        'byte_length', artifact.byte_length,
        'artifact_sha256', artifact.artifact_sha256,
        'artifact_fingerprint_sha256', artifact.artifact_fingerprint_sha256,
        'hash_algorithm', artifact.hash_algorithm,
        'code_sha', artifact.code_sha,
        'content_sha256', release.content_root_sha256,
        'site_release_id', release.id,
        'site_release_sequence', release.sequence,
        'expected_predecessor_id', release.expected_predecessor_id,
        'build_environment_version', artifact.build_environment_version
      ) end,
    'trusted_baseline', case when predecessor.site_release_id is null then null else
      jsonb_build_object(
        'site_release_id', predecessor.site_release_id,
        'production_verified', true,
        'object_key', predecessor.object_key,
        'byte_length', predecessor.byte_length,
        'artifact_sha256', predecessor.artifact_sha256,
        'artifact_fingerprint_sha256', predecessor.artifact_fingerprint_sha256,
        'hash_algorithm', predecessor.hash_algorithm,
        'verification_profile', predecessor.verification_profile,
        'r2_verified_at', predecessor.r2_verified_at,
        'lock_evidence_sha256', predecessor.lock_evidence_sha256
      ) end
  );
end;
$$;

create or replace function private.accept_deployment_callback_v2(
  p_site_release_id uuid,
  p_dispatch_id uuid,
  p_attempt_token uuid,
  p_execution_generation bigint,
  p_event_type text,
  p_evidence jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update private.content_outbox value
  set lease_expires_at = clock_timestamp() + interval '30 minutes',
      github_run_id = coalesce((p_evidence ->> 'github_run_id')::bigint, github_run_id),
      updated_at = clock_timestamp()
  where value.site_release_id = p_site_release_id
    and value.dispatch_id = p_dispatch_id
    and value.attempt_token = p_attempt_token
    and value.execution_generation = p_execution_generation
    and value.status not in ('deployed', 'dead_letter')
    and value.lease_expires_at > clock_timestamp();

  if not found then
    insert into private.release_deployment_attempts(
      site_release_id, dispatch_id, event_type, evidence
    ) values (
      p_site_release_id, p_dispatch_id, 'stale_callback_ignored',
      coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object(
        'stale_event_type', p_event_type,
        'execution_generation', p_execution_generation
      )
    );
    return false;
  end if;

  if p_event_type = 'heartbeat' then
    insert into private.release_deployment_attempts(
      site_release_id, dispatch_id, event_type, evidence
    ) values (
      p_site_release_id, p_dispatch_id, 'heartbeat', coalesce(p_evidence, '{}'::jsonb)
    );
  end if;
  return true;
end;
$$;

create or replace function private.attest_release_artifact_v1(
  p_site_release_id uuid,
  p_artifact_sha256 text,
  p_verification_profile text,
  p_r2_verified_at timestamptz,
  p_lock_evidence_sha256 text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_verification_profile <> 'r2-full-get-sha256-indefinite-lock-v1'
    or p_artifact_sha256 !~ '^[a-f0-9]{64}$'
    or p_lock_evidence_sha256 !~ '^[a-f0-9]{64}$'
    or p_r2_verified_at is null then
    raise exception 'Invalid R2 verification attestation';
  end if;

  update private.release_artifacts value
  set verification_profile = p_verification_profile,
      r2_verified_at = greatest(value.r2_verified_at, p_r2_verified_at),
      lock_evidence_sha256 = p_lock_evidence_sha256
  where value.site_release_id = p_site_release_id
    and value.artifact_sha256 = p_artifact_sha256
    and (value.verification_profile is null
      or (value.verification_profile = p_verification_profile
        and value.lock_evidence_sha256 = p_lock_evidence_sha256));
  if not found then raise exception 'Artifact verification attestation collision'; end if;
end;
$$;

create or replace function private.record_deployment_checkpoint_v2(
  p_site_release_id uuid,
  p_dispatch_id uuid,
  p_attempt_token uuid,
  p_execution_generation bigint,
  p_event_type text,
  p_evidence jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  checkpoint_stage text;
begin
  if not exists (
    select 1 from private.content_outbox value
    where value.site_release_id = p_site_release_id
      and value.dispatch_id = p_dispatch_id
      and value.attempt_token = p_attempt_token
      and value.execution_generation = p_execution_generation
      and value.lease_expires_at > clock_timestamp()
  ) then
    raise exception 'Stale deployment attempt token';
  end if;

  checkpoint_stage := case
    when p_event_type in ('artifact_registered', 'preview_verified') then p_event_type
    else null
  end;
  if checkpoint_stage is not null then
    insert into private.release_deployment_checkpoints(
      site_release_id, stage, dispatch_id, originating_attempt_token,
      originating_execution_generation, artifact_sha256, content_sha256,
      code_sha, evidence
    ) values (
      p_site_release_id, checkpoint_stage, p_dispatch_id, p_attempt_token,
      p_execution_generation,
      p_evidence ->> 'artifact_sha256',
      nullif(p_evidence ->> 'content_sha256', ''),
      nullif(p_evidence ->> 'code_sha', ''),
      p_evidence
    )
    on conflict (site_release_id, stage) do nothing;

    if not exists (
      select 1 from private.release_deployment_checkpoints value
      where value.site_release_id = p_site_release_id
        and value.stage = checkpoint_stage
        and value.dispatch_id = p_dispatch_id
        and value.artifact_sha256 = p_evidence ->> 'artifact_sha256'
        and value.content_sha256 is not distinct from nullif(p_evidence ->> 'content_sha256', '')
        and value.code_sha is not distinct from nullif(p_evidence ->> 'code_sha', '')
        and (
          checkpoint_stage <> 'preview_verified'
          or value.evidence ->> 'preview_url'
            is not distinct from nullif(p_evidence ->> 'preview_url', '')
        )
    ) then
      raise exception 'Deployment checkpoint identity collision';
    end if;
  end if;

  perform private.record_deployment_event_v1(
    p_site_release_id, p_dispatch_id, p_event_type, p_evidence
  );
end;
$$;

create or replace function private.authorize_attempt_production_promotion_v1(
  p_site_release_id uuid,
  p_dispatch_id uuid,
  p_attempt_token uuid,
  p_execution_generation bigint,
  p_expected_pointer_generation bigint,
  p_locked_by text,
  p_attempt_lease_seconds integer default 900,
  p_slot_lease_seconds integer default 600
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  attempt private.content_outbox%rowtype;
  pointer private.release_current_pointer%rowtype;
  promotion_authorization jsonb;
  attempt_lease_expires_at timestamptz;
begin
  perform private.require_setting_v1('publication');
  perform pg_advisory_xact_lock(42003);

  select * into attempt
  from private.content_outbox value
  where value.site_release_id = p_site_release_id
    and value.dispatch_id = p_dispatch_id
    and value.attempt_token = p_attempt_token
    and value.execution_generation = p_execution_generation
  for update;
  if not found then
    raise exception 'Stale production deployment attempt';
  end if;
  if p_locked_by is distinct from (
    'broker:' || p_dispatch_id::text || ':' || p_attempt_token::text
  ) then
    raise exception 'Invalid production broker lock identity';
  end if;

  select * into pointer
  from private.release_current_pointer
  where singleton
  for update;
  if coalesce(pointer.generation, 0) <> p_expected_pointer_generation then
    raise exception 'Pointer generation conflict';
  end if;

  -- A Durable Object retry may arrive after the database commit response was
  -- lost. It may acknowledge that exact attempt, but it must not run the
  -- same-release repair path or perform another Pages mutation.
  if pointer.target_site_release_id = p_site_release_id then
    if attempt.status = 'dead_letter'
      or (
        attempt.status <> 'deployed'
        and (
          attempt.lease_expires_at is null
          or attempt.lease_expires_at <= clock_timestamp()
        )
      ) then
      raise exception 'Stale production deployment attempt';
    end if;
    update private.content_outbox value
    set status = 'deployed',
        lease_expires_at = null,
        updated_at = clock_timestamp()
    where value.id = attempt.id;
    return jsonb_build_object(
      'site_release_id', p_site_release_id,
      'already_committed', true,
      'expected_pointer_generation', pointer.generation
    );
  end if;

  if attempt.status <> 'preview_verified'
    or attempt.lease_expires_at is null
    or attempt.lease_expires_at <= clock_timestamp() then
    raise exception 'Stale production deployment attempt';
  end if;

  attempt_lease_expires_at := clock_timestamp()
    + make_interval(
        secs => least(greatest(p_attempt_lease_seconds, 900), 1800)
      );
  update private.content_outbox value
  set status = 'promoting',
      locked_by = p_locked_by,
      lease_expires_at = attempt_lease_expires_at,
      updated_at = clock_timestamp()
  where value.id = attempt.id;

  promotion_authorization := private.authorize_production_promotion_v1(
    p_site_release_id,
    p_expected_pointer_generation,
    p_locked_by,
    least(greatest(p_slot_lease_seconds, 60), 600)
  );
  return promotion_authorization || jsonb_build_object(
    'already_committed', false,
    'dispatch_id', p_dispatch_id,
    'attempt_token', p_attempt_token,
    'execution_generation', p_execution_generation,
    'attempt_lease_expires_at', attempt_lease_expires_at
  );
end;
$$;

create or replace function private.commit_attempt_production_promotion_v1(
  p_site_release_id uuid,
  p_dispatch_id uuid,
  p_attempt_token uuid,
  p_execution_generation bigint,
  p_fencing_token bigint,
  p_expected_pointer_generation bigint,
  p_pages_deployment_id text,
  p_manifest_sha256 text,
  p_artifact_sha256 text,
  p_build_environment_version text,
  p_verifier_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  attempt private.content_outbox%rowtype;
  committed jsonb;
begin
  perform pg_advisory_xact_lock(42003);

  select * into attempt
  from private.content_outbox value
  where value.site_release_id = p_site_release_id
    and value.dispatch_id = p_dispatch_id
    and value.attempt_token = p_attempt_token
    and value.execution_generation = p_execution_generation
    and value.status = 'promoting'
    and value.lease_expires_at > clock_timestamp()
  for update;
  if not found then
    raise exception 'Stale production deployment attempt';
  end if;

  committed := private.commit_production_promotion_v1(
    p_site_release_id,
    p_fencing_token,
    p_expected_pointer_generation,
    p_pages_deployment_id,
    p_manifest_sha256,
    p_artifact_sha256,
    p_build_environment_version,
    p_verifier_evidence
  );
  return committed || jsonb_build_object(
    'dispatch_id', p_dispatch_id,
    'execution_generation', p_execution_generation
  );
end;
$$;

create or replace function private.commit_reconciled_production_promotion_v1(
  p_site_release_id uuid,
  p_fencing_token bigint,
  p_expected_pointer_generation bigint,
  p_pages_deployment_id text,
  p_manifest_sha256 text,
  p_artifact_sha256 text,
  p_build_environment_version text,
  p_verifier_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  committed jsonb;
begin
  perform pg_advisory_xact_lock(42003);
  if not exists (
    select 1
    from private.production_promotion_slot slot
    where slot.project_key = 'bubble-brain-pages'
      and slot.site_release_id = p_site_release_id
      and slot.fencing_token = p_fencing_token
      and slot.expected_pointer_generation = p_expected_pointer_generation
      and slot.operation = 'forward'
      and slot.status = 'verifying'
      and slot.locked_by like 'reconciler:%'
      and slot.lease_expires_at > clock_timestamp()
  ) then
    raise exception 'Stale production reconcile fencing token';
  end if;

  committed := private.commit_production_promotion_v1(
    p_site_release_id,
    p_fencing_token,
    p_expected_pointer_generation,
    p_pages_deployment_id,
    p_manifest_sha256,
    p_artifact_sha256,
    p_build_environment_version,
    p_verifier_evidence
  );
  return committed;
end;
$$;

revoke all on function private.get_content_release_resume_plan_v1(uuid, uuid, uuid)
  from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller, content_reader;
grant execute on function private.get_content_release_resume_plan_v1(uuid, uuid, uuid)
  to content_deployer;

revoke all on function private.accept_deployment_callback_v2(
  uuid, uuid, uuid, bigint, text, jsonb
) from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller, content_reader;
grant execute on function private.accept_deployment_callback_v2(
  uuid, uuid, uuid, bigint, text, jsonb
) to content_deployer;

revoke all on function private.attest_release_artifact_v1(
  uuid, text, text, timestamptz, text
) from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller, content_reader;
grant execute on function private.attest_release_artifact_v1(
  uuid, text, text, timestamptz, text
) to content_deployer;

revoke all on function private.record_deployment_checkpoint_v2(
  uuid, uuid, uuid, bigint, text, jsonb
) from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller, content_reader;
grant execute on function private.record_deployment_checkpoint_v2(
  uuid, uuid, uuid, bigint, text, jsonb
) to content_deployer;

revoke all on function private.authorize_attempt_production_promotion_v1(
  uuid, uuid, uuid, bigint, bigint, text, integer, integer
) from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller, content_reader;
grant execute on function private.authorize_attempt_production_promotion_v1(
  uuid, uuid, uuid, bigint, bigint, text, integer, integer
) to content_deployer;

revoke all on function private.commit_attempt_production_promotion_v1(
  uuid, uuid, uuid, bigint, bigint, bigint, text, text, text, text, jsonb
) from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller, content_reader;
grant execute on function private.commit_attempt_production_promotion_v1(
  uuid, uuid, uuid, bigint, bigint, bigint, text, text, text, text, jsonb
) to content_deployer;

revoke all on function private.commit_reconciled_production_promotion_v1(
  uuid, bigint, bigint, text, text, text, text, jsonb
) from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller, content_reader;
grant execute on function private.commit_reconciled_production_promotion_v1(
  uuid, bigint, bigint, text, text, text, text, jsonb
) to content_deployer;

-- Expand phase only: the legacy authorize RPC remains executable until every
-- production Broker instance is running the attempt-fenced call above. Revoke
-- it in a separately deployed contract phase to avoid a DB/Broker rollout gap.

commit;
