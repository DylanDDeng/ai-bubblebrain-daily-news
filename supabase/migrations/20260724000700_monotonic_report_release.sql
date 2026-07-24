begin;

set local role content_rpc_owner;

create or replace function private.enforce_monotonic_site_release_report_v1()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_candidate_generated_at timestamptz;
  v_predecessor_generated_at timestamptz;
begin
  select (snapshot.parsed_document ->> 'generated_at')::timestamptz
  into v_candidate_generated_at
  from private.report_snapshots snapshot
  where snapshot.id = new.report_snapshot_id;

  select (snapshot.parsed_document ->> 'generated_at')::timestamptz
  into v_predecessor_generated_at
  from private.site_releases release
  join private.site_release_reports report
    on report.site_release_id = release.expected_predecessor_id
   and report.report_date = new.report_date
  join private.report_snapshots snapshot
    on snapshot.id = report.report_snapshot_id
  where release.id = new.site_release_id;

  if v_predecessor_generated_at is null then
    return new;
  end if;
  if v_candidate_generated_at is null then
    raise exception using
      errcode = '22023',
      message = 'Site release report is missing generated_at';
  end if;
  if v_predecessor_generated_at is not null
    and v_candidate_generated_at < v_predecessor_generated_at then
    raise exception using
      errcode = '22023',
      message = 'Site release report snapshot is superseded';
  end if;
  return new;
end;
$$;

grant execute on function private.enforce_monotonic_site_release_report_v1()
  to postgres;

set local role postgres;

drop trigger if exists enforce_monotonic_site_release_report
  on private.site_release_reports;
create trigger enforce_monotonic_site_release_report
before insert or update of report_snapshot_id
on private.site_release_reports
for each row
execute function private.enforce_monotonic_site_release_report_v1();

set local role content_rpc_owner;

revoke all on function private.enforce_monotonic_site_release_report_v1()
  from public, anon, authenticated, service_role,
       content_backup, content_editor, content_controller,
       content_reader, content_ingestor, content_deployer, postgres;

commit;
