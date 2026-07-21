begin;

alter table private.publication_slots
  drop constraint if exists publication_slots_batch_id_check;
alter table private.publication_slots
  add constraint publication_slots_batch_id_check check (
    batch_id in ('morning', 'afternoon', 'night', 'lateNight', 'lateNightSupplement')
  );

alter table private.publication_attempts
  drop constraint if exists publication_attempts_batch_id_check;
alter table private.publication_attempts
  add constraint publication_attempts_batch_id_check check (
    batch_id in ('morning', 'afternoon', 'night', 'lateNight', 'lateNightSupplement')
  );

set local role content_rpc_owner;

-- Keep the frozen daily-report schema at four presentation batches. The extra
-- identity exists only in publication fencing so the 02:00 close and 03:00
-- supplement cannot collide while each remains independently idempotent.
do $migration$
declare
  function_definition text;
  updated_definition text;
  old_identity constant text := $$('morning', 'afternoon', 'night', 'lateNight')$$;
  new_identity constant text := $$('morning', 'afternoon', 'night', 'lateNight', 'lateNightSupplement')$$;
begin
  select pg_get_functiondef(
    'private.reserve_ingestion_site_release_v1(uuid,text,text,text,text,text)'::regprocedure
  ) into function_definition;
  updated_definition := replace(function_definition, old_identity, new_identity);
  if updated_definition = function_definition
    and position('lateNightSupplement' in function_definition) = 0 then
    raise exception 'reserve ingestion publication identity guard changed unexpectedly';
  end if;
  execute updated_definition;

  select pg_get_functiondef(
    'private.fail_ingestion_publication_attempt_v1(date,text,text,text,text,text,text)'::regprocedure
  ) into function_definition;
  updated_definition := replace(function_definition, old_identity, new_identity);
  if updated_definition = function_definition
    and position('lateNightSupplement' in function_definition) = 0 then
    raise exception 'failed ingestion publication identity guard changed unexpectedly';
  end if;
  execute updated_definition;
end;
$migration$;

create or replace function private.get_deployer_alert_state_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'dead_letter_count', count(*) filter (
      where outbox.status = 'dead_letter'
        and outbox.last_error is distinct from 'superseded_by_history_bootstrap'
    ),
    'resolved_dead_letter_count', count(*) filter (
      where outbox.status = 'dead_letter'
        and outbox.last_error = 'superseded_by_history_bootstrap'
    ),
    'stale_queued_count', count(*) filter (
      where (
        outbox.status in ('queued','failed','claimed','dispatched','building','promoting')
        and outbox.inserted_at <= current_timestamp - interval '10 minutes'
      )
      or (
        outbox.status = 'preview_verified'
        and outbox.payload ->> 'mode' = 'production'
        and outbox.updated_at <= current_timestamp - interval '10 minutes'
      )
    ),
    'oldest_actionable_at', min(outbox.inserted_at) filter (
      where outbox.status in ('queued','failed','claimed','dispatched','building','promoting')
        or (
          outbox.status = 'preview_verified'
          and outbox.payload ->> 'mode' = 'production'
        )
    ),
    'release_head_stale_count', (
      select count(*)
      from private.release_head_claims claim
      where claim.inserted_at <= current_timestamp - interval '10 minutes'
        or claim.expires_at <= current_timestamp
    ),
    'oldest_release_head_claimed_at', (
      select min(claim.inserted_at)
      from private.release_head_claims claim
    )
  )
  from private.content_outbox outbox
$$;

comment on function private.get_deployer_alert_state_v1() is
  'Returns actionable outbox and release-head health, including stalled production preview verification.';

commit;
