begin;

set local role content_rpc_owner;

create or replace function private.reconcile_legacy_github_trending_source_id_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_identity_digest text;
begin
  if new.source_type <> 'github_trending'
    or new.content_type <> 'project'
    or new.source_id is distinct from new.canonical_url
    or new.url is distinct from new.canonical_url
    or new.canonical_url !~ '^https://github[.]com/[^/?#]+/[^/?#]+$' then
    return new;
  end if;

  v_identity_digest := encode(
    extensions.digest(
      convert_to('url:' || new.canonical_url, 'utf8'),
      'sha256'
    ),
    'hex'
  );
  if new.id <> ('n_' || v_identity_digest)
    or new.event_id <> ('e_' || v_identity_digest) then
    return new;
  end if;

  update private.content_items
  set source_id = new.source_id
  where id = new.id
    and event_id = new.event_id
    and identity_version = new.identity_version
    and source_type = new.source_type
    and content_type = new.content_type
    and source_id ~ '^[0-9]+$'
    and url = new.url
    and canonical_url = new.canonical_url;

  return new;
end;
$$;

create or replace function private.reconcile_all_legacy_github_trending_source_ids_v1()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  lock table private.content_items in share row exclusive mode;
  lock table private.content_identity_claims in share row exclusive mode;

  if exists (
    select 1
    from private.content_items item
    where item.source_type = 'github_trending'
      and item.source_id ~ '^[0-9]+$'
      and not (
        item.content_type = 'project'
        and item.url is not distinct from item.canonical_url
        and item.canonical_url ~ '^https://github[.]com/[^/?#]+/[^/?#]+$'
        and item.id = 'n_' || encode(
          extensions.digest(
            convert_to('url:' || item.canonical_url, 'utf8'),
            'sha256'
          ),
          'hex'
        )
        and item.event_id = 'e_' || substr(item.id, 3)
      )
  ) then
    raise exception
      'Legacy GitHub Trending source IDs failed canonical identity preflight';
  end if;

  if exists (
    select 1
    from private.content_items item
    join private.content_identity_claims claim
      on claim.claim_id = 'c_' || encode(
        extensions.digest(
          convert_to(
            'source:github_trending:' || item.canonical_url,
            'utf8'
          ),
          'sha256'
        ),
        'hex'
      )
    where item.source_type = 'github_trending'
      and item.source_id ~ '^[0-9]+$'
      and claim.item_id <> item.id
  ) then
    raise exception
      'Legacy GitHub Trending canonical source claim belongs to another item';
  end if;

  insert into private.content_identity_claims(
    claim_id,
    item_id,
    identity_version,
    strategy
  )
  select
    'c_' || encode(
      extensions.digest(
        convert_to(
          'source:github_trending:' || item.canonical_url,
          'utf8'
        ),
        'sha256'
      ),
      'hex'
    ),
    item.id,
    item.identity_version,
    'canonical_url'
  from private.content_items item
  where item.source_type = 'github_trending'
    and item.source_id ~ '^[0-9]+$'
  on conflict on constraint content_identity_claims_pkey do nothing;

  update private.content_items item
  set source_id = item.canonical_url
  where item.source_type = 'github_trending'
    and item.source_id ~ '^[0-9]+$';
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

grant execute on function private.reconcile_legacy_github_trending_source_id_v1()
  to postgres;

set local role postgres;

drop trigger if exists reconcile_legacy_github_trending_source_id
  on private.content_items;
create trigger reconcile_legacy_github_trending_source_id
before insert on private.content_items
for each row
execute function private.reconcile_legacy_github_trending_source_id_v1();

set local role content_rpc_owner;

select private.reconcile_all_legacy_github_trending_source_ids_v1();

revoke all on function private.reconcile_legacy_github_trending_source_id_v1()
  from public, postgres, anon, authenticated, service_role,
       content_ingestor, content_editor, content_controller,
       content_reader, content_deployer, content_backup;
revoke all on function private.reconcile_all_legacy_github_trending_source_ids_v1()
  from public, anon, authenticated, service_role,
       content_ingestor, content_editor, content_controller,
       content_reader, content_deployer, content_backup;

commit;
