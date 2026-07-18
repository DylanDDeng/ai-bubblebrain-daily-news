begin;

set local role content_rpc_owner;

create or replace function private.get_deployer_alert_state_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'dead_letter_count', count(*) filter (
      where status = 'dead_letter'
        and last_error is distinct from 'superseded_by_history_bootstrap'
    ),
    'resolved_dead_letter_count', count(*) filter (
      where status = 'dead_letter'
        and last_error = 'superseded_by_history_bootstrap'
    ),
    'stale_queued_count', count(*) filter (
      where status in ('queued','failed','claimed','dispatched','building','promoting')
        and inserted_at <= current_timestamp - interval '10 minutes'
    ),
    'oldest_actionable_at', min(inserted_at) filter (
      where status in ('queued','failed','claimed','dispatched','building','promoting')
    )
  )
  from private.content_outbox
$$;

comment on function private.get_deployer_alert_state_v1() is
  'Returns actionable outbox health; history-bootstrap supersessions remain immutable resolved evidence.';

commit;
