begin;

create extension if not exists pgtap with schema extensions;
select plan(13);

set local role content_rpc_owner;

insert into private.content_items(
  id,
  event_id,
  identity_version,
  source_type,
  content_type,
  source_id,
  source_name,
  url,
  canonical_url,
  published_date,
  time_precision,
  provenance_kind
)
values (
  'n_2955677f0d2801c015fafe447b356e88c7eca8077b5aa6416e239376b7accb37',
  'e_2955677f0d2801c015fafe447b356e88c7eca8077b5aa6416e239376b7accb37',
  1,
  'github_trending',
  'project',
  '3',
  'GitHub Trending',
  'https://github.com/example/repository',
  'https://github.com/example/repository',
  '2026-07-16',
  'date_only',
  'legacy_structured_import'
);

insert into private.content_items(
  id,
  event_id,
  identity_version,
  source_type,
  content_type,
  source_id,
  source_name,
  url,
  canonical_url,
  published_date,
  time_precision,
  provenance_kind
)
values (
  'n_2955677f0d2801c015fafe447b356e88c7eca8077b5aa6416e239376b7accb37',
  'e_2955677f0d2801c015fafe447b356e88c7eca8077b5aa6416e239376b7accb37',
  1,
  'github_trending',
  'project',
  'https://github.com/example/repository',
  'GitHub Trending',
  'https://github.com/example/repository',
  'https://github.com/example/repository',
  '2026-07-24',
  'date_only',
  'live_ingestion'
)
on conflict on constraint content_items_pkey do nothing;

select is(
  (
    select source_id
    from private.content_items
    where id = 'n_2955677f0d2801c015fafe447b356e88c7eca8077b5aa6416e239376b7accb37'
  ),
  'https://github.com/example/repository',
  'a canonical GitHub source ID safely replaces its historical ranking index'
);

select is(
  (
    select count(*)
    from private.content_items
    where id = 'n_2955677f0d2801c015fafe447b356e88c7eca8077b5aa6416e239376b7accb37'
  ),
  1::bigint,
  'source ID reconciliation preserves the canonical content item'
);

insert into private.content_items(
  id,
  event_id,
  identity_version,
  source_type,
  content_type,
  source_id,
  source_name,
  url,
  canonical_url,
  time_precision,
  provenance_kind
)
values (
  'n_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'e_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  1,
  'github_trending',
  'project',
  '9',
  'GitHub Trending',
  'https://github.com/example/not-the-hashed-item',
  'https://github.com/example/not-the-hashed-item',
  'inferred',
  'legacy_structured_import'
);

insert into private.content_items(
  id,
  event_id,
  identity_version,
  source_type,
  content_type,
  source_id,
  source_name,
  url,
  canonical_url,
  time_precision,
  provenance_kind
)
values (
  'n_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'e_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  1,
  'github_trending',
  'project',
  'https://github.com/example/not-the-hashed-item',
  'GitHub Trending',
  'https://github.com/example/not-the-hashed-item',
  'https://github.com/example/not-the-hashed-item',
  'inferred',
  'live_ingestion'
)
on conflict on constraint content_items_pkey do nothing;

select is(
  (
    select source_id
    from private.content_items
    where id = 'n_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ),
  '9',
  'an item whose ID does not derive from the canonical URL remains immutable'
);

select throws_ok(
  'select private.reconcile_all_legacy_github_trending_source_ids_v1()',
  'P0001',
  'Legacy GitHub Trending source IDs failed canonical identity preflight',
  'bulk reconciliation fails closed when any historical identity is invalid'
);

delete from private.content_items
where id = 'n_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

insert into private.content_items(
  id,
  event_id,
  identity_version,
  source_type,
  content_type,
  source_id,
  source_name,
  url,
  canonical_url,
  published_date,
  time_precision,
  provenance_kind
)
values (
  'n_d5e00c05855bb932d0f93d26da1395ab8724f9f26319d630cd6a819e8e86f0a5',
  'e_d5e00c05855bb932d0f93d26da1395ab8724f9f26319d630cd6a819e8e86f0a5',
  1,
  'github_trending',
  'project',
  '12',
  'GitHub Trending',
  'https://github.com/example/bulk-repository',
  'https://github.com/example/bulk-repository',
  '2026-07-16',
  'date_only',
  'legacy_structured_import'
);

select is(
  private.reconcile_all_legacy_github_trending_source_ids_v1(),
  1,
  'the bounded bulk reconciler upgrades one validated historical row'
);

select is(
  (
    select source_id
    from private.content_items
    where id = 'n_d5e00c05855bb932d0f93d26da1395ab8724f9f26319d630cd6a819e8e86f0a5'
  ),
  'https://github.com/example/bulk-repository',
  'the bulk reconciler stores the canonical repository URL'
);

select ok(
  exists (
    select 1
    from private.content_identity_claims
    where claim_id = 'c_2639127531a50fd6e135090004e789e69436e707fdc898ce967484632ac4bd2c'
      and item_id = 'n_d5e00c05855bb932d0f93d26da1395ab8724f9f26319d630cd6a819e8e86f0a5'
  ),
  'the bulk reconciler records the canonical source claim'
);

select is(
  private.reconcile_all_legacy_github_trending_source_ids_v1(),
  0,
  'the bulk reconciler is idempotent'
);

select ok(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'reconcile_legacy_github_trending_source_id_v1'
  ),
  'the reconciliation trigger uses the private security boundary'
);

select ok(
  (
    select coalesce(p.proconfig, '{}') @> array['search_path=""']
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'reconcile_legacy_github_trending_source_id_v1'
  ),
  'the reconciliation trigger has an empty search path'
);

select ok(
  not has_function_privilege(
    'content_ingestor',
    'private.reconcile_legacy_github_trending_source_id_v1()',
    'execute'
  ),
  'the ingestor cannot invoke the reconciliation trigger directly'
);

select ok(
  not has_function_privilege(
    'service_role',
    'private.reconcile_legacy_github_trending_source_id_v1()',
    'execute'
  ),
  'the service role cannot invoke the reconciliation trigger directly'
);

select ok(
  not has_function_privilege(
    'content_ingestor',
    'private.reconcile_all_legacy_github_trending_source_ids_v1()',
    'execute'
  ),
  'the ingestor cannot invoke bulk reconciliation'
);

select * from finish();
rollback;
