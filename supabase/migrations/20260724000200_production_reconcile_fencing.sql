begin;

set local role content_rpc_owner;

-- A scheduled reconciler is recovery work, not a peer production writer. It
-- may only take over an expired operation and must rotate the fencing token
-- before returning any deployment context. Active publishers and rollbacks
-- therefore remain invisible to the reconciler.
create or replace function private.begin_production_reconcile_v1()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  slot private.production_promotion_slot%rowtype;
  pointer_generation bigint;
begin
  perform pg_advisory_xact_lock(42003);

  select * into slot
  from private.production_promotion_slot
  where project_key = 'bubble-brain-pages'
  for update;

  if slot.project_key is null
    or slot.status = 'committed'
    or slot.lease_expires_at > clock_timestamp() then
    return null;
  end if;

  pointer_generation := coalesce(
    (select generation
     from private.release_current_pointer
     where singleton),
    0
  );
  if pointer_generation <> slot.expected_pointer_generation then
    raise exception 'Pointer generation conflict during reconcile';
  end if;

  update private.production_promotion_slot
  set
    fencing_token = fencing_token + 1,
    locked_by = 'reconciler:' || (fencing_token + 1)::text,
    status = case
      when operation = 'forward' then 'verifying'
      else 'rolling_back'
    end,
    lease_expires_at = clock_timestamp() + interval '10 minutes',
    updated_at = clock_timestamp()
  where project_key = 'bubble-brain-pages';

  return private.get_promotion_reconcile_context_v1();
end;
$$;

-- Finishing recovery is a state mutation and must be held to the same lease,
-- pointer and evidence checks as the production commit RPCs. A stale recovery
-- may have observed an old pointer, but it cannot mark itself successful.
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
  perform pg_advisory_xact_lock(42003);

  if coalesce(
    (select generation
     from private.release_current_pointer
     where singleton),
    0
  ) <> expected_pointer_generation then
    raise exception 'Pointer generation conflict during recovery';
  end if;

  if recovery_succeeded
    and coalesce((evidence ->> 'production_unchanged')::boolean, false) is not true
    and coalesce((evidence ->> 'multi_edge_verified')::boolean, false) is not true then
    raise exception 'Recovery verifier evidence is required';
  end if;

  update private.production_promotion_slot
  set
    status = case
      when recovery_succeeded then 'committed'
      else 'rolling_back_failed'
    end,
    updated_at = clock_timestamp()
  where project_key = 'bubble-brain-pages'
    and private.production_promotion_slot.site_release_id =
      finish_production_recovery_v1.site_release_id
    and private.production_promotion_slot.fencing_token =
      finish_production_recovery_v1.fencing_token
    and private.production_promotion_slot.expected_pointer_generation =
      finish_production_recovery_v1.expected_pointer_generation
    and lease_expires_at > clock_timestamp()
    and status in (
      'deploying', 'verifying', 'reconciling',
      'rolling_back', 'rolling_back_failed'
    );

  if not found then
    raise exception 'Stale recovery fencing token';
  end if;

  insert into private.release_deployment_attempts(
    site_release_id,
    event_type,
    evidence
  )
  values (
    site_release_id,
    case
      when recovery_succeeded then 'rollback_deployed'
      else 'failed'
    end,
    evidence
  );
end;
$$;

create or replace function private.get_current_pages_deployment_v1(
  target_site_release_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pointer private.release_current_pointer%rowtype;
begin
  select * into pointer
  from private.release_current_pointer
  where singleton;

  if pointer.target_site_release_id is distinct from target_site_release_id
    or nullif(btrim(pointer.pages_deployment_id), '') is null then
    raise exception 'Requested release is not the current production pointer';
  end if;

  return jsonb_build_object(
    'site_release_id', pointer.target_site_release_id,
    'site_release_sequence', pointer.target_release_sequence,
    'pointer_generation', pointer.generation,
    'pages_deployment_id', pointer.pages_deployment_id,
    'manifest_sha256', pointer.manifest_sha256,
    'artifact_sha256', pointer.artifact_sha256
  );
end;
$$;

create or replace function private.record_current_pages_repair_v1(
  target_site_release_id uuid,
  expected_pointer_generation bigint,
  pages_deployment_id text,
  verifier_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(42003);

  if pages_deployment_id is null
    or pages_deployment_id !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception 'Invalid Pages repair deployment identity';
  end if;

  if coalesce((verifier_evidence ->> 'multi_edge_verified')::boolean, false)
    is not true then
    raise exception 'Multi-edge repair evidence is required';
  end if;
  if verifier_evidence ->> 'site_release_id'
    is distinct from target_site_release_id::text then
    raise exception 'Pages repair evidence release mismatch';
  end if;

  if exists (
    select 1
    from private.production_promotion_slot slot
    where slot.project_key = 'bubble-brain-pages'
      and slot.status <> 'committed'
      and slot.lease_expires_at > clock_timestamp()
  ) then
    raise exception 'Production promotion slot is busy during Pages repair';
  end if;

  -- A same-release repair is a new physical production generation. Any
  -- expired operation against the previous generation is superseded before
  -- the pointer advances so future reconcilers cannot revive it.
  update private.production_promotion_slot
  set
    status = 'committed',
    updated_at = clock_timestamp()
  where project_key = 'bubble-brain-pages'
    and status <> 'committed'
    and lease_expires_at <= clock_timestamp();

  if not exists (
    select 1
    from private.release_current_pointer pointer
    where pointer.singleton
      and pointer.target_site_release_id =
        record_current_pages_repair_v1.target_site_release_id
      and pointer.generation =
        record_current_pages_repair_v1.expected_pointer_generation
  ) then
    raise exception 'Current pointer changed during Pages repair';
  end if;

  update private.release_current_pointer
  set
    pages_deployment_id = record_current_pages_repair_v1.pages_deployment_id,
    generation = expected_pointer_generation + 1,
    updated_at = clock_timestamp()
  where singleton;

  insert into private.release_deployment_attempts(
    site_release_id,
    event_type,
    evidence
  )
  values (
    target_site_release_id,
    'production_deployed',
    verifier_evidence || jsonb_build_object(
      'repair_current', true,
      'pages_deployment_id', pages_deployment_id
    )
  );

  return jsonb_build_object(
    'site_release_id', target_site_release_id,
    'generation', expected_pointer_generation + 1,
    'pages_deployment_id', pages_deployment_id
  );
end;
$$;

revoke all on function private.get_current_pages_deployment_v1(uuid)
  from public, anon, authenticated, service_role,
       content_backup, content_editor, content_controller,
       content_reader, content_ingestor;
grant execute on function private.get_current_pages_deployment_v1(uuid)
  to content_deployer;

revoke all on function private.record_current_pages_repair_v1(
  uuid, bigint, text, jsonb
)
  from public, anon, authenticated, service_role,
       content_backup, content_editor, content_controller,
       content_reader, content_ingestor;
grant execute on function private.record_current_pages_repair_v1(
  uuid, bigint, text, jsonb
)
  to content_deployer;

commit;
