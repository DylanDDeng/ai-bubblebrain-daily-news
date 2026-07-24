begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

select has_column(
  'private', 'content_outbox', 'attempt_token',
  'outbox stores the active attempt token'
);
select has_column(
  'private', 'content_outbox', 'execution_generation',
  'outbox stores the monotonic execution generation'
);
select has_column(
  'private', 'release_deployment_checkpoints', 'originating_attempt_token',
  'checkpoints retain the attempt token that first produced the evidence'
);
select has_column(
  'private', 'release_deployment_checkpoints',
  'originating_execution_generation',
  'checkpoints retain the generation that first produced the evidence'
);
select ok(
  exists (
    select 1
    from pg_index index_row
    join pg_class relation on relation.oid = index_row.indrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relname = 'content_outbox'
      and index_row.indisunique
      and position(
        'attempt_token IS NOT NULL'
        in pg_get_expr(index_row.indpred, index_row.indrelid)
      ) > 0
  ),
  'non-null attempt tokens are unique across outbox rows'
);
select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relname = 'release_deployment_checkpoints'
  ),
  'checkpoint evidence is protected by forced RLS'
);
select ok(
  has_table_privilege(
    'content_rpc_owner', 'private.release_deployment_checkpoints', 'select'
  )
    and has_table_privilege(
      'content_rpc_owner', 'private.release_deployment_checkpoints', 'insert'
    )
    and has_table_privilege(
      'content_rpc_owner', 'private.release_deployment_checkpoints', 'update'
    ),
  'the no-login RPC owner can maintain checkpoints'
);
select ok(
  has_table_privilege(
    'content_backup', 'private.release_deployment_checkpoints', 'select'
  )
    and not has_table_privilege(
      'content_backup', 'private.release_deployment_checkpoints', 'insert'
    )
    and not has_table_privilege(
      'content_backup', 'private.release_deployment_checkpoints', 'update'
    )
    and not has_table_privilege(
      'content_backup', 'private.release_deployment_checkpoints', 'delete'
    ),
  'the backup role remains read-only'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'anon', 'authenticated', 'service_role', 'content_ingestor',
      'content_editor', 'content_controller', 'content_reader',
      'content_deployer'
    ]) role_name
    where has_table_privilege(
      role_name, 'private.release_deployment_checkpoints', 'select'
    )
      or has_table_privilege(
        role_name, 'private.release_deployment_checkpoints', 'insert'
      )
      or has_table_privilege(
        role_name, 'private.release_deployment_checkpoints', 'update'
      )
      or has_table_privilege(
        role_name, 'private.release_deployment_checkpoints', 'delete'
      )
  ),
  'runtime roles cannot access checkpoint rows directly'
);

create temporary table checkpoint_claims (
  label text primary key,
  result jsonb not null
);
create temporary table checkpoint_plans (
  label text primary key,
  result jsonb not null
);
grant all on checkpoint_claims, checkpoint_plans
  to content_rpc_owner, content_deployer;

set local role content_rpc_owner;
insert into private.site_releases(
  id, sequence, manifest_object_key, manifest_byte_length, manifest_sha256,
  content_root_sha256, schema_version, taxonomy_version, serializer_version,
  search_contract_version, source_contract_version, structured_cutover_date,
  no_report_days
) values (
  '71000000-0000-4000-8000-000000000001', 971001,
  'site-manifests/sha256/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.json',
  100, repeat('b', 64), repeat('c', 64), 1, 1,
  'daily-json-c14n-v1', 'search-v1', 'daily-source-v1', '2026-07-16', '{}'
);
insert into private.release_artifacts(
  site_release_id, object_key, byte_length, artifact_sha256,
  artifact_fingerprint_sha256, hash_algorithm, code_sha,
  build_environment_version
) values (
  '71000000-0000-4000-8000-000000000001',
  'artifacts/sha256/dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd.json',
  100, repeat('d', 64), repeat('e', 64),
  'sha256-content-addressed-pages-v1', repeat('3', 40),
  'node22.17-astro7-hugo0.147.9-v1'
);
insert into private.content_outbox(
  site_release_id, dispatch_id, payload
) values (
  '71000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  '{"mode":"production"}'
);
reset role;

set local role content_rpc_owner;
insert into checkpoint_claims(label, result)
select 'first', private.claim_content_outbox_v1('checkpoint-test-first', 1800);
select private.record_deployment_checkpoint_v2(
  '71000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  (select (result ->> 'attempt_token')::uuid
   from checkpoint_claims where label = 'first'),
  (select (result ->> 'execution_generation')::bigint
   from checkpoint_claims where label = 'first'),
  'artifact_registered',
  jsonb_build_object(
    'artifact_sha256', repeat('d', 64),
    'content_sha256', repeat('c', 64),
    'code_sha', repeat('3', 40),
    'resume_contract_version', 'r2-materialize-v1'
  )
);
select private.record_deployment_checkpoint_v2(
  '71000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  (select (result ->> 'attempt_token')::uuid
   from checkpoint_claims where label = 'first'),
  (select (result ->> 'execution_generation')::bigint
   from checkpoint_claims where label = 'first'),
  'preview_verified',
  jsonb_build_object(
    'artifact_sha256', repeat('d', 64),
    'content_sha256', repeat('c', 64),
    'code_sha', repeat('3', 40),
    'preview_url', 'https://first-preview.example.invalid',
    'resume_contract_version', 'r2-materialize-v1'
  )
);
reset role;
set local role content_rpc_owner;
select is(
  (select (result ->> 'execution_generation')::bigint
   from checkpoint_claims where label = 'first'),
  1::bigint,
  'the first claim starts generation one'
);
select is(
  (select count(*) from private.release_deployment_checkpoints
   where site_release_id = '71000000-0000-4000-8000-000000000001'),
  2::bigint,
  'the first attempt records artifact and preview checkpoints'
);
select is(
  (
    select count(distinct originating_attempt_token)
    from private.release_deployment_checkpoints
    where site_release_id = '71000000-0000-4000-8000-000000000001'
      and originating_attempt_token = (
        select (result ->> 'attempt_token')::uuid
        from checkpoint_claims where label = 'first'
      )
      and originating_execution_generation = 1
  ),
  1::bigint,
  'both checkpoints retain the originating fenced attempt'
);

set local role content_rpc_owner;
update private.content_outbox
set lease_expires_at = clock_timestamp() - interval '1 second'
where site_release_id = '71000000-0000-4000-8000-000000000001';
reset role;

set local role content_rpc_owner;
insert into checkpoint_claims(label, result)
select 'second', private.claim_content_outbox_v1('checkpoint-test-second', 1800);
select private.record_deployment_checkpoint_v2(
  '71000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  (select (result ->> 'attempt_token')::uuid
   from checkpoint_claims where label = 'second'),
  (select (result ->> 'execution_generation')::bigint
   from checkpoint_claims where label = 'second'),
  'preview_verified',
  jsonb_build_object(
    'artifact_sha256', repeat('d', 64),
    'content_sha256', repeat('c', 64),
    'code_sha', repeat('3', 40),
    'preview_url', 'https://first-preview.example.invalid',
    'resume_contract_version', 'r2-materialize-v1'
  )
);
insert into checkpoint_plans(label, result)
select 'second', private.get_content_release_resume_plan_v1(
  '71000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  (select (result ->> 'attempt_token')::uuid
   from checkpoint_claims where label = 'second')
);
reset role;
set local role content_rpc_owner;
select is(
  (select (result ->> 'execution_generation')::bigint
   from checkpoint_claims where label = 'second'),
  2::bigint,
  'a reclaimed outbox row advances its execution generation'
);
select isnt(
  (select result ->> 'attempt_token'
   from checkpoint_claims where label = 'second'),
  (select result ->> 'attempt_token'
   from checkpoint_claims where label = 'first'),
  'a reclaimed outbox row receives a fresh attempt token'
);
select is(
  (select count(*) from private.release_deployment_checkpoints
   where site_release_id = '71000000-0000-4000-8000-000000000001'),
  2::bigint,
  'a later attempt reuses identical checkpoint evidence without replacing it'
);
select is(
  (
    select originating_attempt_token::text
    from private.release_deployment_checkpoints
    where site_release_id = '71000000-0000-4000-8000-000000000001'
      and stage = 'preview_verified'
  ),
  (select result ->> 'attempt_token'
   from checkpoint_claims where label = 'first'),
  'checkpoint reuse preserves the original attempt token'
);
select is(
  (
    select count(*)
    from private.release_deployment_attempts
    where site_release_id = '71000000-0000-4000-8000-000000000001'
      and event_type = 'preview_verified'
  ),
  2::bigint,
  'checkpoint reuse still appends an audit event for the new attempt'
);
set local role content_rpc_owner;
select throws_ok(
  format(
    $sql$select private.record_deployment_checkpoint_v2(
      %L::uuid, %L::uuid, %L::uuid, %L::bigint, 'preview_verified',
      %L::jsonb
    )$sql$,
    '71000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    (select result ->> 'attempt_token'
     from checkpoint_claims where label = 'second'),
    (select result ->> 'execution_generation'
     from checkpoint_claims where label = 'second'),
    jsonb_build_object(
      'artifact_sha256', repeat('d', 64),
      'content_sha256', repeat('c', 64),
      'code_sha', repeat('3', 40),
      'preview_url', 'https://different-preview.example.invalid',
      'resume_contract_version', 'r2-materialize-v1'
    )::text
  ),
  'P0001',
  'Deployment checkpoint identity collision',
  'a later attempt cannot replace immutable preview identity'
);
reset role;
set local role content_rpc_owner;
select is(
  (select result ->> 'resume_stage'
   from checkpoint_plans where label = 'second'),
  'promote',
  'the server resumes at promotion only after exact checkpoint validation'
);
select is(
  (select result #>> '{preview_checkpoint,artifact_sha256}'
   from checkpoint_plans where label = 'second'),
  repeat('d', 64),
  'the resume plan returns the exact checkpoint artifact identity'
);
select is(
  (select result #>> '{preview_checkpoint,preview_url}'
   from checkpoint_plans where label = 'second'),
  'https://first-preview.example.invalid',
  'the resume plan returns the immutable verified preview URL'
);

set local role content_rpc_owner;
update private.release_deployment_checkpoints
set evidence = evidence - 'resume_contract_version'
where site_release_id = '71000000-0000-4000-8000-000000000001';
reset role;

set local role content_rpc_owner;
insert into checkpoint_plans(label, result)
select 'legacy', private.get_content_release_resume_plan_v1(
  '71000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  (select (result ->> 'attempt_token')::uuid
   from checkpoint_claims where label = 'second')
);
reset role;
select is(
  (select result ->> 'resume_stage'
   from checkpoint_plans where label = 'legacy'),
  'build',
  'checkpoints without the materializer capability contract fail closed to build'
);

select * from finish();
rollback;
