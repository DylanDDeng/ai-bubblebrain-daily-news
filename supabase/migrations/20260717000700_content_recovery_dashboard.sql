begin;

create table if not exists private.recovery_health_checks (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null,
  pitr_enabled boolean not null,
  latest_backup_object_key text not null check (
    latest_backup_object_key ~ '^database/[0-9]{4}/[0-9]{2}/[0-9]{2}/[a-f0-9]{64}\.dump\.age$'
  ),
  latest_backup_at timestamptz not null,
  latest_backup_age_seconds integer not null check (latest_backup_age_seconds >= 0),
  maximum_backup_age_seconds integer not null check (maximum_backup_age_seconds = 3600),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  recorded_at timestamptz not null default clock_timestamp()
);

create index if not exists recovery_health_checks_latest_idx
  on private.recovery_health_checks (checked_at desc, id desc);

alter table private.recovery_health_checks enable row level security;
alter table private.recovery_health_checks force row level security;
drop policy if exists content_rpc_owner_all on private.recovery_health_checks;
create policy content_rpc_owner_all on private.recovery_health_checks
  for all to content_rpc_owner using (true) with check (true);

revoke all on private.recovery_health_checks
  from public, anon, authenticated, service_role,
    content_ingestor, content_editor, content_controller, content_reader, content_deployer;
grant select, insert on private.recovery_health_checks to content_rpc_owner;

set local role content_rpc_owner;

create or replace function private.record_recovery_health_v1(evidence jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  checked timestamptz;
  latest timestamptz;
  latest_age integer;
  maximum_age integer;
  object_key text;
  inserted private.recovery_health_checks%rowtype;
begin
  if jsonb_typeof(evidence) <> 'object'
    or evidence ->> 'healthy' <> 'true'
    or evidence ->> 'pitr_enabled' <> 'true' then
    raise exception 'Invalid recovery health evidence' using errcode = '22023';
  end if;
  begin
    checked := (evidence ->> 'checked_at')::timestamptz;
    latest := (evidence ->> 'latest_backup_at')::timestamptz;
    latest_age := (evidence ->> 'latest_backup_age_seconds')::integer;
    maximum_age := (evidence ->> 'maximum_backup_age_seconds')::integer;
  exception when others then
    raise exception 'Invalid recovery health evidence' using errcode = '22023';
  end;
  object_key := evidence ->> 'latest_backup_object_key';
  if checked < clock_timestamp() - interval '24 hours'
    or checked > clock_timestamp() + interval '5 minutes'
    or latest > checked
    or latest_age < 0
    or maximum_age <> 3600
    or abs(latest_age - extract(epoch from checked - latest)::integer) > 5
    or object_key is null
    or object_key !~ '^database/[0-9]{4}/[0-9]{2}/[0-9]{2}/[a-f0-9]{64}\.dump\.age$' then
    raise exception 'Invalid recovery health evidence' using errcode = '22023';
  end if;

  insert into private.recovery_health_checks(
    checked_at, pitr_enabled, latest_backup_object_key, latest_backup_at,
    latest_backup_age_seconds, maximum_backup_age_seconds, evidence
  ) values (
    checked, true, object_key, latest, latest_age, maximum_age, evidence
  ) returning * into inserted;

  return jsonb_build_object(
    'id', inserted.id,
    'checked_at', inserted.checked_at,
    'recorded_at', inserted.recorded_at
  );
end;
$$;

create or replace function private.get_admin_dashboard_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with latest_recovery as (
    select jsonb_build_object(
      'status', case
        when checked_at >= current_timestamp - interval '45 minutes'
          and pitr_enabled
          and latest_backup_at >= current_timestamp - make_interval(secs => maximum_backup_age_seconds)
        then 'healthy'
        else 'stale'
      end,
      'source', 'external-recovery-monitor',
      'checked_at', checked_at,
      'pitr_enabled', pitr_enabled,
      'latest_backup_object_key', latest_backup_object_key,
      'latest_backup_at', latest_backup_at,
      'maximum_backup_age_seconds', maximum_backup_age_seconds
    ) as value
    from private.recovery_health_checks
    order by checked_at desc, id desc
    limit 1
  )
  select jsonb_build_object(
    'current', private.get_current_release_v1(),
    'settings', (select coalesce(jsonb_object_agg(setting_key, enabled order by setting_key), '{}'::jsonb)
      from private.content_settings),
    'reports', (select count(*) from private.daily_reports),
    'drafts_open', (select count(*) from private.editorial_drafts
      where status in ('draft', 'preview_building', 'preview_ready', 'stale', 'publishing')),
    'outbox_queued', (select count(*) from private.content_outbox
      where status in ('queued', 'claimed', 'dispatched', 'building', 'preview_verified', 'promoting')),
    'outbox_oldest', (select min(inserted_at) from private.content_outbox
      where status in ('queued', 'claimed', 'dispatched', 'building', 'preview_verified', 'promoting')),
    'dead_letters', (select count(*) from private.content_outbox where status = 'dead_letter'),
    'publication_attempts_started', (select count(*) from private.publication_attempts where status = 'started'),
    'publication_attempts_failed', (select count(*) from private.publication_attempts where status = 'failed'),
    'publication_attempt_oldest_started', (select min(started_at) from private.publication_attempts where status = 'started'),
    'promotion_slot', (select to_jsonb(s) - 'locked_by' from private.production_promotion_slot s
      where project_key = 'bubble-brain-pages'),
    'backup', coalesce(
      (select value from latest_recovery),
      jsonb_build_object('status', 'unknown', 'source', 'external-recovery-monitor')
    )
  )
$$;

revoke all on function private.record_recovery_health_v1(jsonb)
  from public, anon, authenticated, service_role, content_ingestor,
    content_editor, content_controller, content_reader, content_deployer;
grant execute on function private.record_recovery_health_v1(jsonb) to content_deployer;

-- SET LOCAL ROLE unwinds at COMMIT. An explicit RESET ROLE would discard the
-- Supabase CLI migration writer's outer SET ROLE before it records history.
commit;
