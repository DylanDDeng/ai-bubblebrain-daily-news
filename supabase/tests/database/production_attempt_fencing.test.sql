begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

select has_function(
  'private',
  'authorize_attempt_production_promotion_v1',
  array['uuid', 'uuid', 'uuid', 'bigint', 'bigint', 'text', 'integer', 'integer'],
  'attempt-fenced production authorization exists'
);
select has_function(
  'private',
  'commit_attempt_production_promotion_v1',
  array[
    'uuid', 'uuid', 'uuid', 'bigint', 'bigint', 'bigint',
    'text', 'text', 'text', 'text', 'jsonb'
  ],
  'attempt-fenced production commit exists'
);
select has_function(
  'private',
  'commit_reconciled_production_promotion_v1',
  array[
    'uuid', 'bigint', 'bigint', 'text', 'text', 'text', 'text', 'jsonb'
  ],
  'reconciler production commit uses a dedicated fenced wrapper'
);
select ok(
  has_function_privilege(
    'content_deployer',
    'private.authorize_attempt_production_promotion_v1(uuid,uuid,uuid,bigint,bigint,text,integer,integer)',
    'execute'
  ),
  'the deployer can invoke only the expanded attempt-fenced authorization path'
);
select ok(
  has_function_privilege(
    'content_deployer',
    'private.commit_attempt_production_promotion_v1(uuid,uuid,uuid,bigint,bigint,bigint,text,text,text,text,jsonb)',
    'execute'
  ),
  'the deployer can commit with attempt identity'
);
select ok(
  has_function_privilege(
    'content_deployer',
    'private.commit_reconciled_production_promotion_v1(uuid,bigint,bigint,text,text,text,text,jsonb)',
    'execute'
  ),
  'the deployer can finish only a fenced reconciler promotion'
);

create temporary table promotion_results (
  label text primary key,
  result jsonb not null
);
grant all on promotion_results to content_rpc_owner, content_deployer;

set local role content_rpc_owner;
update private.content_settings
set enabled = true
where setting_key = 'publication';
delete from private.production_promotion_slot
where project_key = 'bubble-brain-pages';
delete from private.release_current_pointer where singleton;
insert into private.site_releases(
  id, sequence, manifest_object_key, manifest_byte_length, manifest_sha256,
  content_root_sha256, schema_version, taxonomy_version, serializer_version,
  search_contract_version, source_contract_version, structured_cutover_date,
  no_report_days
) values (
  '73000000-0000-4000-8000-000000000001', 972001,
  'site-manifests/sha256/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json',
  100, repeat('a', 64), repeat('b', 64), 1, 1,
  'daily-json-c14n-v1', 'search-v1', 'daily-source-v1', '2026-07-16', '{}'
);
insert into private.release_artifacts(
  site_release_id, object_key, byte_length, artifact_sha256,
  artifact_fingerprint_sha256, hash_algorithm, code_sha,
  build_environment_version
) values (
  '73000000-0000-4000-8000-000000000001',
  'artifacts/sha256/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.json',
  100, repeat('c', 64), repeat('d', 64),
  'sha256-content-addressed-pages-v1', repeat('e', 40),
  'node22.17-astro7-hugo0.147.9-v1'
);
insert into private.content_outbox(
  site_release_id, dispatch_id, payload, status, attempt_token,
  execution_generation, lease_expires_at, locked_by
) values (
  '73000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  '{"mode":"production"}', 'preview_verified',
  '75000000-0000-4000-8000-000000000001', 7,
  clock_timestamp() + interval '30 minutes', 'workflow:original'
);
insert into private.release_deployment_attempts(
  site_release_id, dispatch_id, event_type, evidence
) values (
  '73000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  'preview_verified', '{"route_parity":true}'
);
select throws_ok(
  $$select private.authorize_attempt_production_promotion_v1(
    '73000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000099',
    '75000000-0000-4000-8000-000000000001',
    7, 0, 'broker:wrong-dispatch', 900, 600
  )$$,
  'P0001',
  'Stale production deployment attempt',
  'a mismatched dispatch cannot authorize production'
);
select throws_ok(
  $$select private.authorize_attempt_production_promotion_v1(
    '73000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000099',
    7, 0, 'broker:wrong-token', 900, 600
  )$$,
  'P0001',
  'Stale production deployment attempt',
  'a mismatched token cannot authorize production'
);
select throws_ok(
  $$select private.authorize_attempt_production_promotion_v1(
    '73000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001',
    8, 0, 'broker:wrong-generation', 900, 600
  )$$,
  'P0001',
  'Stale production deployment attempt',
  'a mismatched execution generation cannot authorize production'
);

select is(
  (
    select count(*)
    from private.production_promotion_slot
    where project_key = 'bubble-brain-pages'
  ),
  0::bigint,
  'failed attempt checks leave the production slot unchanged'
);

update private.content_outbox
set lease_expires_at = clock_timestamp() - interval '1 second'
where site_release_id = '73000000-0000-4000-8000-000000000001';
select throws_ok(
  $$select private.authorize_attempt_production_promotion_v1(
    '73000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001',
    7, 0,
    'broker:74000000-0000-4000-8000-000000000001:75000000-0000-4000-8000-000000000001',
    900, 600
  )$$,
  'P0001',
  'Stale production deployment attempt',
  'an expired attempt cannot authorize production'
);

set local role content_rpc_owner;
update private.content_outbox
set lease_expires_at = clock_timestamp() + interval '30 minutes'
where site_release_id = '73000000-0000-4000-8000-000000000001';

select throws_ok(
  $$select private.authorize_attempt_production_promotion_v1(
    '73000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001',
    7, 0, 'reconciler:forged', 900, 600
  )$$,
  'P0001',
  'Invalid production broker lock identity',
  'a workflow attempt cannot forge the reconciler lock namespace'
);

insert into promotion_results(label, result)
select 'authorized', private.authorize_attempt_production_promotion_v1(
  '73000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001',
  7, 0,
  'broker:74000000-0000-4000-8000-000000000001:75000000-0000-4000-8000-000000000001',
  900, 600
);
select is(
  (select result ->> 'already_committed'
   from promotion_results where label = 'authorized'),
  'false',
  'the current live attempt receives a forward authorization'
);

select is(
  (
    select status
    from private.content_outbox
    where site_release_id = '73000000-0000-4000-8000-000000000001'
  ),
  'promoting',
  'authorization atomically marks the current attempt promoting'
);
select ok(
  (
    select lease_expires_at >= clock_timestamp() + interval '14 minutes'
    from private.content_outbox
    where site_release_id = '73000000-0000-4000-8000-000000000001'
  ),
  'authorization renews the attempt beyond the production slot window'
);

update private.content_outbox
set attempt_token = '75000000-0000-4000-8000-000000000002',
    execution_generation = 8,
    status = 'claimed',
    lease_expires_at = clock_timestamp() + interval '30 minutes'
where site_release_id = '73000000-0000-4000-8000-000000000001';
select throws_ok(
  format(
    $sql$select private.commit_attempt_production_promotion_v1(
      %L::uuid, %L::uuid, %L::uuid, 7, %L::bigint, 0,
      %L, %L, %L, %L, %L::jsonb
    )$sql$,
    '73000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    '75000000-0000-4000-8000-000000000001',
    (select result ->> 'fencing_token'
     from promotion_results where label = 'authorized'),
    '76000000-0000-4000-8000-000000000001',
    repeat('a', 64),
    repeat('c', 64),
    'node22.17-astro7-hugo0.147.9-v1',
    jsonb_build_object('multi_edge_verified', true)::text
  ),
  'P0001',
  'Stale production deployment attempt',
  'a reclaimed attempt fences the old production commit'
);

select is(
  (select count(*) from private.release_current_pointer),
  0::bigint,
  'a fenced old commit cannot advance the production pointer'
);

update private.content_outbox
set attempt_token = '75000000-0000-4000-8000-000000000001',
    execution_generation = 7,
    status = 'promoting',
    lease_expires_at = clock_timestamp() + interval '15 minutes'
where site_release_id = '73000000-0000-4000-8000-000000000001';
select private.mark_promotion_deploying_v1(
  '73000000-0000-4000-8000-000000000001',
  (select (result ->> 'fencing_token')::bigint
   from promotion_results where label = 'authorized'),
  0
);
select private.mark_promotion_verifying_v1(
  '73000000-0000-4000-8000-000000000001',
  (select (result ->> 'fencing_token')::bigint
   from promotion_results where label = 'authorized'),
  0,
  '76000000-0000-4000-8000-000000000001'
);
insert into promotion_results(label, result)
select 'committed', private.commit_attempt_production_promotion_v1(
  '73000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001',
  7,
  (select (result ->> 'fencing_token')::bigint
   from promotion_results where label = 'authorized'),
  0,
  '76000000-0000-4000-8000-000000000001',
  repeat('a', 64),
  repeat('c', 64),
  'node22.17-astro7-hugo0.147.9-v1',
  '{"multi_edge_verified":true}'
);

select is(
  (select target_site_release_id::text from private.release_current_pointer),
  '73000000-0000-4000-8000-000000000001',
  'the current attempt can commit the exact release'
);
select is(
  (
    select status
    from private.content_outbox
    where site_release_id = '73000000-0000-4000-8000-000000000001'
  ),
  'deployed',
  'the fenced commit marks only the current attempt deployed'
);
select is(
  (select result ->> 'execution_generation'
   from promotion_results where label = 'committed'),
  '7',
  'commit evidence retains the execution generation'
);

insert into promotion_results(label, result)
select 'retry', private.authorize_attempt_production_promotion_v1(
  '73000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001',
  7, 1,
  'broker:74000000-0000-4000-8000-000000000001:75000000-0000-4000-8000-000000000001',
  900, 600
);
select is(
  (select result ->> 'already_committed'
   from promotion_results where label = 'retry'),
  'true',
  'the exact committed attempt receives a no-side-effect idempotent result'
);

select * from finish();
rollback;
