begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

select ok(
  exists (
    select 1
    from pg_trigger trigger
    join pg_class relation on relation.oid = trigger.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relname = 'site_release_reports'
      and trigger.tgname = 'enforce_monotonic_site_release_report'
      and not trigger.tgisinternal
  ),
  'site release reports have a monotonic snapshot trigger'
);

insert into private.report_snapshots(
  id, report_date, report_version, parsed_document, object_key,
  byte_length, byte_sha256, serializer_version
) values
  (
    '11111111-1111-4111-8111-111111111101',
    '2099-01-01', 1, '{"generated_at":"2099-01-01T01:00:00.000Z"}',
    'report-snapshots/sha256/' || repeat('a', 64) || '.json',
    1, repeat('a', 64), 'test-v1'
  ),
  (
    '11111111-1111-4111-8111-111111111102',
    '2099-01-01', 2, '{"generated_at":"2099-01-01T02:00:00.000Z"}',
    'report-snapshots/sha256/' || repeat('b', 64) || '.json',
    1, repeat('b', 64), 'test-v1'
  ),
  (
    '11111111-1111-4111-8111-111111111103',
    '2099-01-01', 3, '{"generated_at":"2099-01-01T03:00:00.000Z"}',
    'report-snapshots/sha256/' || repeat('c', 64) || '.json',
    1, repeat('c', 64), 'test-v1'
  );

insert into private.site_releases(
  id, expected_predecessor_id, manifest_object_key, manifest_byte_length,
  manifest_sha256, content_root_sha256, schema_version, taxonomy_version,
  serializer_version, search_contract_version, source_contract_version,
  structured_cutover_date
) values (
  '22222222-2222-4222-8222-222222222201', null,
  'site-manifests/sha256/' || repeat('d', 64) || '.json', 1,
  repeat('d', 64), repeat('e', 64), 1, 1,
  'test-v1', 'test-v1', 'test-v1', '2099-01-01'
);
insert into private.site_release_reports(
  site_release_id, report_date, report_snapshot_id, byte_sha256
) values (
  '22222222-2222-4222-8222-222222222201',
  '2099-01-01',
  '11111111-1111-4111-8111-111111111102',
  repeat('b', 64)
);

insert into private.site_releases(
  id, expected_predecessor_id, manifest_object_key, manifest_byte_length,
  manifest_sha256, content_root_sha256, schema_version, taxonomy_version,
  serializer_version, search_contract_version, source_contract_version,
  structured_cutover_date
) values
  (
    '22222222-2222-4222-8222-222222222202',
    '22222222-2222-4222-8222-222222222201',
    'site-manifests/sha256/' || repeat('f', 64) || '.json', 1,
    repeat('f', 64), repeat('1', 64), 1, 1,
    'test-v1', 'test-v1', 'test-v1', '2099-01-01'
  ),
  (
    '22222222-2222-4222-8222-222222222203',
    '22222222-2222-4222-8222-222222222201',
    'site-manifests/sha256/' || repeat('2', 64) || '.json', 1,
    repeat('2', 64), repeat('3', 64), 1, 1,
    'test-v1', 'test-v1', 'test-v1', '2099-01-01'
  );

select throws_ok(
  $$insert into private.site_release_reports(
      site_release_id, report_date, report_snapshot_id, byte_sha256
    ) values (
      '22222222-2222-4222-8222-222222222202',
      '2099-01-01',
      '11111111-1111-4111-8111-111111111101',
      repeat('a', 64)
    )$$,
  '22023',
  'Site release report snapshot is superseded',
  'an older cumulative report cannot replace its release predecessor'
);

select lives_ok(
  $$insert into private.site_release_reports(
      site_release_id, report_date, report_snapshot_id, byte_sha256
    ) values (
      '22222222-2222-4222-8222-222222222203',
      '2099-01-01',
      '11111111-1111-4111-8111-111111111103',
      repeat('c', 64)
    )$$,
  'a newer cumulative report may advance its release predecessor'
);

select * from finish();
rollback;
