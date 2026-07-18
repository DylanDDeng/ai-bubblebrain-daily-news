begin;

set local role content_rpc_owner;

create or replace function private.request_editorial_publish_v1(
  draft_id uuid,
  preview_build_id uuid,
  expected_row_version bigint,
  reason text,
  idempotency_key uuid,
  assertion jsonb,
  body_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare actor record;
declare draft private.editorial_drafts%rowtype;
declare existing jsonb;
declare publish_request private.editorial_publish_requests%rowtype;
declare result jsonb;
begin
  perform private.require_setting_v1('admin_publish');
  perform private.require_setting_v1('publication');
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-control', 'draft.publish', body_sha256, array['Publisher','Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-control', 'draft.publish', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;
  if char_length(btrim(reason)) < 8 then raise exception 'Publish reason is required'; end if;
  select * into draft from private.editorial_drafts where id = draft_id for update;
  if draft.id is null or draft.row_version <> expected_row_version or draft.status <> 'preview_ready'
    or not exists (select 1 from private.preview_builds
      where id = preview_build_id and private.preview_builds.draft_id = request_editorial_publish_v1.draft_id
        and base_site_release_id = draft.base_site_release_id)
    or draft.base_site_release_id is distinct from (
      select target_site_release_id from private.release_current_pointer where singleton
    ) then raise exception 'Draft Preview is stale or not publishable'; end if;
  insert into private.editorial_publish_requests(
    draft_id, preview_build_id, requested_by, reason, idempotency_key
  ) values (draft_id, preview_build_id, actor.actor_sub, reason, idempotency_key)
  returning * into publish_request;
  update private.editorial_drafts set status = 'publishing', row_version = row_version + 1,
    updated_at = clock_timestamp() where id = draft_id returning * into draft;
  result := jsonb_build_object('publish_request_id', publish_request.id, 'draft_id', draft.id,
    'row_version', draft.row_version, 'status', draft.status);
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id, idempotency_key, target, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'draft.publish', reason,
    actor.assertion_jti::text, idempotency_key::text,
    jsonb_build_object('draft_id', draft.id, 'preview_build_id', preview_build_id), 'queued'
  );
  perform private.complete_admin_idempotency_v1('content-control', 'draft.publish', idempotency_key, result);
  return result;
end;
$$;

revoke execute on function private.request_editorial_publish_v1(
  uuid, uuid, bigint, text, uuid, jsonb, text
) from public, anon, authenticated, service_role, content_editor;
grant execute on function private.request_editorial_publish_v1(
  uuid, uuid, bigint, text, uuid, jsonb, text
) to content_controller;

-- SET LOCAL ROLE unwinds at COMMIT. An explicit RESET ROLE would discard the
-- Supabase CLI migration writer's outer SET ROLE before it records history.
commit;
