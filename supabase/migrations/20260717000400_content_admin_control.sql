begin;

create table if not exists private.admin_idempotency_keys (
  audience text not null,
  action text not null,
  idempotency_key uuid not null,
  actor_sub text not null,
  body_sha256 text not null check (body_sha256 ~ '^[a-f0-9]{64}$'),
  result jsonb,
  inserted_at timestamptz not null default clock_timestamp(),
  primary key (audience, action, idempotency_key)
);

create table if not exists private.editorial_publish_requests (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references private.editorial_drafts(id),
  preview_build_id uuid not null references private.preview_builds(id),
  requested_by text not null,
  reason text not null,
  idempotency_key uuid not null unique,
  status text not null default 'queued' check (status in ('queued', 'claimed', 'completed', 'failed')),
  locked_by text,
  lease_expires_at timestamptz,
  reservation_id uuid unique references private.site_release_reservations(id),
  site_release_id uuid references private.site_releases(id),
  error_code text,
  inserted_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists private.site_release_reservation_reports (
  reservation_id uuid not null references private.site_release_reservations(id),
  report_date date not null,
  report_snapshot_id uuid not null references private.report_snapshots(id),
  byte_sha256 text not null check (byte_sha256 ~ '^[a-f0-9]{64}$'),
  primary key (reservation_id, report_date),
  unique (reservation_id, report_snapshot_id)
);

create table if not exists private.editorial_staged_overrides (
  publish_request_id uuid not null references private.editorial_publish_requests(id),
  item_id text not null references private.content_items(id),
  override_id uuid not null unique references private.editorial_overrides(id),
  primary key (publish_request_id, item_id)
);

create table if not exists private.global_suppression_requests (
  id uuid primary key default gen_random_uuid(),
  suppression_id uuid not null unique references private.global_suppressions(id),
  item_id text not null references private.content_items(id),
  base_site_release_id uuid not null references private.site_releases(id),
  requested_by text not null,
  requested_email text,
  requested_role text not null,
  request_jti uuid not null unique,
  reason text not null,
  idempotency_key uuid not null unique,
  status text not null default 'queued' check (status in ('queued', 'claimed', 'completed', 'failed')),
  locked_by text,
  lease_expires_at timestamptz,
  reservation_id uuid unique references private.site_release_reservations(id),
  site_release_id uuid references private.site_releases(id),
  error_code text,
  inserted_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table private.admin_idempotency_keys enable row level security;
alter table private.admin_idempotency_keys force row level security;
alter table private.editorial_publish_requests enable row level security;
alter table private.editorial_publish_requests force row level security;
alter table private.site_release_reservation_reports enable row level security;
alter table private.site_release_reservation_reports force row level security;
alter table private.editorial_staged_overrides enable row level security;
alter table private.editorial_staged_overrides force row level security;
alter table private.global_suppression_requests enable row level security;
alter table private.global_suppression_requests force row level security;
drop policy if exists content_rpc_owner_all on private.admin_idempotency_keys;
create policy content_rpc_owner_all on private.admin_idempotency_keys
  for all to content_rpc_owner using (true) with check (true);
drop policy if exists content_rpc_owner_all on private.editorial_publish_requests;
create policy content_rpc_owner_all on private.editorial_publish_requests
  for all to content_rpc_owner using (true) with check (true);
drop policy if exists content_rpc_owner_all on private.site_release_reservation_reports;
create policy content_rpc_owner_all on private.site_release_reservation_reports
  for all to content_rpc_owner using (true) with check (true);
drop policy if exists content_rpc_owner_all on private.editorial_staged_overrides;
create policy content_rpc_owner_all on private.editorial_staged_overrides
  for all to content_rpc_owner using (true) with check (true);
drop policy if exists content_rpc_owner_all on private.global_suppression_requests;
create policy content_rpc_owner_all on private.global_suppression_requests
  for all to content_rpc_owner using (true) with check (true);
revoke all on private.admin_idempotency_keys, private.editorial_publish_requests,
  private.site_release_reservation_reports, private.editorial_staged_overrides,
  private.global_suppression_requests
  from public, anon, authenticated, service_role,
       content_ingestor, content_editor, content_controller, content_reader, content_deployer;
grant select, insert, update, delete on private.admin_idempotency_keys, private.editorial_publish_requests,
  private.site_release_reservation_reports, private.editorial_staged_overrides,
  private.global_suppression_requests
  to content_rpc_owner;

set local role content_rpc_owner;

create or replace function private.reserve_admin_idempotency_v1(
  audience text,
  action text,
  idempotency_key uuid,
  actor_sub text,
  body_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare existing private.admin_idempotency_keys%rowtype;
begin
  insert into private.admin_idempotency_keys(audience, action, idempotency_key, actor_sub, body_sha256)
  values (audience, action, idempotency_key, actor_sub, body_sha256)
  on conflict do nothing;
  select * into existing from private.admin_idempotency_keys k
  where k.audience = reserve_admin_idempotency_v1.audience
    and k.action = reserve_admin_idempotency_v1.action
    and k.idempotency_key = reserve_admin_idempotency_v1.idempotency_key;
  if existing.actor_sub <> actor_sub or existing.body_sha256 <> body_sha256 then
    raise exception 'Idempotency key payload collision';
  end if;
  return existing.result;
end;
$$;

create or replace function private.complete_admin_idempotency_v1(
  audience text,
  action text,
  idempotency_key uuid,
  result jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update private.admin_idempotency_keys k set result = complete_admin_idempotency_v1.result
  where k.audience = complete_admin_idempotency_v1.audience
    and k.action = complete_admin_idempotency_v1.action
    and k.idempotency_key = complete_admin_idempotency_v1.idempotency_key
    and k.result is null;
  if not found then raise exception 'Idempotency reservation is unavailable'; end if;
end;
$$;

create or replace function private.get_admin_dashboard_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
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
      where project_key = 'bubble-brain-pages')
  )
$$;

create or replace function private.list_admin_reports_v1(before_date date default null, page_size integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(value order by (value ->> 'report_date') desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'report_id', r.id, 'report_date', r.report_date, 'row_version', r.row_version,
      'item_count', count(i.item_id),
      'batches', coalesce((select jsonb_agg(jsonb_build_object(
        'batch_id', b.batch_id, 'status', b.status, 'generated_at', b.generated_at
      ) order by array_position(array['morning','afternoon','night','lateNight'], b.batch_id))
      from private.daily_batches b where b.report_id = r.id), '[]'::jsonb)
    ) as value
    from private.daily_reports r
    left join private.daily_report_items i on i.report_id = r.id
    where before_date is null or r.report_date < before_date
    group by r.id
    order by r.report_date desc
    limit least(greatest(page_size, 1), 100)
  ) page
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
      r.manifest_sha256, r.inserted_at,
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

create or replace function private.list_admin_drafts_v1(page_size integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(page) order by updated_at desc), '[]'::jsonb)
  from (
    select d.id, d.base_site_release_id, d.row_version, d.owner_sub, d.required_role,
      d.status, d.inserted_at, d.updated_at, count(i.item_id) as item_count,
      (select p.id from private.preview_builds p where p.draft_id = d.id order by p.inserted_at desc limit 1)
        as latest_preview_build_id
    from private.editorial_drafts d
    left join private.editorial_draft_items i on i.draft_id = d.id
    group by d.id
    order by d.updated_at desc
    limit least(greatest(page_size, 1), 100)
  ) page
$$;

create or replace function private.list_admin_audit_v1(before_id bigint default null, page_size integer default 100)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(page) order by id desc), '[]'::jsonb)
  from (
    select id, actor_sub, actor_email, actor_role, action, reason, request_id,
      idempotency_key, target, before_sha256, after_sha256, result, inserted_at
    from private.content_audit_log
    where before_id is null or id < before_id
    order by id desc
    limit least(greatest(page_size, 1), 200)
  ) page
$$;

create or replace function private.create_editorial_draft_v1(
  base_site_release_id uuid,
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
declare actor record;
declare existing jsonb;
declare draft private.editorial_drafts%rowtype;
declare result jsonb;
begin
  perform private.require_setting_v1('admin_draft');
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-routine', 'draft.create', body_sha256, array['Editor','Publisher','Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-routine', 'draft.create', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;
  if not exists (select 1 from private.site_releases where id = base_site_release_id) then
    raise exception 'Unknown base site release';
  end if;
  insert into private.editorial_drafts(base_site_release_id, owner_sub, required_role)
  values (base_site_release_id, actor.actor_sub, 'Editor') returning * into draft;
  result := jsonb_build_object('draft_id', draft.id, 'row_version', draft.row_version, 'status', draft.status);
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, request_id, idempotency_key, target, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'draft.create', actor.assertion_jti::text,
    idempotency_key::text, jsonb_build_object('draft_id', draft.id, 'base_site_release_id', base_site_release_id),
    'created'
  );
  perform private.complete_admin_idempotency_v1('content-routine', 'draft.create', idempotency_key, result);
  return result;
end;
$$;

create or replace function private.upsert_editorial_draft_item_v1(
  draft_id uuid,
  item_id text,
  base_revision_id uuid,
  base_override_id uuid,
  patch jsonb,
  expected_row_version bigint,
  reason text,
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
declare actor record;
declare draft private.editorial_drafts%rowtype;
declare existing jsonb;
declare result jsonb;
begin
  perform private.require_setting_v1('admin_draft');
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-routine', 'draft.update', body_sha256, array['Editor','Publisher','Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-routine', 'draft.update', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;
  if jsonb_typeof(patch) <> 'object'
    or patch - array[
      'title','summary','category','featured','score','reason','topic_ids','entity_ids',
      'report_hidden','report_date'
    ] <> '{}'::jsonb
    or ((patch ? 'report_hidden') <> (patch ? 'report_date'))
    or (patch ? 'report_hidden' and (
      patch -> 'report_hidden' <> 'true'::jsonb
      or patch ->> 'report_date' !~ '^\d{4}-\d{2}-\d{2}$'
      or patch - array['report_hidden','report_date'] <> '{}'::jsonb
    ))
    or char_length(btrim(reason)) < 4 then raise exception 'Invalid editorial patch or reason'; end if;
  select * into draft from private.editorial_drafts
  where id = upsert_editorial_draft_item_v1.draft_id for update;
  if draft.id is null or draft.row_version <> expected_row_version
    or draft.status not in ('draft','stale','preview_ready')
    or (draft.owner_sub <> actor.actor_sub and actor.actor_role <> 'Owner') then
    raise exception 'Draft ownership, state, or row version conflict';
  end if;
  if patch ? 'report_hidden' and not exists (
    select 1
    from private.site_release_reports release_report
    join private.report_snapshot_items snapshot_item
      on snapshot_item.report_snapshot_id = release_report.report_snapshot_id
    where release_report.site_release_id = draft.base_site_release_id
      and release_report.report_date = (patch ->> 'report_date')::date
      and snapshot_item.item_id = upsert_editorial_draft_item_v1.item_id
  ) then raise exception 'Report-scoped item placement does not exist'; end if;
  if not exists (select 1 from private.content_item_revisions
    where private.content_item_revisions.id = base_revision_id
      and private.content_item_revisions.item_id = upsert_editorial_draft_item_v1.item_id) then
    raise exception 'Base revision does not belong to item';
  end if;
  if base_override_id is not null and not exists (select 1 from private.editorial_overrides
    where id = base_override_id and private.editorial_overrides.item_id = upsert_editorial_draft_item_v1.item_id
      and status = 'active') then raise exception 'Base override does not belong to item'; end if;
  insert into private.editorial_draft_items(
    draft_id, item_id, base_revision_id, base_override_id, patch
  ) values (draft_id, item_id, base_revision_id, base_override_id, patch)
  on conflict on constraint editorial_draft_items_pkey do update set
    base_revision_id = excluded.base_revision_id,
    base_override_id = excluded.base_override_id,
    patch = excluded.patch;
  update private.editorial_drafts set
    row_version = row_version + 1, status = 'draft', updated_at = clock_timestamp()
  where id = draft_id returning * into draft;
  result := jsonb_build_object('draft_id', draft.id, 'row_version', draft.row_version, 'status', draft.status);
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id, idempotency_key, target, after_sha256, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'draft.update', reason,
    actor.assertion_jti::text, idempotency_key::text,
    jsonb_strip_nulls(jsonb_build_object(
      'draft_id', draft.id, 'item_id', item_id,
      'scope', case when patch ? 'report_hidden' then 'report' else 'item' end,
      'report_date', patch ->> 'report_date'
    )), private.sha256_jsonb_v1(patch), 'updated'
  );
  perform private.complete_admin_idempotency_v1('content-routine', 'draft.update', idempotency_key, result);
  return result;
end;
$$;

create or replace function private.rebase_editorial_draft_v1(
  draft_id uuid,
  new_base_site_release_id uuid,
  expected_row_version bigint,
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
declare actor record;
declare draft private.editorial_drafts%rowtype;
declare existing jsonb;
declare conflicts jsonb;
declare result jsonb;
begin
  perform private.require_setting_v1('admin_draft');
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-routine', 'draft.rebase', body_sha256, array['Editor','Publisher','Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-routine', 'draft.rebase', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;
  select * into draft from private.editorial_drafts
  where id = rebase_editorial_draft_v1.draft_id for update;
  if draft.id is null or draft.row_version <> expected_row_version
    or (draft.owner_sub <> actor.actor_sub and actor.actor_role <> 'Owner') then
    raise exception 'Draft ownership or row version conflict';
  end if;
  if not exists (select 1 from private.site_releases where id = new_base_site_release_id) then
    raise exception 'Unknown rebase release';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id', i.item_id, 'base_revision_id', i.base_revision_id,
    'current_revision_id', current_item.revision_id
  )), '[]'::jsonb) into conflicts
  from private.editorial_draft_items i
  left join lateral (
    select si.revision_id
    from private.site_release_reports sr
    join private.report_snapshot_items si on si.report_snapshot_id = sr.report_snapshot_id
    where sr.site_release_id = new_base_site_release_id and si.item_id = i.item_id
      and (not (i.patch ? 'report_hidden')
        or sr.report_date = (i.patch ->> 'report_date')::date)
    order by sr.report_date desc limit 1
  ) current_item on true
  where i.draft_id = rebase_editorial_draft_v1.draft_id
    and current_item.revision_id is distinct from i.base_revision_id;
  if jsonb_array_length(conflicts) > 0 then
    update private.editorial_drafts set
      status = 'stale', row_version = row_version + 1, updated_at = clock_timestamp()
    where id = rebase_editorial_draft_v1.draft_id returning * into draft;
    result := jsonb_build_object(
      'draft_id', draft.id, 'row_version', draft.row_version,
      'status', draft.status, 'conflicts', conflicts
    );
  else
    update private.editorial_drafts set
      base_site_release_id = new_base_site_release_id,
      row_version = row_version + 1,
      status = 'draft',
      updated_at = clock_timestamp()
    where id = rebase_editorial_draft_v1.draft_id returning * into draft;
    result := jsonb_build_object('draft_id', draft.id, 'row_version', draft.row_version, 'status', draft.status, 'conflicts', conflicts);
  end if;
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, request_id, idempotency_key, target, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'draft.rebase', actor.assertion_jti::text,
    idempotency_key::text, jsonb_build_object(
      'draft_id', rebase_editorial_draft_v1.draft_id,
      'new_base_site_release_id', new_base_site_release_id
    ),
    case when jsonb_array_length(conflicts) > 0 then 'conflict' else 'rebased' end
  );
  perform private.complete_admin_idempotency_v1('content-routine', 'draft.rebase', idempotency_key, result);
  return result;
end;
$$;

create or replace function private.editorial_preview_payload_v1(draft_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'draft_id', d.id,
    'base_site_release_id', d.base_site_release_id,
    'row_version', d.row_version,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', i.item_id,
        'base_revision_id', i.base_revision_id,
        'base_override_id', i.base_override_id,
        'patch', i.patch,
        'base_document', jsonb_build_object(
          'title', r.title, 'summary', r.summary, 'category', r.category,
          'featured', r.featured, 'score', r.score, 'reason', r.reason,
          'topic_ids', r.topic_ids, 'entity_ids', r.entity_ids
        )
      ) order by i.item_id)
      from private.editorial_draft_items i
      join private.content_item_revisions r on r.id = i.base_revision_id and r.item_id = i.item_id
      where i.draft_id = d.id
    ), '[]'::jsonb)
  )
  from private.editorial_drafts d where d.id = editorial_preview_payload_v1.draft_id
$$;

create or replace function private.request_preview_build_v1(
  draft_id uuid,
  expected_row_version bigint,
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
declare actor record;
declare draft private.editorial_drafts%rowtype;
declare existing jsonb;
declare result jsonb;
declare preview_sha256 text;
begin
  perform private.require_setting_v1('admin_preview');
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-routine', 'preview.build', body_sha256, array['Editor','Publisher','Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-routine', 'preview.build', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;
  select * into draft from private.editorial_drafts where id = draft_id for update;
  if draft.id is null or draft.row_version <> expected_row_version or draft.status <> 'draft'
    or (draft.owner_sub <> actor.actor_sub and actor.actor_role <> 'Owner') then
    raise exception 'Draft is not previewable';
  end if;
  update private.editorial_drafts set
    status = 'preview_building', row_version = row_version + 1, updated_at = clock_timestamp()
  where id = draft_id returning * into draft;
  preview_sha256 := private.sha256_jsonb_v1(private.editorial_preview_payload_v1(draft.id));
  result := jsonb_build_object(
    'draft_id', draft.id, 'base_site_release_id', draft.base_site_release_id,
    'row_version', draft.row_version, 'status', draft.status, 'preview_sha256', preview_sha256,
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.item_id), '[]'::jsonb)
      from private.editorial_draft_items i where i.draft_id = draft.id)
  );
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, request_id, idempotency_key, target, after_sha256, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'preview.build', actor.assertion_jti::text,
    idempotency_key::text, jsonb_build_object('draft_id', draft.id), preview_sha256, 'queued'
  );
  perform private.complete_admin_idempotency_v1('content-routine', 'preview.build', idempotency_key, result);
  return result;
end;
$$;

create or replace function private.get_preview_build_input_v1(draft_id uuid, expected_preview_sha256 text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare draft private.editorial_drafts%rowtype;
declare payload jsonb;
declare preview_sha256 text;
declare artifact private.release_artifacts%rowtype;
begin
  select * into draft from private.editorial_drafts where id = draft_id;
  if draft.id is null or draft.status <> 'preview_building' then
    raise exception 'Draft is not awaiting a Preview build';
  end if;
  payload := private.editorial_preview_payload_v1(draft.id);
  preview_sha256 := private.sha256_jsonb_v1(payload);
  if preview_sha256 <> expected_preview_sha256 then raise exception 'Preview hash mismatch'; end if;
  select * into artifact from private.release_artifacts where site_release_id = draft.base_site_release_id;
  if artifact.site_release_id is null then raise exception 'Base release build identity is unavailable'; end if;
  return payload || jsonb_build_object(
    'preview_sha256', preview_sha256,
    'code_sha', artifact.code_sha,
    'build_environment_version', artifact.build_environment_version
  );
end;
$$;

create or replace function private.register_preview_build_v1(
  draft_id uuid,
  preview_sha256 text,
  artifact_sha256 text,
  pages_preview_url text,
  verifier_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare draft private.editorial_drafts%rowtype;
declare preview private.preview_builds%rowtype;
begin
  if preview_sha256 !~ '^[a-f0-9]{64}$' or artifact_sha256 !~ '^[a-f0-9]{64}$'
    or pages_preview_url !~ '^https://' or jsonb_typeof(verifier_evidence) <> 'object'
    or coalesce((verifier_evidence ->> 'route_parity')::boolean, false) is not true then
    raise exception 'Invalid verified preview evidence';
  end if;
  select * into draft from private.editorial_drafts where id = draft_id for update;
  if draft.id is null then raise exception 'Unknown draft'; end if;
  if draft.status = 'preview_ready' then
    select * into preview from private.preview_builds
      where private.preview_builds.draft_id = register_preview_build_v1.draft_id
        and private.preview_builds.preview_sha256 = register_preview_build_v1.preview_sha256;
    if preview.id is not null and preview.artifact_sha256 = register_preview_build_v1.artifact_sha256
      and preview.pages_preview_url = register_preview_build_v1.pages_preview_url then
      return jsonb_build_object('draft_id', draft.id, 'row_version', draft.row_version,
        'status', draft.status, 'preview_build_id', preview.id, 'idempotent', true);
    end if;
    raise exception 'Preview registration collision';
  end if;
  if draft.status <> 'preview_building' then raise exception 'Draft is not awaiting Preview'; end if;
  if private.sha256_jsonb_v1(private.editorial_preview_payload_v1(draft.id)) <> preview_sha256 then
    raise exception 'Preview hash is stale';
  end if;
  insert into private.preview_builds(
    draft_id, base_site_release_id, preview_sha256, artifact_sha256, pages_preview_url, verifier_evidence
  ) values (
    draft.id, draft.base_site_release_id, preview_sha256, artifact_sha256, pages_preview_url, verifier_evidence
  ) on conflict on constraint preview_builds_draft_id_preview_sha256_key do nothing
  returning * into preview;
  if preview.id is null then raise exception 'Preview registration collision'; end if;
  update private.editorial_drafts set
    status = 'preview_ready', row_version = row_version + 1, updated_at = clock_timestamp()
  where id = draft.id returning * into draft;
  return jsonb_build_object('draft_id', draft.id, 'row_version', draft.row_version,
    'status', draft.status, 'preview_build_id', preview.id);
end;
$$;

create or replace function private.fail_preview_build_v1(
  draft_id uuid,
  preview_sha256 text,
  error_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if preview_sha256 !~ '^[a-f0-9]{64}$' or nullif(btrim(error_code), '') is null then
    raise exception 'Invalid Preview failure evidence';
  end if;
  update private.editorial_drafts set status = 'failed', row_version = row_version + 1,
    updated_at = clock_timestamp()
  where id = draft_id and status = 'preview_building'
    and private.sha256_jsonb_v1(private.editorial_preview_payload_v1(id)) = preview_sha256;
  if not found then raise exception 'Draft Preview failure is stale'; end if;
end;
$$;

create or replace function private.request_editorial_publish_v1(
  draft_id uuid,
  preview_build_id uuid,
  expected_row_version bigint,
  reason text,
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
declare actor record;
declare draft private.editorial_drafts%rowtype;
declare existing jsonb;
declare publish_request private.editorial_publish_requests%rowtype;
declare result jsonb;
begin
  perform private.require_setting_v1('admin_publish');
  perform private.require_setting_v1('publication');
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-routine', 'draft.publish', body_sha256, array['Publisher','Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-routine', 'draft.publish', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;
  if char_length(btrim(reason)) < 8 then raise exception 'Publish reason is required'; end if;
  select * into draft from private.editorial_drafts where id = draft_id for update;
  if draft.id is null or draft.row_version <> expected_row_version or draft.status <> 'preview_ready'
    or not exists (select 1 from private.preview_builds
      where id = preview_build_id and private.preview_builds.draft_id = request_editorial_publish_v1.draft_id
        and base_site_release_id = draft.base_site_release_id)
    or draft.base_site_release_id is distinct from (
      select target_site_release_id from private.release_current_pointer where singleton
    ) then raise exception 'Draft Preview is stale or not publishable'; end if;
  insert into private.editorial_publish_requests(
    draft_id, preview_build_id, requested_by, reason, idempotency_key
  ) values (draft_id, preview_build_id, actor.actor_sub, reason, idempotency_key)
  returning * into publish_request;
  update private.editorial_drafts set status = 'publishing', row_version = row_version + 1,
    updated_at = clock_timestamp() where id = draft_id returning * into draft;
  result := jsonb_build_object('publish_request_id', publish_request.id, 'draft_id', draft.id,
    'row_version', draft.row_version, 'status', draft.status);
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id, idempotency_key, target, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'draft.publish', reason,
    actor.assertion_jti::text, idempotency_key::text,
    jsonb_build_object('draft_id', draft.id, 'preview_build_id', preview_build_id), 'queued'
  );
  perform private.complete_admin_idempotency_v1('content-routine', 'draft.publish', idempotency_key, result);
  return result;
end;
$$;

create or replace function private.claim_editorial_publish_request_v1(worker_id text, lease_seconds integer default 300)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare request private.editorial_publish_requests%rowtype;
begin
  perform private.require_setting_v1('admin_publish');
  perform private.require_setting_v1('publication');
  select * into request from private.editorial_publish_requests
  where status = 'queued' or (status = 'claimed' and lease_expires_at <= clock_timestamp())
  order by inserted_at for update skip locked limit 1;
  if request.id is null then return null; end if;
  update private.editorial_publish_requests set status = 'claimed', locked_by = worker_id,
    lease_expires_at = clock_timestamp() + make_interval(secs => least(greatest(lease_seconds, 60), 600)),
    updated_at = clock_timestamp() where id = request.id returning * into request;
  return to_jsonb(request);
end;
$$;

create or replace function private.get_editorial_publish_input_v1(publish_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare request private.editorial_publish_requests%rowtype;
declare draft private.editorial_drafts%rowtype;
declare release private.site_releases%rowtype;
declare artifact private.release_artifacts%rowtype;
begin
  perform private.require_setting_v1('admin_publish');
  perform private.require_setting_v1('publication');
  select * into request from private.editorial_publish_requests where id = publish_request_id;
  if request.id is null or request.status <> 'claimed' or request.lease_expires_at <= clock_timestamp() then
    raise exception 'Editorial publish request is not actively claimed';
  end if;
  select * into draft from private.editorial_drafts where id = request.draft_id;
  select * into release from private.site_releases where id = draft.base_site_release_id;
  select * into artifact from private.release_artifacts where site_release_id = release.id;
  if draft.status <> 'publishing' or release.id is null or artifact.site_release_id is null then
    raise exception 'Editorial publish base release is unavailable';
  end if;
  return private.editorial_preview_payload_v1(draft.id) || jsonb_build_object(
    'publish_request_id', request.id,
    'reason', request.reason,
    'requested_by', request.requested_by,
    'code_sha', artifact.code_sha,
    'build_environment_version', artifact.build_environment_version,
    'schema_version', release.schema_version,
    'taxonomy_version', release.taxonomy_version,
    'serializer_version', release.serializer_version,
    'search_contract_version', release.search_contract_version,
    'source_contract_version', release.source_contract_version,
    'structured_cutover_date', release.structured_cutover_date,
    'no_report_days', release.no_report_days,
    'reports', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'report_date', sr.report_date,
        'report_snapshot_id', sr.report_snapshot_id,
        'object_key', snapshot.object_key,
        'byte_length', snapshot.byte_length,
        'byte_sha256', snapshot.byte_sha256
      ) order by sr.report_date), '[]'::jsonb)
      from private.site_release_reports sr
      join private.report_snapshots snapshot on snapshot.id = sr.report_snapshot_id
      where sr.site_release_id = release.id
        and exists (
          select 1 from private.report_snapshot_items snapshot_item
          join private.editorial_draft_items draft_item
            on draft_item.draft_id = draft.id and draft_item.item_id = snapshot_item.item_id
          where snapshot_item.report_snapshot_id = sr.report_snapshot_id
            and (not (draft_item.patch ? 'report_hidden')
              or sr.report_date = (draft_item.patch ->> 'report_date')::date)
        )
    )
  );
end;
$$;

create or replace function private.stage_editorial_release_v1(
  publish_request_id uuid,
  report_objects jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare request private.editorial_publish_requests%rowtype;
declare draft private.editorial_drafts%rowtype;
declare reservation private.site_release_reservations%rowtype;
declare object jsonb;
declare v_report_date date;
declare snapshot_id uuid;
declare first_snapshot_id uuid;
declare staged_snapshot_ids uuid[] := '{}'::uuid[];
declare staged_override_id uuid;
declare expected_count integer;
declare supplied_count integer;
declare supplied_distinct_count integer;
begin
  perform private.require_setting_v1('admin_publish');
  perform private.require_setting_v1('publication');
  if jsonb_typeof(report_objects) <> 'array' then raise exception 'Editorial report objects must be an array'; end if;
  perform pg_advisory_xact_lock(42002);
  select * into request from private.editorial_publish_requests where id = publish_request_id for update;
  if request.id is null or request.status <> 'claimed' or request.lease_expires_at <= clock_timestamp() then
    raise exception 'Editorial publish request is not actively claimed';
  end if;
  if request.reservation_id is not null then
    select * into reservation from private.site_release_reservations where id = request.reservation_id;
    return jsonb_build_object(
      'reservation_id', reservation.id, 'site_release_id', reservation.id,
      'site_release_sequence', reservation.sequence,
      'expected_predecessor_id', reservation.expected_predecessor_id,
      'reports', (select jsonb_agg(jsonb_build_object(
        'report_date', rr.report_date, 'report_snapshot_id', rr.report_snapshot_id,
        'byte_sha256', rr.byte_sha256
      ) order by rr.report_date) from private.site_release_reservation_reports rr
        where rr.reservation_id = reservation.id),
      'idempotent', true
    );
  end if;
  select * into draft from private.editorial_drafts where id = request.draft_id for update;
  if draft.status <> 'publishing' or draft.base_site_release_id is distinct from (
    select target_site_release_id from private.release_current_pointer where singleton
  ) then raise exception 'Editorial base release is no longer current'; end if;
  select count(distinct sr.report_date) into expected_count
  from private.site_release_reports sr
  join private.report_snapshot_items si on si.report_snapshot_id = sr.report_snapshot_id
  join private.editorial_draft_items di on di.draft_id = draft.id and di.item_id = si.item_id
  where sr.site_release_id = draft.base_site_release_id
    and (not (di.patch ? 'report_hidden')
      or sr.report_date = (di.patch ->> 'report_date')::date);
  supplied_count := jsonb_array_length(report_objects);
  select count(distinct (value ->> 'report_date')) into supplied_distinct_count
    from jsonb_array_elements(report_objects);
  if expected_count = 0 or supplied_count <> expected_count or supplied_distinct_count <> supplied_count
    or exists (
      select 1
      from private.site_release_reports expected_ref
      join private.report_snapshot_items expected_item
        on expected_item.report_snapshot_id = expected_ref.report_snapshot_id
      join private.editorial_draft_items expected_draft_item
        on expected_draft_item.draft_id = draft.id and expected_draft_item.item_id = expected_item.item_id
      where expected_ref.site_release_id = draft.base_site_release_id
        and (not (expected_draft_item.patch ? 'report_hidden')
          or expected_ref.report_date = (expected_draft_item.patch ->> 'report_date')::date)
        and not exists (
          select 1 from jsonb_array_elements(report_objects) supplied
          where supplied ->> 'report_date' = expected_ref.report_date::text
        )
    ) then
    raise exception 'Editorial report object coverage mismatch';
  end if;
  for object in select value from jsonb_array_elements(report_objects) loop
    v_report_date := (object ->> 'report_date')::date;
    if object ->> 'byte_sha256' !~ '^[a-f0-9]{64}$'
      or object ->> 'object_key' <> 'report-snapshots/sha256/' || (object ->> 'byte_sha256') || '.json'
      or (object ->> 'byte_length')::bigint <= 0
      or jsonb_typeof(object -> 'parsed_document') <> 'object'
      or object #>> '{parsed_document,date}' <> v_report_date::text
      or not exists (
        select 1 from private.site_release_reports sr
        join private.report_snapshot_items si on si.report_snapshot_id = sr.report_snapshot_id
        join private.editorial_draft_items di on di.draft_id = draft.id and di.item_id = si.item_id
        where sr.site_release_id = draft.base_site_release_id and sr.report_date = v_report_date
          and (not (di.patch ? 'report_hidden')
            or sr.report_date = (di.patch ->> 'report_date')::date)
      ) then raise exception 'Invalid editorial report object'; end if;
    if exists (
      select 1 from private.site_release_reports base_ref
      where base_ref.site_release_id = draft.base_site_release_id
        and base_ref.report_date = v_report_date
        and base_ref.byte_sha256 = object ->> 'byte_sha256'
    ) then raise exception 'Editorial publish contains a no-op report'; end if;
    if exists (
      select 1 from private.site_release_reservation_reports rr
      where rr.reservation_id = reservation.id and rr.report_date = v_report_date
    ) then raise exception 'Duplicate editorial report date'; end if;
  end loop;
  for object in select value from jsonb_array_elements(report_objects) loop
    v_report_date := (object ->> 'report_date')::date;
    insert into private.report_snapshots(
      report_date, report_version, parsed_document, object_key, byte_length, byte_sha256, serializer_version
    ) values (
      v_report_date,
      (select coalesce(max(report_version), 0) + 1 from private.report_snapshots where private.report_snapshots.report_date = v_report_date),
      object -> 'parsed_document', object ->> 'object_key', (object ->> 'byte_length')::bigint,
      object ->> 'byte_sha256', 'daily-json-c14n-v1'
    ) returning id into snapshot_id;
    first_snapshot_id := coalesce(first_snapshot_id, snapshot_id);
    staged_snapshot_ids := array_append(staged_snapshot_ids, snapshot_id);
    insert into private.report_snapshot_items(
      report_snapshot_id, item_id, revision_id, override_id, batch_id, ordinal, materialized_document
    )
    select snapshot_id, base_item.item_id, base_item.revision_id,
      coalesce(staged.override_id, base_item.override_id), base_item.batch_id, base_item.ordinal, document_item.value
    from private.site_release_reports base_ref
    join private.report_snapshot_items base_item on base_item.report_snapshot_id = base_ref.report_snapshot_id
    join lateral jsonb_array_elements(object #> '{parsed_document,items}') document_item(value)
      on document_item.value ->> 'id' = base_item.item_id
    left join private.editorial_staged_overrides staged
      on staged.publish_request_id = request.id and staged.item_id = base_item.item_id
    where base_ref.site_release_id = draft.base_site_release_id and base_ref.report_date = v_report_date;
    if (select count(*) from private.report_snapshot_items where report_snapshot_id = snapshot_id)
      <> jsonb_array_length(object #> '{parsed_document,items}') then
      raise exception 'Editorial report item identity mismatch';
    end if;
  end loop;
  -- Staged overrides are inert until finalization; create them after report validation.
  for object in
    select to_jsonb(i) from private.editorial_draft_items i
    where i.draft_id = draft.id and not (i.patch ? 'report_hidden')
  loop
    if exists (
      select 1 from private.editorial_overrides active_override
      where active_override.item_id = object ->> 'item_id' and active_override.status = 'active'
        and active_override.id is distinct from nullif(object ->> 'base_override_id', '')::uuid
    ) or (
      nullif(object ->> 'base_override_id', '') is not null and not exists (
        select 1 from private.editorial_overrides expected_override
        where expected_override.id = (object ->> 'base_override_id')::uuid and expected_override.status = 'active'
      )
    ) then raise exception 'Editorial override base conflict'; end if;
    insert into private.editorial_overrides(
      item_id, base_revision_id, patch, created_by, reason, status
    ) values (
      object ->> 'item_id', (object ->> 'base_revision_id')::uuid,
      jsonb_strip_nulls(object -> 'patch'), request.requested_by, request.reason, 'staged'
    ) returning id into staged_override_id;
    insert into private.editorial_staged_overrides(publish_request_id, item_id, override_id)
    values (request.id, object ->> 'item_id', staged_override_id);
  end loop;
  insert into private.site_release_reservations(expected_predecessor_id, report_snapshot_id)
  values (draft.base_site_release_id, first_snapshot_id) returning * into reservation;
  insert into private.site_release_reservation_reports(reservation_id, report_date, report_snapshot_id, byte_sha256)
  select reservation.id, base_ref.report_date, base_ref.report_snapshot_id, base_ref.byte_sha256
  from private.site_release_reports base_ref
  where base_ref.site_release_id = draft.base_site_release_id
    and not exists (
      select 1 from jsonb_array_elements(report_objects) supplied
      where (supplied ->> 'report_date')::date = base_ref.report_date
    );
  insert into private.site_release_reservation_reports(reservation_id, report_date, report_snapshot_id, byte_sha256)
  select reservation.id, snapshot.report_date, snapshot.id, snapshot.byte_sha256
  from private.report_snapshots snapshot
  where snapshot.id = any(staged_snapshot_ids);
  -- Attach staged override identities after all snapshot IDs are known.
  update private.report_snapshot_items snapshot_item set override_id = staged.override_id
  from private.editorial_staged_overrides staged
  where staged.publish_request_id = request.id
    and staged.item_id = snapshot_item.item_id
    and snapshot_item.report_snapshot_id = any(staged_snapshot_ids);
  update private.editorial_publish_requests set reservation_id = reservation.id, updated_at = clock_timestamp()
    where id = request.id;
  return jsonb_build_object(
    'reservation_id', reservation.id, 'site_release_id', reservation.id,
    'site_release_sequence', reservation.sequence,
    'expected_predecessor_id', reservation.expected_predecessor_id,
    'reports', (select jsonb_agg(jsonb_build_object(
      'report_date', rr.report_date, 'report_snapshot_id', rr.report_snapshot_id,
      'byte_sha256', rr.byte_sha256
    ) order by rr.report_date) from private.site_release_reservation_reports rr
      where rr.reservation_id = reservation.id),
    'idempotent', false
  );
end;
$$;

create or replace function private.finalize_editorial_release_v1(
  publish_request_id uuid,
  manifest_object_key text,
  manifest_byte_length bigint,
  manifest_sha256 text,
  content_root_sha256 text,
  dispatch_id uuid,
  dispatch_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare request private.editorial_publish_requests%rowtype;
declare draft private.editorial_drafts%rowtype;
declare reservation private.site_release_reservations%rowtype;
declare base_release private.site_releases%rowtype;
begin
  perform pg_advisory_xact_lock(42002);
  select * into request from private.editorial_publish_requests where id = publish_request_id for update;
  if request.status = 'completed' then
    return jsonb_build_object('site_release_id', request.site_release_id, 'idempotent', true);
  end if;
  if request.status <> 'claimed' or request.lease_expires_at <= clock_timestamp()
    or request.reservation_id is null then raise exception 'Editorial publish request is not finalizable'; end if;
  perform private.require_setting_v1('admin_publish');
  perform private.require_setting_v1('publication');
  if dispatch_payload ->> 'mode' <> 'production' then
    raise exception using errcode = '22023', message = 'Editorial release requires production mode';
  end if;
  select * into draft from private.editorial_drafts where id = request.draft_id for update;
  select * into reservation from private.site_release_reservations where id = request.reservation_id for update;
  select * into base_release from private.site_releases where id = draft.base_site_release_id;
  if jsonb_typeof(dispatch_payload) <> 'object'
    or dispatch_payload ->> 'dispatch_id' <> dispatch_id::text
    or dispatch_payload ->> 'site_release_id' <> reservation.id::text
    or (dispatch_payload ->> 'site_release_sequence')::bigint <> reservation.sequence
    or dispatch_payload ->> 'expected_predecessor_id'
      is distinct from reservation.expected_predecessor_id::text
    or dispatch_payload ->> 'expected_content_sha' <> content_root_sha256
    or dispatch_payload ->> 'code_sha' !~ '^[a-f0-9]{40}$'
    or nullif(btrim(dispatch_payload ->> 'build_environment_version'), '') is null then
    raise exception using errcode = '22023', message = 'Editorial release dispatch identity mismatch';
  end if;
  if reservation.status <> 'reserved' or reservation.expires_at <= clock_timestamp()
    or reservation.expected_predecessor_id is distinct from (
      select target_site_release_id from private.release_current_pointer where singleton
    ) or manifest_sha256 !~ '^[a-f0-9]{64}$'
    or manifest_object_key <> 'site-manifests/sha256/' || manifest_sha256 || '.json'
    or content_root_sha256 !~ '^[a-f0-9]{64}$' or manifest_byte_length <= 0 then
    raise exception 'Editorial release finalization conflict';
  end if;
  insert into private.site_releases(
    id, sequence, expected_predecessor_id, manifest_object_key, manifest_byte_length,
    manifest_sha256, content_root_sha256, schema_version, taxonomy_version,
    serializer_version, search_contract_version, source_contract_version,
    structured_cutover_date, no_report_days
  ) values (
    reservation.id, reservation.sequence, reservation.expected_predecessor_id,
    manifest_object_key, manifest_byte_length, manifest_sha256, content_root_sha256,
    base_release.schema_version, base_release.taxonomy_version, base_release.serializer_version,
    base_release.search_contract_version, base_release.source_contract_version,
    base_release.structured_cutover_date, base_release.no_report_days
  );
  insert into private.site_release_reports(site_release_id, report_date, report_snapshot_id, byte_sha256)
  select reservation.id, report_date, report_snapshot_id, byte_sha256
  from private.site_release_reservation_reports where reservation_id = reservation.id;
  update private.editorial_overrides active_override set status = 'superseded'
  where active_override.status = 'active' and exists (
    select 1 from private.editorial_staged_overrides staged
    where staged.publish_request_id = request.id and staged.item_id = active_override.item_id
  );
  update private.editorial_overrides staged_override set
    status = case when staged_override.patch = '{}'::jsonb then 'cleared' else 'active' end
  where staged_override.status = 'staged' and exists (
    select 1 from private.editorial_staged_overrides staged
    where staged.publish_request_id = request.id and staged.override_id = staged_override.id
  );
  insert into private.content_outbox(site_release_id, dispatch_id, payload)
  values (reservation.id, dispatch_id, dispatch_payload);
  insert into private.release_deployment_attempts(site_release_id, dispatch_id, event_type)
  values (reservation.id, dispatch_id, 'queued');
  update private.site_release_reservations set status = 'finalized' where id = reservation.id;
  update private.editorial_publish_requests set status = 'completed', site_release_id = reservation.id,
    lease_expires_at = null, updated_at = clock_timestamp() where id = request.id;
  update private.editorial_drafts set status = 'published', row_version = row_version + 1,
    updated_at = clock_timestamp() where id = draft.id;
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id,
    idempotency_key, target, after_sha256, result
  )
  select queued.actor_sub, queued.actor_email, queued.actor_role,
    'draft.publish.finalize', request.reason, queued.request_id,
    request.idempotency_key::text,
    jsonb_build_object(
      'draft_id', draft.id,
      'publish_request_id', request.id,
      'site_release_id', reservation.id
    ), content_root_sha256, 'published'
  from private.content_audit_log queued
  where queued.action = 'draft.publish'
    and queued.idempotency_key = request.idempotency_key::text
  order by queued.id desc
  limit 1;
  return jsonb_build_object(
    'site_release_id', reservation.id, 'site_release_sequence', reservation.sequence,
    'expected_predecessor_id', reservation.expected_predecessor_id,
    'dispatch_id', dispatch_id, 'idempotent', false
  );
end;
$$;

create or replace function private.fail_editorial_publish_request_v1(
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
  select * into request from private.editorial_publish_requests where id = publish_request_id for update;
  if request.id is null or request.status <> 'claimed' or request.locked_by <> worker_id then
    raise exception 'Editorial publish failure ownership conflict';
  end if;
  update private.editorial_publish_requests set
    status = 'failed',
    error_code = left(fail_editorial_publish_request_v1.error_code, 200),
    lease_expires_at = null, updated_at = clock_timestamp() where id = request.id;
  update private.editorial_drafts set status = 'failed', row_version = row_version + 1,
    updated_at = clock_timestamp() where id = request.draft_id and status = 'publishing';
  update private.site_release_reservations set status = 'abandoned'
    where id = request.reservation_id and status = 'reserved';
  update private.editorial_overrides set status = 'cleared'
    where status = 'staged' and id in (
      select staged.override_id
      from private.editorial_staged_overrides staged
      where staged.publish_request_id = request.id
    );
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id,
    idempotency_key, target, result
  )
  select queued.actor_sub, queued.actor_email, queued.actor_role,
    'draft.publish.fail', request.reason, queued.request_id,
    request.idempotency_key::text,
    jsonb_build_object('draft_id', request.draft_id, 'publish_request_id', request.id),
    left(fail_editorial_publish_request_v1.error_code, 200)
  from private.content_audit_log queued
  where queued.action = 'draft.publish'
    and queued.idempotency_key = request.idempotency_key::text
  order by queued.id desc
  limit 1;
end;
$$;

create or replace function private.update_content_setting_v1(
  setting_key text,
  enabled boolean,
  expected_row_version bigint,
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
declare actor record;
declare setting private.content_settings%rowtype;
declare existing jsonb;
declare result jsonb;
begin
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-control', 'settings.update', body_sha256, array['Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-control', 'settings.update', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;
  if char_length(btrim(reason)) < 8 or typed_confirmation <> concat(
    case when enabled then 'ENABLE ' else 'DISABLE ' end, upper(setting_key)
  ) then raise exception 'Reason and typed confirmation are required'; end if;
  update private.content_settings s set enabled = update_content_setting_v1.enabled,
    row_version = row_version + 1, updated_by = actor.actor_sub, updated_at = clock_timestamp()
  where s.setting_key = update_content_setting_v1.setting_key
    and s.row_version = expected_row_version
  returning * into setting;
  if setting.setting_key is null then raise exception 'Setting row version conflict'; end if;
  result := jsonb_build_object('setting_key', setting.setting_key, 'enabled', setting.enabled,
    'row_version', setting.row_version);
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id, idempotency_key, target, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'settings.update', reason,
    actor.assertion_jti::text, idempotency_key::text, result, 'updated'
  );
  perform private.complete_admin_idempotency_v1('content-control', 'settings.update', idempotency_key, result);
  return result;
end;
$$;

create or replace function private.upsert_admin_role_v1(
  principal_sub text,
  display_email text,
  principal_status text,
  role text,
  valid_until timestamptz,
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
declare actor record;
declare existing jsonb;
declare result jsonb;
begin
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-control', 'roles.update', body_sha256, array['Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-control', 'roles.update', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;
  if nullif(btrim(principal_sub), '') is null or role not in ('Viewer','Editor','Publisher','Owner')
    or principal_status not in ('active','disabled') or char_length(btrim(reason)) < 8
    or typed_confirmation <> concat('SET ROLE ', role, ' FOR ', principal_sub) then
    raise exception 'Invalid role mutation or typed confirmation';
  end if;
  insert into private.admin_principals(access_sub, display_email, status)
  values (principal_sub, display_email, principal_status)
  on conflict on constraint admin_principals_pkey do update set display_email = excluded.display_email,
    status = excluded.status, updated_at = clock_timestamp();
  update private.admin_role_bindings set valid_until = clock_timestamp()
    where principal_id = principal_sub
      and private.admin_role_bindings.role = upsert_admin_role_v1.role
      and (private.admin_role_bindings.valid_until is null or private.admin_role_bindings.valid_until > clock_timestamp());
  insert into private.admin_role_bindings(principal_id, role, valid_until)
  values (principal_sub, role, valid_until);
  result := jsonb_build_object('principal_sub', principal_sub, 'role', role,
    'status', principal_status, 'valid_until', valid_until);
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id, idempotency_key, target, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'roles.update', reason,
    actor.assertion_jti::text, idempotency_key::text, result, 'updated'
  );
  perform private.complete_admin_idempotency_v1('content-control', 'roles.update', idempotency_key, result);
  return result;
end;
$$;

create or replace function private.global_suppress_item_v1(
  item_id text,
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
declare actor record;
declare existing jsonb;
declare suppression private.global_suppressions%rowtype;
declare suppression_request private.global_suppression_requests%rowtype;
declare current_release_id uuid;
declare result jsonb;
begin
  perform private.require_setting_v1('global_suppression');
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-control', 'global.suppress', body_sha256, array['Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-control', 'global.suppress', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;
  if char_length(btrim(reason)) < 8 or typed_confirmation <> concat('SUPPRESS ', item_id)
    or not exists (select 1 from private.content_items where id = item_id) then
    raise exception 'Invalid suppression request';
  end if;
  if exists (select 1 from private.global_suppressions where private.global_suppressions.item_id = global_suppress_item_v1.item_id and active) then
    raise exception 'Item is already globally suppressed';
  end if;
  select target_site_release_id into current_release_id
  from private.release_current_pointer
  where singleton;
  if current_release_id is null or not exists (
    select 1
    from private.site_release_reports release_report
    join private.report_snapshot_items snapshot_item
      on snapshot_item.report_snapshot_id = release_report.report_snapshot_id
    where release_report.site_release_id = current_release_id
      and snapshot_item.item_id = global_suppress_item_v1.item_id
  ) then
    raise exception 'Suppressed item is not present in the current release';
  end if;
  insert into private.global_suppressions(item_id, reason, created_by, assertion_jti)
  values (item_id, reason, actor.actor_sub, actor.assertion_jti)
  returning * into suppression;
  update private.global_suppressions set active = false where id = suppression.id;
  insert into private.global_suppression_requests(
    suppression_id, item_id, base_site_release_id, requested_by, requested_email,
    requested_role, request_jti, reason, idempotency_key
  ) values (
    suppression.id, item_id, current_release_id, actor.actor_sub, actor.actor_email,
    actor.actor_role, actor.assertion_jti, reason, idempotency_key
  ) returning * into suppression_request;
  result := jsonb_build_object(
    'suppression_id', suppression.id,
    'suppression_request_id', suppression_request.id,
    'item_id', item_id,
    'active', false,
    'status', suppression_request.status
  );
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id, idempotency_key, target, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'global.suppress', reason,
    actor.assertion_jti::text, idempotency_key::text, result, 'queued'
  );
  perform private.complete_admin_idempotency_v1('content-control', 'global.suppress', idempotency_key, result);
  return result;
end;
$$;

create or replace function private.authorize_production_reconcile_v1(
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
declare actor record;
declare existing jsonb;
declare result jsonb;
declare pointer_generation bigint;
begin
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-control', 'production.reconcile', body_sha256, array['Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-control', 'production.reconcile', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;
  if char_length(btrim(reason)) < 8 or typed_confirmation <> 'RECONCILE PRODUCTION' then
    raise exception 'Invalid production reconciliation request';
  end if;
  select generation into pointer_generation
  from private.release_current_pointer
  where singleton;
  result := jsonb_build_object(
    'authorized', true,
    'expected_pointer_generation', pointer_generation
  );
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id,
    idempotency_key, target, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role,
    'production.reconcile.authorize', reason, actor.assertion_jti::text,
    idempotency_key::text,
    jsonb_build_object('expected_pointer_generation', pointer_generation),
    'authorized'
  );
  perform private.complete_admin_idempotency_v1(
    'content-control', 'production.reconcile', idempotency_key, result
  );
  return result;
end;
$$;

create or replace function private.claim_global_suppression_request_v1(
  worker_id text,
  lease_seconds integer default 300
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare request private.global_suppression_requests%rowtype;
begin
  perform private.require_setting_v1('global_suppression');
  perform private.require_setting_v1('publication');
  select * into request
  from private.global_suppression_requests
  where status in ('queued', 'failed')
    or (status = 'claimed' and lease_expires_at <= clock_timestamp())
  order by inserted_at
  for update skip locked
  limit 1;
  if request.id is null then return null; end if;
  update private.global_suppression_requests
  set status = 'claimed',
      locked_by = worker_id,
      lease_expires_at = clock_timestamp() + make_interval(secs => least(greatest(lease_seconds, 60), 600)),
      updated_at = clock_timestamp()
  where id = request.id
  returning * into request;
  return to_jsonb(request) - array['requested_email','request_jti'];
end;
$$;

create or replace function private.get_global_suppression_input_v1(
  suppression_request_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare request private.global_suppression_requests%rowtype;
declare release private.site_releases%rowtype;
declare artifact private.release_artifacts%rowtype;
declare reports jsonb;
begin
  perform private.require_setting_v1('global_suppression');
  perform private.require_setting_v1('publication');
  select * into request
  from private.global_suppression_requests
  where id = suppression_request_id;
  if request.id is null or request.status <> 'claimed'
    or request.lease_expires_at <= clock_timestamp() then
    raise exception 'Global suppression request is not actively claimed';
  end if;
  if request.base_site_release_id is distinct from (
    select target_site_release_id from private.release_current_pointer where singleton
  ) then
    raise exception 'Global suppression base release is no longer current';
  end if;
  select * into release from private.site_releases where id = request.base_site_release_id;
  select * into artifact from private.release_artifacts where site_release_id = release.id;
  if release.id is null or artifact.site_release_id is null then
    raise exception 'Global suppression base release is unavailable';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'report_date', release_report.report_date,
    'report_snapshot_id', release_report.report_snapshot_id,
    'object_key', snapshot.object_key,
    'byte_length', snapshot.byte_length,
    'byte_sha256', snapshot.byte_sha256
  ) order by release_report.report_date), '[]'::jsonb)
  into reports
  from private.site_release_reports release_report
  join private.report_snapshots snapshot on snapshot.id = release_report.report_snapshot_id
  where release_report.site_release_id = release.id
    and exists (
      select 1 from private.report_snapshot_items snapshot_item
      where snapshot_item.report_snapshot_id = release_report.report_snapshot_id
        and snapshot_item.item_id = request.item_id
    );
  if jsonb_array_length(reports) = 0 then
    raise exception 'Suppressed item is absent from the base release';
  end if;
  return jsonb_build_object(
    'suppression_request_id', request.id,
    'item_id', request.item_id,
    'base_site_release_id', release.id,
    'code_sha', artifact.code_sha,
    'build_environment_version', artifact.build_environment_version,
    'schema_version', release.schema_version,
    'taxonomy_version', release.taxonomy_version,
    'serializer_version', release.serializer_version,
    'search_contract_version', release.search_contract_version,
    'source_contract_version', release.source_contract_version,
    'structured_cutover_date', release.structured_cutover_date,
    'no_report_days', release.no_report_days,
    'reports', reports
  );
end;
$$;

create or replace function private.stage_global_suppression_release_v1(
  suppression_request_id uuid,
  report_objects jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare request private.global_suppression_requests%rowtype;
declare reservation private.site_release_reservations%rowtype;
declare object jsonb;
declare report_date_value date;
declare base_snapshot_id uuid;
declare snapshot_id uuid;
declare first_snapshot_id uuid;
declare staged_snapshot_ids uuid[] := '{}'::uuid[];
declare expected_count integer;
declare supplied_count integer;
declare supplied_distinct_count integer;
begin
  perform private.require_setting_v1('global_suppression');
  perform private.require_setting_v1('publication');
  if jsonb_typeof(report_objects) <> 'array' then
    raise exception 'Global suppression report objects must be an array';
  end if;
  perform pg_advisory_xact_lock(42002);
  select * into request
  from private.global_suppression_requests
  where id = suppression_request_id
  for update;
  if request.id is null or request.status <> 'claimed'
    or request.lease_expires_at <= clock_timestamp() then
    raise exception 'Global suppression request is not actively claimed';
  end if;
  if request.base_site_release_id is distinct from (
    select target_site_release_id from private.release_current_pointer where singleton
  ) then
    raise exception 'Global suppression base release is no longer current';
  end if;
  if request.reservation_id is not null then
    select * into reservation
    from private.site_release_reservations
    where id = request.reservation_id;
    return jsonb_build_object(
      'reservation_id', reservation.id,
      'site_release_id', reservation.id,
      'site_release_sequence', reservation.sequence,
      'expected_predecessor_id', reservation.expected_predecessor_id,
      'reports', (select jsonb_agg(jsonb_build_object(
        'report_date', refs.report_date,
        'report_snapshot_id', refs.report_snapshot_id,
        'byte_sha256', refs.byte_sha256
      ) order by refs.report_date)
      from private.site_release_reservation_reports refs
      where refs.reservation_id = reservation.id),
      'idempotent', true
    );
  end if;

  select count(*) into expected_count
  from private.site_release_reports release_report
  where release_report.site_release_id = request.base_site_release_id
    and exists (
      select 1 from private.report_snapshot_items snapshot_item
      where snapshot_item.report_snapshot_id = release_report.report_snapshot_id
        and snapshot_item.item_id = request.item_id
    );
  supplied_count := jsonb_array_length(report_objects);
  select count(distinct value ->> 'report_date') into supplied_distinct_count
  from jsonb_array_elements(report_objects);
  if expected_count = 0 or supplied_count <> expected_count
    or supplied_distinct_count <> supplied_count then
    raise exception 'Global suppression report object coverage mismatch';
  end if;

  for object in select value from jsonb_array_elements(report_objects) loop
    report_date_value := (object ->> 'report_date')::date;
    select release_report.report_snapshot_id into base_snapshot_id
    from private.site_release_reports release_report
    where release_report.site_release_id = request.base_site_release_id
      and release_report.report_date = report_date_value
      and exists (
        select 1 from private.report_snapshot_items snapshot_item
        where snapshot_item.report_snapshot_id = release_report.report_snapshot_id
          and snapshot_item.item_id = request.item_id
      );
    if base_snapshot_id is null
      or object ->> 'byte_sha256' !~ '^[a-f0-9]{64}$'
      or object ->> 'object_key' <> 'report-snapshots/sha256/' || (object ->> 'byte_sha256') || '.json'
      or (object ->> 'byte_length')::bigint <= 0
      or jsonb_typeof(object -> 'parsed_document') <> 'object'
      or jsonb_typeof(object #> '{parsed_document,items}') <> 'array'
      or jsonb_typeof(object #> '{parsed_document,batches}') <> 'array'
      or object #>> '{parsed_document,date}' <> report_date_value::text
      or exists (
        select 1 from jsonb_array_elements(object #> '{parsed_document,items}') item
        where item ->> 'id' = request.item_id
      )
      or exists (
        select 1
        from jsonb_array_elements(object #> '{parsed_document,batches}') batch,
             jsonb_array_elements_text(batch -> 'item_ids') batch_item(item_id)
        where batch_item.item_id = request.item_id
      )
      or (select count(*) from jsonb_array_elements(object #> '{parsed_document,items}')) <>
         (select count(*) from private.report_snapshot_items
          where report_snapshot_id = base_snapshot_id and item_id <> request.item_id)
      or exists (
        select 1 from private.report_snapshot_items base_item
        where base_item.report_snapshot_id = base_snapshot_id
          and base_item.item_id <> request.item_id
          and not exists (
            select 1 from jsonb_array_elements(object #> '{parsed_document,items}') supplied_item
            where supplied_item ->> 'id' = base_item.item_id
          )
      )
      or exists (
        select 1 from jsonb_array_elements(object #> '{parsed_document,items}') supplied_item
        where not exists (
          select 1 from private.report_snapshot_items base_item
          where base_item.report_snapshot_id = base_snapshot_id
            and base_item.item_id = supplied_item ->> 'id'
            and base_item.item_id <> request.item_id
        )
      ) then
      raise exception 'Invalid global suppression report object';
    end if;

    select id into snapshot_id
    from private.report_snapshots
    where report_date = report_date_value
      and byte_sha256 = object ->> 'byte_sha256'
      and object_key = object ->> 'object_key'
      and byte_length = (object ->> 'byte_length')::bigint;
    if snapshot_id is null then
      insert into private.report_snapshots(
        report_date, report_version, parsed_document, object_key,
        byte_length, byte_sha256, serializer_version
      ) values (
        report_date_value,
        (select coalesce(max(report_version), 0) + 1
         from private.report_snapshots
         where private.report_snapshots.report_date = report_date_value),
        object -> 'parsed_document', object ->> 'object_key',
        (object ->> 'byte_length')::bigint, object ->> 'byte_sha256',
        'daily-json-c14n-v1'
      ) returning id into snapshot_id;
    end if;
    first_snapshot_id := coalesce(first_snapshot_id, snapshot_id);
    staged_snapshot_ids := array_append(staged_snapshot_ids, snapshot_id);
    insert into private.report_snapshot_items(
      report_snapshot_id, item_id, revision_id, override_id,
      batch_id, ordinal, materialized_document
    )
    select snapshot_id, base_item.item_id, base_item.revision_id, base_item.override_id,
      base_item.batch_id, base_item.ordinal, supplied_item.value
    from private.report_snapshot_items base_item
    join lateral jsonb_array_elements(object #> '{parsed_document,items}') supplied_item(value)
      on supplied_item.value ->> 'id' = base_item.item_id
    where base_item.report_snapshot_id = base_snapshot_id
      and base_item.item_id <> request.item_id
    on conflict on constraint report_snapshot_items_pkey do nothing;
  end loop;

  insert into private.site_release_reservations(expected_predecessor_id, report_snapshot_id)
  values (request.base_site_release_id, first_snapshot_id)
  returning * into reservation;
  insert into private.site_release_reservation_reports(
    reservation_id, report_date, report_snapshot_id, byte_sha256
  )
  select reservation.id, base_ref.report_date, base_ref.report_snapshot_id, base_ref.byte_sha256
  from private.site_release_reports base_ref
  where base_ref.site_release_id = request.base_site_release_id
    and not exists (
      select 1 from private.report_snapshots staged_snapshot
      where staged_snapshot.id = any(staged_snapshot_ids)
        and staged_snapshot.report_date = base_ref.report_date
    );
  insert into private.site_release_reservation_reports(
    reservation_id, report_date, report_snapshot_id, byte_sha256
  )
  select reservation.id, staged_snapshot.report_date, staged_snapshot.id, staged_snapshot.byte_sha256
  from private.report_snapshots staged_snapshot
  where staged_snapshot.id = any(staged_snapshot_ids);
  update private.global_suppression_requests
  set reservation_id = reservation.id, updated_at = clock_timestamp()
  where id = request.id;
  return jsonb_build_object(
    'reservation_id', reservation.id,
    'site_release_id', reservation.id,
    'site_release_sequence', reservation.sequence,
    'expected_predecessor_id', reservation.expected_predecessor_id,
    'reports', (select jsonb_agg(jsonb_build_object(
      'report_date', refs.report_date,
      'report_snapshot_id', refs.report_snapshot_id,
      'byte_sha256', refs.byte_sha256
    ) order by refs.report_date)
    from private.site_release_reservation_reports refs
    where refs.reservation_id = reservation.id),
    'idempotent', false
  );
end;
$$;

create or replace function private.finalize_global_suppression_release_v1(
  suppression_request_id uuid,
  manifest_object_key text,
  manifest_byte_length bigint,
  manifest_sha256 text,
  content_root_sha256 text,
  dispatch_id uuid,
  dispatch_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare request private.global_suppression_requests%rowtype;
declare reservation private.site_release_reservations%rowtype;
declare base_release private.site_releases%rowtype;
begin
  perform private.require_setting_v1('global_suppression');
  perform private.require_setting_v1('publication');
  perform pg_advisory_xact_lock(42002);
  select * into request
  from private.global_suppression_requests
  where id = suppression_request_id
  for update;
  if request.status = 'completed' then
    return jsonb_build_object('site_release_id', request.site_release_id, 'idempotent', true);
  end if;
  if request.id is null or request.status <> 'claimed'
    or request.lease_expires_at <= clock_timestamp()
    or request.reservation_id is null then
    raise exception 'Global suppression request is not finalizable';
  end if;
  select * into reservation
  from private.site_release_reservations
  where id = request.reservation_id
  for update;
  select * into base_release
  from private.site_releases
  where id = request.base_site_release_id;
  if reservation.status <> 'reserved'
    or reservation.expires_at <= clock_timestamp()
    or reservation.expected_predecessor_id is distinct from (
      select target_site_release_id from private.release_current_pointer where singleton
    )
    or manifest_sha256 !~ '^[a-f0-9]{64}$'
    or manifest_object_key <> 'site-manifests/sha256/' || manifest_sha256 || '.json'
    or content_root_sha256 !~ '^[a-f0-9]{64}$'
    or manifest_byte_length <= 0
    or dispatch_payload ->> 'mode' <> 'production'
    or dispatch_payload ->> 'dispatch_id' <> dispatch_id::text
    or dispatch_payload ->> 'site_release_id' <> reservation.id::text
    or (dispatch_payload ->> 'site_release_sequence')::bigint <> reservation.sequence
    or dispatch_payload ->> 'expected_predecessor_id'
      is distinct from reservation.expected_predecessor_id::text
    or dispatch_payload ->> 'expected_content_sha' <> content_root_sha256 then
    raise exception 'Global suppression release finalization conflict';
  end if;
  insert into private.site_releases(
    id, sequence, expected_predecessor_id, manifest_object_key, manifest_byte_length,
    manifest_sha256, content_root_sha256, schema_version, taxonomy_version,
    serializer_version, search_contract_version, source_contract_version,
    structured_cutover_date, no_report_days
  ) values (
    reservation.id, reservation.sequence, reservation.expected_predecessor_id,
    manifest_object_key, manifest_byte_length, manifest_sha256, content_root_sha256,
    base_release.schema_version, base_release.taxonomy_version, base_release.serializer_version,
    base_release.search_contract_version, base_release.source_contract_version,
    base_release.structured_cutover_date, base_release.no_report_days
  );
  insert into private.site_release_reports(
    site_release_id, report_date, report_snapshot_id, byte_sha256
  )
  select reservation.id, report_date, report_snapshot_id, byte_sha256
  from private.site_release_reservation_reports
  where reservation_id = reservation.id;
  insert into private.content_outbox(site_release_id, dispatch_id, payload)
  values (reservation.id, dispatch_id, dispatch_payload);
  insert into private.release_deployment_attempts(site_release_id, dispatch_id, event_type)
  values (reservation.id, dispatch_id, 'queued');
  update private.site_release_reservations
  set status = 'finalized'
  where id = reservation.id;
  update private.global_suppressions
  set active = true
  where id = request.suppression_id;
  update private.daily_report_items
  set report_hidden = true
  where item_id = request.item_id;
  update private.global_suppression_requests
  set status = 'completed', site_release_id = reservation.id,
      lease_expires_at = null, updated_at = clock_timestamp()
  where id = request.id;
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id,
    idempotency_key, target, after_sha256, result
  ) values (
    request.requested_by, request.requested_email, request.requested_role,
    'global.suppress.finalize', request.reason, request.request_jti::text,
    request.idempotency_key::text,
    jsonb_build_object(
      'suppression_id', request.suppression_id,
      'item_id', request.item_id,
      'site_release_id', reservation.id
    ),
    content_root_sha256,
    'published'
  );
  return jsonb_build_object(
    'site_release_id', reservation.id,
    'site_release_sequence', reservation.sequence,
    'expected_predecessor_id', reservation.expected_predecessor_id,
    'dispatch_id', dispatch_id,
    'idempotent', false
  );
end;
$$;

create or replace function private.fail_global_suppression_request_v1(
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
  select * into request
  from private.global_suppression_requests
  where id = suppression_request_id
  for update;
  if request.id is null or request.status <> 'claimed' or request.locked_by <> worker_id then
    raise exception 'Global suppression failure ownership conflict';
  end if;
  update private.global_suppression_requests
  set status = 'failed', error_code = left(fail_global_suppression_request_v1.error_code, 200),
      lease_expires_at = null, reservation_id = null, updated_at = clock_timestamp()
  where id = request.id;
  update private.site_release_reservations
  set status = 'abandoned'
  where id = request.reservation_id and status = 'reserved';
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id,
    idempotency_key, target, result
  ) values (
    request.requested_by, request.requested_email, request.requested_role,
    'global.suppress.fail', request.reason, request.request_jti::text,
    request.idempotency_key::text,
    jsonb_build_object('suppression_id', request.suppression_id, 'item_id', request.item_id),
    left(fail_global_suppression_request_v1.error_code, 200)
  );
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
        'reserve_admin_idempotency_v1','complete_admin_idempotency_v1',
        'get_admin_dashboard_v1','list_admin_reports_v1','list_admin_releases_v1',
        'list_admin_drafts_v1','list_admin_audit_v1','create_editorial_draft_v1',
        'upsert_editorial_draft_item_v1','rebase_editorial_draft_v1','editorial_preview_payload_v1',
        'request_preview_build_v1','get_preview_build_input_v1','register_preview_build_v1',
        'fail_preview_build_v1','request_editorial_publish_v1',
        'claim_editorial_publish_request_v1','get_editorial_publish_input_v1',
        'stage_editorial_release_v1','finalize_editorial_release_v1',
        'fail_editorial_publish_request_v1','update_content_setting_v1',
        'upsert_admin_role_v1','global_suppress_item_v1',
        'authorize_production_reconcile_v1',
        'claim_global_suppression_request_v1','get_global_suppression_input_v1',
        'stage_global_suppression_release_v1','finalize_global_suppression_release_v1',
        'fail_global_suppression_request_v1'
      )
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated, service_role, content_ingestor, content_editor, content_controller, content_reader, content_deployer',
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

grant execute on function private.get_admin_dashboard_v1() to content_editor, content_controller;
grant execute on function private.list_admin_reports_v1(date, integer) to content_editor;
grant execute on function private.list_admin_releases_v1(integer) to content_editor, content_controller;
grant execute on function private.list_admin_drafts_v1(integer) to content_editor;
grant execute on function private.list_admin_audit_v1(bigint, integer) to content_editor, content_controller;
grant execute on function private.create_editorial_draft_v1(uuid, uuid, jsonb, text) to content_editor;
grant execute on function private.upsert_editorial_draft_item_v1(
  uuid, text, uuid, uuid, jsonb, bigint, text, uuid, jsonb, text
) to content_editor;
grant execute on function private.rebase_editorial_draft_v1(uuid, uuid, bigint, uuid, jsonb, text)
  to content_editor;
grant execute on function private.request_preview_build_v1(uuid, bigint, uuid, jsonb, text)
  to content_editor;
grant execute on function private.get_preview_build_input_v1(uuid, text) to content_deployer;
grant execute on function private.register_preview_build_v1(uuid, text, text, text, jsonb)
  to content_deployer;
grant execute on function private.fail_preview_build_v1(uuid, text, text) to content_deployer;
grant execute on function private.request_editorial_publish_v1(
  uuid, uuid, bigint, text, uuid, jsonb, text
) to content_editor;
grant execute on function private.claim_editorial_publish_request_v1(text, integer) to content_ingestor;
grant execute on function private.get_editorial_publish_input_v1(uuid) to content_ingestor;
grant execute on function private.stage_editorial_release_v1(uuid, jsonb) to content_ingestor;
grant execute on function private.finalize_editorial_release_v1(
  uuid, text, bigint, text, text, uuid, jsonb
) to content_ingestor;
grant execute on function private.fail_editorial_publish_request_v1(uuid, text, text) to content_ingestor;
grant execute on function private.update_content_setting_v1(
  text, boolean, bigint, text, text, uuid, jsonb, text
) to content_controller;
grant execute on function private.upsert_admin_role_v1(
  text, text, text, text, timestamptz, text, text, uuid, jsonb, text
) to content_controller;
grant execute on function private.global_suppress_item_v1(text, text, text, uuid, jsonb, text)
  to content_controller;
grant execute on function private.authorize_production_reconcile_v1(text, text, uuid, jsonb, text)
  to content_controller;
grant execute on function private.claim_global_suppression_request_v1(text, integer)
  to content_ingestor;
grant execute on function private.get_global_suppression_input_v1(uuid)
  to content_ingestor;
grant execute on function private.stage_global_suppression_release_v1(uuid, jsonb)
  to content_ingestor;
grant execute on function private.finalize_global_suppression_release_v1(
  uuid, text, bigint, text, text, uuid, jsonb
) to content_ingestor;
grant execute on function private.fail_global_suppression_request_v1(uuid, text, text)
  to content_ingestor;

commit;
