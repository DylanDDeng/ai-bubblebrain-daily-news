begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

select ok(
  has_function_privilege(
    'content_deployer',
    'private.reserve_code_release_v1(uuid,text,text,text,text)',
    'execute'
  ),
  'deployer can reserve automatic code releases'
);
select ok(
  has_function_privilege(
    'content_deployer',
    'private.finalize_code_release_v1(uuid,text,bigint,text,uuid,jsonb)',
    'execute'
  ),
  'deployer can finalize automatic code releases'
);
select ok(
  not has_function_privilege(
    'content_controller',
    'private.reserve_code_release_v1(uuid,text,text,text,text)',
    'execute'
  ),
  'interactive controllers cannot bypass automatic code release validation'
);
select ok(
  has_table_privilege('content_backup', 'private.release_head_claims', 'select')
    and not has_table_privilege('content_backup', 'private.release_head_claims', 'insert'),
  'backup role can read but cannot mutate release head claims'
);
select ok(
  has_function_privilege(
    'content_ingestor',
    'private.defer_editorial_publish_request_v1(uuid,text,text)',
    'execute'
  ) and has_function_privilege(
    'content_ingestor',
    'private.defer_global_suppression_request_v1(uuid,text,text)',
    'execute'
  ),
  'ingestor can defer transient editorial and suppression head conflicts'
);
select ok(
  not has_function_privilege(
    'content_editor',
    'private.defer_editorial_publish_request_v1(uuid,text,text)',
    'execute'
  ) and not has_function_privilege(
    'content_controller',
    'private.defer_global_suppression_request_v1(uuid,text,text)',
    'execute'
  ) and not has_function_privilege(
    'content_deployer',
    'private.defer_editorial_publish_request_v1(uuid,text,text)',
    'execute'
  ),
  'non-ingestor runtime roles cannot defer publication requests'
);

create temporary table code_reservation(result jsonb);
create temporary table finalized_code_release(result jsonb);
create temporary table rebuild_result(result jsonb);
create temporary table second_code_reservation(result jsonb);
create temporary table second_code_release(result jsonb);
grant all on code_reservation, finalized_code_release, rebuild_result,
  second_code_reservation, second_code_release to content_rpc_owner;

set local role content_rpc_owner;
select is(
  (select enabled from private.content_settings where setting_key = 'code_release'),
  false,
  'automatic code releases remain disabled until explicitly enabled after bootstrap'
);
update private.content_settings set enabled = true
where setting_key in ('publication', 'code_release');

insert into private.report_snapshots(
  id, report_date, report_version, parsed_document, object_key,
  byte_length, byte_sha256, serializer_version
) values (
  '10000000-0000-4000-8000-000000000001', '2026-07-19', 1,
  '{"date":"2026-07-19","items":[],"batches":[]}'::jsonb,
  'report-snapshots/sha256/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json',
  42, repeat('a', 64), 'daily-json-c14n-v1'
);
insert into private.site_releases(
  id, sequence, expected_predecessor_id, manifest_object_key,
  manifest_byte_length, manifest_sha256, content_root_sha256,
  schema_version, taxonomy_version, serializer_version,
  search_contract_version, source_contract_version,
  structured_cutover_date, no_report_days
) values (
  '20000000-0000-4000-8000-000000000001', 9001, null,
  'site-manifests/sha256/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.json',
  100, repeat('b', 64), repeat('c', 64), 1, 1,
  'daily-json-c14n-v1', 'search-v1', 'daily-source-v1', '2026-07-16', '{}'
);
insert into private.site_release_reports(
  site_release_id, report_date, report_snapshot_id, byte_sha256
) values (
  '20000000-0000-4000-8000-000000000001', '2026-07-19',
  '10000000-0000-4000-8000-000000000001', repeat('a', 64)
);
insert into private.release_artifacts(
  site_release_id, object_key, byte_length, artifact_sha256,
  artifact_fingerprint_sha256, hash_algorithm, code_sha,
  build_environment_version, production_verified_at
) values (
  '20000000-0000-4000-8000-000000000001',
  'artifacts/sha256/dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd.json',
  100, repeat('d', 64), repeat('e', 64),
  'sha256-content-addressed-pages-v1', repeat('3', 40),
  'node22.17-astro7-hugo0.147.9-v1', clock_timestamp()
);
insert into private.release_current_pointer(
  singleton, target_site_release_id, target_release_sequence, generation,
  pages_deployment_id, manifest_sha256, artifact_sha256,
  build_environment_version
) values (
  true, '20000000-0000-4000-8000-000000000001', 9001, 1,
  'base-pages-deployment', repeat('b', 64), repeat('d', 64),
  'node22.17-astro7-hugo0.147.9-v1'
);

insert into code_reservation(result)
select private.reserve_code_release_v1(
  '30000000-0000-4000-8000-000000000001', repeat('4', 40), repeat('3', 40),
  'node22.17-astro7-hugo0.147.9-v1', repeat('f', 64)
) as result;

select is(
  (select result ->> 'expected_predecessor_id' from code_reservation),
  '20000000-0000-4000-8000-000000000001',
  'code release is based on the current production release'
);
select is(
  (select result ->> 'content_root_sha256' from code_reservation),
  repeat('c', 64),
  'code release preserves the current content root'
);
select is(
  (select count(*) from private.site_release_reservation_reports
   where reservation_id = (select (result ->> 'reservation_id')::uuid from code_reservation)),
  1::bigint,
  'code release clones every current report reference'
);
select is(
  (select result ->> 'dispatch_id' from code_reservation),
  '30000000-0000-4000-8000-000000000001',
  'reservation returns a deterministic dispatch identity bound to its idempotency key'
);
select throws_ok(
  $$select private.reserve_site_release_v1('10000000-0000-4000-8000-000000000001')$$,
  '55P03',
  'Release head is busy; retry from the latest production pointer',
  'content and code releases cannot form sibling children'
);

insert into finalized_code_release(result)
select private.finalize_code_release_v1(
  (select (result ->> 'reservation_id')::uuid from code_reservation),
  'site-manifests/sha256/1111111111111111111111111111111111111111111111111111111111111111.json',
  101, repeat('1', 64),
  '30000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'dispatch_id', '30000000-0000-4000-8000-000000000001',
    'site_release_id', (select result ->> 'site_release_id' from code_reservation),
    'site_release_sequence', (select (result ->> 'site_release_sequence')::bigint from code_reservation),
    'expected_predecessor_id', '20000000-0000-4000-8000-000000000001',
    'expected_content_sha', repeat('c', 64),
    'code_sha', repeat('4', 40),
    'build_environment_version', 'node22.17-astro7-hugo0.147.9-v1',
    'mode', 'production'
  )
) as result;

select is(
  (select release_kind from private.site_releases
   where id = (select (result ->> 'site_release_id')::uuid from finalized_code_release)),
  'code',
  'finalized release records its code-only lineage'
);
select is(
  (select content_root_sha256 from private.site_releases
   where id = (select (result ->> 'site_release_id')::uuid from finalized_code_release)),
  repeat('c', 64),
  'finalized code release keeps content byte-identical'
);
select is(
  (select payload ->> 'code_sha' from private.content_outbox
   where site_release_id = (select (result ->> 'site_release_id')::uuid from finalized_code_release)),
  repeat('4', 40),
  'outbox pins the requested main code SHA'
);
select is(
  (select content_base_release_id::text from private.site_releases
   where id = (select (result ->> 'site_release_id')::uuid from finalized_code_release)),
  '20000000-0000-4000-8000-000000000001',
  'first code release records the canonical content-bearing base release'
);
select is(
  (
    select private.finalize_code_release_v1(
      (select (result ->> 'reservation_id')::uuid from code_reservation),
      'site-manifests/sha256/1111111111111111111111111111111111111111111111111111111111111111.json',
      101, repeat('1', 64),
      '30000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'dispatch_id', '30000000-0000-4000-8000-000000000001',
        'site_release_id', (select result ->> 'site_release_id' from code_reservation),
        'site_release_sequence', (select (result ->> 'site_release_sequence')::bigint from code_reservation),
        'expected_predecessor_id', '20000000-0000-4000-8000-000000000001',
        'expected_content_sha', repeat('c', 64),
        'code_sha', repeat('4', 40),
        'build_environment_version', 'node22.17-astro7-hugo0.147.9-v1',
        'mode', 'production'
      )
    ) ->> 'idempotent'
  ),
  'true',
  'finalize replays the exact deterministic tuple idempotently'
);
select is(
  (select count(*) from private.content_outbox
   where site_release_id = (select (result ->> 'site_release_id')::uuid from finalized_code_release)),
  1::bigint,
  'deterministic finalize replay creates no duplicate outbox work'
);
select throws_ok(
  $$select private.reserve_site_release_v1('10000000-0000-4000-8000-000000000001')$$,
  '55P03',
  'Release head is busy; retry from the latest production pointer',
  'finalized but unpromoted release continues to own the production head'
);
select throws_ok(
  format(
    $$select private.finalize_code_release_v1(%L::uuid, %L, 101, %L, %L::uuid, %L::jsonb)$$,
    (select result ->> 'site_release_id' from finalized_code_release),
    'site-manifests/sha256/1111111111111111111111111111111111111111111111111111111111111111.json',
    repeat('1', 64),
    '40000000-0000-4000-8000-000000000002',
    jsonb_build_object('different', true)::text
  ),
  '23505',
  'Code release finalize idempotency collision',
  'finalize rejects the same reservation with a different dispatch tuple'
);

insert into private.content_outbox(site_release_id, dispatch_id, payload)
select site_release_id,
  '40000000-0000-4000-8000-000000000003',
  payload || jsonb_build_object('dispatch_id', '40000000-0000-4000-8000-000000000003')
from private.content_outbox
where dispatch_id = '30000000-0000-4000-8000-000000000001';
update private.content_outbox set status = 'dead_letter'
where dispatch_id = '30000000-0000-4000-8000-000000000001';
select is(
  (select count(*) from private.release_head_claims),
  1::bigint,
  'one dead-lettered outbox does not release a head still owned by actionable rebuild work'
);
update private.content_outbox set status = 'dead_letter'
where dispatch_id = '40000000-0000-4000-8000-000000000003';
insert into private.content_outbox(site_release_id, dispatch_id, payload, inserted_at)
select site_release_id,
  '40000000-0000-4000-8000-000000000004',
  payload || jsonb_build_object('dispatch_id', '40000000-0000-4000-8000-000000000004'),
  inserted_at - interval '1 day'
from private.content_outbox
where dispatch_id = '30000000-0000-4000-8000-000000000001';

create or replace function private.consume_attestation_v1(
  assertion jsonb,
  expected_audience text,
  expected_action text,
  expected_body_sha256 text,
  required_roles text[]
)
returns table(actor_sub text, actor_email text, actor_role text, assertion_jti uuid)
language sql
volatile
security definer
set search_path = ''
as $$
  select 'automatic-code-release-owner'::text,
    'owner@example.test'::text,
    'Owner'::text,
    '60000000-0000-4000-8000-000000000001'::uuid
$$;

select throws_ok(
  format(
    $$select private.rebuild_content_release_v1(%L::uuid, %L, %L, %L::uuid, '{}'::jsonb, %L)$$,
    (select result ->> 'site_release_id' from finalized_code_release),
    'retry while sibling dispatch remains actionable',
    'REBUILD ' || (select result ->> 'site_release_id' from finalized_code_release),
    '50000000-0000-4000-8000-000000000000',
    repeat('9', 64)
  ),
  '55P03',
  'Release already has actionable dispatch work',
  'manual rebuild rejects duplicate dispatch while sibling outbox work remains actionable'
);
update private.content_outbox set status = 'dead_letter'
where dispatch_id = '40000000-0000-4000-8000-000000000004';

insert into rebuild_result(result)
select private.rebuild_content_release_v1(
  (select (result ->> 'site_release_id')::uuid from finalized_code_release),
  'retry after dead letter',
  'REBUILD ' || (select result ->> 'site_release_id' from finalized_code_release),
  '50000000-0000-4000-8000-000000000001',
  '{}'::jsonb,
  repeat('9', 64)
);
select is(
  (select count(*) from private.release_head_claims),
  1::bigint,
  'manual rebuild atomically reacquires the current predecessor head'
);
select is(
  (select result ->> 'status' from rebuild_result),
  'queued',
  'manual rebuild queues a new outbox only after reacquiring the head'
);
update private.content_outbox set status = 'dead_letter'
where id = (select (result ->> 'outbox_id')::uuid from rebuild_result);

insert into private.release_artifacts(
  site_release_id, object_key, byte_length, artifact_sha256,
  artifact_fingerprint_sha256, hash_algorithm, code_sha,
  build_environment_version, production_verified_at
)
select (result ->> 'site_release_id')::uuid,
  'artifacts/sha256/6666666666666666666666666666666666666666666666666666666666666666.json',
  100, repeat('6', 64), repeat('7', 64),
  'sha256-content-addressed-pages-v1', repeat('4', 40),
  'node22.17-astro7-hugo0.147.9-v1', clock_timestamp()
from finalized_code_release;
update private.release_current_pointer pointer set
  target_site_release_id = (select (result ->> 'site_release_id')::uuid from finalized_code_release),
  target_release_sequence = (select (result ->> 'site_release_sequence')::bigint from finalized_code_release),
  generation = 2,
  pages_deployment_id = 'code-pages-deployment',
  manifest_sha256 = repeat('1', 64),
  artifact_sha256 = repeat('6', 64)
where pointer.singleton;

insert into second_code_reservation(result)
select private.reserve_code_release_v1(
  '30000000-0000-4000-8000-000000000002', repeat('5', 40), repeat('4', 40),
  'node22.17-astro7-hugo0.147.9-v1', repeat('8', 64)
);
insert into second_code_release(result)
select private.finalize_code_release_v1(
  (select (result ->> 'reservation_id')::uuid from second_code_reservation),
  'site-manifests/sha256/2222222222222222222222222222222222222222222222222222222222222222.json',
  102, repeat('2', 64),
  '30000000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'dispatch_id', '30000000-0000-4000-8000-000000000002',
    'site_release_id', (select result ->> 'site_release_id' from second_code_reservation),
    'site_release_sequence', (select (result ->> 'site_release_sequence')::bigint from second_code_reservation),
    'expected_predecessor_id', (select result ->> 'site_release_id' from finalized_code_release),
    'expected_content_sha', repeat('c', 64),
    'code_sha', repeat('5', 40),
    'build_environment_version', 'node22.17-astro7-hugo0.147.9-v1',
    'mode', 'production'
  )
);
select is(
  (select release.content_base_release_id::text
   from private.site_releases release
   where release.id = (select (result ->> 'site_release_id')::uuid from second_code_release)),
  '20000000-0000-4000-8000-000000000001',
  'code-on-code release retains the canonical content-bearing base instead of the prior code release'
);
update private.content_outbox set status = 'deployed'
where site_release_id = (select (result ->> 'site_release_id')::uuid from second_code_release);
select lives_ok(
  $$select private.reserve_site_release_v1('10000000-0000-4000-8000-000000000001')$$,
  'content publication can continue after the code release reaches a terminal state'
);

insert into private.editorial_drafts(
  id, base_site_release_id, owner_sub, status
) values (
  '70000000-0000-4000-8000-000000000001',
  (select (result ->> 'site_release_id')::uuid from finalized_code_release),
  'automatic-code-release-owner', 'publishing'
);
insert into private.preview_builds(
  id, draft_id, base_site_release_id, preview_sha256,
  artifact_sha256, pages_preview_url, verifier_evidence
) values (
  '71000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  (select (result ->> 'site_release_id')::uuid from finalized_code_release),
  repeat('a', 64), repeat('b', 64),
  'https://editorial-preview.example.test', '{"verified":true}'::jsonb
);
insert into private.editorial_publish_requests(
  id, draft_id, preview_build_id, requested_by, reason, idempotency_key,
  status, locked_by, lease_expires_at
) values (
  '72000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  'automatic-code-release-owner', 'publish after active release',
  '73000000-0000-4000-8000-000000000001',
  'claimed', 'editorial-transient-worker', clock_timestamp() + interval '5 minutes'
);
select throws_ok(
  $$select private.defer_editorial_publish_request_v1(
    '72000000-0000-4000-8000-000000000001',
    'editorial-transient-worker', 'XX000'
  )$$,
  '22023',
  'Editorial deferral requires a transient release-head conflict',
  'editorial deferral rejects non-transient failures'
);

insert into private.content_items(
  id, event_id, identity_version, source_type, content_type,
  source_name, time_precision, provenance_kind
) values (
  'n_' || repeat('1', 64), 'e_' || repeat('2', 64), 1,
  'test', 'article', 'automatic-code-release-test', 'exact', 'live_ingestion'
);
insert into private.global_suppressions(
  id, item_id, reason, created_by, assertion_jti, active
) values (
  '74000000-0000-4000-8000-000000000001', 'n_' || repeat('1', 64),
  'transient suppression test', 'automatic-code-release-owner',
  '75000000-0000-4000-8000-000000000001', false
);
insert into private.global_suppression_requests(
  id, suppression_id, item_id, base_site_release_id,
  requested_by, requested_role, request_jti, reason, idempotency_key,
  status, locked_by, lease_expires_at
) values (
  '76000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001', 'n_' || repeat('1', 64),
  (select (result ->> 'site_release_id')::uuid from finalized_code_release),
  'automatic-code-release-owner', 'Owner',
  '77000000-0000-4000-8000-000000000001',
  'suppress after active release', '78000000-0000-4000-8000-000000000001',
  'claimed', 'suppression-transient-worker', clock_timestamp() + interval '5 minutes'
);

select private.defer_editorial_publish_request_v1(
  '72000000-0000-4000-8000-000000000001',
  'editorial-transient-worker', '55P03'
);
select private.defer_global_suppression_request_v1(
  '76000000-0000-4000-8000-000000000001',
  'suppression-transient-worker', '40001'
);
select ok(
  (select status = 'queued' and locked_by is null and lease_expires_at is null
     and reservation_id is null and error_code = '55P03'
   from private.editorial_publish_requests
   where id = '72000000-0000-4000-8000-000000000001'),
  'editorial transient deferral requeues the claimed request and clears its lease'
);
select is(
  (select status from private.editorial_drafts
   where id = '70000000-0000-4000-8000-000000000001'),
  'publishing',
  'editorial transient deferral does not mark the draft failed'
);
select ok(
  (select status = 'queued' and locked_by is null and lease_expires_at is null
     and reservation_id is null and error_code = '40001'
   from private.global_suppression_requests
   where id = '76000000-0000-4000-8000-000000000001'),
  'global suppression transient deferral requeues the claimed request without failing it'
);

select * from finish();
rollback;
