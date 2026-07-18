begin;

set local role content_rpc_owner;

create or replace function private.list_admin_content_v1(
  after_item_id text default null,
  page_size integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(page) order by id), '[]'::jsonb)
  from (
    select
      item.id,
      item.event_id,
      item.source_type,
      item.content_type,
      item.source_id,
      item.source_name,
      item.canonical_url,
      item.published_at,
      item.provenance_kind,
      revision.id as automatic_revision_id,
      revision.revision as automatic_revision,
      revision.title as automatic_title,
      revision.summary as automatic_summary,
      revision.category as automatic_category,
      revision.featured as automatic_featured,
      revision.score as automatic_score,
      revision.reason as automatic_reason,
      override_row.id as active_override_id,
      override_row.status as override_status,
      override_row.patch as override_patch,
      override_row.reason as override_reason
    from private.content_items item
    left join lateral (
      select r.*
      from private.content_item_revisions r
      where r.item_id = item.id
      order by r.revision desc
      limit 1
    ) revision on true
    left join lateral (
      select o.*
      from private.editorial_overrides o
      where o.item_id = item.id and o.status = 'active'
      order by o.inserted_at desc, o.id desc
      limit 1
    ) override_row on true
    where after_item_id is null or item.id > after_item_id
    order by item.id
    limit least(greatest(page_size, 1), 100)
  ) page
$$;

create or replace function private.list_admin_operations_v1(page_size integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'current', private.get_current_release_v1(),
    'promotion_slot', (
      select to_jsonb(slot) - 'locked_by'
      from private.production_promotion_slot slot
      where slot.project_key = 'bubble-brain-pages'
    ),
    'outbox', (
      select coalesce(jsonb_agg(to_jsonb(page) order by inserted_at desc), '[]'::jsonb)
      from (
        select
          outbox.id,
          outbox.site_release_id,
          release.sequence as site_release_sequence,
          outbox.dispatch_id,
          outbox.payload ->> 'mode' as mode,
          outbox.status,
          outbox.attempts,
          outbox.max_attempts,
          outbox.next_attempt_at,
          outbox.lease_expires_at,
          outbox.github_run_id,
          outbox.dead_lettered_at,
          outbox.last_error,
          outbox.inserted_at,
          outbox.updated_at,
          (
            select jsonb_build_object(
              'id', event.id,
              'event_type', event.event_type,
              'evidence', event.evidence,
              'inserted_at', event.inserted_at
            )
            from private.release_deployment_attempts event
            where event.site_release_id = outbox.site_release_id
              and event.dispatch_id is not distinct from outbox.dispatch_id
            order by event.id desc
            limit 1
          ) as latest_event
        from private.content_outbox outbox
        join private.site_releases release on release.id = outbox.site_release_id
        order by outbox.inserted_at desc
        limit least(greatest(page_size, 1), 100)
      ) page
    )
  )
$$;

create or replace function private.get_admin_verifier_diff_v1(
  target_site_release_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_release_id uuid;
  release_row private.site_releases%rowtype;
  artifact_row private.release_artifacts%rowtype;
  latest_event private.release_deployment_attempts%rowtype;
  observed jsonb := '{}'::jsonb;
  mismatches jsonb;
  identity_complete boolean := false;
begin
  resolved_release_id := target_site_release_id;
  if resolved_release_id is null then
    select pointer.target_site_release_id into resolved_release_id
    from private.release_current_pointer pointer
    where pointer.singleton;
  end if;
  if resolved_release_id is null then return null; end if;

  select * into release_row
  from private.site_releases release
  where release.id = resolved_release_id;
  if release_row.id is null then raise exception 'Unknown site release'; end if;

  select * into artifact_row
  from private.release_artifacts artifact
  where artifact.site_release_id = resolved_release_id;
  select * into latest_event
  from private.release_deployment_attempts event
  where event.site_release_id = resolved_release_id
    and event.event_type in (
      'preview_verified', 'preview_failed', 'production_deployed',
      'edge_verified', 'rollback_deployed', 'rollback_committed', 'failed'
    )
  order by event.id desc
  limit 1;
  observed := coalesce(latest_event.evidence, '{}'::jsonb);
  identity_complete := latest_event.event_type in ('edge_verified', 'rollback_committed')
    and observed ?& array[
      'site_release_id', 'site_release_sequence', 'manifest_sha256',
      'content_sha256', 'artifact_sha256', 'artifact_fingerprint_sha256',
      'code_sha', 'build_environment_version', 'multi_edge_verified',
      'convergence_elapsed_ms', 'maximum_inconsistency_ms'
    ]
    and coalesce((observed ->> 'multi_edge_verified')::boolean, false);

  mismatches := jsonb_strip_nulls(jsonb_build_object(
    'site_release_id', case
      when observed ? 'site_release_id'
        and observed ->> 'site_release_id' is distinct from release_row.id::text
      then jsonb_build_object('expected', release_row.id, 'observed', observed ->> 'site_release_id')
    end,
    'site_release_sequence', case
      when observed ? 'site_release_sequence'
        and observed ->> 'site_release_sequence' is distinct from release_row.sequence::text
      then jsonb_build_object('expected', release_row.sequence, 'observed', observed ->> 'site_release_sequence')
    end,
    'manifest_sha256', case
      when observed ? 'manifest_sha256'
        and observed ->> 'manifest_sha256' is distinct from release_row.manifest_sha256
      then jsonb_build_object('expected', release_row.manifest_sha256, 'observed', observed ->> 'manifest_sha256')
    end,
    'content_sha256', case
      when observed ? 'content_sha256'
        and observed ->> 'content_sha256' is distinct from release_row.content_root_sha256
      then jsonb_build_object('expected', release_row.content_root_sha256, 'observed', observed ->> 'content_sha256')
    end,
    'artifact_sha256', case
      when observed ? 'artifact_sha256'
        and observed ->> 'artifact_sha256' is distinct from artifact_row.artifact_sha256
      then jsonb_build_object('expected', artifact_row.artifact_sha256, 'observed', observed ->> 'artifact_sha256')
    end,
    'artifact_fingerprint_sha256', case
      when observed ? 'artifact_fingerprint_sha256'
        and observed ->> 'artifact_fingerprint_sha256' is distinct from artifact_row.artifact_fingerprint_sha256
      then jsonb_build_object(
        'expected', artifact_row.artifact_fingerprint_sha256,
        'observed', observed ->> 'artifact_fingerprint_sha256'
      )
    end,
    'code_sha', case
      when observed ? 'code_sha'
        and observed ->> 'code_sha' is distinct from artifact_row.code_sha
      then jsonb_build_object('expected', artifact_row.code_sha, 'observed', observed ->> 'code_sha')
    end,
    'build_environment_version', case
      when observed ? 'build_environment_version'
        and observed ->> 'build_environment_version' is distinct from artifact_row.build_environment_version
      then jsonb_build_object(
        'expected', artifact_row.build_environment_version,
        'observed', observed ->> 'build_environment_version'
      )
    end
  ));

  return jsonb_build_object(
    'site_release_id', release_row.id,
    'expected', jsonb_build_object(
      'site_release_id', release_row.id,
      'site_release_sequence', release_row.sequence,
      'expected_predecessor_id', release_row.expected_predecessor_id,
      'manifest_sha256', release_row.manifest_sha256,
      'content_sha256', release_row.content_root_sha256,
      'artifact_sha256', artifact_row.artifact_sha256,
      'artifact_fingerprint_sha256', artifact_row.artifact_fingerprint_sha256,
      'code_sha', artifact_row.code_sha,
      'build_environment_version', artifact_row.build_environment_version,
      'production_verified_at', artifact_row.production_verified_at
    ),
    'latest_event', case when latest_event.id is null then null else jsonb_build_object(
      'id', latest_event.id,
      'event_type', latest_event.event_type,
      'inserted_at', latest_event.inserted_at,
      'evidence', observed
    ) end,
    'mismatches', mismatches,
    'status', case
      when artifact_row.site_release_id is null then 'artifact_missing'
      when latest_event.id is null or not identity_complete then 'verifier_evidence_missing'
      when mismatches = '{}'::jsonb then 'matches'
      else 'mismatch'
    end,
    'matches', artifact_row.site_release_id is not null
      and latest_event.id is not null
      and identity_complete
      and mismatches = '{}'::jsonb
  );
end;
$$;

create or replace function private.retry_content_outbox_v1(
  outbox_id uuid,
  reason text,
  typed_confirmation text,
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
declare
  actor record;
  existing jsonb;
  outbox private.content_outbox%rowtype;
  result jsonb;
begin
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-control', 'operations.retry', body_sha256, array['Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-control', 'operations.retry', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;
  if char_length(btrim(reason)) < 8 or typed_confirmation <> 'RETRY ' || outbox_id::text then
    raise exception 'Invalid retry confirmation';
  end if;

  select * into outbox
  from private.content_outbox value
  where value.id = outbox_id
  for update;
  if outbox.id is null or outbox.status not in ('failed', 'dead_letter') then
    raise exception 'Outbox row is not retryable';
  end if;
  if outbox.payload ->> 'mode' = 'production' then
    perform private.require_setting_v1('publication');
  elsif outbox.payload ->> 'mode' = 'shadow' then
    perform private.require_setting_v1('shadow_build');
  else
    raise exception 'Outbox row has an invalid mode';
  end if;

  update private.content_outbox value set
    status = 'queued',
    locked_by = null,
    locked_at = null,
    lease_expires_at = null,
    max_attempts = greatest(value.max_attempts, value.attempts + 1),
    next_attempt_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where value.id = outbox.id;
  insert into private.release_deployment_attempts(
    site_release_id, dispatch_id, event_type, evidence
  ) values (
    outbox.site_release_id, outbox.dispatch_id, 'queued',
    jsonb_build_object(
      'kind', 'manual_retry',
      'requested_by', actor.actor_sub,
      'prior_status', outbox.status,
      'prior_attempts', outbox.attempts
    )
  );
  result := jsonb_build_object(
    'outbox_id', outbox.id,
    'site_release_id', outbox.site_release_id,
    'dispatch_id', outbox.dispatch_id,
    'status', 'queued',
    'attempts', outbox.attempts,
    'max_attempts', greatest(outbox.max_attempts, outbox.attempts + 1)
  );
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id,
    idempotency_key, target, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'operations.retry', reason,
    actor.assertion_jti::text, idempotency_key::text,
    jsonb_build_object(
      'outbox_id', outbox.id,
      'site_release_id', outbox.site_release_id,
      'dispatch_id', outbox.dispatch_id,
      'prior_status', outbox.status
    ),
    'queued'
  );
  perform private.complete_admin_idempotency_v1(
    'content-control', 'operations.retry', idempotency_key, result
  );
  return result;
end;
$$;

create or replace function private.rebuild_content_release_v1(
  site_release_id uuid,
  reason text,
  typed_confirmation text,
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
declare
  actor record;
  existing jsonb;
  source_outbox private.content_outbox%rowtype;
  new_outbox private.content_outbox%rowtype;
  new_dispatch_id uuid := gen_random_uuid();
  result jsonb;
begin
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-control', 'operations.rebuild', body_sha256, array['Owner']
  );
  existing := private.reserve_admin_idempotency_v1(
    'content-control', 'operations.rebuild', idempotency_key, actor.actor_sub, body_sha256
  );
  if existing is not null then return existing; end if;
  if char_length(btrim(reason)) < 8
    or typed_confirmation <> 'REBUILD ' || rebuild_content_release_v1.site_release_id::text then
    raise exception 'Invalid rebuild confirmation';
  end if;
  if not exists (
    select 1 from private.site_releases release
    where release.id = rebuild_content_release_v1.site_release_id
  ) then
    raise exception 'Unknown site release';
  end if;

  select * into source_outbox
  from private.content_outbox value
  where value.site_release_id = rebuild_content_release_v1.site_release_id
  order by value.inserted_at desc
  limit 1;
  if source_outbox.id is null then raise exception 'Release has no dispatch identity'; end if;
  if source_outbox.payload ->> 'mode' = 'production' then
    perform private.require_setting_v1('publication');
  elsif source_outbox.payload ->> 'mode' = 'shadow' then
    perform private.require_setting_v1('shadow_build');
  else
    raise exception 'Release outbox has an invalid mode';
  end if;

  insert into private.content_outbox(site_release_id, dispatch_id, payload)
  values (
    rebuild_content_release_v1.site_release_id,
    new_dispatch_id,
    source_outbox.payload || jsonb_build_object('dispatch_id', new_dispatch_id::text)
  )
  returning * into new_outbox;
  insert into private.release_deployment_attempts(
    site_release_id, dispatch_id, event_type, evidence
  ) values (
    rebuild_content_release_v1.site_release_id, new_dispatch_id, 'queued',
    jsonb_build_object(
      'kind', 'manual_rebuild',
      'requested_by', actor.actor_sub,
      'source_dispatch_id', source_outbox.dispatch_id
    )
  );
  result := jsonb_build_object(
    'outbox_id', new_outbox.id,
    'site_release_id', new_outbox.site_release_id,
    'dispatch_id', new_outbox.dispatch_id,
    'source_dispatch_id', source_outbox.dispatch_id,
    'status', new_outbox.status
  );
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id,
    idempotency_key, target, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'operations.rebuild', reason,
    actor.assertion_jti::text, idempotency_key::text,
    jsonb_build_object(
      'site_release_id', rebuild_content_release_v1.site_release_id,
      'source_dispatch_id', source_outbox.dispatch_id,
      'dispatch_id', new_dispatch_id
    ),
    'queued'
  );
  perform private.complete_admin_idempotency_v1(
    'content-control', 'operations.rebuild', idempotency_key, result
  );
  return result;
end;
$$;

do $$
declare function_record record;
begin
  for function_record in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname in (
        'list_admin_content_v1', 'list_admin_operations_v1',
        'get_admin_verifier_diff_v1', 'retry_content_outbox_v1',
        'rebuild_content_release_v1'
      )
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated, service_role, content_ingestor, content_editor, content_controller, content_reader, content_deployer',
      function_record.nspname, function_record.proname, function_record.args
    );
  end loop;
end;
$$;

grant execute on function private.list_admin_content_v1(text, integer)
  to content_editor;
grant execute on function private.list_admin_operations_v1(integer)
  to content_editor, content_controller;
grant execute on function private.get_admin_verifier_diff_v1(uuid)
  to content_editor, content_controller;
grant execute on function private.retry_content_outbox_v1(
  uuid, text, text, uuid, jsonb, text
) to content_controller;
grant execute on function private.rebuild_content_release_v1(
  uuid, text, text, uuid, jsonb, text
) to content_controller;

commit;
