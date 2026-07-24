begin;

create table if not exists private.scheduled_run_observability_events (
  id bigint generated always as identity primary key,
  run_id text not null check (run_id ~ '^scheduled:[0-9]{13}$'),
  scheduled_at timestamptz not null,
  report_date date not null,
  batch_id text not null check (
    batch_id in ('morning', 'afternoon', 'night', 'lateNight')
  ),
  publication_batch_id text not null check (
    publication_batch_id in (
      'morning', 'afternoon', 'night', 'lateNight', 'lateNightSupplement'
    )
  ),
  event_type text not null check (
    event_type in ('started', 'release_registered', 'succeeded', 'failed')
  ),
  content_sha256 text check (
    content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'
  ),
  no_op boolean not null default false,
  site_release_id uuid references private.site_releases(id),
  dispatch_id uuid,
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  evidence_sha256 text not null check (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  unique (run_id, event_type, evidence_sha256)
);

create index if not exists scheduled_run_observability_events_window_idx
  on private.scheduled_run_observability_events (
    report_date, scheduled_at, id
  );
create index if not exists scheduled_run_observability_events_release_idx
  on private.scheduled_run_observability_events (site_release_id, id)
  where site_release_id is not null;

create table if not exists private.scheduled_run_observability_current (
  run_id text primary key check (run_id ~ '^scheduled:[0-9]{13}$'),
  scheduled_at timestamptz not null unique,
  report_date date not null,
  batch_id text not null check (
    batch_id in ('morning', 'afternoon', 'night', 'lateNight')
  ),
  publication_batch_id text not null check (
    publication_batch_id in (
      'morning', 'afternoon', 'night', 'lateNight', 'lateNightSupplement'
    )
  ),
  status text not null check (status in ('started', 'succeeded', 'failed')),
  stage text not null,
  started_at timestamptz,
  finished_at timestamptz,
  source_result jsonb check (
    source_result is null or jsonb_typeof(source_result) = 'object'
  ),
  content_sha256 text check (
    content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'
  ),
  no_op boolean not null default false,
  site_release_id uuid references private.site_releases(id),
  dispatch_id uuid,
  last_event_id bigint not null
    references private.scheduled_run_observability_events(id),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (status = 'started' and finished_at is null)
    or (status in ('succeeded', 'failed') and finished_at is not null)
  )
);

create index if not exists scheduled_run_observability_current_window_idx
  on private.scheduled_run_observability_current (
    report_date, scheduled_at, run_id
  );

alter table private.scheduled_run_observability_events enable row level security;
alter table private.scheduled_run_observability_events force row level security;
drop policy if exists content_rpc_owner_all
  on private.scheduled_run_observability_events;
create policy content_rpc_owner_all
  on private.scheduled_run_observability_events
  for all to content_rpc_owner using (true) with check (true);
drop policy if exists content_backup_select
  on private.scheduled_run_observability_events;
create policy content_backup_select
  on private.scheduled_run_observability_events
  for select to content_backup using (true);

alter table private.scheduled_run_observability_current enable row level security;
alter table private.scheduled_run_observability_current force row level security;
drop policy if exists content_rpc_owner_all
  on private.scheduled_run_observability_current;
create policy content_rpc_owner_all
  on private.scheduled_run_observability_current
  for all to content_rpc_owner using (true) with check (true);
drop policy if exists content_backup_select
  on private.scheduled_run_observability_current;
create policy content_backup_select
  on private.scheduled_run_observability_current
  for select to content_backup using (true);

revoke all on private.scheduled_run_observability_events,
  private.scheduled_run_observability_current
  from public, anon, authenticated, service_role, content_ingestor,
       content_editor, content_controller, content_reader, content_deployer;
grant select, insert on private.scheduled_run_observability_events
  to content_rpc_owner;
grant select, insert, update on private.scheduled_run_observability_current
  to content_rpc_owner;
grant usage, select on sequence
  private.scheduled_run_observability_events_id_seq
  to content_rpc_owner;
grant select on private.scheduled_run_observability_events,
  private.scheduled_run_observability_current
  to content_backup;

set local role content_rpc_owner;

create or replace function private.record_scheduled_run_trace_v1(
  p_run_id text,
  p_scheduled_at timestamptz,
  p_event_type text,
  p_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_expected_run_id text;
  v_local timestamp;
  v_local_hour integer;
  v_report_date date;
  v_batch_id text;
  v_publication_batch_id text;
  v_status text;
  v_stage text;
  v_started_at timestamptz;
  v_finished_at timestamptz;
  v_source_result jsonb;
  v_content_sha256 text;
  v_no_op boolean;
  v_site_release_id uuid;
  v_dispatch_id uuid;
  v_evidence_sha256 text;
  v_event private.scheduled_run_observability_events%rowtype;
  v_current private.scheduled_run_observability_current%rowtype;
begin
  if p_scheduled_at is null
    or p_scheduled_at <> date_trunc('hour', p_scheduled_at)
    or extract(hour from p_scheduled_at at time zone 'UTC')::integer
      not in (0, 2, 4, 6, 8, 10, 12, 14, 16, 17, 18, 19, 20, 21, 22, 23)
    or p_scheduled_at < timestamptz '2020-01-01 00:00:00+00'
    or p_scheduled_at > clock_timestamp() + interval '5 minutes'
    or p_event_type not in ('started', 'release_registered', 'succeeded', 'failed')
    or jsonb_typeof(p_evidence) is distinct from 'object'
    or octet_length(p_evidence::text) > 32768 then
    raise exception 'Invalid scheduled run trace' using errcode = '22023';
  end if;

  v_expected_run_id := 'scheduled:' ||
    ((extract(epoch from p_scheduled_at) * 1000)::bigint)::text;
  if p_run_id is distinct from v_expected_run_id then
    raise exception 'Invalid scheduled run trace' using errcode = '22023';
  end if;

  v_local := p_scheduled_at at time zone 'Asia/Shanghai';
  v_local_hour := extract(hour from v_local)::integer;
  v_batch_id := case
    when v_local_hour >= 2 and v_local_hour < 5 then 'lateNight'
    when v_local_hour >= 22 or v_local_hour < 2 then 'night'
    when v_local_hour >= 14 and v_local_hour < 22 then 'afternoon'
    else 'morning'
  end;
  v_publication_batch_id := case
    when v_batch_id = 'lateNight' and v_local_hour = 3
      then 'lateNightSupplement'
    else v_batch_id
  end;
  v_report_date := v_local::date -
    case when v_batch_id = 'lateNight' then 1 else 0 end;

  v_status := case
    when p_event_type in ('started', 'release_registered') then 'started'
    else p_event_type
  end;
  if p_event_type <> 'release_registered'
    and p_evidence ->> 'status' is distinct from v_status then
    raise exception 'Invalid scheduled run trace' using errcode = '22023';
  end if;
  v_stage := nullif(btrim(p_evidence ->> 'stage'), '');
  if v_stage is null or length(v_stage) > 128 then
    raise exception 'Invalid scheduled run trace' using errcode = '22023';
  end if;

  begin
    v_started_at := nullif(p_evidence ->> 'started_at', '')::timestamptz;
    v_finished_at := nullif(p_evidence ->> 'finished_at', '')::timestamptz;
  exception when others then
    raise exception 'Invalid scheduled run trace' using errcode = '22023';
  end;
  if p_event_type = 'started' and v_finished_at is not null then
    raise exception 'Invalid scheduled run trace' using errcode = '22023';
  end if;
  if p_event_type in ('succeeded', 'failed')
    and (v_started_at is null or v_finished_at is null
      or v_finished_at < v_started_at) then
    raise exception 'Invalid scheduled run trace' using errcode = '22023';
  end if;

  v_source_result := p_evidence -> 'source_result';
  if v_source_result is not null
    and jsonb_typeof(v_source_result) is distinct from 'object' then
    raise exception 'Invalid scheduled run trace' using errcode = '22023';
  end if;
  v_content_sha256 := nullif(p_evidence ->> 'content_sha256', '');
  if v_content_sha256 is not null
    and v_content_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid scheduled run trace' using errcode = '22023';
  end if;
  v_no_op := coalesce((p_evidence ->> 'no_op')::boolean, false);

  begin
    v_site_release_id := nullif(p_evidence ->> 'site_release_id', '')::uuid;
    v_dispatch_id := nullif(p_evidence ->> 'dispatch_id', '')::uuid;
  exception when others then
    raise exception 'Invalid scheduled run trace' using errcode = '22023';
  end;
  if (v_site_release_id is null) <> (v_dispatch_id is null)
    or (v_site_release_id is not null and not exists (
      select 1
      from private.content_outbox value
      where value.site_release_id = v_site_release_id
        and value.dispatch_id = v_dispatch_id
    )) then
    raise exception 'Invalid scheduled run release identity'
      using errcode = '22023';
  end if;
  if p_event_type = 'release_registered'
    and v_site_release_id is null then
    raise exception 'Invalid scheduled run release identity'
      using errcode = '22023';
  end if;

  v_evidence_sha256 := private.sha256_jsonb_v1(jsonb_build_object(
    'run_id', p_run_id,
    'event_type', p_event_type,
    'evidence', p_evidence
  ));
  insert into private.scheduled_run_observability_events(
    run_id, scheduled_at, report_date, batch_id, publication_batch_id,
    event_type, content_sha256, no_op, site_release_id, dispatch_id,
    evidence, evidence_sha256
  ) values (
    p_run_id, p_scheduled_at, v_report_date, v_batch_id,
    v_publication_batch_id, p_event_type, v_content_sha256, v_no_op,
    v_site_release_id, v_dispatch_id, p_evidence, v_evidence_sha256
  )
  on conflict (run_id, event_type, evidence_sha256) do nothing
  returning * into v_event;
  if v_event.id is null then
    select * into v_event
    from private.scheduled_run_observability_events value
    where value.run_id = p_run_id
      and value.event_type = p_event_type
      and value.evidence_sha256 = v_evidence_sha256;
  end if;

  select * into v_current
  from private.scheduled_run_observability_current value
  where value.run_id = p_run_id
  for update;

  if not found then
    insert into private.scheduled_run_observability_current(
      run_id, scheduled_at, report_date, batch_id, publication_batch_id,
      status, stage, started_at, finished_at, source_result,
      content_sha256, no_op, site_release_id, dispatch_id, last_event_id
    ) values (
      p_run_id, p_scheduled_at, v_report_date, v_batch_id,
      v_publication_batch_id, v_status, v_stage,
      coalesce(v_started_at, p_scheduled_at),
      case when v_status = 'started' then null else v_finished_at end,
      v_source_result, v_content_sha256, v_no_op,
      v_site_release_id, v_dispatch_id, v_event.id
    );
  else
    if v_current.scheduled_at <> p_scheduled_at
      or v_current.report_date <> v_report_date
      or v_current.batch_id <> v_batch_id
      or (v_current.site_release_id is not null
        and v_site_release_id is not null
        and v_current.site_release_id <> v_site_release_id)
      or (v_current.dispatch_id is not null
        and v_dispatch_id is not null
        and v_current.dispatch_id <> v_dispatch_id) then
      raise exception 'Scheduled run trace identity collision';
    end if;

    if p_event_type = 'release_registered' then
      update private.scheduled_run_observability_current value
      set stage = case
            when value.status = 'started' then v_stage else value.stage
          end,
          content_sha256 = coalesce(value.content_sha256, v_content_sha256),
          no_op = value.no_op or v_no_op,
          site_release_id = coalesce(value.site_release_id, v_site_release_id),
          dispatch_id = coalesce(value.dispatch_id, v_dispatch_id),
          last_event_id = v_event.id,
          updated_at = clock_timestamp()
      where value.run_id = p_run_id;
    elsif p_event_type = 'started' then
      update private.scheduled_run_observability_current value
      set started_at = least(
            coalesce(value.started_at, v_started_at, p_scheduled_at),
            coalesce(v_started_at, p_scheduled_at)
          ),
          last_event_id = v_event.id,
          updated_at = clock_timestamp()
      where value.run_id = p_run_id
        and value.status = 'started';
    elsif v_current.status = 'started'
      or (v_current.status = 'failed' and v_status = 'succeeded')
      or (v_current.status = v_status
        and v_finished_at >= v_current.finished_at) then
      update private.scheduled_run_observability_current value
      set status = v_status,
          stage = v_stage,
          started_at = least(
            coalesce(value.started_at, v_started_at),
            v_started_at
          ),
          finished_at = v_finished_at,
          source_result = coalesce(v_source_result, value.source_result),
          content_sha256 = coalesce(v_content_sha256, value.content_sha256),
          no_op = v_no_op,
          site_release_id = coalesce(v_site_release_id, value.site_release_id),
          dispatch_id = coalesce(v_dispatch_id, value.dispatch_id),
          last_event_id = v_event.id,
          updated_at = clock_timestamp()
      where value.run_id = p_run_id;
    end if;
  end if;

  return (
    select jsonb_build_object(
      'run_id', value.run_id,
      'scheduled_at', value.scheduled_at,
      'status', value.status,
      'event_id', v_event.id,
      'recorded_at', v_event.recorded_at
    )
    from private.scheduled_run_observability_current value
    where value.run_id = p_run_id
  );
end;
$$;

create or replace function private.finalize_site_release_v1(
  reservation_id uuid,
  manifest_object_key text,
  manifest_byte_length bigint,
  manifest_sha256 text,
  content_root_sha256 text,
  schema_version integer,
  taxonomy_version integer,
  serializer_version text,
  search_contract_version text,
  source_contract_version text,
  structured_cutover_date date,
  no_report_days date[],
  dispatch_id uuid,
  dispatch_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reservation private.site_release_reservations%rowtype;
  snapshot private.report_snapshots%rowtype;
  dispatch_mode text;
  existing_dispatch_id uuid;
  scheduled_trigger text;
  scheduled_started_at timestamptz;
  scheduled_at timestamptz;
begin
  perform pg_advisory_xact_lock(42002);
  select * into reservation
  from private.site_release_reservations
  where id = reservation_id
  for update;
  if not found then raise exception 'Unknown site release reservation'; end if;
  if reservation.status = 'finalized' then
    select value.dispatch_id into existing_dispatch_id
    from private.content_outbox value
    where value.site_release_id = reservation.id
    order by value.inserted_at, value.id
    limit 1;
    if existing_dispatch_id is null then
      raise exception 'Finalized site release is missing its dispatch identity';
    end if;
    return (select jsonb_build_object(
      'site_release_id', id, 'site_release_sequence', sequence,
      'expected_predecessor_id', expected_predecessor_id,
      'dispatch_id', existing_dispatch_id, 'idempotent', true
    ) from private.site_releases where id = reservation_id);
  end if;
  if reservation.status <> 'reserved'
    or reservation.expires_at <= clock_timestamp() then
    raise exception 'Expired or unusable site release reservation';
  end if;
  dispatch_mode := dispatch_payload ->> 'mode';
  if dispatch_mode = 'shadow' then
    perform private.require_setting_v1('shadow_build');
  elsif dispatch_mode = 'production' then
    perform private.require_setting_v1('publication');
  else
    raise exception using
      errcode = '22023',
      message = 'Invalid content release dispatch mode';
  end if;
  if jsonb_typeof(dispatch_payload) <> 'object'
    or dispatch_payload ->> 'dispatch_id' <> dispatch_id::text
    or dispatch_payload ->> 'site_release_id' <> reservation.id::text
    or (dispatch_payload ->> 'site_release_sequence')::bigint
      <> reservation.sequence
    or dispatch_payload ->> 'expected_predecessor_id'
      is distinct from reservation.expected_predecessor_id::text
    or dispatch_payload ->> 'expected_content_sha' <> content_root_sha256
    or dispatch_payload ->> 'code_sha' !~ '^[a-f0-9]{40}$'
    or nullif(
      btrim(dispatch_payload ->> 'build_environment_version'), ''
    ) is null then
    raise exception using
      errcode = '22023',
      message = 'Content release dispatch identity mismatch';
  end if;
  if manifest_sha256 !~ '^[a-f0-9]{64}$'
    or manifest_object_key
      <> 'site-manifests/sha256/' || manifest_sha256 || '.json'
    or content_root_sha256 !~ '^[a-f0-9]{64}$'
    or manifest_byte_length <= 0
    or schema_version < 1
    or taxonomy_version < 1
    or serializer_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
    or search_contract_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
    or source_contract_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
  then
    raise exception 'Invalid verified site manifest metadata';
  end if;
  if reservation.expected_predecessor_id is distinct from coalesce(
    (select target_site_release_id
     from private.release_current_pointer where singleton),
    (select id from private.site_releases order by sequence desc limit 1)
  ) then
    raise exception 'Site release predecessor changed';
  end if;

  select * into snapshot
  from private.report_snapshots
  where id = reservation.report_snapshot_id;
  insert into private.site_releases(
    id, sequence, expected_predecessor_id, manifest_object_key,
    manifest_byte_length, manifest_sha256, content_root_sha256,
    schema_version, taxonomy_version, serializer_version,
    search_contract_version, source_contract_version,
    structured_cutover_date, no_report_days
  ) values (
    reservation.id, reservation.sequence,
    reservation.expected_predecessor_id, manifest_object_key,
    manifest_byte_length, manifest_sha256, content_root_sha256,
    schema_version, taxonomy_version, serializer_version,
    search_contract_version, source_contract_version,
    structured_cutover_date, coalesce(no_report_days, '{}')
  );

  if reservation.expected_predecessor_id is not null then
    insert into private.site_release_reports(
      site_release_id, report_date, report_snapshot_id, byte_sha256
    )
    select reservation.id, report_date, report_snapshot_id, byte_sha256
    from private.site_release_reports
    where site_release_id = reservation.expected_predecessor_id
      and report_date <> snapshot.report_date;
  end if;
  insert into private.site_release_reports(
    site_release_id, report_date, report_snapshot_id, byte_sha256
  ) values (
    reservation.id, snapshot.report_date, snapshot.id, snapshot.byte_sha256
  );

  insert into private.content_outbox(site_release_id, dispatch_id, payload)
  values (reservation.id, dispatch_id, dispatch_payload);
  insert into private.release_deployment_attempts(
    site_release_id, dispatch_id, event_type
  ) values (reservation.id, dispatch_id, 'queued');
  update private.site_release_reservations
  set status = 'finalized'
  where id = reservation.id;
  update private.publication_slots slot
  set site_release_id = reservation.id, updated_at = clock_timestamp()
  where slot.reservation_id = reservation.id;

  select attempt.trigger_kind, attempt.started_at
  into scheduled_trigger, scheduled_started_at
  from private.publication_slots slot
  join private.publication_attempts attempt
    on attempt.report_date = slot.report_date
   and attempt.batch_id = slot.batch_id
   and attempt.input_sha256 = slot.input_sha256
   and attempt.status = 'started'
  where slot.reservation_id = reservation.id
    and attempt.trigger_kind ~ '^scheduled:[0-9]{13}$'
  order by attempt.attempt_number desc, attempt.started_at desc
  limit 1;

  update private.publication_attempts attempt
  set status = 'succeeded',
      error_code = null,
      error_detail = null,
      finished_at = clock_timestamp()
  from private.publication_slots slot
  where slot.reservation_id = reservation.id
    and attempt.report_date = slot.report_date
    and attempt.batch_id = slot.batch_id
    and attempt.input_sha256 = slot.input_sha256
    and attempt.status = 'started';

  -- The release/run association is committed in the same transaction as the
  -- outbox row. A Worker crash after finalize can no longer create a release
  -- that is invisible to run-level observability.
  if scheduled_trigger is not null then
    scheduled_at := timestamptz 'epoch' +
      (substring(scheduled_trigger from 11)::bigint
        * interval '1 millisecond');
    perform private.record_scheduled_run_trace_v1(
      scheduled_trigger,
      scheduled_at,
      'release_registered',
      jsonb_build_object(
        'status', 'started',
        'stage', 'release_registered',
        'started_at', coalesce(scheduled_started_at, scheduled_at),
        'finished_at', null,
        'content_sha256', snapshot.byte_sha256,
        'no_op', false,
        'site_release_id', reservation.id,
        'dispatch_id', dispatch_id
      )
    );
  end if;

  return jsonb_build_object(
    'site_release_id', reservation.id,
    'site_release_sequence', reservation.sequence,
    'expected_predecessor_id', reservation.expected_predecessor_id,
    'dispatch_id', dispatch_id,
    'idempotent', false
  );
end;
$$;

-- Preserve the previous implementations as private building blocks so this
-- migration can add run-level evidence without duplicating their mature
-- release, slot, and incident projections.
do $$
begin
  if to_regprocedure('private.get_content_observability_base_v1()') is null then
    alter function private.get_content_observability_v1()
      rename to get_content_observability_base_v1;
  end if;
  if to_regprocedure(
    'private.get_content_observation_window_base_v1(date)'
  ) is null then
    alter function private.get_content_observation_window_v1(date)
      rename to get_content_observation_window_base_v1;
  end if;
end;
$$;

create or replace function private.get_content_observability_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.get_content_observability_base_v1() || jsonb_build_object(
    'publication_attempts', coalesce((
      select jsonb_agg(to_jsonb(latest) order by latest.started_at)
      from (
        select distinct on (attempt.trigger_kind)
          attempt.report_date,
          attempt.batch_id,
          attempt.input_sha256,
          attempt.trigger_kind,
          attempt.status,
          attempt.attempt_number,
          attempt.started_at,
          attempt.finished_at,
          attempt.error_code
        from private.publication_attempts attempt
        where attempt.started_at >= current_timestamp - interval '3 days'
        order by attempt.trigger_kind, attempt.attempt_number desc,
          attempt.started_at desc
      ) latest
    ), '[]'::jsonb),
    'scheduled_runs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'run_id', run.run_id,
        'scheduled_at', run.scheduled_at,
        'report_date', run.report_date,
        'batch_id', run.batch_id,
        'publication_batch_id', run.publication_batch_id,
        'status', run.status,
        'stage', run.stage,
        'started_at', run.started_at,
        'finished_at', run.finished_at,
        'source_result', run.source_result,
        'content_sha256', run.content_sha256,
        'no_op', run.no_op,
        'database_mirror', jsonb_build_object(
          'status', case
            when run.status = 'failed' and run.stage = 'database_mirror_failed'
              then 'failed'
            when run.site_release_id is not null and run.dispatch_id is not null
              then 'mirrored'
            else 'unknown'
          end
        ),
        'site_release_id', run.site_release_id,
        'site_release_sequence', release.sequence,
        'dispatch_id', run.dispatch_id,
        'stable_verified_at', edge.stable_verified_at
      ) order by run.scheduled_at, run.run_id)
      from private.scheduled_run_observability_current run
      left join private.site_releases release
        on release.id = run.site_release_id
      left join lateral (
        select min(event.evidence ->> 'stable_verified_at')
          as stable_verified_at
        from private.release_deployment_attempts event
        where event.site_release_id = run.site_release_id
          and event.event_type = 'edge_verified'
          and event.evidence -> 'stability_offsets'
            = '[15000, 45000, 120000]'::jsonb
          and event.evidence ->> 'stable_verified_at'
            ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$'
          and jsonb_array_length(case
            when jsonb_typeof(event.evidence -> 'stability_rounds') = 'array'
              then event.evidence -> 'stability_rounds'
            else '[]'::jsonb
          end) = 3
      ) edge on true
      where run.scheduled_at >= current_timestamp - interval '3 days'
    ), '[]'::jsonb)
  )
$$;

create or replace function private.get_content_observation_window_v1(
  start_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base jsonb;
  end_at timestamptz;
  ready_at timestamptz;
begin
  base := private.get_content_observation_window_base_v1(start_date);
  end_at := (start_date + 2)::timestamp at time zone 'Asia/Shanghai';
  -- The final 04:00 Asia/Shanghai late-night run owns the previous report
  -- date. Its ten-minute terminal deadline closes the two-day gate.
  ready_at := end_at + interval '4 hours 10 minutes';
  return base || jsonb_build_object(
    'ready_at', ready_at,
    'window_complete', current_timestamp >= ready_at,
    'scheduled_runs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'run_id', run.run_id,
        'scheduled_at', run.scheduled_at,
        'report_date', run.report_date,
        'batch_id', run.batch_id,
        'publication_batch_id', run.publication_batch_id,
        'status', run.status,
        'stage', run.stage,
        'started_at', run.started_at,
        'finished_at', run.finished_at,
        'source_result', run.source_result,
        'content_sha256', run.content_sha256,
        'no_op', run.no_op,
        'database_mirror', jsonb_build_object(
          'status', case
            when run.status = 'failed' and run.stage = 'database_mirror_failed'
              then 'failed'
            when run.site_release_id is not null and run.dispatch_id is not null
              then 'mirrored'
            else 'unknown'
          end
        ),
        'site_release_id', run.site_release_id,
        'site_release_sequence', release.sequence,
        'dispatch_id', run.dispatch_id,
        'stable_verified_at', edge.stable_verified_at
      ) order by run.scheduled_at, run.run_id)
      from private.scheduled_run_observability_current run
      left join private.site_releases release
        on release.id = run.site_release_id
      left join lateral (
        select min(event.evidence ->> 'stable_verified_at')
          as stable_verified_at
        from private.release_deployment_attempts event
        where event.site_release_id = run.site_release_id
          and event.event_type = 'edge_verified'
          and event.evidence -> 'stability_offsets'
            = '[15000, 45000, 120000]'::jsonb
          and event.evidence ->> 'stable_verified_at'
            ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$'
          and jsonb_array_length(case
            when jsonb_typeof(event.evidence -> 'stability_rounds') = 'array'
              then event.evidence -> 'stability_rounds'
            else '[]'::jsonb
          end) = 3
      ) edge on true
      where run.report_date >= start_date
        and run.report_date < start_date + 2
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function private.get_content_observability_base_v1()
  from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller,
       content_reader, content_deployer;
revoke all on function private.get_content_observation_window_base_v1(date)
  from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller,
       content_reader, content_deployer;
revoke all on function private.record_scheduled_run_trace_v1(
  text, timestamptz, text, jsonb
) from public, anon, authenticated, service_role, content_backup,
       content_editor, content_controller, content_reader, content_deployer;
grant execute on function private.record_scheduled_run_trace_v1(
  text, timestamptz, text, jsonb
) to content_ingestor;
revoke all on function private.get_content_observability_v1()
  from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller, content_reader;
grant execute on function private.get_content_observability_v1()
  to content_deployer;
revoke all on function private.get_content_observation_window_v1(date)
  from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller, content_reader;
grant execute on function private.get_content_observation_window_v1(date)
  to content_deployer;
revoke all on function private.finalize_site_release_v1(
  uuid, text, bigint, text, text, integer, integer, text, text, text,
  date, date[], uuid, jsonb
) from public, anon, authenticated, service_role, content_backup,
       content_controller, content_reader, content_deployer;
grant execute on function private.finalize_site_release_v1(
  uuid, text, bigint, text, text, integer, integer, text, text, text,
  date, date[], uuid, jsonb
) to content_ingestor, content_editor;

commit;
