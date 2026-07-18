begin;

set local role content_rpc_owner;

create or replace function private.get_production_deploy_context_v1(target_site_release_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target private.site_releases%rowtype;
  artifact private.release_artifacts%rowtype;
  pointer private.release_current_pointer%rowtype;
begin
  select * into target from private.site_releases where id = target_site_release_id;
  select * into artifact from private.release_artifacts where site_release_id = target_site_release_id;
  select * into pointer from private.release_current_pointer where singleton;
  if target.id is null or artifact.site_release_id is null then
    raise exception 'Release or immutable artifact unavailable';
  end if;
  return jsonb_build_object(
    'site_release_id', target.id,
    'site_release_sequence', target.sequence,
    'expected_predecessor_id', target.expected_predecessor_id,
    'manifest_sha256', target.manifest_sha256,
    'content_sha256', target.content_root_sha256,
    'schema_version', target.schema_version,
    'taxonomy_version', target.taxonomy_version,
    'serializer_version', target.serializer_version,
    'search_contract_version', target.search_contract_version,
    'source_contract_version', target.source_contract_version,
    'artifact_object_key', artifact.object_key,
    'artifact_byte_length', artifact.byte_length,
    'artifact_sha256', artifact.artifact_sha256,
    'artifact_fingerprint_sha256', artifact.artifact_fingerprint_sha256,
    'artifact_hash_algorithm', artifact.hash_algorithm,
    'code_sha', artifact.code_sha,
    'build_environment_version', artifact.build_environment_version,
    'pointer_generation', coalesce(pointer.generation, 0),
    'current_site_release_id', pointer.target_site_release_id,
    'current_site_release_sequence', pointer.target_release_sequence
  );
end;
$$;

create or replace function private.mark_promotion_verifying_v1(
  site_release_id uuid,
  fencing_token bigint,
  expected_pointer_generation bigint,
  pages_deployment_id text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(pages_deployment_id), '') is null then
    raise exception 'Pages deployment id is required';
  end if;
  update private.production_promotion_slot set
    status = 'verifying', updated_at = clock_timestamp()
  where project_key = 'bubble-brain-pages'
    and private.production_promotion_slot.site_release_id = mark_promotion_verifying_v1.site_release_id
    and private.production_promotion_slot.fencing_token = mark_promotion_verifying_v1.fencing_token
    and private.production_promotion_slot.expected_pointer_generation = mark_promotion_verifying_v1.expected_pointer_generation
    and lease_expires_at > clock_timestamp()
    and status = 'deploying'
    and operation = 'forward';
  if not found then raise exception 'Stale production fencing token'; end if;
  insert into private.release_deployment_attempts(site_release_id, event_type, evidence)
  values (site_release_id, 'production_deployed', jsonb_build_object('pages_deployment_id', pages_deployment_id));
end;
$$;

create or replace function private.get_authorized_rollback_context_v1(
  target_site_release_id uuid,
  fencing_token bigint,
  expected_pointer_generation bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target private.site_releases%rowtype;
  artifact private.release_artifacts%rowtype;
begin
  if not exists (
    select 1 from private.production_promotion_slot
    where private.production_promotion_slot.project_key = 'bubble-brain-pages'
      and private.production_promotion_slot.site_release_id = get_authorized_rollback_context_v1.target_site_release_id
      and private.production_promotion_slot.fencing_token = get_authorized_rollback_context_v1.fencing_token
      and private.production_promotion_slot.expected_pointer_generation = get_authorized_rollback_context_v1.expected_pointer_generation
      and operation = 'rollback'
      and status = 'rolling_back'
      and lease_expires_at > clock_timestamp()
  ) then raise exception 'Stale rollback fencing token'; end if;
  if (select generation from private.release_current_pointer where singleton)
    <> expected_pointer_generation then raise exception 'Pointer generation conflict'; end if;
  select * into target from private.site_releases
    where id = get_authorized_rollback_context_v1.target_site_release_id;
  select * into artifact from private.release_artifacts
    where private.release_artifacts.site_release_id = get_authorized_rollback_context_v1.target_site_release_id
      and production_verified_at is not null;
  if target.id is null or artifact.site_release_id is null then
    raise exception 'Rollback artifact unavailable';
  end if;
  return jsonb_build_object(
    'site_release_id', target.id,
    'site_release_sequence', target.sequence,
    'manifest_sha256', target.manifest_sha256,
    'content_sha256', target.content_root_sha256,
    'schema_version', target.schema_version,
    'taxonomy_version', target.taxonomy_version,
    'serializer_version', target.serializer_version,
    'search_contract_version', target.search_contract_version,
    'source_contract_version', target.source_contract_version,
    'artifact_object_key', artifact.object_key,
    'artifact_byte_length', artifact.byte_length,
    'artifact_sha256', artifact.artifact_sha256,
    'artifact_fingerprint_sha256', artifact.artifact_fingerprint_sha256,
    'artifact_hash_algorithm', artifact.hash_algorithm,
    'code_sha', artifact.code_sha,
    'build_environment_version', artifact.build_environment_version
  );
end;
$$;

create or replace function private.begin_production_reconcile_v1()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  slot private.production_promotion_slot%rowtype;
begin
  perform pg_advisory_xact_lock(42003);
  select * into slot from private.production_promotion_slot
    where project_key = 'bubble-brain-pages' for update;
  if slot.project_key is null or slot.status in ('committed', 'authorized') then return null; end if;
  if coalesce((select generation from private.release_current_pointer where singleton), 0)
    <> slot.expected_pointer_generation then
    raise exception 'Pointer generation conflict during reconcile';
  end if;
  update private.production_promotion_slot set
    status = case when operation = 'forward' then 'verifying' else 'rolling_back' end,
    lease_expires_at = clock_timestamp() + interval '10 minutes',
    updated_at = clock_timestamp()
  where project_key = 'bubble-brain-pages';
  return private.get_promotion_reconcile_context_v1();
end;
$$;

create or replace function private.get_promotion_reconcile_context_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  slot private.production_promotion_slot%rowtype;
  target jsonb;
  current_context jsonb;
  current_id uuid;
begin
  select * into slot from private.production_promotion_slot
  where project_key = 'bubble-brain-pages';
  if slot.project_key is null or slot.status in ('committed', 'authorized') then return null; end if;
  target := private.get_production_deploy_context_v1(slot.site_release_id);
  select target_site_release_id into current_id from private.release_current_pointer where singleton;
  if current_id is not null then
    current_context := private.get_production_deploy_context_v1(current_id);
  end if;
  return jsonb_build_object(
    'slot', jsonb_build_object(
      'site_release_id', slot.site_release_id,
      'fencing_token', slot.fencing_token,
      'expected_pointer_generation', slot.expected_pointer_generation,
      'status', slot.status,
      'operation', slot.operation,
      'lease_expires_at', slot.lease_expires_at
    ),
    'target', target,
    'current', current_context
  );
end;
$$;

create or replace function private.finish_production_recovery_v1(
  site_release_id uuid,
  fencing_token bigint,
  expected_pointer_generation bigint,
  recovery_succeeded boolean,
  evidence jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update private.production_promotion_slot set
    status = case when recovery_succeeded then 'committed' else 'rolling_back_failed' end,
    updated_at = clock_timestamp()
  where project_key = 'bubble-brain-pages'
    and private.production_promotion_slot.site_release_id = finish_production_recovery_v1.site_release_id
    and private.production_promotion_slot.fencing_token = finish_production_recovery_v1.fencing_token
    and private.production_promotion_slot.expected_pointer_generation = finish_production_recovery_v1.expected_pointer_generation
    and status in ('deploying', 'verifying', 'reconciling', 'rolling_back', 'rolling_back_failed');
  if not found then raise exception 'Stale recovery fencing token'; end if;
  insert into private.release_deployment_attempts(site_release_id, event_type, evidence)
  values (
    site_release_id,
    case when recovery_succeeded then 'rollback_deployed' else 'failed' end,
    evidence
  );
end;
$$;

create or replace function private.get_deployer_alert_state_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'dead_letter_count', count(*) filter (where status = 'dead_letter'),
    'stale_queued_count', count(*) filter (
      where status in ('queued','failed','claimed','dispatched','building','promoting')
        and inserted_at <= current_timestamp - interval '10 minutes'
    ),
    'oldest_actionable_at', min(inserted_at) filter (
      where status in ('queued','failed','claimed','dispatched','building','promoting')
    )
  )
  from private.content_outbox
$$;

create or replace function private.prune_content_operational_history_v1()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  attempts_deleted integer := 0;
  outbox_deleted integer := 0;
  cutoff timestamptz := clock_timestamp() - interval '180 days';
  result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('content-operational-retention-v1', 0));

  if exists (
    select 1
    from private.content_audit_log audit
    where audit.action = 'retention.prune'
      and audit.result = 'succeeded'
      and audit.inserted_at >= clock_timestamp() - interval '23 hours'
  ) then
    return jsonb_build_object('status', 'skipped_recent_run');
  end if;

  delete from private.publication_attempts
  where status = 'succeeded'
    and coalesce(finished_at, started_at) < cutoff;
  get diagnostics attempts_deleted = row_count;

  delete from private.content_outbox
  where status = 'deployed'
    and updated_at < cutoff;
  get diagnostics outbox_deleted = row_count;

  result := jsonb_build_object(
    'status', 'succeeded',
    'cutoff', cutoff,
    'publication_attempts_deleted', attempts_deleted,
    'outbox_rows_deleted', outbox_deleted,
    'failed_and_dlq_retained_days_minimum', 365
  );
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id,
    target, result
  ) values (
    'system:content-deployer', null, 'System', 'retention.prune',
    'scheduled operational retention', 'retention:' || to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD'),
    result - 'status', 'succeeded'
  );
  return result;
end;
$$;

do $$
declare function_record record;
begin
  for function_record in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'get_production_deploy_context_v1', 'mark_promotion_verifying_v1',
        'get_authorized_rollback_context_v1', 'get_promotion_reconcile_context_v1',
        'begin_production_reconcile_v1', 'finish_production_recovery_v1',
        'get_deployer_alert_state_v1', 'prune_content_operational_history_v1'
      )
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated, service_role, content_ingestor, content_editor, content_controller, content_reader',
      function_record.nspname, function_record.proname, function_record.args
    );
  end loop;
end;
$$;

do $$
declare function_record record;
begin
  for function_record in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
  loop
    execute format(
      'alter function %I.%I(%s) owner to content_rpc_owner',
      function_record.nspname, function_record.proname, function_record.args
    );
  end loop;
end;
$$;

grant execute on function private.get_production_deploy_context_v1(uuid) to content_deployer;
grant execute on function private.mark_promotion_verifying_v1(uuid, bigint, bigint, text) to content_deployer;
grant execute on function private.get_authorized_rollback_context_v1(uuid, bigint, bigint) to content_deployer;
grant execute on function private.get_promotion_reconcile_context_v1() to content_deployer;
grant execute on function private.begin_production_reconcile_v1() to content_deployer;
grant execute on function private.finish_production_recovery_v1(uuid, bigint, bigint, boolean, jsonb)
  to content_deployer;
grant execute on function private.get_deployer_alert_state_v1() to content_deployer;
grant execute on function private.prune_content_operational_history_v1() to content_deployer;

commit;
