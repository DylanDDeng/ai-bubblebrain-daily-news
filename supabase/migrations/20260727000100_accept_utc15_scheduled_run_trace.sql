begin;

set local role content_rpc_owner;

-- The Worker runs at 23:00 Beijing (15:00 UTC), but the observability RPC
-- omitted that production slot. finalize_site_release_v1 records its
-- release_registered trace in the same transaction, so the invalid hour
-- rolled back the release and left later runs waiting behind its head claim.
--
-- Patch the deployed function in place instead of copying its large body.
-- Fresh databases already contain the corrected definition in the source
-- migration above; production databases still contain the old guard.
do $migration$
declare
  function_definition text;
  updated_definition text;
  old_hours constant text :=
    'not in (0, 2, 4, 6, 8, 10, 12, 14, 16, 17, 18, 19, 20, 21, 22, 23)';
  new_hours constant text :=
    'not in (0, 2, 4, 6, 8, 10, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23)';
begin
  select pg_get_functiondef(
    'private.record_scheduled_run_trace_v1(text,timestamptz,text,jsonb)'::regprocedure
  ) into function_definition;

  if position(new_hours in function_definition) > 0 then
    return;
  end if;
  if position(old_hours in function_definition) = 0 then
    raise exception
      'scheduled run trace production-hour guard changed unexpectedly';
  end if;

  updated_definition := replace(function_definition, old_hours, new_hours);
  execute updated_definition;
end;
$migration$;

commit;
