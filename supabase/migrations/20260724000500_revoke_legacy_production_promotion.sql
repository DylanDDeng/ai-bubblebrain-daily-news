-- Contract phase for the attempt-fenced Broker rollout.
--
-- The expand migrations and fenced Broker must be deployed before this
-- migration. Once applied, runtime code can authorize and commit forward
-- production promotions only through the attempt-fenced wrappers.

begin;

set local role content_rpc_owner;

revoke execute on function private.authorize_production_promotion_v1(
  uuid, bigint, text, integer
) from content_deployer;

revoke execute on function private.commit_production_promotion_v1(
  uuid, bigint, bigint, text, text, text, text, jsonb
) from content_deployer;

commit;
