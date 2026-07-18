begin;

set local role content_rpc_owner;

alter table private.library_items
  drop constraint if exists library_items_kind_check;
alter table private.library_items
  add constraint library_items_kind_check check (
    kind in ('highlight_bookmark', 'highlight_article', 'prompt', 'model_eval')
  );
alter table private.library_items
  drop constraint if exists library_items_detail_url_check;
alter table private.library_items
  add constraint library_items_detail_url_check check (
    detail_url is null or detail_url ~ '^/(en/)?(highlights|prompts)/[a-z0-9][a-z0-9._~!$&''()*+,;=:@%/-]*/$'
  );

-- library_items is shared by several editorial directories. Keep the older
-- Highlight RPCs type-scoped so adding new kinds can never leak them into the
-- Highlights page or its Admin view.
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
    where locale = requested_locale
      and kind in ('highlight_bookmark', 'highlight_article')
      and status = 'published'
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
      and kind in ('highlight_bookmark', 'highlight_article')
    order by sort_order, inserted_at desc
    limit page_size
  ) item;
  return result;
end;
$$;

create or replace function private.list_public_prompts_v1(
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
    raise exception 'Invalid prompt listing request' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'schema_version', 1,
    'locale', requested_locale,
    'item_count', count(*),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', item.external_id,
      'title', item.title,
      'description', item.description,
      'model', nullif(item.metadata ->> 'model', ''),
      'date', nullif(item.metadata ->> 'date', ''),
      'tags', to_jsonb(item.tags),
      'detailUrl', coalesce(
        item.detail_url,
        '/prompts/library/?id=' || item.external_id
      ),
      'updated_at', item.updated_at
    ) order by item.sort_order, item.inserted_at desc), '[]'::jsonb)
  ) into result
  from (
    select * from private.library_items
    where locale = requested_locale and kind = 'prompt' and status = 'published'
    order by sort_order, inserted_at desc
    limit page_size
  ) item;
  return result;
end;
$$;

create or replace function private.get_public_prompt_v1(
  requested_locale text,
  requested_external_id text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schema_version', 1,
    'locale', item.locale,
    'id', item.external_id,
    'title', item.title,
    'description', item.description,
    'model', nullif(item.metadata ->> 'model', ''),
    'date', nullif(item.metadata ->> 'date', ''),
    'tags', to_jsonb(item.tags),
    'body_markdown', item.metadata ->> 'body_markdown',
    'updated_at', item.updated_at
  )
  from private.library_items item
  where item.locale = requested_locale
    and item.external_id = requested_external_id
    and item.kind = 'prompt'
    and item.status = 'published'
    and requested_locale in ('zh-CN', 'en')
    and requested_external_id ~ '^prompt-[a-z0-9][a-z0-9-]{0,119}$'
$$;

create or replace function private.list_public_model_evals_v1(
  requested_locale text,
  requested_year integer default null,
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
    or (requested_year is not null and requested_year not between 2000 and 2100)
    or page_size < 1 or page_size > 200 then
    raise exception 'Invalid model evaluation listing request' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'schema_version', 1,
    'locale', requested_locale,
    'year', requested_year,
    'item_count', count(*),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', item.external_id,
      'name', item.title,
      'company', item.metadata ->> 'company',
      'logo', item.cover_url,
      'releaseDate', item.metadata ->> 'release_month',
      'description', item.description,
      'tags', to_jsonb(item.tags),
      'updated_at', item.updated_at
    ) order by item.sort_order, item.inserted_at desc), '[]'::jsonb)
  ) into result
  from (
    select * from private.library_items
    where locale = requested_locale and kind = 'model_eval' and status = 'published'
      and (requested_year is null or left(metadata ->> 'release_month', 4) = requested_year::text)
    order by sort_order, inserted_at desc
    limit page_size
  ) item;
  return result;
end;
$$;

create or replace function private.list_admin_library_v1(
  requested_kind text,
  requested_locale text,
  page_size integer default 100
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', requested_kind,
    'locale', requested_locale,
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', item.id,
      'external_id', item.external_id,
      'title', item.title,
      'description', item.description,
      'cover_url', item.cover_url,
      'detail_url', item.detail_url,
      'tags', to_jsonb(item.tags),
      'metadata', item.metadata - 'body_markdown',
      'body_length', coalesce(char_length(item.metadata ->> 'body_markdown'), 0),
      'status', item.status,
      'sort_order', item.sort_order,
      'row_version', item.row_version,
      'updated_at', item.updated_at
    ) order by item.sort_order, item.inserted_at desc), '[]'::jsonb)
  )
  from (
    select * from private.library_items
    where kind = requested_kind and locale = requested_locale
      and requested_kind in ('prompt', 'model_eval')
      and requested_locale in ('zh-CN', 'en')
    order by sort_order, inserted_at desc
    limit case when page_size between 1 and 200 then page_size else 0 end
  ) item
$$;

create or replace function private.read_admin_library_v1(
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
declare requested_kind text;
declare route text;
begin
  if jsonb_typeof(arguments) <> 'object' then
    raise exception 'Invalid Admin library read request' using errcode = '22023';
  end if;
  requested_kind := arguments ->> 'kind';
  route := case requested_kind
    when 'prompt' then '/v1/prompts'
    when 'model_eval' then '/v1/model-evals'
    else null
  end;
  if route is null then
    raise exception 'Invalid Admin library kind' using errcode = '22023';
  end if;
  perform private.consume_attestation_v1(
    assertion, 'content-routine', 'admin.read', body_sha256,
    array['Viewer', 'Editor', 'Publisher', 'Owner']
  );
  begin payload := (assertion ->> 'payload')::jsonb;
  exception when others then
    raise exception 'Malformed Admin read assertion' using errcode = '22023';
  end;
  if payload -> 'request_context' is distinct from jsonb_build_object(
    'route', route,
    'arguments', arguments
  ) then
    raise exception 'Admin read request context mismatch' using errcode = '42501';
  end if;
  return private.list_admin_library_v1(
    requested_kind,
    coalesce(nullif(arguments ->> 'locale', ''), 'zh-CN'),
    coalesce((arguments ->> 'limit')::integer, 100)
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Invalid Admin library read arguments' using errcode = '22023';
end;
$$;

create or replace function private.create_prompt_v1(
  requested_locale text, requested_slug text, requested_title text,
  requested_description text, requested_model text, requested_tags text[],
  requested_body text, requested_date date, requested_status text,
  reason text, idempotency_key uuid, assertion jsonb, body_sha256 text
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
declare external_id text;
begin
  perform private.require_setting_v1('admin_draft');
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-routine', 'prompt.create', body_sha256,
    array['Editor', 'Publisher', 'Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-routine', 'prompt.create', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;
  normalized_tags := array(select distinct btrim(value)
    from unnest(coalesce(requested_tags, '{}'::text[])) value
    where nullif(btrim(value), '') is not null order by 1);
  if requested_locale not in ('zh-CN', 'en')
    or requested_slug !~ '^[a-z0-9][a-z0-9-]{0,119}$'
    or char_length(btrim(coalesce(requested_title, ''))) not between 1 and 300
    or char_length(coalesce(requested_description, '')) > 2000
    or char_length(coalesce(requested_model, '')) > 120
    or char_length(coalesce(requested_body, '')) not between 1 and 100000
    or coalesce(array_length(normalized_tags, 1), 0) > 20
    or exists (select 1 from unnest(normalized_tags) value where char_length(value) > 64)
    or requested_status not in ('draft', 'published')
    or char_length(btrim(coalesce(reason, ''))) < 4 then
    raise exception 'Invalid prompt content or reason' using errcode = '22023';
  end if;
  external_id := 'prompt-' || requested_slug;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('library-items:prompt:' || requested_locale));
  select coalesce(max(sort_order), -1) + 1 into next_sort
  from private.library_items where locale = requested_locale and kind = 'prompt';
  insert into private.library_items(
    external_id, locale, kind, title, description, source_url, tags, metadata,
    status, sort_order, created_by, updated_by, published_at
  ) values (
    external_id, requested_locale, 'prompt', btrim(requested_title),
    coalesce(requested_description, ''),
    'https://bubblenews.today/prompts/library/?id=' || external_id,
    normalized_tags, jsonb_build_object(
      'slug', requested_slug, 'model', coalesce(requested_model, ''),
      'date', requested_date, 'body_markdown', requested_body
    ), requested_status, next_sort, actor.actor_sub, actor.actor_sub,
    case when requested_status = 'published' then clock_timestamp() else null end
  ) returning * into created;
  result := jsonb_build_object('id', created.id, 'external_id', created.external_id,
    'locale', created.locale, 'title', created.title, 'status', created.status,
    'row_version', created.row_version);
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id,
    idempotency_key, target, after_sha256, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'prompt.create', reason,
    actor.assertion_jti::text, idempotency_key::text,
    jsonb_build_object('library_item_id', created.id, 'external_id', created.external_id),
    private.sha256_jsonb_v1(to_jsonb(created)), 'created'
  );
  perform private.complete_admin_idempotency_v1(
    'content-routine', 'prompt.create', idempotency_key, result
  );
  return result;
end;
$$;

create or replace function private.create_model_eval_v1(
  requested_locale text, requested_external_id text, requested_name text,
  requested_company text, requested_logo_url text, requested_release_month text,
  requested_description text, requested_tags text[], requested_status text,
  reason text, idempotency_key uuid, assertion jsonb, body_sha256 text
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
    assertion, 'content-routine', 'model_eval.create', body_sha256,
    array['Editor', 'Publisher', 'Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-routine', 'model_eval.create', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;
  normalized_tags := array(select distinct btrim(value)
    from unnest(coalesce(requested_tags, '{}'::text[])) value
    where nullif(btrim(value), '') is not null order by 1);
  if requested_locale not in ('zh-CN', 'en')
    or char_length(btrim(coalesce(requested_external_id, ''))) not between 1 and 200
    or char_length(btrim(coalesce(requested_name, ''))) not between 1 and 300
    or char_length(btrim(coalesce(requested_company, ''))) not between 1 and 120
    or (nullif(btrim(coalesce(requested_logo_url, '')), '') is not null
      and requested_logo_url !~ '^https://[^[:space:]]+$')
    or requested_release_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
    or char_length(coalesce(requested_description, '')) > 2000
    or coalesce(array_length(normalized_tags, 1), 0) > 20
    or exists (select 1 from unnest(normalized_tags) value where char_length(value) > 64)
    or requested_status not in ('draft', 'published')
    or char_length(btrim(coalesce(reason, ''))) < 4 then
    raise exception 'Invalid model evaluation content or reason' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('library-items:model-eval:' || requested_locale));
  select coalesce(max(sort_order), -1) + 1 into next_sort
  from private.library_items where locale = requested_locale and kind = 'model_eval';
  insert into private.library_items(
    external_id, locale, kind, title, description, source_url, cover_url,
    tags, metadata, status, sort_order, created_by, updated_by, published_at
  ) values (
    btrim(requested_external_id), requested_locale, 'model_eval', btrim(requested_name),
    coalesce(requested_description, ''),
    'https://bubblenews.today/model-evals/' || left(requested_release_month, 4) || '/',
    nullif(btrim(coalesce(requested_logo_url, '')), ''), normalized_tags,
    jsonb_build_object('company', btrim(requested_company), 'release_month', requested_release_month),
    requested_status, next_sort, actor.actor_sub, actor.actor_sub,
    case when requested_status = 'published' then clock_timestamp() else null end
  ) returning * into created;
  result := jsonb_build_object('id', created.id, 'external_id', created.external_id,
    'locale', created.locale, 'title', created.title, 'status', created.status,
    'row_version', created.row_version);
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id,
    idempotency_key, target, after_sha256, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'model_eval.create', reason,
    actor.assertion_jti::text, idempotency_key::text,
    jsonb_build_object('library_item_id', created.id, 'external_id', created.external_id),
    private.sha256_jsonb_v1(to_jsonb(created)), 'created'
  );
  perform private.complete_admin_idempotency_v1(
    'content-routine', 'model_eval.create', idempotency_key, result
  );
  return result;
end;
$$;

revoke all on function private.list_public_prompts_v1(text, integer)
  from public, anon, authenticated, service_role, content_ingestor, content_editor,
    content_controller, content_reader, content_deployer;
revoke all on function private.get_public_prompt_v1(text, text)
  from public, anon, authenticated, service_role, content_ingestor, content_editor,
    content_controller, content_reader, content_deployer;
revoke all on function private.list_public_model_evals_v1(text, integer, integer)
  from public, anon, authenticated, service_role, content_ingestor, content_editor,
    content_controller, content_reader, content_deployer;
revoke all on function private.list_admin_library_v1(text, text, integer)
  from public, anon, authenticated, service_role, content_ingestor, content_editor,
    content_controller, content_reader, content_deployer;
revoke all on function private.read_admin_library_v1(jsonb, jsonb, text)
  from public, anon, authenticated, service_role, content_ingestor, content_editor,
    content_controller, content_reader, content_deployer;
revoke all on function private.create_prompt_v1(text,text,text,text,text,text[],text,date,text,text,uuid,jsonb,text)
  from public, anon, authenticated, service_role, content_ingestor, content_editor,
    content_controller, content_reader, content_deployer;
revoke all on function private.create_model_eval_v1(text,text,text,text,text,text,text,text[],text,text,uuid,jsonb,text)
  from public, anon, authenticated, service_role, content_ingestor, content_editor,
    content_controller, content_reader, content_deployer;

grant execute on function private.list_public_prompts_v1(text, integer),
  private.get_public_prompt_v1(text, text),
  private.list_public_model_evals_v1(text, integer, integer) to content_reader;
grant execute on function private.read_admin_library_v1(jsonb, jsonb, text),
  private.create_prompt_v1(text,text,text,text,text,text[],text,date,text,text,uuid,jsonb,text),
  private.create_model_eval_v1(text,text,text,text,text,text,text,text[],text,text,uuid,jsonb,text)
  to content_editor;

-- SET LOCAL ROLE unwinds at COMMIT and preserves the Supabase migration writer.
commit;
