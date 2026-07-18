begin;

create extension if not exists pgsodium;

alter table private.content_attestation_keys
  add column if not exists public_key bytea;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'content_attestation_keys'
      and column_name = 'hmac_secret'
  ) then
    update private.content_attestation_keys
    set status = 'retired'
    where public_key is null;
    alter table private.content_attestation_keys drop column hmac_secret;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'private'
      and relation.relname = 'content_attestation_keys'
      and constraint_row.conname = 'content_attestation_keys_public_key_shape'
  ) then
    alter table private.content_attestation_keys
      add constraint content_attestation_keys_public_key_shape check (
        (status = 'active' and octet_length(public_key) = 32)
        or (status = 'retired' and (public_key is null or octet_length(public_key) = 32))
      );
  end if;
end;
$$;

set local role content_rpc_owner;

create or replace function private.consume_attestation_v1(
  assertion jsonb,
  expected_audience text,
  expected_action text,
  expected_body_sha256 text,
  required_roles text[]
)
returns table(actor_sub text, actor_email text, actor_role text, assertion_jti uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  payload_text text;
  payload jsonb;
  supplied_signature text;
  key_public bytea;
  issued_at timestamptz;
  expires_at timestamptz;
  subject text;
  resolved_email text;
  resolved_role text;
  token_jti uuid;
begin
  payload_text := assertion ->> 'payload';
  supplied_signature := lower(assertion ->> 'signature');
  if payload_text is null or supplied_signature !~ '^[a-f0-9]{128}$' then
    raise exception 'Malformed attestation' using errcode = '22023';
  end if;

  begin
    payload := payload_text::jsonb;
    issued_at := (payload ->> 'iat')::timestamptz;
    expires_at := (payload ->> 'exp')::timestamptz;
    token_jti := (payload ->> 'jti')::uuid;
  exception when others then
    raise exception 'Malformed attestation payload' using errcode = '22023';
  end;

  select public_key
  into key_public
  from private.content_attestation_keys
  where key_id = payload ->> 'key_id'
    and status = 'active'
    and clock_timestamp() between not_before and not_after;

  if key_public is null or not pgsodium.crypto_sign_verify_detached(
    decode(supplied_signature, 'hex'),
    convert_to(payload_text, 'utf8'),
    key_public
  ) then
    raise exception 'Invalid attestation signature' using errcode = '42501';
  end if;
  if payload ->> 'aud' <> expected_audience
    or payload ->> 'action' <> expected_action
    or payload ->> 'body_sha256' <> expected_body_sha256 then
    raise exception 'Attestation request binding mismatch' using errcode = '42501';
  end if;
  if payload ->> 'auth_context' <> (case
      when expected_audience = 'content-control' then 'access+totp'
      else 'access'
    end) then
    raise exception 'Attestation authentication context mismatch' using errcode = '42501';
  end if;
  if expires_at <= clock_timestamp()
    or issued_at > clock_timestamp() + interval '5 seconds'
    or expires_at > issued_at + interval '60 seconds'
    or issued_at < clock_timestamp() - interval '65 seconds' then
    raise exception 'Expired attestation' using errcode = '42501';
  end if;

  subject := payload ->> 'sub';
  select p.display_email, b.role
  into resolved_email, resolved_role
  from private.admin_principals p
  join private.admin_role_bindings b on b.principal_id = p.access_sub
  where p.access_sub = subject
    and p.status = 'active'
    and b.role = any(required_roles)
    and b.valid_from <= clock_timestamp()
    and (b.valid_until is null or b.valid_until > clock_timestamp())
  order by array_position(array['Viewer', 'Editor', 'Publisher', 'Owner'], b.role) desc
  limit 1;

  if resolved_role is null then
    raise exception 'Attested principal lacks the required role' using errcode = '42501';
  end if;

  insert into private.consumed_attestation_jtis(jti, actor_sub, action, expires_at)
  values (token_jti, subject, expected_action, expires_at);

  return query select subject, resolved_email, resolved_role, token_jti;
exception when unique_violation then
  raise exception 'Attestation replay rejected' using errcode = '42501';
end;
$$;

-- SET LOCAL ROLE unwinds at COMMIT. An explicit RESET ROLE would discard the
-- Supabase CLI migration writer's outer SET ROLE before it records history.
commit;
