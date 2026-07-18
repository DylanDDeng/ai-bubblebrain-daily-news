begin;

create extension if not exists pgtap with schema extensions;
select plan(112);

select cmp_ok(
  (select count(*) from information_schema.tables where table_schema = 'private' and table_name like '%content%' or table_schema = 'private' and table_name like '%release%'),
  '>=', 12::bigint,
  'content and release tables are installed in the private schema'
);
select is((select count(*) from private.content_settings), 7::bigint, 'all capability switches exist');
select is((select count(*) from private.content_settings where enabled), 0::bigint, 'all capability switches fail closed');
select ok(
  (select bool_and(rolcanlogin) from pg_roles where rolname in (
    'content_ingestor', 'content_editor', 'content_controller', 'content_reader', 'content_deployer'
  )),
  'all runtime capability roles are LOGIN roles'
);
select ok(
  not (select rolcanlogin from pg_roles where rolname = 'content_rpc_owner'),
  'function owner remains NOLOGIN'
);
select ok(
  (select bool_and(not rolsuper and not rolcreatedb and not rolcreaterole
    and not rolinherit and not rolreplication and not rolbypassrls)
   from pg_roles where rolname like 'content_%' and rolname <> 'content_backup'),
  'all content roles have the required safe role attributes'
);
select ok(
  (select rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole
     and not rolinherit and not rolreplication and rolbypassrls
   from pg_roles where rolname = 'content_backup'),
  'logical backup role has only LOGIN and BYPASSRLS role attributes'
);
select ok(
  has_schema_privilege('content_backup', 'private', 'usage')
    and not has_schema_privilege('content_backup', 'private', 'create'),
  'logical backup role can use but cannot create in the private schema'
);
select ok(
  not exists (
    select 1
    from information_schema.tables table_info
    where table_info.table_schema = 'private'
      and table_info.table_name ~ '^(admin_|consumed_attestation_jtis$|content_|daily_|editorial_|global_|preview_|production_|publication_|recovery_|release_|report_|site_)'
      and not has_table_privilege(
        'content_backup',
        format('%I.%I', table_info.table_schema, table_info.table_name),
        'select'
      )
  ),
  'logical backup role can select every content backup table'
);
select ok(
  not exists (
    select 1
    from information_schema.tables table_info
    where table_info.table_schema = 'private'
      and (
        has_table_privilege('content_backup', format('%I.%I', table_info.table_schema, table_info.table_name), 'insert')
        or has_table_privilege('content_backup', format('%I.%I', table_info.table_schema, table_info.table_name), 'update')
        or has_table_privilege('content_backup', format('%I.%I', table_info.table_schema, table_info.table_name), 'delete')
      )
  ),
  'logical backup role cannot mutate private tables'
);
select ok(
  not has_table_privilege('content_backup', 'private.community_settings', 'select')
    and not has_table_privilege('content_backup', 'private.community_rate_events', 'select'),
  'logical content backup cannot read unrelated community private tables'
);
select ok(
  not has_database_privilege('content_backup', current_database(), 'temporary'),
  'logical backup role cannot create temporary tables'
);
select ok(
  not exists (
    select 1
    from pg_proc function_row
    join pg_namespace function_schema on function_schema.oid = function_row.pronamespace
    where function_schema.nspname = 'private'
      and has_function_privilege('content_backup', function_row.oid, 'execute')
  ),
  'logical backup role cannot execute private functions'
);
select ok(
  not exists (
    select 1
    from pg_auth_members membership
    join pg_roles member_role on member_role.oid = membership.member
    where member_role.rolname in (
      'content_ingestor', 'content_editor', 'content_controller',
      'content_reader', 'content_deployer'
    )
  ),
  'runtime capability roles have no role memberships or SET ROLE targets'
);
select ok(
  not exists (
    select 1
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and pg_get_userbyid(p.proowner) <> 'content_rpc_owner'
  ),
  'all private functions are owned by the dedicated NOLOGIN function owner'
);
select ok(
  not exists (
    select 1
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.prosecdef
      and not coalesce(p.proconfig, '{}') @> array['search_path=""']
  ),
  'all private security definer functions use an empty search path'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'content_ingestor', 'content_editor', 'content_controller', 'content_reader', 'content_deployer'
    ]) role_name
    cross join information_schema.tables table_info
    where table_info.table_schema = 'private'
      and has_table_privilege(role_name, format('%I.%I', table_info.table_schema, table_info.table_name), 'select')
  ),
  'runtime roles cannot select any private base table'
);
select ok(
  not exists (
    select 1
    from unnest(array[
      'content_ingestor', 'content_editor', 'content_controller', 'content_reader', 'content_deployer'
    ]) role_name
    cross join information_schema.tables table_info
    where table_info.table_schema = 'private'
      and (
        has_table_privilege(role_name, format('%I.%I', table_info.table_schema, table_info.table_name), 'insert')
        or has_table_privilege(role_name, format('%I.%I', table_info.table_schema, table_info.table_name), 'update')
        or has_table_privilege(role_name, format('%I.%I', table_info.table_schema, table_info.table_name), 'delete')
      )
  ),
  'runtime roles cannot mutate any private base table'
);
select ok(
  not exists (
    select 1 from unnest(array[
      'content_ingestor', 'content_editor', 'content_controller', 'content_reader', 'content_deployer'
    ]) role_name where has_database_privilege(role_name, current_database(), 'temporary')
  ),
  'runtime roles cannot create temporary tables'
);
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use private schema');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated cannot use private schema');
select ok(not has_schema_privilege('service_role', 'private', 'usage'), 'service role cannot use content private schema');
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'private' and table_name = 'content_attestation_keys'
      and column_name = 'hmac_secret'
  ),
  'database stores no attestation signing secret'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'private' and table_name = 'content_attestation_keys'
      and column_name = 'public_key' and data_type = 'bytea'
  ),
  'database stores only the Ed25519 verification key'
);
select ok(has_function_privilege('content_ingestor', 'private.ingest_report_snapshot_v1(jsonb,text,bigint,text,text,text,text)', 'execute'), 'ingestor can ingest snapshots');
select ok(has_function_privilege('content_ingestor', 'private.reserve_site_release_v1(uuid)', 'execute'), 'ingestor can reserve releases');
select ok(has_function_privilege('content_ingestor', 'private.reserve_ingestion_site_release_v1(uuid,text,text,text,text,text)', 'execute'), 'ingestor can reserve deterministic publication slots');
select ok(not has_function_privilege('content_editor', 'private.reserve_ingestion_site_release_v1(uuid,text,text,text,text,text)', 'execute'), 'routine editor cannot reserve ingestion publication slots');
select ok(has_function_privilege('content_ingestor', 'private.fail_ingestion_publication_attempt_v1(date,text,text,text,text,text,text)', 'execute'), 'ingestor can record a failed publication attempt');
select ok(not has_function_privilege('content_editor', 'private.fail_ingestion_publication_attempt_v1(date,text,text,text,text,text,text)', 'execute'), 'routine editor cannot record ingestion publication attempts');
select ok(not has_function_privilege('content_ingestor', 'private.get_release_report_v1(uuid,date)', 'execute'), 'ingestor cannot call content reader');
select ok(has_function_privilege('content_reader', 'private.get_release_report_v1(uuid,date)', 'execute'), 'reader can read release reports');
select ok(has_function_privilege('content_reader', 'private.get_release_manifest_v1(uuid)', 'execute'), 'reader can read exact release manifest metadata');
select ok(has_function_privilege('content_reader', 'private.get_release_item_v1(uuid,text)', 'execute'), 'reader can read release items');
select ok(has_function_privilege('content_reader', 'private.search_release_v1(uuid,text,integer,date)', 'execute'), 'reader can search a pinned release');
select ok(has_function_privilege('content_reader', 'private.get_current_release_v1()', 'execute'), 'reader can read the small current pointer');
select ok(not has_function_privilege('content_reader', 'private.ingest_report_snapshot_v1(jsonb,text,bigint,text,text,text,text)', 'execute'), 'reader cannot ingest content');
select ok(not has_function_privilege('content_reader', 'private.get_build_release_report_v1(uuid,date)', 'execute'), 'public reader cannot use the unpromoted report build capability');
select ok(not has_function_privilege('content_reader', 'private.get_build_release_manifest_v1(uuid)', 'execute'), 'public reader cannot use the unpromoted manifest build capability');
select ok(has_function_privilege('content_editor', 'private.finalize_site_release_v1(uuid,text,bigint,text,text,integer,integer,text,text,text,date,date[],uuid,jsonb)', 'execute'), 'editor can finalize a preview release');
select ok(has_function_privilege('content_controller', 'private.authorize_production_rollback_v1(uuid,bigint,text,text,jsonb,text)', 'execute'), 'controller can authorize rollback');
select ok(not has_function_privilege('content_editor', 'private.authorize_production_rollback_v1(uuid,bigint,text,text,jsonb,text)', 'execute'), 'routine editor cannot authorize rollback');
select ok(not has_function_privilege('content_controller', 'private.ingest_report_snapshot_v1(jsonb,text,bigint,text,text,text,text)', 'execute'), 'controller cannot ingest content');
select ok(has_function_privilege('content_deployer', 'private.claim_content_outbox_v1(text,integer)', 'execute'), 'deployer can claim outbox work');
select ok(has_function_privilege('content_deployer', 'private.get_build_release_report_v1(uuid,date)', 'execute'), 'deployer can read an exact report for an authenticated build');
select ok(has_function_privilege('content_deployer', 'private.get_build_release_manifest_v1(uuid)', 'execute'), 'deployer can read an exact manifest for an authenticated build');
select ok(has_function_privilege('content_deployer', 'private.commit_production_promotion_v1(uuid,bigint,bigint,text,text,text,text,jsonb)', 'execute'), 'deployer can commit verified promotion');
select ok(has_function_privilege('content_deployer', 'private.register_release_artifact_v1(uuid,text,bigint,text,text,text,text,text)', 'execute'), 'deployer can register both immutable artifact inventory and site fingerprint hashes');
select has_table('private', 'content_observability_checks', 'append-only production observability evidence table exists');
select ok(has_function_privilege('content_deployer', 'private.record_content_observability_v1(jsonb)', 'execute'), 'deployer can append production observability evidence');
select ok(has_function_privilege('content_deployer', 'private.get_content_observation_window_v1(date)', 'execute'), 'deployer can read a bounded two-day observation window');
select ok(
  not exists (
    select 1 from unnest(array[
      'content_ingestor', 'content_editor', 'content_controller', 'content_reader'
    ]) role_name
    where has_function_privilege(role_name, 'private.record_content_observability_v1(jsonb)', 'execute')
      or has_function_privilege(role_name, 'private.get_content_observation_window_v1(date)', 'execute')
  ),
  'non-deployer runtime roles cannot write or read production observation evidence'
);
set local role content_rpc_owner;
select throws_ok(
  $$select private.record_content_observability_v1('{}'::jsonb)$$,
  '22023',
  'Invalid content observability evidence',
  'malformed production observability evidence fails closed'
);
select throws_ok(
  $$select private.get_content_observation_window_v1(null)$$,
  '22023',
  'Invalid content observation start date',
  'observation window requires an explicit valid start date'
);
reset role;
select ok(
  not has_function_privilege('content_ingestor', 'private.register_release_artifact_v1(uuid,text,bigint,text,text,text,text,text)', 'execute')
    and not has_function_privilege('content_editor', 'private.register_release_artifact_v1(uuid,text,bigint,text,text,text,text,text)', 'execute')
    and not has_function_privilege('content_controller', 'private.register_release_artifact_v1(uuid,text,bigint,text,text,text,text,text)', 'execute')
    and not has_function_privilege('content_reader', 'private.register_release_artifact_v1(uuid,text,bigint,text,text,text,text,text)', 'execute'),
  'non-deployer runtime roles cannot register release artifacts'
);
select is(
  (select is_nullable from information_schema.columns
   where table_schema = 'private' and table_name = 'release_artifacts'
     and column_name = 'artifact_fingerprint_sha256'),
  'NO',
  'every release artifact requires a distinct site fingerprint hash'
);
select ok(not has_function_privilege('content_deployer', 'private.authorize_production_rollback_v1(uuid,bigint,text,text,jsonb,text)', 'execute'), 'deployer cannot authorize rollback');
select ok(not has_function_privilege('anon', 'private.get_current_release_v1()', 'execute'), 'anon cannot execute content RPCs');
select ok(not has_function_privilege('authenticated', 'private.get_current_release_v1()', 'execute'), 'authenticated cannot execute content RPCs');
select ok(not has_function_privilege('service_role', 'private.get_current_release_v1()', 'execute'), 'legacy service role cannot execute content RPCs');
select ok(has_function_privilege('content_editor', 'private.read_admin_v1(text,text,jsonb,jsonb,text)', 'execute'), 'editor can invoke the role-attested Admin read gateway');
select ok(has_function_privilege('content_controller', 'private.read_admin_v1(text,text,jsonb,jsonb,text)', 'execute'), 'controller can invoke the role-attested Admin read gateway');
select ok(not has_function_privilege('content_reader', 'private.read_admin_v1(text,text,jsonb,jsonb,text)', 'execute'), 'public reader cannot invoke the Admin read gateway');
select ok(not has_function_privilege('content_editor', 'private.get_admin_dashboard_v1()', 'execute'), 'editor cannot bypass read attestation through the dashboard implementation RPC');
select ok(not has_function_privilege('content_editor', 'private.list_admin_content_v1(text,integer)', 'execute'), 'editor cannot bypass read attestation through the content implementation RPC');
select ok(not has_function_privilege('content_editor', 'private.list_admin_operations_v1(integer)', 'execute') and not has_function_privilege('content_controller', 'private.list_admin_operations_v1(integer)', 'execute'), 'runtime Admin roles cannot bypass read attestation through the operations implementation RPC');
select ok(not has_function_privilege('content_editor', 'private.get_admin_verifier_diff_v1(uuid)', 'execute') and not has_function_privilege('content_controller', 'private.get_admin_verifier_diff_v1(uuid)', 'execute'), 'runtime Admin roles cannot bypass read attestation through the verifier implementation RPC');
select ok(has_function_privilege('content_controller', 'private.retry_content_outbox_v1(uuid,text,text,uuid,jsonb,text)', 'execute'), 'controller can invoke Owner-attested outbox retry');
select ok(not has_function_privilege('content_editor', 'private.retry_content_outbox_v1(uuid,text,text,uuid,jsonb,text)', 'execute'), 'routine editor cannot retry outbox work');
select ok(has_function_privilege('content_controller', 'private.rebuild_content_release_v1(uuid,text,text,uuid,jsonb,text)', 'execute'), 'controller can invoke Owner-attested same-release rebuild');
select ok(not has_function_privilege('content_editor', 'private.rebuild_content_release_v1(uuid,text,text,uuid,jsonb,text)', 'execute'), 'routine editor cannot rebuild a release');
select ok(has_function_privilege('content_editor', 'private.create_editorial_draft_v1(uuid,uuid,jsonb,text)', 'execute'), 'editor can create attested drafts');
select ok(has_function_privilege('content_editor', 'private.upsert_editorial_draft_item_v1(uuid,text,uuid,uuid,jsonb,bigint,text,uuid,jsonb,text)', 'execute'), 'editor can update attested draft items');
select ok(has_function_privilege('content_editor', 'private.rebase_editorial_draft_v1(uuid,uuid,bigint,uuid,jsonb,text)', 'execute'), 'editor can request fail-closed draft rebase');
select ok(has_function_privilege('content_editor', 'private.request_preview_build_v1(uuid,bigint,uuid,jsonb,text)', 'execute'), 'editor can request Preview builds');
select ok(not has_function_privilege('content_editor', 'private.request_editorial_publish_v1(uuid,uuid,bigint,text,uuid,jsonb,text)', 'execute') and has_function_privilege('content_controller', 'private.request_editorial_publish_v1(uuid,uuid,bigint,text,uuid,jsonb,text)', 'execute'), 'only the control connection can invoke the Publisher-checked publish RPC');
select ok(not has_function_privilege('content_editor', 'private.update_content_setting_v1(text,boolean,bigint,text,text,uuid,jsonb,text)', 'execute'), 'routine editor connection cannot change control settings');
select ok(has_function_privilege('content_controller', 'private.update_content_setting_v1(text,boolean,bigint,text,text,uuid,jsonb,text)', 'execute'), 'controller can invoke Owner-checked settings RPC');
select ok(has_function_privilege('content_controller', 'private.upsert_admin_role_v1(text,text,text,text,timestamptz,text,text,uuid,jsonb,text)', 'execute'), 'controller can invoke Owner-checked role RPC');
select ok(has_function_privilege('content_controller', 'private.global_suppress_item_v1(text,text,text,uuid,jsonb,text)', 'execute'), 'controller can invoke Owner-checked suppression RPC');
select ok(not has_function_privilege('content_controller', 'private.create_editorial_draft_v1(uuid,uuid,jsonb,text)', 'execute'), 'control connection cannot create routine drafts');
select ok(has_function_privilege('content_deployer', 'private.get_production_deploy_context_v1(uuid)', 'execute'), 'deployer can read exact fenced deployment context');
select ok(has_function_privilege('content_deployer', 'private.register_preview_build_v1(uuid,text,text,text,jsonb)', 'execute'), 'deployer can register verified Preview evidence');
select ok(has_function_privilege('content_deployer', 'private.begin_production_reconcile_v1()', 'execute'), 'deployer can reconcile an interrupted fenced promotion');
select ok(has_function_privilege('content_deployer', 'private.finish_production_recovery_v1(uuid,bigint,bigint,boolean,jsonb)', 'execute'), 'deployer can finish fenced recovery');
select ok(has_function_privilege('content_deployer', 'private.get_deployer_alert_state_v1()', 'execute'), 'deployer can emit least-privilege outbox alert state');
select ok(has_function_privilege('content_deployer', 'private.get_content_observability_v1()', 'execute') and not has_function_privilege('content_editor', 'private.get_content_observability_v1()', 'execute') and not has_function_privilege('content_controller', 'private.get_content_observability_v1()', 'execute') and not has_function_privilege('content_reader', 'private.get_content_observability_v1()', 'execute'), 'only the deployer can read the production observability snapshot');
select ok(has_function_privilege('content_deployer', 'private.record_recovery_health_v1(jsonb)', 'execute'), 'deployer can record signed recovery-monitor health');
select ok(
  not has_function_privilege('content_ingestor', 'private.record_recovery_health_v1(jsonb)', 'execute')
    and not has_function_privilege('content_editor', 'private.record_recovery_health_v1(jsonb)', 'execute')
    and not has_function_privilege('content_controller', 'private.record_recovery_health_v1(jsonb)', 'execute')
    and not has_function_privilege('content_reader', 'private.record_recovery_health_v1(jsonb)', 'execute'),
  'non-deployer runtime roles cannot record recovery health'
);
set local role content_rpc_owner;
select private.record_recovery_health_v1(jsonb_build_object(
  'healthy', true,
  'checked_at', clock_timestamp(),
  'pitr_enabled', true,
  'latest_backup_object_key', 'database/2026/07/17/' || repeat('a', 64) || '.dump.age',
  'latest_backup_at', clock_timestamp() - interval '60 seconds',
  'latest_backup_age_seconds', 60,
  'maximum_backup_age_seconds', 3600
));
select is(
  private.get_admin_dashboard_v1() -> 'backup' ->> 'status',
  'healthy',
  'Admin dashboard exposes a fresh signed recovery-monitor status'
);
reset role;
select ok(
  (select c.relkind = 'p'
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'private' and c.relname = 'content_audit_log'),
  'online content audit log is range partitioned'
);
select cmp_ok(
  (select count(*)
   from pg_inherits inheritance
   join pg_class parent on parent.oid = inheritance.inhparent
   join pg_namespace n on n.oid = parent.relnamespace
   where n.nspname = 'private' and parent.relname = 'content_audit_log'),
  '>=', 10::bigint,
  'audit partitions are provisioned well ahead of the current quarter'
);
select ok(
  has_function_privilege('content_deployer', 'private.prune_content_operational_history_v1()', 'execute'),
  'deployer can run bounded operational retention'
);
select ok(
  not has_function_privilege('content_reader', 'private.prune_content_operational_history_v1()', 'execute')
    and not has_function_privilege('content_editor', 'private.prune_content_operational_history_v1()', 'execute')
    and not has_function_privilege('content_controller', 'private.prune_content_operational_history_v1()', 'execute')
    and not has_function_privilege('content_ingestor', 'private.prune_content_operational_history_v1()', 'execute'),
  'non-deployer runtime roles cannot run retention'
);
set local role content_rpc_owner;
insert into private.publication_attempts(
  report_date, batch_id, input_sha256, trigger_kind, worker_version,
  status, started_at, finished_at
) values
  ('1900-01-01', 'morning', repeat('a', 64), 'retention-test', 'test',
   'succeeded', clock_timestamp() - interval '181 days', clock_timestamp() - interval '181 days'),
  ('1900-01-01', 'morning', repeat('b', 64), 'retention-test', 'test',
   'failed', clock_timestamp() - interval '400 days', clock_timestamp() - interval '400 days');
reset role;
-- Production may legitimately have completed retention within the previous
-- 23 hours. Hide that evidence only inside this test transaction so the
-- deletion path remains deterministic; the final rollback restores it.
delete from private.content_audit_log
where action = 'retention.prune'
  and result = 'succeeded'
  and inserted_at >= clock_timestamp() - interval '23 hours';
set local role content_rpc_owner;
select is(
  private.prune_content_operational_history_v1() ->> 'status',
  'succeeded',
  'bounded operational retention executes with function-owner privileges'
);
reset role;
select is(
  (select jsonb_build_object(
    'succeeded', count(*) filter (where status = 'succeeded'),
    'failed', count(*) filter (where status = 'failed')
  ) from private.publication_attempts where trigger_kind = 'retention-test'),
  '{"failed": 1, "succeeded": 0}'::jsonb,
  'retention prunes 180-day success rows but preserves failure evidence beyond one year'
);
select ok(has_function_privilege('content_ingestor', 'private.claim_editorial_publish_request_v1(text,integer)', 'execute'), 'ingestor can claim editorial materialization work');
select ok(has_function_privilege('content_ingestor', 'private.get_editorial_publish_input_v1(uuid)', 'execute'), 'ingestor can read exact editorial materialization input');
select ok(has_function_privilege('content_ingestor', 'private.stage_editorial_release_v1(uuid,jsonb)', 'execute'), 'ingestor can atomically stage an editorial release');
select ok(has_function_privilege('content_ingestor', 'private.finalize_editorial_release_v1(uuid,text,bigint,text,text,uuid,jsonb)', 'execute'), 'ingestor can atomically finalize an editorial release');
select ok(has_function_privilege('content_ingestor', 'private.fail_editorial_publish_request_v1(uuid,text,text)', 'execute'), 'ingestor can fail and clean up its claimed editorial request');
select ok(not has_function_privilege('content_reader', 'private.get_admin_dashboard_v1()', 'execute'), 'public content reader cannot access admin health data');
select ok(not has_function_privilege('content_editor', 'private.reserve_admin_idempotency_v1(text,text,uuid,text,text)', 'execute'), 'application roles cannot bypass mutation idempotency helpers');
select ok(has_function_privilege('content_controller', 'private.authorize_production_reconcile_v1(text,text,uuid,jsonb,text)', 'execute'), 'controller can authorize production reconciliation');
select ok(not has_function_privilege('content_editor', 'private.authorize_production_reconcile_v1(text,text,uuid,jsonb,text)', 'execute'), 'routine editor cannot authorize production reconciliation');
select ok(has_function_privilege('content_ingestor', 'private.claim_global_suppression_request_v1(text,integer)', 'execute'), 'ingestor can claim global suppression materialization work');
select ok(not has_function_privilege('content_controller', 'private.finalize_global_suppression_release_v1(uuid,text,bigint,text,text,uuid,jsonb)', 'execute'), 'controller cannot bypass the suppression materializer to finalize a release');
select ok(
  not exists (
    select 1 from unnest(array[
      'content_ingestor', 'content_editor', 'content_controller', 'content_reader', 'content_deployer'
    ]) role_name
    where has_function_privilege(
      role_name,
      'private.consume_attestation_v1(jsonb,text,text,text,text[])',
      'execute'
    )
  ),
  'runtime roles cannot invoke the internal attestation consumer directly'
);
set local role content_rpc_owner;
select throws_ok(
  $$select private.require_setting_v1('publication')$$,
  '42501',
  'Content capability is disabled: publication',
  'dangerous publication capability fails closed'
);
reset role;
select ok(
  not exists (
    select 1
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relkind = 'r'
      and c.relname not like 'community_%'
      and (not c.relrowsecurity or not c.relforcerowsecurity)
  ),
  'every private content table has forced RLS'
);
select ok(
  not exists (
    select 1
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and constraint_row.contype in ('c', 'f')
      and not constraint_row.convalidated
  ),
  'every private CHECK and foreign-key relation is validated and rejects illegal state'
);
select ok(
  not exists (
    select 1
    from (values
      ('create_editorial_draft_v1'),
      ('upsert_editorial_draft_item_v1'),
      ('rebase_editorial_draft_v1'),
      ('request_preview_build_v1'),
      ('request_editorial_publish_v1'),
      ('update_content_setting_v1'),
      ('upsert_admin_role_v1'),
      ('global_suppress_item_v1'),
      ('authorize_production_reconcile_v1'),
      ('authorize_production_rollback_v1'),
      ('retry_content_outbox_v1'),
      ('rebuild_content_release_v1')
    ) expected(proname)
    where not exists (
      select 1
      from pg_proc function_row
      join pg_namespace namespace on namespace.oid = function_row.pronamespace
      where namespace.nspname = 'private'
        and function_row.proname = expected.proname
        and position('insert into private.content_audit_log' in lower(function_row.prosrc)) > 0
    )
  ),
  'every externally exposed Admin mutation writes same-transaction audit evidence'
);

select * from finish();
rollback;
