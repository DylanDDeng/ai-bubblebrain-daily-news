begin;

alter table private.site_release_reservations
  alter column report_snapshot_id drop not null,
  add column if not exists release_kind text not null default 'content',
  add column if not exists idempotency_key uuid,
  add column if not exists requested_code_sha text,
  add column if not exists requested_base_code_sha text,
  add column if not exists requested_build_environment_version text,
  add column if not exists source_change_set_sha256 text;

alter table private.site_release_reservations
  drop constraint if exists site_release_reservations_release_kind_check;
alter table private.site_release_reservations
  add constraint site_release_reservations_release_kind_check
  check (release_kind in ('content', 'code'));

alter table private.site_release_reservations
  drop constraint if exists site_release_reservations_shape_check;
alter table private.site_release_reservations
  add constraint site_release_reservations_shape_check check (
    (
      release_kind = 'content'
      and report_snapshot_id is not null
      and idempotency_key is null
      and requested_code_sha is null
      and requested_base_code_sha is null
      and requested_build_environment_version is null
      and source_change_set_sha256 is null
    )
    or
    (
      release_kind = 'code'
      and report_snapshot_id is null
      and idempotency_key is not null
      and requested_code_sha ~ '^[a-f0-9]{40}$'
      and requested_base_code_sha ~ '^[a-f0-9]{40}$'
      and requested_code_sha <> requested_base_code_sha
      and nullif(btrim(requested_build_environment_version), '') is not null
      and source_change_set_sha256 ~ '^[a-f0-9]{64}$'
    )
  );

create unique index if not exists site_release_reservations_code_idempotency_idx
  on private.site_release_reservations(idempotency_key)
  where idempotency_key is not null;

create unique index if not exists site_release_reservations_code_semantic_idx
  on private.site_release_reservations(
    expected_predecessor_id,
    requested_code_sha,
    requested_build_environment_version
  )
  where release_kind = 'code';

alter table private.site_releases
  add column if not exists release_kind text not null default 'content',
  add column if not exists content_base_release_id uuid references private.site_releases(id),
  add column if not exists requested_code_sha text,
  add column if not exists source_change_set_sha256 text;

alter table private.site_releases
  drop constraint if exists site_releases_release_kind_check;
alter table private.site_releases
  add constraint site_releases_release_kind_check
  check (release_kind in ('content', 'code'));

alter table private.site_releases
  drop constraint if exists site_releases_code_shape_check;
alter table private.site_releases
  add constraint site_releases_code_shape_check check (
    (
      release_kind = 'content'
      and content_base_release_id is null
      and requested_code_sha is null
      and source_change_set_sha256 is null
    )
    or
    (
      release_kind = 'code'
      and content_base_release_id is not null
      and requested_code_sha ~ '^[a-f0-9]{40}$'
      and source_change_set_sha256 ~ '^[a-f0-9]{64}$'
    )
  );

alter table private.content_settings
  drop constraint if exists content_settings_setting_key_check;
alter table private.content_settings
  add constraint content_settings_setting_key_check check (setting_key in (
    'database_mirror', 'shadow_build', 'publication', 'admin_draft',
    'admin_preview', 'admin_publish', 'global_suppression', 'code_release'
  ));
insert into private.content_settings(setting_key, enabled, updated_by)
values ('code_release', false, 'migration:automatic-code-release')
on conflict (setting_key) do nothing;

create table if not exists private.release_head_claims (
  predecessor_id uuid primary key references private.site_releases(id),
  reservation_id uuid not null unique references private.site_release_reservations(id),
  release_kind text not null check (release_kind in ('content', 'code')),
  expires_at timestamptz,
  inserted_at timestamptz not null default clock_timestamp()
);

alter table private.release_head_claims enable row level security;
alter table private.release_head_claims force row level security;
drop policy if exists content_rpc_owner_all on private.release_head_claims;
create policy content_rpc_owner_all on private.release_head_claims
  for all to content_rpc_owner using (true) with check (true);
revoke all on private.release_head_claims
  from public, anon, authenticated, service_role,
       content_ingestor, content_editor, content_controller,
       content_reader, content_deployer;
grant select, insert, update, delete on private.release_head_claims to content_rpc_owner;
grant select on private.release_head_claims to content_backup;

set local role content_rpc_owner;

create or replace function private.claim_release_head_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.expected_predecessor_id is null then return new; end if;

  delete from private.release_head_claims claim
  using private.site_release_reservations reservation
  where claim.predecessor_id = new.expected_predecessor_id
    and reservation.id = claim.reservation_id
    and (
      reservation.status = 'abandoned'
      or (reservation.status = 'reserved' and reservation.expires_at <= clock_timestamp())
    );

  begin
    insert into private.release_head_claims(
      predecessor_id, reservation_id, release_kind, expires_at
    ) values (
      new.expected_predecessor_id, new.id, new.release_kind, new.expires_at
    );
  exception when unique_violation then
    raise exception using
      errcode = '55P03',
      message = 'Release head is busy; retry from the latest production pointer';
  end;
  return new;
end;
$$;

set local role postgres;
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'site_release_reservation_claim_head'
      and tgrelid = 'private.site_release_reservations'::regclass
      and not tgisinternal
  ) then
    create trigger site_release_reservation_claim_head
    after insert on private.site_release_reservations
    for each row execute function private.claim_release_head_v1();
  end if;
end;
$$;
set local role content_rpc_owner;

create or replace function private.release_abandoned_head_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.status = 'abandoned' and old.status is distinct from new.status then
    delete from private.release_head_claims where reservation_id = new.id;
  elsif new.status = 'finalized' and old.status is distinct from new.status then
    update private.release_head_claims
    set expires_at = null
    where reservation_id = new.id;
  end if;
  return new;
end;
$$;

set local role postgres;
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'site_release_reservation_release_head'
      and tgrelid = 'private.site_release_reservations'::regclass
      and not tgisinternal
  ) then
    create trigger site_release_reservation_release_head
    after update of status on private.site_release_reservations
    for each row execute function private.release_abandoned_head_v1();
  end if;
end;
$$;
set local role content_rpc_owner;

create or replace function private.release_terminal_head_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.status = 'deployed'
    or (new.status = 'preview_verified' and new.payload ->> 'mode' = 'shadow')
    or (
      new.status = 'dead_letter'
      and not exists (
        select 1
        from private.content_outbox sibling
        where sibling.site_release_id = new.site_release_id
          and sibling.id <> new.id
          and sibling.status not in ('deployed', 'dead_letter')
          and not (
            sibling.status = 'preview_verified'
            and sibling.payload ->> 'mode' = 'shadow'
          )
      )
    ) then
    delete from private.release_head_claims where reservation_id = new.site_release_id;
  end if;
  return new;
end;
$$;

set local role postgres;
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgname = 'content_outbox_release_terminal_head'
      and tgrelid = 'private.content_outbox'::regclass
      and not tgisinternal
  ) then
    create trigger content_outbox_release_terminal_head
    after insert or update on private.content_outbox
    for each row execute function private.release_terminal_head_v1();
  end if;
end;
$$;
set local role content_rpc_owner;

revoke all on function private.claim_release_head_v1()
  from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller,
       content_reader, content_deployer;
revoke all on function private.release_abandoned_head_v1()
  from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller,
       content_reader, content_deployer;
revoke all on function private.release_terminal_head_v1()
  from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller,
       content_reader, content_deployer;

do $$
declare
  current_release_id uuid;
  active_count integer;
begin
  select target_site_release_id into current_release_id
  from private.release_current_pointer where singleton;
  if current_release_id is null then return; end if;

  select count(*) into active_count
  from private.site_release_reservations reservation
  where reservation.expected_predecessor_id = current_release_id
    and (
      (reservation.status = 'reserved' and reservation.expires_at > clock_timestamp())
      or (
        reservation.status = 'finalized'
        and exists (
          select 1 from private.content_outbox outbox
          where outbox.site_release_id = reservation.id
            and outbox.status not in ('deployed', 'dead_letter')
            and not (
              outbox.status = 'preview_verified'
              and outbox.payload ->> 'mode' = 'shadow'
            )
        )
      )
    );
  if active_count > 1 then
    raise exception 'Multiple active children already exist for the production release';
  end if;

  insert into private.release_head_claims(
    predecessor_id, reservation_id, release_kind, expires_at
  )
  select current_release_id, reservation.id, reservation.release_kind,
    case when reservation.status = 'reserved' then reservation.expires_at else null end
  from private.site_release_reservations reservation
  where reservation.expected_predecessor_id = current_release_id
    and (
      (reservation.status = 'reserved' and reservation.expires_at > clock_timestamp())
      or (
        reservation.status = 'finalized'
        and exists (
          select 1 from private.content_outbox outbox
          where outbox.site_release_id = reservation.id
            and outbox.status not in ('deployed', 'dead_letter')
            and not (
              outbox.status = 'preview_verified'
              and outbox.payload ->> 'mode' = 'shadow'
            )
        )
      )
    )
  on conflict (predecessor_id) do nothing;
end;
$$;

create or replace function private.get_code_release_base_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'site_release_id', release.id,
    'site_release_sequence', release.sequence,
    'manifest_object_key', release.manifest_object_key,
    'manifest_byte_length', release.manifest_byte_length,
    'manifest_sha256', release.manifest_sha256,
    'content_root_sha256', release.content_root_sha256,
    'structured_cutover_date', release.structured_cutover_date,
    'code_sha', artifact.code_sha,
    'build_environment_version', artifact.build_environment_version,
    'pointer_generation', pointer.generation
  )
  from private.release_current_pointer pointer
  join private.site_releases release on release.id = pointer.target_site_release_id
  join private.release_artifacts artifact on artifact.site_release_id = release.id
  where pointer.singleton
$$;

create or replace function private.get_current_release_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'site_release_id', pointer.target_site_release_id,
    'site_release_sequence', pointer.target_release_sequence,
    'generation', pointer.generation,
    'pages_deployment_id', pointer.pages_deployment_id,
    'manifest_sha256', pointer.manifest_sha256,
    'content_sha256', release.content_root_sha256,
    'artifact_sha256', pointer.artifact_sha256,
    'artifact_fingerprint_sha256', artifact.artifact_fingerprint_sha256,
    'code_sha', artifact.code_sha,
    'build_environment_version', pointer.build_environment_version,
    'release_kind', release.release_kind,
    'content_base_release_id', release.content_base_release_id
  )
  from private.release_current_pointer pointer
  join private.site_releases release on release.id = pointer.target_site_release_id
  join private.release_artifacts artifact on artifact.site_release_id = pointer.target_site_release_id
  where pointer.singleton
$$;

create or replace function private.list_admin_releases_v1(page_size integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(page) order by sequence desc), '[]'::jsonb)
  from (
    select r.id, r.sequence, r.expected_predecessor_id, r.content_root_sha256,
      r.manifest_sha256, r.inserted_at, r.release_kind,
      r.content_base_release_id, r.requested_code_sha, r.source_change_set_sha256,
      (p.target_site_release_id = r.id) as is_current,
      a.artifact_sha256, a.production_verified_at,
      (select d.event_type from private.release_deployment_attempts d
        where d.site_release_id = r.id order by d.id desc limit 1) as latest_event
    from private.site_releases r
    left join private.release_current_pointer p on p.singleton
    left join private.release_artifacts a on a.site_release_id = r.id
    order by r.sequence desc
    limit least(greatest(page_size, 1), 100)
  ) page
$$;

create or replace function private.reserve_code_release_v1(
  requested_idempotency_key uuid,
  code_sha text,
  base_code_sha text,
  build_environment_version text,
  change_set_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reservation private.site_release_reservations%rowtype;
  base_release private.site_releases%rowtype;
  base_artifact private.release_artifacts%rowtype;
  current_release_id uuid;
  was_idempotent boolean := false;
begin
  perform private.require_setting_v1('publication');
  perform private.require_setting_v1('code_release');
  if requested_idempotency_key is null
    or code_sha is null
    or code_sha !~ '^[a-f0-9]{40}$'
    or base_code_sha is null
    or base_code_sha !~ '^[a-f0-9]{40}$'
    or code_sha = base_code_sha
    or nullif(btrim(build_environment_version), '') is null
    or change_set_sha256 is null
    or change_set_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid code release request';
  end if;

  perform pg_advisory_xact_lock(42002);
  select * into reservation
  from private.site_release_reservations
  where idempotency_key = requested_idempotency_key
  for update;
  if found then
    was_idempotent := true;
    if reservation.release_kind <> 'code'
      or reservation.requested_code_sha <> code_sha
      or reservation.requested_base_code_sha <> base_code_sha
      or reservation.requested_build_environment_version <> build_environment_version
      or reservation.source_change_set_sha256 <> change_set_sha256 then
      raise exception using errcode = '23505', message = 'Code release idempotency collision';
    end if;
    if reservation.status = 'reserved'
      and reservation.expires_at <= clock_timestamp() then
      select target_site_release_id into current_release_id
      from private.release_current_pointer where singleton;
      if current_release_id is distinct from reservation.expected_predecessor_id then
        raise exception using errcode = '40001', message = 'Code release base is no longer current';
      end if;
      delete from private.release_head_claims claim
      using private.site_release_reservations stale
      where claim.predecessor_id = reservation.expected_predecessor_id
        and stale.id = claim.reservation_id
        and stale.status = 'reserved'
        and stale.expires_at <= clock_timestamp();
      begin
        insert into private.release_head_claims(
          predecessor_id, reservation_id, release_kind, expires_at
        ) values (
          reservation.expected_predecessor_id, reservation.id,
          reservation.release_kind, clock_timestamp() + interval '15 minutes'
        );
      exception when unique_violation then
        raise exception using
          errcode = '55P03',
          message = 'Release head is busy; retry from the latest production pointer';
      end;
      update private.site_release_reservations
      set expires_at = clock_timestamp() + interval '15 minutes'
      where id = reservation.id
      returning * into reservation;
    end if;
  else
    select target_site_release_id into current_release_id
    from private.release_current_pointer where singleton;
    select * into base_release from private.site_releases where id = current_release_id;
    select * into base_artifact from private.release_artifacts where site_release_id = current_release_id;
    if base_release.id is null or base_artifact.site_release_id is null
      or base_artifact.code_sha <> base_code_sha then
      raise exception using errcode = '40001', message = 'Code release base is no longer current';
    end if;

    insert into private.site_release_reservations(
      expected_predecessor_id, report_snapshot_id, release_kind,
      idempotency_key, requested_code_sha, requested_base_code_sha,
      requested_build_environment_version, source_change_set_sha256
    ) values (
      base_release.id, null, 'code', requested_idempotency_key,
      code_sha, base_code_sha, build_environment_version, change_set_sha256
    ) returning * into reservation;

    insert into private.site_release_reservation_reports(
      reservation_id, report_date, report_snapshot_id, byte_sha256
    )
    select reservation.id, report_date, report_snapshot_id, byte_sha256
    from private.site_release_reports
    where site_release_id = base_release.id;
  end if;

  select * into base_release
  from private.site_releases where id = reservation.expected_predecessor_id;
  return jsonb_build_object(
    'reservation_id', reservation.id,
    'site_release_id', reservation.id,
    'site_release_sequence', reservation.sequence,
    'expected_predecessor_id', reservation.expected_predecessor_id,
    'expires_at', reservation.expires_at,
    'status', reservation.status,
    'dispatch_id', reservation.idempotency_key,
    'base_manifest', jsonb_build_object(
      'object_key', base_release.manifest_object_key,
      'byte_length', base_release.manifest_byte_length,
      'sha256', base_release.manifest_sha256
    ),
    'content_root_sha256', base_release.content_root_sha256,
    'idempotent', was_idempotent
  );
end;
$$;

create or replace function private.finalize_code_release_v1(
  reservation_id uuid,
  manifest_object_key text,
  manifest_byte_length bigint,
  manifest_sha256 text,
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
  base_release private.site_releases%rowtype;
  existing_release private.site_releases%rowtype;
  existing_outbox private.content_outbox%rowtype;
begin
  perform private.require_setting_v1('publication');
  perform private.require_setting_v1('code_release');
  perform pg_advisory_xact_lock(42002);
  select * into reservation
  from private.site_release_reservations
  where id = reservation_id
  for update;
  if not found or reservation.release_kind <> 'code' then
    raise exception 'Unknown code release reservation';
  end if;

  if reservation.status = 'finalized' then
    select * into existing_release from private.site_releases where id = reservation.id;
    select * into existing_outbox
    from private.content_outbox
    where site_release_id = reservation.id
      and private.content_outbox.dispatch_id = reservation.idempotency_key;
    if existing_release.id is null
      or existing_outbox.id is null
      or existing_release.manifest_object_key is distinct from manifest_object_key
      or existing_release.manifest_byte_length is distinct from manifest_byte_length
      or existing_release.manifest_sha256 is distinct from manifest_sha256
      or existing_release.content_root_sha256 is distinct from (
        select content_root_sha256 from private.site_releases
        where id = reservation.expected_predecessor_id
      )
      or existing_outbox.dispatch_id is distinct from dispatch_id
      or existing_outbox.payload is distinct from dispatch_payload then
      raise exception using errcode = '23505', message = 'Code release finalize idempotency collision';
    end if;
    return jsonb_build_object(
      'site_release_id', existing_release.id,
      'site_release_sequence', existing_release.sequence,
      'expected_predecessor_id', existing_release.expected_predecessor_id,
      'dispatch_id', existing_outbox.dispatch_id,
      'idempotent', true
    );
  end if;

  if dispatch_id is distinct from reservation.idempotency_key then
    raise exception using errcode = '22023', message = 'Code release dispatch identity mismatch';
  end if;

  select * into base_release
  from private.site_releases where id = reservation.expected_predecessor_id;
  if reservation.status <> 'reserved'
    or reservation.expires_at <= clock_timestamp()
    or reservation.expected_predecessor_id is distinct from (
      select target_site_release_id from private.release_current_pointer where singleton
    ) then
    raise exception using errcode = '40001', message = 'Code release predecessor changed';
  end if;
  if dispatch_payload is null
    or jsonb_typeof(dispatch_payload) is distinct from 'object'
    or dispatch_payload ->> 'mode' is distinct from 'production'
    or dispatch_payload ->> 'dispatch_id' is distinct from dispatch_id::text
    or dispatch_payload ->> 'site_release_id' is distinct from reservation.id::text
    or coalesce(dispatch_payload ->> 'site_release_sequence', '') !~ '^[0-9]+$'
    or (dispatch_payload ->> 'site_release_sequence')::bigint is distinct from reservation.sequence
    or dispatch_payload ->> 'expected_predecessor_id'
      is distinct from reservation.expected_predecessor_id::text
    or dispatch_payload ->> 'expected_content_sha' is distinct from base_release.content_root_sha256
    or dispatch_payload ->> 'code_sha' is distinct from reservation.requested_code_sha
    or dispatch_payload ->> 'build_environment_version'
      is distinct from reservation.requested_build_environment_version then
    raise exception using errcode = '22023', message = 'Code release dispatch identity mismatch';
  end if;
  if manifest_sha256 is null
    or manifest_sha256 !~ '^[a-f0-9]{64}$'
    or manifest_object_key is distinct from 'site-manifests/sha256/' || manifest_sha256 || '.json'
    or manifest_byte_length is null
    or manifest_byte_length <= 0
    or not exists (
      select 1 from private.site_release_reservation_reports refs
      where refs.reservation_id = reservation.id
    )
    or exists (
      (select report_date, report_snapshot_id, byte_sha256
       from private.site_release_reservation_reports
       where private.site_release_reservation_reports.reservation_id = reservation.id)
      except
      (select report_date, report_snapshot_id, byte_sha256
       from private.site_release_reports
       where site_release_id = base_release.id)
    )
    or exists (
      (select report_date, report_snapshot_id, byte_sha256
       from private.site_release_reports
       where site_release_id = base_release.id)
      except
      (select report_date, report_snapshot_id, byte_sha256
       from private.site_release_reservation_reports
       where private.site_release_reservation_reports.reservation_id = reservation.id)
    ) then
    raise exception 'Code release content clone mismatch';
  end if;

  insert into private.site_releases(
    id, sequence, expected_predecessor_id, manifest_object_key,
    manifest_byte_length, manifest_sha256, content_root_sha256,
    schema_version, taxonomy_version, serializer_version,
    search_contract_version, source_contract_version,
    structured_cutover_date, no_report_days, release_kind,
    content_base_release_id, requested_code_sha, source_change_set_sha256
  ) values (
    reservation.id, reservation.sequence, reservation.expected_predecessor_id,
    manifest_object_key, manifest_byte_length, manifest_sha256,
    base_release.content_root_sha256, base_release.schema_version,
    base_release.taxonomy_version, base_release.serializer_version,
    base_release.search_contract_version, base_release.source_contract_version,
    base_release.structured_cutover_date, base_release.no_report_days, 'code',
    coalesce(base_release.content_base_release_id, base_release.id),
    reservation.requested_code_sha,
    reservation.source_change_set_sha256
  );
  insert into private.site_release_reports(
    site_release_id, report_date, report_snapshot_id, byte_sha256
  )
  select reservation.id, report_date, report_snapshot_id, byte_sha256
  from private.site_release_reservation_reports
  where private.site_release_reservation_reports.reservation_id = reservation.id;
  insert into private.content_outbox(site_release_id, dispatch_id, payload)
  values (reservation.id, dispatch_id, dispatch_payload);
  insert into private.release_deployment_attempts(site_release_id, dispatch_id, event_type)
  values (reservation.id, dispatch_id, 'queued');
  update private.site_release_reservations
  set status = 'finalized'
  where id = reservation.id;

  return jsonb_build_object(
    'site_release_id', reservation.id,
    'site_release_sequence', reservation.sequence,
    'expected_predecessor_id', reservation.expected_predecessor_id,
    'dispatch_id', dispatch_id,
    'idempotent', false
  );
end;
$$;

create or replace function private.defer_editorial_publish_request_v1(
  publish_request_id uuid,
  worker_id text,
  error_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare request private.editorial_publish_requests%rowtype;
begin
  if error_code is null or error_code not in ('55P03', '40001') then
    raise exception using errcode = '22023', message = 'Editorial deferral requires a transient release-head conflict';
  end if;
  select * into request
  from private.editorial_publish_requests
  where id = publish_request_id
  for update;
  if request.id is null
    or request.status <> 'claimed'
    or request.locked_by is distinct from worker_id then
    raise exception 'Editorial publish deferral ownership conflict';
  end if;

  update private.site_release_reservations
  set status = 'abandoned'
  where id = request.reservation_id and status = 'reserved';
  update private.editorial_overrides value
  set status = 'cleared'
  where value.status = 'staged'
    and exists (
      select 1
      from private.editorial_staged_overrides staged
      where staged.publish_request_id = request.id
        and staged.override_id = value.id
    );
  delete from private.editorial_staged_overrides staged
  where staged.publish_request_id = request.id;
  update private.editorial_publish_requests value
  set status = 'queued',
      locked_by = null,
      lease_expires_at = null,
      reservation_id = null,
      error_code = left(defer_editorial_publish_request_v1.error_code, 200),
      updated_at = clock_timestamp()
  where value.id = request.id;
end;
$$;

create or replace function private.defer_global_suppression_request_v1(
  suppression_request_id uuid,
  worker_id text,
  error_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare request private.global_suppression_requests%rowtype;
begin
  if error_code is null or error_code not in ('55P03', '40001') then
    raise exception using errcode = '22023', message = 'Global suppression deferral requires a transient release-head conflict';
  end if;
  select * into request
  from private.global_suppression_requests
  where id = suppression_request_id
  for update;
  if request.id is null
    or request.status <> 'claimed'
    or request.locked_by is distinct from worker_id then
    raise exception 'Global suppression deferral ownership conflict';
  end if;

  update private.site_release_reservations
  set status = 'abandoned'
  where id = request.reservation_id and status = 'reserved';
  update private.global_suppression_requests value
  set status = 'queued',
      locked_by = null,
      lease_expires_at = null,
      reservation_id = null,
      error_code = left(defer_global_suppression_request_v1.error_code, 200),
      updated_at = clock_timestamp()
  where value.id = request.id;
end;
$$;

create or replace function private.rebuild_content_release_v1(
  site_release_id uuid,
  reason text,
  typed_confirmation text,
  idempotency_key uuid,
  assertion jsonb,
  body_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor record;
  existing jsonb;
  release_row private.site_releases%rowtype;
  source_outbox private.content_outbox%rowtype;
  new_outbox private.content_outbox%rowtype;
  current_release_id uuid;
  claimed_predecessor_id uuid;
  new_dispatch_id uuid := gen_random_uuid();
  result jsonb;
begin
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-control', 'operations.rebuild', body_sha256, array['Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-control', 'operations.rebuild', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;
  if coalesce(char_length(btrim(reason)), 0) < 8
    or typed_confirmation is distinct from 'REBUILD ' || rebuild_content_release_v1.site_release_id::text then
    raise exception 'Invalid rebuild confirmation';
  end if;

  perform pg_advisory_xact_lock(42002);
  select * into release_row
  from private.site_releases value
  where value.id = rebuild_content_release_v1.site_release_id;
  if release_row.id is null then raise exception 'Unknown site release'; end if;
  select target_site_release_id into current_release_id
  from private.release_current_pointer
  where singleton;

  select * into source_outbox
  from private.content_outbox value
  where value.site_release_id = rebuild_content_release_v1.site_release_id
  order by value.inserted_at desc, value.id desc
  limit 1;
  if source_outbox.id is null then raise exception 'Release has no dispatch identity'; end if;
  if source_outbox.status not in ('failed', 'dead_letter') then
    raise exception 'Release latest dispatch is not rebuildable';
  end if;
  if exists (
    select 1
    from private.content_outbox sibling
    where sibling.site_release_id = rebuild_content_release_v1.site_release_id
      and sibling.id <> source_outbox.id
      and sibling.status not in ('deployed', 'dead_letter')
      and not (
        sibling.status = 'preview_verified'
        and sibling.payload ->> 'mode' = 'shadow'
      )
  ) then
    raise exception using
      errcode = '55P03',
      message = 'Release already has actionable dispatch work';
  end if;
  if source_outbox.payload ->> 'mode' = 'production' then
    perform private.require_setting_v1('publication');
  elsif source_outbox.payload ->> 'mode' = 'shadow' then
    perform private.require_setting_v1('shadow_build');
  else
    raise exception 'Release outbox has an invalid mode';
  end if;

  if source_outbox.payload ->> 'mode' = 'production'
    and release_row.id is distinct from current_release_id then
    if release_row.expected_predecessor_id is distinct from current_release_id then
      raise exception using errcode = '40001', message = 'Rebuild predecessor is no longer current';
    end if;
    if not exists (
      select 1
      from private.site_release_reservations reservation
      where reservation.id = release_row.id
        and reservation.status = 'finalized'
    ) then
      raise exception 'Release reservation is unavailable for rebuild';
    end if;
    insert into private.release_head_claims(
      predecessor_id, reservation_id, release_kind, expires_at
    ) values (
      release_row.expected_predecessor_id, release_row.id,
      release_row.release_kind, null
    )
    on conflict (predecessor_id) do update set
      reservation_id = excluded.reservation_id,
      release_kind = excluded.release_kind,
      expires_at = null
    where private.release_head_claims.reservation_id = excluded.reservation_id
    returning predecessor_id into claimed_predecessor_id;
    if claimed_predecessor_id is null then
      raise exception using
        errcode = '55P03',
        message = 'Release head is busy; retry from the latest production pointer';
    end if;
  end if;

  insert into private.content_outbox(site_release_id, dispatch_id, payload)
  values (
    rebuild_content_release_v1.site_release_id,
    new_dispatch_id,
    source_outbox.payload || jsonb_build_object('dispatch_id', new_dispatch_id::text)
  )
  returning * into new_outbox;
  insert into private.release_deployment_attempts(
    site_release_id, dispatch_id, event_type, evidence
  ) values (
    rebuild_content_release_v1.site_release_id, new_dispatch_id, 'queued',
    jsonb_build_object(
      'kind', 'manual_rebuild',
      'requested_by', actor.actor_sub,
      'source_dispatch_id', source_outbox.dispatch_id
    )
  );
  result := jsonb_build_object(
    'outbox_id', new_outbox.id,
    'site_release_id', new_outbox.site_release_id,
    'dispatch_id', new_outbox.dispatch_id,
    'source_dispatch_id', source_outbox.dispatch_id,
    'status', new_outbox.status
  );
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id,
    idempotency_key, target, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'operations.rebuild', reason,
    actor.assertion_jti::text, idempotency_key::text,
    jsonb_build_object(
      'site_release_id', rebuild_content_release_v1.site_release_id,
      'source_dispatch_id', source_outbox.dispatch_id,
      'dispatch_id', new_dispatch_id
    ),
    'queued'
  );
  perform private.complete_admin_idempotency_v1(
    'content-control', 'operations.rebuild', idempotency_key, result
  );
  return result;
end;
$$;

revoke all on function private.get_code_release_base_v1()
  from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller, content_reader;
revoke all on function private.reserve_code_release_v1(uuid, text, text, text, text)
  from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller, content_reader;
revoke all on function private.finalize_code_release_v1(uuid, text, bigint, text, uuid, jsonb)
  from public, anon, authenticated, service_role, content_backup,
       content_ingestor, content_editor, content_controller, content_reader;
revoke all on function private.defer_editorial_publish_request_v1(uuid, text, text)
  from public, anon, authenticated, service_role, content_backup,
       content_editor, content_controller, content_reader, content_deployer;
revoke all on function private.defer_global_suppression_request_v1(uuid, text, text)
  from public, anon, authenticated, service_role, content_backup,
       content_editor, content_controller, content_reader, content_deployer;
grant execute on function private.get_code_release_base_v1() to content_deployer;
grant execute on function private.reserve_code_release_v1(uuid, text, text, text, text)
  to content_deployer;
grant execute on function private.finalize_code_release_v1(uuid, text, bigint, text, uuid, jsonb)
  to content_deployer;
grant execute on function private.defer_editorial_publish_request_v1(uuid, text, text)
  to content_ingestor;
grant execute on function private.defer_global_suppression_request_v1(uuid, text, text)
  to content_ingestor;

commit;
