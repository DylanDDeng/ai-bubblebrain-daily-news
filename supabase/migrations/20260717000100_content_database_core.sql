begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create schema if not exists private;

do $$
declare
  role_name text;
begin
  foreach role_name in array array[
    'content_rpc_owner',
    'content_ingestor',
    'content_editor',
    'content_controller',
    'content_reader',
    'content_deployer'
  ] loop
    if not exists (select 1 from pg_roles where rolname = role_name) then
      if role_name = 'content_rpc_owner' then
        execute format(
          'create role %I nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls connection limit 20',
          role_name
        );
      else
        execute format(
          'create role %I login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls connection limit 20',
          role_name
        );
      end if;
    elsif exists (
      select 1
      from pg_roles
      where rolname = role_name
        and (rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolreplication or rolbypassrls)
    ) then
      raise exception 'Unsafe pre-existing content role: %', role_name;
    elsif role_name = 'content_rpc_owner' and exists (
      select 1 from pg_roles where rolname = role_name and rolcanlogin
    ) then
      raise exception 'Function owner role must remain NOLOGIN';
    elsif role_name <> 'content_rpc_owner' and exists (
      select 1 from pg_roles where rolname = role_name and not rolcanlogin
    ) then
      raise exception 'Runtime content role must be LOGIN: %', role_name;
    end if;
  end loop;
end;
$$;

-- The migration identity must be able to assign the dedicated NOLOGIN owner.
-- Runtime capability roles are deliberately not members of this role.
do $$
declare
  migration_role text;
begin
  for migration_role in
    select distinct candidate
    from unnest(array[current_user, session_user]) candidate
    where exists (select 1 from pg_roles where rolname = candidate)
  loop
    execute format(
      'grant content_rpc_owner to %I with set true, inherit false',
      migration_role
    );
  end loop;
end;
$$;

revoke create on schema public from public;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage, create on schema private to content_rpc_owner;
grant usage on schema extensions to content_rpc_owner;
do $$
declare
  role_name text;
begin
  execute format(
    'revoke temporary on database %I from public',
    current_database()
  );
  -- TEMP inherited from PUBLIC cannot be denied to only the capability roles.
  -- Preserve the pre-migration privilege for every existing non-content role,
  -- while keeping all content runtime identities fail-closed.
  for role_name in
    select rolname
    from pg_roles
    where rolname not in (
      'content_rpc_owner', 'content_ingestor', 'content_editor',
      'content_controller', 'content_reader', 'content_deployer'
    )
  loop
    execute format(
      'grant temporary on database %I to %I',
      current_database(), role_name
    );
  end loop;
end;
$$;

create table if not exists private.content_items (
  id text primary key check (id ~ '^n_[a-f0-9]{64}$'),
  event_id text not null check (event_id ~ '^e_[a-f0-9]{64}$'),
  identity_version integer not null check (identity_version > 0),
  source_type text not null,
  content_type text not null,
  source_id text,
  source_name text not null,
  source_homepage text,
  url text,
  canonical_url text,
  published_at timestamptz,
  published_date date,
  time_precision text not null check (time_precision in ('exact', 'date_only', 'inferred')),
  provenance_kind text not null check (
    provenance_kind in ('live_ingestion', 'legacy_structured_import')
  ),
  raw_payload_sha256 text check (
    raw_payload_sha256 is null or raw_payload_sha256 ~ '^[a-f0-9]{64}$'
  ),
  inserted_at timestamptz not null default clock_timestamp()
);

create table if not exists private.content_identity_claims (
  claim_id text primary key check (claim_id ~ '^c_[a-f0-9]{64}$'),
  item_id text not null references private.content_items(id),
  identity_version integer not null check (identity_version > 0),
  strategy text not null,
  inserted_at timestamptz not null default clock_timestamp()
);

create table if not exists private.content_item_aliases (
  alias_item_id text primary key check (alias_item_id ~ '^n_[a-f0-9]{64}$'),
  canonical_item_id text not null references private.content_items(id),
  reason text not null,
  strategy_version integer not null check (strategy_version > 0),
  inserted_at timestamptz not null default clock_timestamp(),
  check (alias_item_id <> canonical_item_id)
);

create table if not exists private.content_item_revisions (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references private.content_items(id),
  revision integer not null check (revision > 0),
  title text not null,
  summary text,
  category text not null,
  featured boolean not null default false,
  score numeric,
  reason text,
  topic_ids text[] not null default '{}',
  entity_ids text[] not null default '{}',
  related_source_ids text[] not null default '{}',
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  inserted_at timestamptz not null default clock_timestamp(),
  unique (item_id, revision),
  unique (item_id, id),
  unique (item_id, payload_sha256)
);

create table if not exists private.editorial_overrides (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references private.content_items(id),
  base_revision_id uuid not null,
  patch jsonb not null check (jsonb_typeof(patch) = 'object'),
  created_by text not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  status text not null check (status in ('staged', 'active', 'superseded', 'cleared')),
  inserted_at timestamptz not null default clock_timestamp(),
  foreign key (item_id, base_revision_id)
    references private.content_item_revisions(item_id, id)
);

create table if not exists private.content_item_topics (
  item_id text not null,
  revision_id uuid not null,
  topic_id text not null check (topic_id ~ '^topic_[a-z0-9_]{2,63}$'),
  primary key (item_id, revision_id, topic_id),
  foreign key (item_id, revision_id)
    references private.content_item_revisions(item_id, id)
);

create table if not exists private.content_item_entities (
  item_id text not null,
  revision_id uuid not null,
  entity_id text not null check (entity_id ~ '^entity_[a-z0-9_]{2,63}$'),
  primary key (item_id, revision_id, entity_id),
  foreign key (item_id, revision_id)
    references private.content_item_revisions(item_id, id)
);

create table if not exists private.content_item_relations (
  revision_id uuid not null references private.content_item_revisions(id),
  left_item_id text not null references private.content_items(id),
  right_item_id text not null references private.content_items(id),
  relation_type text not null,
  inserted_at timestamptz not null default clock_timestamp(),
  primary key (revision_id, left_item_id, right_item_id, relation_type),
  check (left_item_id < right_item_id)
);

create table if not exists private.daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  timezone text not null default 'Asia/Shanghai' check (timezone = 'Asia/Shanghai'),
  schema_version integer not null,
  identity_version integer not null,
  dedupe_version integer not null,
  taxonomy_version integer not null,
  classifier_version text not null,
  producer_version text not null,
  row_version bigint not null default 1 check (row_version > 0),
  inserted_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists private.daily_batches (
  report_id uuid not null references private.daily_reports(id),
  batch_id text not null check (batch_id in ('morning', 'afternoon', 'night', 'lateNight')),
  status text not null check (status in ('pending', 'completed')),
  generated_at timestamptz,
  primary key (report_id, batch_id),
  check (
    (status = 'completed' and generated_at is not null)
    or (status = 'pending' and generated_at is null)
  )
);

create table if not exists private.daily_report_items (
  report_id uuid not null,
  batch_id text not null,
  item_id text not null,
  revision_id uuid not null,
  ordinal integer not null check (ordinal >= 0),
  report_hidden boolean not null default false,
  primary key (report_id, item_id),
  unique (report_id, batch_id, ordinal),
  foreign key (report_id, batch_id)
    references private.daily_batches(report_id, batch_id),
  foreign key (item_id, revision_id)
    references private.content_item_revisions(item_id, id)
);

create table if not exists private.global_suppressions (
  id uuid primary key default gen_random_uuid(),
  item_id text not null references private.content_items(id),
  reason text not null,
  created_by text not null,
  assertion_jti uuid not null unique,
  active boolean not null default true,
  inserted_at timestamptz not null default clock_timestamp()
);

create table if not exists private.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  report_version integer not null check (report_version > 0),
  parsed_document jsonb not null check (jsonb_typeof(parsed_document) = 'object'),
  object_key text not null unique check (object_key ~ '^report-snapshots/sha256/[a-f0-9]{64}\.json$'),
  byte_length bigint not null check (byte_length > 0),
  byte_sha256 text not null check (byte_sha256 ~ '^[a-f0-9]{64}$'),
  serializer_version text not null,
  inserted_at timestamptz not null default clock_timestamp(),
  unique (report_date, report_version),
  unique (report_date, byte_sha256)
);

create table if not exists private.report_snapshot_items (
  report_snapshot_id uuid not null references private.report_snapshots(id),
  item_id text not null,
  revision_id uuid not null,
  override_id uuid references private.editorial_overrides(id),
  batch_id text not null check (batch_id in ('morning', 'afternoon', 'night', 'lateNight')),
  ordinal integer not null check (ordinal >= 0),
  materialized_document jsonb not null check (jsonb_typeof(materialized_document) = 'object'),
  primary key (report_snapshot_id, item_id),
  unique (report_snapshot_id, batch_id, ordinal),
  foreign key (item_id, revision_id)
    references private.content_item_revisions(item_id, id)
);

create index if not exists report_snapshot_items_title_trgm_idx
  on private.report_snapshot_items
  using gin (lower(materialized_document ->> 'title') public.gin_trgm_ops);
create index if not exists report_snapshot_items_summary_trgm_idx
  on private.report_snapshot_items
  using gin (lower(coalesce(materialized_document ->> 'summary', '')) public.gin_trgm_ops);

create sequence if not exists private.site_release_sequence_seq;

create table if not exists private.site_releases (
  id uuid primary key default gen_random_uuid(),
  sequence bigint not null default nextval('private.site_release_sequence_seq') unique,
  expected_predecessor_id uuid references private.site_releases(id),
  manifest_object_key text not null unique check (
    manifest_object_key ~ '^site-manifests/sha256/[a-f0-9]{64}\.json$'
  ),
  manifest_byte_length bigint not null check (manifest_byte_length > 0),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  content_root_sha256 text not null check (content_root_sha256 ~ '^[a-f0-9]{64}$'),
  schema_version integer not null,
  taxonomy_version integer not null,
  serializer_version text not null,
  search_contract_version text not null,
  source_contract_version text not null,
  structured_cutover_date date not null,
  no_report_days date[] not null default '{}',
  inserted_at timestamptz not null default clock_timestamp(),
  unique (manifest_sha256)
);

alter sequence private.site_release_sequence_seq owned by private.site_releases.sequence;

create table if not exists private.site_release_reservations (
  id uuid primary key default gen_random_uuid(),
  sequence bigint not null default nextval('private.site_release_sequence_seq') unique,
  expected_predecessor_id uuid references private.site_releases(id),
  report_snapshot_id uuid not null references private.report_snapshots(id),
  status text not null default 'reserved' check (status in ('reserved', 'finalized', 'abandoned')),
  expires_at timestamptz not null default (clock_timestamp() + interval '15 minutes'),
  inserted_at timestamptz not null default clock_timestamp()
);

create table if not exists private.site_release_reports (
  site_release_id uuid not null references private.site_releases(id),
  report_date date not null,
  report_snapshot_id uuid not null references private.report_snapshots(id),
  byte_sha256 text not null check (byte_sha256 ~ '^[a-f0-9]{64}$'),
  primary key (site_release_id, report_date),
  unique (site_release_id, report_snapshot_id)
);

create table if not exists private.publication_slots (
  report_date date not null,
  batch_id text not null check (batch_id in ('morning', 'afternoon', 'night', 'lateNight')),
  input_sha256 text not null check (input_sha256 ~ '^[a-f0-9]{64}$'),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  report_snapshot_id uuid references private.report_snapshots(id),
  reservation_id uuid references private.site_release_reservations(id),
  site_release_id uuid references private.site_releases(id),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (report_date, batch_id)
);

alter table private.publication_slots
  add column if not exists reservation_id uuid references private.site_release_reservations(id);

create unique index if not exists publication_slots_reservation_idx
  on private.publication_slots (reservation_id)
  where reservation_id is not null;

create table if not exists private.publication_attempts (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  batch_id text not null check (batch_id in ('morning', 'afternoon', 'night', 'lateNight')),
  input_sha256 text not null check (input_sha256 ~ '^[a-f0-9]{64}$'),
  attempt_number integer not null default 1 check (attempt_number > 0),
  trigger_kind text not null,
  worker_version text not null,
  status text not null check (status in ('started', 'succeeded', 'failed')),
  error_code text,
  error_detail text,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz
);

alter table private.publication_attempts
  add column if not exists attempt_number integer not null default 1;
alter table private.publication_attempts
  drop constraint if exists publication_attempts_report_date_batch_id_input_sha256_key;
create unique index if not exists publication_attempts_semantic_attempt_idx
  on private.publication_attempts (report_date, batch_id, input_sha256, attempt_number);
create unique index if not exists publication_attempts_one_started_idx
  on private.publication_attempts (report_date, batch_id, input_sha256)
  where status = 'started';
create index if not exists publication_attempts_latest_idx
  on private.publication_attempts (report_date, batch_id, input_sha256, attempt_number desc);

create table if not exists private.content_outbox (
  id uuid primary key default gen_random_uuid(),
  site_release_id uuid not null references private.site_releases(id),
  dispatch_id uuid not null unique,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued' check (status in (
    'queued', 'claimed', 'dispatched', 'building', 'preview_verified',
    'promoting', 'deployed', 'failed', 'dead_letter'
  )),
  locked_by text,
  locked_at timestamptz,
  lease_expires_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 8 check (max_attempts > 0),
  next_attempt_at timestamptz not null default clock_timestamp(),
  last_http_status integer,
  github_run_id bigint,
  dead_lettered_at timestamptz,
  last_error text,
  inserted_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists content_outbox_dispatch_idx
  on private.content_outbox (status, next_attempt_at, inserted_at);

create table if not exists private.release_deployment_attempts (
  id bigint generated always as identity primary key,
  site_release_id uuid not null references private.site_releases(id),
  dispatch_id uuid,
  event_type text not null check (event_type in (
    'queued', 'building', 'artifact_registered', 'preview_verified', 'preview_failed',
    'production_deployed', 'edge_verified', 'rollback_authorized',
    'rollback_deployed', 'rollback_committed', 'failed'
  )),
  evidence jsonb not null default '{}' check (jsonb_typeof(evidence) = 'object'),
  inserted_at timestamptz not null default clock_timestamp()
);

create table if not exists private.release_current_pointer (
  singleton boolean primary key default true check (singleton),
  target_site_release_id uuid not null references private.site_releases(id),
  target_release_sequence bigint not null,
  generation bigint not null check (generation > 0),
  pages_deployment_id text not null,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  artifact_sha256 text not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  build_environment_version text not null,
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists private.production_promotion_slot (
  project_key text primary key,
  site_release_id uuid not null references private.site_releases(id),
  release_sequence bigint not null,
  fencing_token bigint not null check (fencing_token > 0),
  locked_by text not null,
  lease_expires_at timestamptz not null,
  expected_pointer_generation bigint not null check (expected_pointer_generation >= 0),
  status text not null check (status in (
    'authorized', 'deploying', 'verifying', 'committed',
    'rolling_back', 'rolling_back_failed', 'reconciling'
  )),
  operation text not null check (operation in ('forward', 'rollback')),
  rollback_from_site_release_id uuid references private.site_releases(id),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists private.release_artifacts (
  site_release_id uuid primary key references private.site_releases(id),
  object_key text not null unique check (object_key ~ '^artifacts/sha256/[a-f0-9]{64}\.(tar|json)$'),
  byte_length bigint not null check (byte_length > 0),
  artifact_sha256 text not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  artifact_fingerprint_sha256 text not null check (artifact_fingerprint_sha256 ~ '^[a-f0-9]{64}$'),
  hash_algorithm text not null,
  code_sha text not null check (code_sha ~ '^[a-f0-9]{40}$'),
  build_environment_version text not null,
  production_verified_at timestamptz,
  inserted_at timestamptz not null default clock_timestamp(),
  unique (artifact_sha256)
);

alter table private.release_artifacts
  add column if not exists artifact_fingerprint_sha256 text
  check (artifact_fingerprint_sha256 ~ '^[a-f0-9]{64}$');

create table if not exists private.editorial_drafts (
  id uuid primary key default gen_random_uuid(),
  base_site_release_id uuid not null references private.site_releases(id),
  row_version bigint not null default 1 check (row_version > 0),
  owner_sub text not null,
  required_role text not null default 'Editor',
  status text not null default 'draft' check (status in (
    'draft', 'preview_building', 'preview_ready', 'stale', 'publishing',
    'published', 'failed', 'abandoned'
  )),
  inserted_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists private.editorial_draft_items (
  draft_id uuid not null references private.editorial_drafts(id),
  item_id text not null references private.content_items(id),
  base_revision_id uuid not null,
  base_override_id uuid references private.editorial_overrides(id),
  patch jsonb not null check (jsonb_typeof(patch) = 'object'),
  primary key (draft_id, item_id),
  foreign key (item_id, base_revision_id)
    references private.content_item_revisions(item_id, id)
);

create table if not exists private.preview_builds (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references private.editorial_drafts(id),
  base_site_release_id uuid not null references private.site_releases(id),
  preview_sha256 text not null check (preview_sha256 ~ '^[a-f0-9]{64}$'),
  artifact_sha256 text not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  pages_preview_url text not null,
  verifier_evidence jsonb not null check (jsonb_typeof(verifier_evidence) = 'object'),
  inserted_at timestamptz not null default clock_timestamp(),
  unique (draft_id, preview_sha256)
);

create table if not exists private.admin_principals (
  access_sub text primary key,
  display_email text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  inserted_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists private.admin_role_bindings (
  principal_id text not null references private.admin_principals(access_sub),
  role text not null check (role in ('Viewer', 'Editor', 'Publisher', 'Owner')),
  valid_from timestamptz not null default clock_timestamp(),
  valid_until timestamptz,
  primary key (principal_id, role, valid_from),
  check (valid_until is null or valid_until > valid_from)
);

create table if not exists private.content_audit_log (
  id bigint generated always as identity,
  actor_sub text not null,
  actor_email text,
  actor_role text not null,
  action text not null,
  reason text,
  request_id text not null,
  idempotency_key text,
  target jsonb not null default '{}' check (jsonb_typeof(target) = 'object'),
  before_sha256 text,
  after_sha256 text,
  result text not null,
  inserted_at timestamptz not null default clock_timestamp(),
  primary key (inserted_at, id)
) partition by range (inserted_at);

-- Keep the online audit table quarterly partitioned. The default partition is
-- fail-safe only; daily maintenance creates future quarters before they begin.
do $$
declare
  audit_owner text;
  quarter_offset integer;
  quarter_start timestamptz;
  quarter_end timestamptz;
  partition_name text;
begin
  select pg_get_userbyid(c.relowner) into audit_owner
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private' and c.relname = 'content_audit_log';
  if audit_owner = 'content_rpc_owner' then
    set local role content_rpc_owner;
  end if;
  create index if not exists content_audit_log_id_idx
    on private.content_audit_log (id desc);
  create index if not exists content_audit_log_action_inserted_idx
    on private.content_audit_log (action, inserted_at desc);
  for quarter_offset in -4..8 loop
    quarter_start := (
      date_trunc('quarter', current_timestamp at time zone 'UTC')
      + make_interval(months => quarter_offset * 3)
    ) at time zone 'UTC';
    quarter_end := quarter_start + interval '3 months';
    partition_name := format(
      'content_audit_log_%sq%s',
      extract(year from quarter_start at time zone 'UTC')::integer,
      extract(quarter from quarter_start at time zone 'UTC')::integer
    );
    execute format(
      'create table if not exists private.%I partition of private.content_audit_log for values from (%L) to (%L)',
      partition_name, quarter_start, quarter_end
    );
  end loop;
  create table if not exists private.content_audit_log_default
    partition of private.content_audit_log default;
  if audit_owner = 'content_rpc_owner' then
    reset role;
  end if;
end;
$$;

create table if not exists private.content_settings (
  setting_key text primary key check (setting_key in (
    'database_mirror', 'shadow_build', 'publication', 'admin_draft',
    'admin_preview', 'admin_publish', 'global_suppression'
  )),
  enabled boolean not null default false,
  row_version bigint not null default 1 check (row_version > 0),
  updated_by text,
  updated_at timestamptz not null default clock_timestamp()
);

insert into private.content_settings (setting_key, enabled)
select key, false
from unnest(array[
  'database_mirror', 'shadow_build', 'publication', 'admin_draft',
  'admin_preview', 'admin_publish', 'global_suppression'
]) as key
on conflict (setting_key) do nothing;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'content_items', 'content_identity_claims', 'content_item_aliases',
    'content_item_revisions', 'editorial_overrides', 'content_item_topics',
    'content_item_entities', 'content_item_relations', 'daily_reports',
    'daily_batches', 'daily_report_items', 'global_suppressions',
    'report_snapshots', 'report_snapshot_items', 'site_releases', 'site_release_reservations',
    'site_release_reports', 'publication_slots', 'publication_attempts',
    'content_outbox', 'release_deployment_attempts', 'release_current_pointer',
    'production_promotion_slot', 'release_artifacts', 'editorial_drafts',
    'editorial_draft_items', 'preview_builds', 'admin_principals',
    'admin_role_bindings', 'content_settings'
  ] loop
    execute format('alter table private.%I enable row level security', relation_name);
    execute format('alter table private.%I force row level security', relation_name);
    execute format('drop policy if exists content_rpc_owner_all on private.%I', relation_name);
    execute format(
      'create policy content_rpc_owner_all on private.%I for all to content_rpc_owner using (true) with check (true)',
      relation_name
    );
    execute format(
      'revoke all on table private.%I from public, anon, authenticated, service_role, content_ingestor, content_editor, content_controller, content_reader, content_deployer',
      relation_name
    );
    execute format('grant select, insert, update, delete on table private.%I to content_rpc_owner', relation_name);
  end loop;
end;
$$;

do $$
declare
  audit_owner text;
  relation_name text;
begin
  select pg_get_userbyid(c.relowner) into audit_owner
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private' and c.relname = 'content_audit_log';
  if audit_owner = 'content_rpc_owner' then
    set local role content_rpc_owner;
  end if;
  for relation_name in
    select parent.relname
    from pg_class parent
    join pg_namespace parent_namespace on parent_namespace.oid = parent.relnamespace
    where parent_namespace.nspname = 'private'
      and parent.relname = 'content_audit_log'
    union all
    select child.relname
    from pg_inherits inheritance
    join pg_class parent on parent.oid = inheritance.inhparent
    join pg_namespace parent_namespace on parent_namespace.oid = parent.relnamespace
    join pg_class child on child.oid = inheritance.inhrelid
    where parent_namespace.nspname = 'private'
      and parent.relname = 'content_audit_log'
  loop
    execute format('alter table private.%I enable row level security', relation_name);
    execute format('alter table private.%I force row level security', relation_name);
    execute format('drop policy if exists content_rpc_owner_all on private.%I', relation_name);
    execute format(
      'create policy content_rpc_owner_all on private.%I for all to content_rpc_owner using (true) with check (true)',
      relation_name
    );
    execute format(
      'revoke all on table private.%I from public, anon, authenticated, service_role, content_ingestor, content_editor, content_controller, content_reader, content_deployer',
      relation_name
    );
    execute format('grant select, insert, update, delete on table private.%I to content_rpc_owner', relation_name);
  end loop;
  if audit_owner = 'content_rpc_owner' then
    reset role;
  end if;
end;
$$;

grant usage, select on all sequences in schema private to content_rpc_owner;
revoke all on all sequences in schema private
  from public, anon, authenticated, service_role,
       content_ingestor, content_editor, content_controller, content_reader, content_deployer;

commit;
