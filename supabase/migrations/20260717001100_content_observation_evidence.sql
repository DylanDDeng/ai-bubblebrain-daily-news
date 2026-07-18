begin;

create table if not exists private.content_observability_checks (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null,
  healthy boolean not null,
  current_site_release_id uuid references private.site_releases(id),
  check_sha256 text not null unique check (check_sha256 ~ '^[a-f0-9]{64}$'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  recorded_at timestamptz not null default clock_timestamp()
);

create index if not exists content_observability_checks_window_idx
  on private.content_observability_checks (checked_at, id);

alter table private.content_observability_checks enable row level security;
alter table private.content_observability_checks force row level security;
drop policy if exists content_rpc_owner_all on private.content_observability_checks;
create policy content_rpc_owner_all on private.content_observability_checks
  for all to content_rpc_owner using (true) with check (true);

revoke all on private.content_observability_checks
  from public, anon, authenticated, service_role,
    content_ingestor, content_editor, content_controller, content_reader, content_deployer;
grant select, insert on private.content_observability_checks to content_rpc_owner;

set local role content_rpc_owner;

create or replace function private.record_content_observability_v1(evidence jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  checked timestamptz;
  current_value jsonb;
  current_release_id uuid;
  evidence_sha256 text;
  inserted private.content_observability_checks%rowtype;
begin
  if jsonb_typeof(evidence) is distinct from 'object'
    or jsonb_typeof(evidence -> 'healthy') is distinct from 'boolean'
    or jsonb_typeof(evidence -> 'current') is distinct from 'object'
    or jsonb_typeof(evidence -> 'due_batches') is distinct from 'array'
    or jsonb_typeof(evidence -> 'reasons') is distinct from 'array'
    or jsonb_typeof(evidence -> 'outbox') is distinct from 'object'
    or jsonb_typeof(evidence -> 'analytics') is distinct from 'object' then
    raise exception 'Invalid content observability evidence' using errcode = '22023';
  end if;
  begin
    checked := (evidence ->> 'checked_at')::timestamptz;
  exception when others then
    raise exception 'Invalid content observability evidence' using errcode = '22023';
  end;
  if checked < clock_timestamp() - interval '24 hours'
    or checked > clock_timestamp() + interval '5 minutes' then
    raise exception 'Invalid content observability evidence' using errcode = '22023';
  end if;

  current_value := evidence -> 'current';
  if current_value ->> 'site_release_id'
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    current_release_id := (current_value ->> 'site_release_id')::uuid;
    if not exists (select 1 from private.site_releases where id = current_release_id) then
      raise exception 'Unknown content observability release' using errcode = '22023';
    end if;
  else
    current_release_id := null;
  end if;

  evidence_sha256 := private.sha256_jsonb_v1(evidence);
  insert into private.content_observability_checks(
    checked_at, healthy, current_site_release_id, check_sha256, evidence
  ) values (
    checked, (evidence ->> 'healthy')::boolean, current_release_id,
    evidence_sha256, evidence
  )
  on conflict (check_sha256) do nothing
  returning * into inserted;

  if inserted.id is null then
    select * into inserted
    from private.content_observability_checks
    where check_sha256 = evidence_sha256;
  end if;

  return jsonb_build_object(
    'id', inserted.id,
    'checked_at', inserted.checked_at,
    'check_sha256', inserted.check_sha256,
    'recorded_at', inserted.recorded_at
  );
end;
$$;

create or replace function private.get_content_observation_window_v1(start_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  start_at timestamptz;
  end_at timestamptz;
  ready_at timestamptz;
  evidence_end_at timestamptz;
begin
  if start_date is null
    or start_date < date '2020-01-01'
    or start_date > (current_timestamp at time zone 'Asia/Shanghai')::date + 1 then
    raise exception 'Invalid content observation start date' using errcode = '22023';
  end if;
  start_at := start_date::timestamp at time zone 'Asia/Shanghai';
  end_at := (start_date + 2)::timestamp at time zone 'Asia/Shanghai';
  -- The lateNight slot belongs to the prior report date and is scheduled at
  -- 03:00 Asia/Shanghai on the following wall-clock day. Its +10 minute
  -- terminal deadline therefore closes after the nominal two-day boundary.
  ready_at := end_at + interval '3 hours 10 minutes';
  evidence_end_at := ready_at + interval '6 hours';

  return jsonb_build_object(
    'start_date', start_date,
    'start_at', start_at,
    'end_at', end_at,
    'ready_at', ready_at,
    'captured_at', current_timestamp,
    'window_complete', current_timestamp >= ready_at,
    'checks', coalesce((
      select jsonb_agg(
        check_row.evidence || jsonb_build_object(
          'check_sha256', check_row.check_sha256,
          'recorded_at', check_row.recorded_at
        ) order by check_row.checked_at, check_row.id
      )
      from private.content_observability_checks check_row
      where check_row.checked_at >= start_at
        and check_row.checked_at < evidence_end_at
    ), '[]'::jsonb),
    'publication_attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'report_date', attempt.report_date,
        'batch_id', attempt.batch_id,
        'input_sha256', attempt.input_sha256,
        'attempt_number', attempt.attempt_number,
        'trigger_kind', attempt.trigger_kind,
        'worker_version', attempt.worker_version,
        'status', attempt.status,
        'error_code', attempt.error_code,
        'started_at', attempt.started_at,
        'finished_at', attempt.finished_at
      ) order by attempt.report_date, attempt.batch_id, attempt.attempt_number)
      from private.publication_attempts attempt
      where attempt.report_date >= start_date
        and attempt.report_date < start_date + 2
    ), '[]'::jsonb),
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'report_date', slot.report_date,
        'batch_id', slot.batch_id,
        'input_sha256', slot.input_sha256,
        'content_sha256', slot.content_sha256,
        'report_snapshot_id', slot.report_snapshot_id,
        'report_object_key', snapshot.object_key,
        'report_byte_sha256', snapshot.byte_sha256,
        'site_release_id', slot.site_release_id,
        'site_release_sequence', release.sequence,
        'site_manifest_sha256', release.manifest_sha256,
        'site_content_sha256', release.content_root_sha256,
        'artifact_sha256', artifact.artifact_sha256,
        'artifact_fingerprint_sha256', artifact.artifact_fingerprint_sha256,
        'code_sha', artifact.code_sha,
        'build_environment_version', artifact.build_environment_version,
        'artifact_production_verified_at', artifact.production_verified_at,
        'outbox_count', coalesce(outbox_state.outbox_count, 0),
        'outbox_all_deployed', coalesce(outbox_state.all_deployed, false),
        'outbox_active_leases', coalesce(outbox_state.active_leases, 0),
        'edge_verified_at', edge.inserted_at,
        'edge_evidence', edge.evidence
      ) order by slot.report_date, slot.batch_id)
      from private.publication_slots slot
      left join private.report_snapshots snapshot on snapshot.id = slot.report_snapshot_id
      left join private.site_releases release on release.id = slot.site_release_id
      left join private.release_artifacts artifact on artifact.site_release_id = slot.site_release_id
      left join lateral (
        select count(*)::integer as outbox_count,
          bool_and(outbox.status = 'deployed') as all_deployed,
          count(*) filter (
            where outbox.locked_by is not null
              or outbox.lease_expires_at is not null
          )::integer as active_leases
        from private.content_outbox outbox
        where outbox.site_release_id = slot.site_release_id
      ) outbox_state on true
      left join lateral (
        select event.inserted_at, event.evidence
        from private.release_deployment_attempts event
        where event.site_release_id = slot.site_release_id
          and event.event_type = 'edge_verified'
        order by event.inserted_at desc, event.id desc
        limit 1
      ) edge on true
      where slot.report_date >= start_date
        and slot.report_date < start_date + 2
    ), '[]'::jsonb),
    'manual_actions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', audit.id,
        'action', audit.action,
        'inserted_at', audit.inserted_at,
        'target', audit.target
      ) order by audit.inserted_at, audit.id)
      from private.content_audit_log audit
      where audit.inserted_at >= start_at
        and audit.inserted_at < evidence_end_at
        and audit.action in (
          'operations.retry', 'operations.rebuild',
          'production.rollback.authorize'
        )
    ), '[]'::jsonb),
    'failure_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'site_release_id', event.site_release_id,
        'event_type', event.event_type,
        'inserted_at', event.inserted_at
      ) order by event.inserted_at, event.id)
      from private.release_deployment_attempts event
      where event.site_release_id in (
        select slot.site_release_id
        from private.publication_slots slot
        where slot.report_date >= start_date
          and slot.report_date < start_date + 2
          and slot.site_release_id is not null
      )
        and event.event_type in (
          'failed', 'rollback_authorized', 'rollback_deployed', 'rollback_committed'
        )
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function private.record_content_observability_v1(jsonb)
  from public, anon, authenticated, service_role, content_ingestor,
    content_editor, content_controller, content_reader, content_deployer;
grant execute on function private.record_content_observability_v1(jsonb)
  to content_deployer;

revoke all on function private.get_content_observation_window_v1(date)
  from public, anon, authenticated, service_role, content_ingestor,
    content_editor, content_controller, content_reader, content_deployer;
grant execute on function private.get_content_observation_window_v1(date)
  to content_deployer;

-- SET LOCAL ROLE unwinds at COMMIT. An explicit RESET ROLE would discard the
-- Supabase CLI migration writer's outer SET ROLE before it records history.
commit;
