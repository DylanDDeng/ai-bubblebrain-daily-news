begin;

set local role content_rpc_owner;

create or replace function private.read_admin_v1(
  expected_audience text,
  route text,
  arguments jsonb,
  assertion jsonb,
  body_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  result jsonb;
  page_size integer;
  before_date date;
  before_id bigint;
  release_id uuid;
  after_item text;
begin
  if jsonb_typeof(arguments) <> 'object'
    or expected_audience not in ('content-routine', 'content-control-read') then
    raise exception 'Invalid Admin read request' using errcode = '22023';
  end if;
  if expected_audience = 'content-routine' and route not in (
    '/v1/dashboard', '/v1/reports', '/v1/releases', '/v1/content',
    '/v1/drafts', '/v1/operations', '/v1/operations/verifier-diff', '/v1/audit'
  ) then
    raise exception 'Routine Admin read route is not allowed' using errcode = '42501';
  end if;
  if expected_audience = 'content-control-read' and route not in (
    '/v1/dashboard', '/v1/releases', '/v1/operations',
    '/v1/operations/verifier-diff', '/v1/audit'
  ) then
    raise exception 'Control read route is not allowed' using errcode = '42501';
  end if;

  perform private.consume_attestation_v1(
    assertion, expected_audience, 'admin.read', body_sha256,
    array['Viewer', 'Editor', 'Publisher', 'Owner']
  );
  begin
    payload := (assertion ->> 'payload')::jsonb;
  exception when others then
    raise exception 'Malformed Admin read assertion' using errcode = '22023';
  end;
  if payload -> 'request_context' is distinct from jsonb_build_object(
    'route', route,
    'arguments', arguments
  ) then
    raise exception 'Admin read request context mismatch' using errcode = '42501';
  end if;

  begin
    case route
      when '/v1/dashboard' then
        if arguments <> '{}'::jsonb then
          raise exception 'Invalid Admin read arguments';
        end if;
        result := private.get_admin_dashboard_v1();
      when '/v1/reports' then
        before_date := nullif(arguments ->> 'before', '')::date;
        page_size := coalesce((arguments ->> 'limit')::integer, 50);
        result := private.list_admin_reports_v1(before_date, page_size);
      when '/v1/releases' then
        page_size := coalesce((arguments ->> 'limit')::integer, 50);
        result := private.list_admin_releases_v1(page_size);
      when '/v1/content' then
        after_item := nullif(arguments ->> 'after', '');
        page_size := coalesce((arguments ->> 'limit')::integer, 50);
        result := private.list_admin_content_v1(after_item, page_size);
      when '/v1/drafts' then
        page_size := coalesce((arguments ->> 'limit')::integer, 50);
        result := private.list_admin_drafts_v1(page_size);
      when '/v1/operations' then
        page_size := coalesce((arguments ->> 'limit')::integer, 50);
        result := private.list_admin_operations_v1(page_size);
      when '/v1/operations/verifier-diff' then
        release_id := nullif(arguments ->> 'site_release_id', '')::uuid;
        result := private.get_admin_verifier_diff_v1(release_id);
      when '/v1/audit' then
        before_id := nullif(arguments ->> 'before', '')::bigint;
        page_size := coalesce((arguments ->> 'limit')::integer, 100);
        result := private.list_admin_audit_v1(before_id, page_size);
      else
        raise exception 'Unknown Admin read route';
    end case;
  exception
    when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
      raise exception 'Invalid Admin read arguments' using errcode = '22023';
  end;
  return result;
end;
$$;

revoke all on function private.read_admin_v1(text, text, jsonb, jsonb, text)
  from public, anon, authenticated, service_role, content_ingestor,
    content_editor, content_controller, content_reader, content_deployer;

revoke execute on function private.get_admin_dashboard_v1()
  from content_editor, content_controller;
revoke execute on function private.list_admin_reports_v1(date, integer)
  from content_editor, content_controller;
revoke execute on function private.list_admin_releases_v1(integer)
  from content_editor, content_controller;
revoke execute on function private.list_admin_drafts_v1(integer)
  from content_editor, content_controller;
revoke execute on function private.list_admin_audit_v1(bigint, integer)
  from content_editor, content_controller;
revoke execute on function private.list_admin_content_v1(text, integer)
  from content_editor, content_controller;
revoke execute on function private.list_admin_operations_v1(integer)
  from content_editor, content_controller;
revoke execute on function private.get_admin_verifier_diff_v1(uuid)
  from content_editor, content_controller;

alter function private.read_admin_v1(text, text, jsonb, jsonb, text)
  owner to content_rpc_owner;

grant execute on function private.read_admin_v1(text, text, jsonb, jsonb, text)
  to content_editor, content_controller;

-- SET LOCAL ROLE unwinds at COMMIT. An explicit RESET ROLE would discard the
-- Supabase CLI migration writer's outer SET ROLE before it records history.
commit;
