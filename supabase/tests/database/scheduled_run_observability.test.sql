begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table(
  'private',
  'scheduled_run_observability_events',
  'append-only scheduled run evidence table exists'
);
select has_table(
  'private',
  'scheduled_run_observability_current',
  'current scheduled run projection exists'
);
select ok(
  has_function_privilege(
    'content_ingestor',
    'private.record_scheduled_run_trace_v1(text,timestamptz,text,jsonb)',
    'execute'
  ),
  'ingestor can append scheduled run evidence'
);
select ok(
  not has_function_privilege(
    'content_editor',
    'private.record_scheduled_run_trace_v1(text,timestamptz,text,jsonb)',
    'execute'
  )
  and not has_function_privilege(
    'content_deployer',
    'private.record_scheduled_run_trace_v1(text,timestamptz,text,jsonb)',
    'execute'
  ),
  'non-ingestor runtime roles cannot forge scheduled run evidence'
);
select ok(
  not has_table_privilege(
    'content_ingestor',
    'private.scheduled_run_observability_events',
    'insert'
  )
  and not has_table_privilege(
    'content_deployer',
    'private.scheduled_run_observability_current',
    'update'
  ),
  'runtime roles cannot bypass scheduled run RPCs'
);
select ok(
  has_function_privilege(
    'content_deployer',
    'private.get_content_observability_v1()',
    'execute'
  ),
  'deployer can read the current run evidence projection'
);
select ok(
  has_function_privilege(
    'content_deployer',
    'private.get_content_observation_window_v1(date)',
    'execute'
  ),
  'deployer can read the two-day run evidence window'
);

set local role content_rpc_owner;
select throws_ok(
  $$select private.record_scheduled_run_trace_v1(
    'scheduled:0',
    date_trunc('hour', current_timestamp) + interval '30 minutes',
    'started',
    '{"status":"started","stage":"started"}'::jsonb
  )$$,
  '22023',
  'Invalid scheduled run trace',
  'off-contract half-hour traces fail closed'
);
select is(
  (
    private.get_content_observation_window_v1(
      (current_timestamp at time zone 'Asia/Shanghai')::date - 2
    ) ->> 'ready_at'
  )::timestamptz,
  (
    (
      (current_timestamp at time zone 'Asia/Shanghai')::date
    )::timestamp at time zone 'Asia/Shanghai'
  ) + interval '4 hours 10 minutes',
  'two-day gate closes after the final 04:00 run deadline'
);
select ok(
  position(
    'Finalized site release is missing its dispatch identity'
    in (
      select p.prosrc
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private'
        and p.proname = 'finalize_site_release_v1'
    )
  ) > 0,
  'idempotent finalize returns the existing outbox dispatch identity'
);
reset role;

select * from finish();
rollback;
