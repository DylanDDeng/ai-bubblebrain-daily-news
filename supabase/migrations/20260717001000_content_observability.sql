begin;

set local role content_rpc_owner;

create or replace function private.get_content_observability_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'captured_at', current_timestamp,
    'current', private.get_current_release_v1(),
    'reports', private.list_admin_reports_v1(null, 3),
    'publication_attempts', coalesce((
      select jsonb_agg(to_jsonb(latest) order by latest.report_date, latest.batch_id)
      from (
        select distinct on (attempt.report_date, attempt.batch_id)
          attempt.report_date,
          attempt.batch_id,
          attempt.status,
          attempt.attempt_number,
          attempt.started_at,
          attempt.finished_at,
          attempt.error_code
        from private.publication_attempts attempt
        where attempt.report_date >= (current_timestamp at time zone 'Asia/Shanghai')::date - 2
        order by attempt.report_date, attempt.batch_id,
          attempt.attempt_number desc, attempt.started_at desc
      ) latest
    ), '[]'::jsonb),
    'search_latest_report_date', (
      select max(release_report.report_date)
      from private.release_current_pointer pointer
      join private.site_release_reports release_report
        on release_report.site_release_id = pointer.target_site_release_id
      where pointer.singleton
    ),
    'outbox', private.get_deployer_alert_state_v1()
  )
$$;

revoke all on function private.get_content_observability_v1()
  from public, anon, authenticated, service_role, content_ingestor,
    content_editor, content_controller, content_reader, content_deployer;
grant execute on function private.get_content_observability_v1()
  to content_deployer;

-- SET LOCAL ROLE unwinds at COMMIT. An explicit RESET ROLE would discard the
-- Supabase CLI migration writer's outer SET ROLE before it records history.
commit;
