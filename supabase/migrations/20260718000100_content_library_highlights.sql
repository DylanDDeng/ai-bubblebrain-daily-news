begin;

-- Create and maintain the table as the dedicated NOLOGIN owner. This keeps
-- the migration repeatable after the first run has transferred ownership.
set local role content_rpc_owner;

create table if not exists private.library_items (
  id uuid primary key default gen_random_uuid(),
  external_id text not null,
  locale text not null check (locale in ('zh-CN', 'en')),
  kind text not null check (kind in ('highlight_bookmark', 'highlight_article')),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  description text not null default '' check (char_length(description) <= 2000),
  source_url text not null check (source_url ~ '^https://[^[:space:]]+$'),
  cover_url text check (
    cover_url is null or cover_url ~ '^(https://[^[:space:]]+|/[^[:space:]]*)$'
  ),
  detail_url text check (
    detail_url is null or detail_url ~ '^/(en/)?highlights/[a-z0-9][a-z0-9._~!$&''()*+,;=:@%/-]*/$'
  ),
  tags text[] not null default '{}',
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  featured boolean not null default false,
  sort_order integer not null check (sort_order >= 0),
  row_version bigint not null default 1 check (row_version > 0),
  created_by text not null,
  updated_by text not null,
  published_at timestamptz,
  inserted_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (locale, external_id),
  check ((status = 'published') = (published_at is not null))
);

create index if not exists library_items_public_listing_idx
  on private.library_items (locale, status, sort_order, inserted_at desc);
create index if not exists library_items_tags_idx
  on private.library_items using gin (tags);

alter table private.library_items enable row level security;
alter table private.library_items force row level security;
drop policy if exists content_rpc_owner_all on private.library_items;
create policy content_rpc_owner_all on private.library_items
  for all to content_rpc_owner using (true) with check (true);
revoke all on table private.library_items
  from public, anon, authenticated, service_role,
       content_ingestor, content_editor, content_controller, content_reader, content_deployer;
grant select, insert, update, delete on table private.library_items to content_rpc_owner;
grant select on table private.library_items to content_backup;

create or replace function private.list_public_highlights_v1(
  requested_locale text,
  page_size integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if requested_locale not in ('zh-CN', 'en')
    or page_size < 1 or page_size > 200 then
    raise exception 'Invalid highlight listing request' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'schema_version', 1,
    'locale', requested_locale,
    'item_count', count(*),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', item.external_id,
      'database_id', item.id,
      'title', item.title,
      'description', item.description,
      'thumb', item.cover_url,
      'full', nullif(item.metadata ->> 'full_url', ''),
      'tags', to_jsonb(item.tags),
      'originalUrl', item.source_url,
      'detailUrl', item.detail_url,
      'kind', item.kind,
      'featured', item.featured,
      'updated_at', item.updated_at
    ) order by item.sort_order, item.inserted_at desc), '[]'::jsonb)
  ) into result
  from (
    select * from private.library_items
    where locale = requested_locale and status = 'published'
    order by sort_order, inserted_at desc
    limit page_size
  ) item;
  return result;
end;
$$;

create or replace function private.list_admin_highlights_v1(
  requested_locale text,
  page_size integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if requested_locale not in ('zh-CN', 'en')
    or page_size < 1 or page_size > 200 then
    raise exception 'Invalid highlight listing request' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'locale', requested_locale,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', item.id,
      'external_id', item.external_id,
      'kind', item.kind,
      'title', item.title,
      'description', item.description,
      'source_url', item.source_url,
      'cover_url', item.cover_url,
      'detail_url', item.detail_url,
      'tags', to_jsonb(item.tags),
      'status', item.status,
      'featured', item.featured,
      'sort_order', item.sort_order,
      'row_version', item.row_version,
      'updated_at', item.updated_at
    ) order by item.sort_order, item.inserted_at desc), '[]'::jsonb)
  ) into result
  from (
    select * from private.library_items
    where locale = requested_locale
    order by sort_order, inserted_at desc
    limit page_size
  ) item;
  return result;
end;
$$;

create or replace function private.read_admin_highlights_v1(
  arguments jsonb,
  assertion jsonb,
  body_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare payload jsonb;
begin
  if jsonb_typeof(arguments) <> 'object' then
    raise exception 'Invalid Admin highlight read request' using errcode = '22023';
  end if;
  perform private.consume_attestation_v1(
    assertion, 'content-routine', 'admin.read', body_sha256,
    array['Viewer', 'Editor', 'Publisher', 'Owner']
  );
  begin
    payload := (assertion ->> 'payload')::jsonb;
  exception when others then
    raise exception 'Malformed Admin read assertion' using errcode = '22023';
  end;
  if payload -> 'request_context' is distinct from jsonb_build_object(
    'route', '/v1/highlights',
    'arguments', arguments
  ) then
    raise exception 'Admin read request context mismatch' using errcode = '42501';
  end if;
  return private.list_admin_highlights_v1(
    coalesce(nullif(arguments ->> 'locale', ''), 'zh-CN'),
    coalesce((arguments ->> 'limit')::integer, 100)
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid Admin highlight read arguments' using errcode = '22023';
end;
$$;

create or replace function private.create_highlight_v1(
  requested_locale text,
  requested_title text,
  requested_description text,
  requested_source_url text,
  requested_cover_url text,
  requested_tags text[],
  requested_status text,
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
declare existing jsonb;
declare created private.library_items%rowtype;
declare result jsonb;
declare normalized_tags text[];
declare next_sort integer;
begin
  perform private.require_setting_v1('admin_draft');
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-routine', 'highlight.create', body_sha256,
    array['Editor', 'Publisher', 'Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-routine', 'highlight.create', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;

  normalized_tags := array(
    select distinct btrim(value)
    from unnest(coalesce(requested_tags, '{}'::text[])) value
    where nullif(btrim(value), '') is not null
    order by 1
  );
  if requested_locale not in ('zh-CN', 'en')
    or char_length(btrim(coalesce(requested_title, ''))) not between 1 and 300
    or char_length(coalesce(requested_description, '')) > 2000
    or requested_source_url !~ '^https://[^[:space:]]+$'
    or (nullif(btrim(coalesce(requested_cover_url, '')), '') is not null
      and requested_cover_url !~ '^(https://[^[:space:]]+|/[^[:space:]]*)$')
    or coalesce(array_length(normalized_tags, 1), 0) > 20
    or exists (select 1 from unnest(normalized_tags) value where char_length(value) > 64)
    or requested_status not in ('draft', 'published')
    or char_length(btrim(coalesce(reason, ''))) < 4 then
    raise exception 'Invalid highlight content or reason' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('library-items:' || requested_locale));
  select coalesce(max(sort_order), -1) + 1 into next_sort
  from private.library_items where locale = requested_locale;
  insert into private.library_items(
    external_id, locale, kind, title, description, source_url, cover_url,
    tags, status, sort_order, created_by, updated_by, published_at
  ) values (
    'manual-' || replace(gen_random_uuid()::text, '-', ''),
    requested_locale, 'highlight_bookmark', btrim(requested_title),
    coalesce(requested_description, ''), requested_source_url,
    nullif(btrim(coalesce(requested_cover_url, '')), ''), normalized_tags,
    requested_status, next_sort, actor.actor_sub, actor.actor_sub,
    case when requested_status = 'published' then clock_timestamp() else null end
  ) returning * into created;

  result := jsonb_build_object(
    'id', created.id,
    'external_id', created.external_id,
    'locale', created.locale,
    'title', created.title,
    'status', created.status,
    'row_version', created.row_version
  );
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id,
    idempotency_key, target, after_sha256, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'highlight.create', reason,
    actor.assertion_jti::text, idempotency_key::text,
    jsonb_build_object('library_item_id', created.id, 'external_id', created.external_id),
    private.sha256_jsonb_v1(to_jsonb(created)), 'created'
  );
  perform private.complete_admin_idempotency_v1(
    'content-routine', 'highlight.create', idempotency_key, result
  );
  return result;
end;
$$;

revoke all on function private.list_public_highlights_v1(text, integer)
  from public, anon, authenticated, service_role,
       content_ingestor, content_editor, content_controller, content_reader, content_deployer;
revoke all on function private.list_admin_highlights_v1(text, integer)
  from public, anon, authenticated, service_role,
       content_ingestor, content_editor, content_controller, content_reader, content_deployer;
revoke all on function private.read_admin_highlights_v1(jsonb, jsonb, text)
  from public, anon, authenticated, service_role,
       content_ingestor, content_editor, content_controller, content_reader, content_deployer;
revoke all on function private.create_highlight_v1(
  text, text, text, text, text, text[], text, text, uuid, jsonb, text
) from public, anon, authenticated, service_role,
       content_ingestor, content_editor, content_controller, content_reader, content_deployer;

grant execute on function private.list_public_highlights_v1(text, integer)
  to content_reader;
grant execute on function private.read_admin_highlights_v1(jsonb, jsonb, text)
  to content_editor;
grant execute on function private.create_highlight_v1(
  text, text, text, text, text, text[], text, text, uuid, jsonb, text
) to content_editor;

-- SET LOCAL ROLE unwinds at COMMIT. RESET ROLE would also clear the Supabase
-- migration writer's outer role before it records this migration.
commit;
