-- Contract phase for the attempt-fenced Broker rollout.
--
-- Do not run this with the expand migration. Apply it only after every
-- production Broker instance is confirmed to call
-- authorize_attempt_production_promotion_v1. Keeping this outside
-- supabase/migrations prevents an automatic db push from breaking an older
-- Broker during the DB-to-Worker deployment window.

begin;

revoke execute on function private.authorize_production_promotion_v1(
  uuid, bigint, text, integer
) from content_deployer;

revoke execute on function private.commit_production_promotion_v1(
  uuid, bigint, bigint, text, text, text, text, jsonb
) from content_deployer;

commit;
