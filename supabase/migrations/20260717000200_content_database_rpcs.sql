begin;

create table if not exists private.content_attestation_keys (
  key_id text primary key,
  hmac_secret bytea not null check (octet_length(hmac_secret) >= 32),
  not_before timestamptz not null,
  not_after timestamptz not null,
  status text not null default 'active' check (status in ('active', 'retired')),
  inserted_at timestamptz not null default clock_timestamp(),
  check (not_after > not_before)
);

create table if not exists private.consumed_attestation_jtis (
  jti uuid primary key,
  actor_sub text not null,
  action text not null,
  expires_at timestamptz not null,
  inserted_at timestamptz not null default clock_timestamp()
);

alter table private.content_attestation_keys enable row level security;
alter table private.content_attestation_keys force row level security;
alter table private.consumed_attestation_jtis enable row level security;
alter table private.consumed_attestation_jtis force row level security;
drop policy if exists content_rpc_owner_all on private.content_attestation_keys;
create policy content_rpc_owner_all on private.content_attestation_keys
  for all to content_rpc_owner using (true) with check (true);
drop policy if exists content_rpc_owner_all on private.consumed_attestation_jtis;
create policy content_rpc_owner_all on private.consumed_attestation_jtis
  for all to content_rpc_owner using (true) with check (true);
revoke all on private.content_attestation_keys, private.consumed_attestation_jtis
  from public, anon, authenticated, service_role,
       content_ingestor, content_editor, content_controller, content_reader, content_deployer;
grant select, insert, update, delete
  on private.content_attestation_keys, private.consumed_attestation_jtis
  to content_rpc_owner;
grant usage on schema private
  to content_ingestor, content_editor, content_controller, content_reader, content_deployer;

set local role content_rpc_owner;

create or replace function private.sha256_jsonb_v1(value jsonb)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(value::text, 'utf8'), 'sha256'), 'hex')
$$;

create or replace function private.require_setting_v1(setting_name text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce((
    select enabled
    from private.content_settings
    where setting_key = setting_name
  ), false) then
    raise exception 'Content capability is disabled: %', setting_name
      using errcode = '42501';
  end if;
end;
$$;

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
  key_secret bytea;
  issued_at timestamptz;
  expires_at timestamptz;
  subject text;
  resolved_email text;
  resolved_role text;
  token_jti uuid;
begin
  payload_text := assertion ->> 'payload';
  supplied_signature := lower(assertion ->> 'signature');
  if payload_text is null or supplied_signature !~ '^[a-f0-9]{64}$' then
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

  select hmac_secret
  into key_secret
  from private.content_attestation_keys
  where key_id = payload ->> 'key_id'
    and status = 'active'
    and clock_timestamp() between not_before and not_after;

  if key_secret is null or encode(extensions.hmac(payload_text::bytea, key_secret, 'sha256'), 'hex') <> supplied_signature then
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

create or replace function private.ingest_report_snapshot_v1(
  document jsonb,
  object_key text,
  byte_length bigint,
  byte_sha256 text,
  serializer_version text,
  provenance_kind text default 'live_ingestion',
  raw_payload_sha256 text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_report_date date;
  v_report_id uuid;
  v_snapshot_id uuid;
  v_snapshot_version integer;
  item jsonb;
  batch jsonb;
  claim text;
  existing_item private.content_items%rowtype;
  v_revision_id uuid;
  v_revision_number integer;
  v_revision_hash text;
  batch_position integer;
  current_batch text;
  existing_snapshot private.report_snapshots%rowtype;
begin
  if provenance_kind not in ('live_ingestion', 'legacy_structured_import') then
    raise exception 'Invalid provenance kind';
  end if;
  if provenance_kind = 'live_ingestion' then
    perform private.require_setting_v1('database_mirror');
  end if;
  if jsonb_typeof(document) <> 'object'
    or jsonb_typeof(document -> 'items') <> 'array'
    or jsonb_typeof(document -> 'batches') <> 'array' then
    raise exception 'Invalid daily report document';
  end if;
  if provenance_kind = 'live_ingestion' and exists (
    select 1
    from private.global_suppressions suppression
    join jsonb_array_elements(document -> 'items') document_item(value)
      on document_item.value ->> 'id' = suppression.item_id
    where suppression.active
  ) then
    raise exception 'Daily report contains a globally suppressed item';
  end if;
  v_report_date := (document ->> 'date')::date;
  if document ->> 'timezone' <> 'Asia/Shanghai' then
    raise exception 'Daily report timezone must be Asia/Shanghai';
  end if;
  if byte_sha256 !~ '^[a-f0-9]{64}$'
    or object_key <> 'report-snapshots/sha256/' || byte_sha256 || '.json'
    or byte_length <= 0 then
    raise exception 'Invalid verified report object metadata';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_report_date::text, 42001));

  select * into existing_snapshot
  from private.report_snapshots
  where private.report_snapshots.report_date = v_report_date
    and private.report_snapshots.byte_sha256 = ingest_report_snapshot_v1.byte_sha256;
  if found then
    return jsonb_build_object(
      'report_snapshot_id', existing_snapshot.id,
      'report_date', existing_snapshot.report_date,
      'report_version', existing_snapshot.report_version,
      'byte_sha256', existing_snapshot.byte_sha256,
      'idempotent', true
    );
  end if;

  insert into private.daily_reports(
    report_date, timezone, schema_version, identity_version, dedupe_version,
    taxonomy_version, classifier_version, producer_version
  ) values (
    v_report_date,
    document ->> 'timezone',
    (document ->> 'schema_version')::integer,
    (document ->> 'identity_version')::integer,
    (document ->> 'dedupe_version')::integer,
    (document ->> 'taxonomy_version')::integer,
    document ->> 'classifier_version',
    document #>> '{producer,version}'
  )
  on conflict on constraint daily_reports_report_date_key do update set
    schema_version = excluded.schema_version,
    identity_version = excluded.identity_version,
    dedupe_version = excluded.dedupe_version,
    taxonomy_version = excluded.taxonomy_version,
    classifier_version = excluded.classifier_version,
    producer_version = excluded.producer_version,
    row_version = private.daily_reports.row_version + 1,
    updated_at = clock_timestamp()
  returning id into v_report_id;

  for batch in select value from jsonb_array_elements(document -> 'batches') loop
    insert into private.daily_batches(report_id, batch_id, status, generated_at)
    values (
      v_report_id,
      batch ->> 'id',
      batch ->> 'status',
      case when batch ->> 'status' = 'completed'
        then (batch ->> 'generated_at')::timestamptz else null end
    )
    on conflict on constraint daily_batches_pkey do update set
      status = excluded.status,
      generated_at = excluded.generated_at;
  end loop;

  for item in select value from jsonb_array_elements(document -> 'items') loop
    insert into private.content_items(
      id, event_id, identity_version, source_type, content_type, source_id,
      source_name, source_homepage, url, canonical_url, published_at,
      published_date, time_precision, provenance_kind, raw_payload_sha256
    ) values (
      item ->> 'id', item ->> 'event_id', (item ->> 'identity_version')::integer,
      item ->> 'source_type', item ->> 'content_type', item ->> 'source_id',
      item #>> '{source,name}', item #>> '{source,homepage}', item ->> 'url',
      item ->> 'canonical_url', nullif(item ->> 'published_at', '')::timestamptz,
      nullif(item ->> 'published_date', '')::date, item ->> 'time_precision',
      provenance_kind, raw_payload_sha256
    ) on conflict on constraint content_items_pkey do nothing;

    select * into existing_item from private.content_items where id = item ->> 'id';
    if existing_item.event_id <> item ->> 'event_id'
      or existing_item.identity_version <> (item ->> 'identity_version')::integer
      or existing_item.source_type <> item ->> 'source_type'
      or existing_item.content_type <> item ->> 'content_type'
      or existing_item.source_id is distinct from item ->> 'source_id'
      or existing_item.url is distinct from item ->> 'url'
      or existing_item.canonical_url is distinct from item ->> 'canonical_url' then
      raise exception 'Insert-only identity conflict for item %', item ->> 'id';
    end if;

    for claim in
      select value #>> '{}'
      from jsonb_array_elements(item -> 'identity_claims')
      order by value #>> '{}'
    loop
      insert into private.content_identity_claims(claim_id, item_id, identity_version, strategy)
      values (claim, item ->> 'id', (item ->> 'identity_version')::integer, item ->> 'identity_strategy')
      on conflict on constraint content_identity_claims_pkey do nothing;
      if not exists (
        select 1 from private.content_identity_claims
        where claim_id = claim and item_id = item ->> 'id'
      ) then
        raise exception 'Identity claim % already belongs to another item', claim;
      end if;
    end loop;

    v_revision_hash := private.sha256_jsonb_v1(jsonb_build_object(
      'title', item -> 'title', 'summary', item -> 'summary',
      'category', item -> 'category', 'featured', item -> 'featured',
      'score', item -> 'score', 'reason', item -> 'reason',
      'topic_ids', coalesce(item -> 'topic_ids', '[]'::jsonb),
      'entity_ids', coalesce(item -> 'entity_ids', '[]'::jsonb),
      'related_source_ids', coalesce(item -> 'related_source_ids', '[]'::jsonb)
    ));
    select id into v_revision_id
    from private.content_item_revisions
    where item_id = item ->> 'id' and payload_sha256 = v_revision_hash;
    if v_revision_id is null then
      select coalesce(max(revision), 0) + 1 into v_revision_number
      from private.content_item_revisions where item_id = item ->> 'id';
      insert into private.content_item_revisions(
        item_id, revision, title, summary, category, featured, score, reason,
        topic_ids, entity_ids, related_source_ids, payload_sha256
      ) values (
        item ->> 'id', v_revision_number, item ->> 'title', item ->> 'summary',
        item ->> 'category', coalesce((item ->> 'featured')::boolean, false),
        nullif(item ->> 'score', '')::numeric, item ->> 'reason',
        array(select jsonb_array_elements_text(coalesce(item -> 'topic_ids', '[]'::jsonb))),
        array(select jsonb_array_elements_text(coalesce(item -> 'entity_ids', '[]'::jsonb))),
        array(select jsonb_array_elements_text(coalesce(item -> 'related_source_ids', '[]'::jsonb))),
        v_revision_hash
      ) returning id into v_revision_id;

      insert into private.content_item_topics(item_id, revision_id, topic_id)
      select item ->> 'id', v_revision_id, value
      from jsonb_array_elements_text(coalesce(item -> 'topic_ids', '[]'::jsonb));
      insert into private.content_item_entities(item_id, revision_id, entity_id)
      select item ->> 'id', v_revision_id, value
      from jsonb_array_elements_text(coalesce(item -> 'entity_ids', '[]'::jsonb));
    end if;
  end loop;

  delete from private.daily_report_items where private.daily_report_items.report_id = v_report_id;
  for batch in select value from jsonb_array_elements(document -> 'batches') loop
    current_batch := batch ->> 'id';
    batch_position := 0;
    for item_position in 0..jsonb_array_length(batch -> 'item_ids') - 1 loop
      select r.id into v_revision_id
      from private.content_item_revisions r
      where r.item_id = batch -> 'item_ids' ->> item_position
      order by r.revision desc limit 1;
      insert into private.daily_report_items(report_id, batch_id, item_id, revision_id, ordinal)
      values (v_report_id, current_batch, batch -> 'item_ids' ->> item_position, v_revision_id, batch_position);
      batch_position := batch_position + 1;
    end loop;
  end loop;

  select coalesce(max(report_version), 0) + 1 into v_snapshot_version
  from private.report_snapshots
  where private.report_snapshots.report_date = v_report_date;
  insert into private.report_snapshots(
    report_date, report_version, parsed_document, object_key, byte_length,
    byte_sha256, serializer_version
  ) values (
    v_report_date, v_snapshot_version, document, object_key, byte_length,
    byte_sha256, serializer_version
  ) returning id into v_snapshot_id;

  insert into private.report_snapshot_items(
    report_snapshot_id, item_id, revision_id, batch_id, ordinal, materialized_document
  )
  select
    v_snapshot_id,
    dri.item_id,
    dri.revision_id,
    dri.batch_id,
    dri.ordinal,
    item_document.value
  from private.daily_report_items dri
  join lateral jsonb_array_elements(document -> 'items') item_document(value)
    on item_document.value ->> 'id' = dri.item_id
  where dri.report_id = v_report_id and not dri.report_hidden;

  return jsonb_build_object(
    'report_snapshot_id', v_snapshot_id,
    'report_date', v_report_date,
    'report_version', v_snapshot_version,
    'byte_sha256', byte_sha256,
    'idempotent', false
  );
end;
$$;

create or replace function private.reserve_site_release_v1(report_snapshot_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reservation private.site_release_reservations%rowtype;
  predecessor private.site_releases%rowtype;
  report_refs jsonb;
begin
  perform pg_advisory_xact_lock(42002);
  select r.* into predecessor
  from private.site_releases r
  where r.id = coalesce(
    (select target_site_release_id from private.release_current_pointer where singleton),
    (select id from private.site_releases order by sequence desc limit 1)
  );
  insert into private.site_release_reservations(expected_predecessor_id, report_snapshot_id)
  values (predecessor.id, report_snapshot_id)
  returning * into reservation;
  with refs as (
    select sr.report_date, sr.report_snapshot_id, sr.byte_sha256
    from private.site_release_reports sr
    where sr.site_release_id = predecessor.id
      and sr.report_date <> (select report_date from private.report_snapshots where id = reserve_site_release_v1.report_snapshot_id)
    union all
    select s.report_date, s.id, s.byte_sha256
    from private.report_snapshots s where s.id = reserve_site_release_v1.report_snapshot_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'report_date', refs.report_date,
    'report_snapshot_id', refs.report_snapshot_id,
    'byte_sha256', refs.byte_sha256
  ) order by refs.report_date, refs.report_snapshot_id), '[]'::jsonb)
  into report_refs from refs;
  return jsonb_build_object(
    'reservation_id', reservation.id,
    'site_release_id', reservation.id,
    'site_release_sequence', reservation.sequence,
    'expected_predecessor_id', reservation.expected_predecessor_id,
    'report_snapshot_id', reservation.report_snapshot_id,
    'reports', report_refs,
    'expires_at', reservation.expires_at
  );
end;
$$;

create or replace function private.reserve_ingestion_site_release_v1(
  p_report_snapshot_id uuid,
  p_batch_id text,
  p_input_sha256 text,
  p_content_sha256 text,
  p_trigger_kind text,
  p_worker_version text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slot private.publication_slots%rowtype;
  v_slot_found boolean := false;
  v_reservation private.site_release_reservations%rowtype;
  v_release private.site_releases%rowtype;
  v_snapshot private.report_snapshots%rowtype;
  v_attempt private.publication_attempts%rowtype;
  v_predecessor_id uuid;
  v_report_refs jsonb;
begin
  if p_batch_id not in ('morning', 'afternoon', 'night', 'lateNight')
    or p_input_sha256 !~ '^[a-f0-9]{64}$'
    or p_content_sha256 !~ '^[a-f0-9]{64}$'
    or nullif(btrim(p_trigger_kind), '') is null
    or length(p_trigger_kind) > 255
    or nullif(btrim(p_worker_version), '') is null
    or length(p_worker_version) > 255 then
    raise exception using errcode = '22023', message = 'Invalid ingestion publication identity';
  end if;

  select * into v_snapshot
  from private.report_snapshots
  where id = p_report_snapshot_id;
  if not found then
    raise exception using errcode = '22023', message = 'Unknown ingestion report snapshot';
  end if;
  if v_snapshot.byte_sha256 <> p_content_sha256 then
    raise exception using errcode = '22023', message = 'Ingestion content hash does not match snapshot';
  end if;

  -- Serialize only the semantic publication slot. Release finalization retains
  -- its separate global pointer/predecessor serialization below.
  perform pg_advisory_xact_lock(
    42002,
    hashtext(v_snapshot.report_date::text || ':' || p_batch_id)
  );

  select * into v_attempt
  from private.publication_attempts
  where report_date = v_snapshot.report_date
    and batch_id = p_batch_id
    and input_sha256 = p_input_sha256
    and status = 'succeeded'
  order by attempt_number desc
  limit 1
  for update;
  if not found then
    select * into v_attempt
    from private.publication_attempts
    where report_date = v_snapshot.report_date
      and batch_id = p_batch_id
      and input_sha256 = p_input_sha256
      and status = 'started'
    order by attempt_number desc
    limit 1
    for update;
  end if;
  if not found then
    insert into private.publication_attempts(
      report_date, batch_id, input_sha256, attempt_number,
      trigger_kind, worker_version, status
    ) values (
      v_snapshot.report_date, p_batch_id, p_input_sha256,
      coalesce((select max(attempt_number) + 1
        from private.publication_attempts
        where report_date = v_snapshot.report_date
          and batch_id = p_batch_id
          and input_sha256 = p_input_sha256), 1),
      p_trigger_kind, p_worker_version, 'started'
    ) returning * into v_attempt;
  end if;

  select coalesce(
    (select target_site_release_id from private.release_current_pointer where singleton),
    (select id from private.site_releases order by sequence desc limit 1)
  ) into v_predecessor_id;

  select * into v_slot
  from private.publication_slots
  where report_date = v_snapshot.report_date and batch_id = p_batch_id
  for update;
  v_slot_found := found;

  if v_slot_found then
    if v_slot.input_sha256 <> p_input_sha256
      or v_slot.content_sha256 <> p_content_sha256
      or v_slot.report_snapshot_id is distinct from p_report_snapshot_id then
      raise exception using errcode = '40001', message = 'Ingestion publication slot CAS conflict';
    end if;

    if v_slot.site_release_id is not null then
      select * into v_release from private.site_releases where id = v_slot.site_release_id;
      if not found then raise exception 'Publication slot references a missing site release'; end if;
      select coalesce(jsonb_agg(jsonb_build_object(
        'report_date', refs.report_date,
        'report_snapshot_id', refs.report_snapshot_id,
        'byte_sha256', refs.byte_sha256
      ) order by refs.report_date, refs.report_snapshot_id), '[]'::jsonb)
      into v_report_refs
      from private.site_release_reports refs
      where refs.site_release_id = v_release.id;
      return jsonb_build_object(
        'reservation_id', v_release.id,
        'site_release_id', v_release.id,
        'site_release_sequence', v_release.sequence,
        'expected_predecessor_id', v_release.expected_predecessor_id,
        'report_snapshot_id', p_report_snapshot_id,
        'reports', v_report_refs,
        'publication_attempt_id', v_attempt.id,
        'publication_attempt_status', v_attempt.status,
        'idempotent', true,
        'finalized', true
      );
    end if;

    if v_slot.reservation_id is not null then
      select * into v_reservation
      from private.site_release_reservations
      where id = v_slot.reservation_id
      for update;
      if found
        and v_reservation.status = 'reserved'
        and v_reservation.expires_at > clock_timestamp()
        and v_reservation.expected_predecessor_id is not distinct from v_predecessor_id then
        with refs as (
          select sr.report_date, sr.report_snapshot_id, sr.byte_sha256
          from private.site_release_reports sr
          where sr.site_release_id = v_reservation.expected_predecessor_id
            and sr.report_date <> v_snapshot.report_date
          union all
          select v_snapshot.report_date, v_snapshot.id, v_snapshot.byte_sha256
        )
        select coalesce(jsonb_agg(jsonb_build_object(
          'report_date', refs.report_date,
          'report_snapshot_id', refs.report_snapshot_id,
          'byte_sha256', refs.byte_sha256
        ) order by refs.report_date, refs.report_snapshot_id), '[]'::jsonb)
        into v_report_refs from refs;
        return jsonb_build_object(
          'reservation_id', v_reservation.id,
          'site_release_id', v_reservation.id,
          'site_release_sequence', v_reservation.sequence,
          'expected_predecessor_id', v_reservation.expected_predecessor_id,
          'report_snapshot_id', v_reservation.report_snapshot_id,
          'reports', v_report_refs,
          'publication_attempt_id', v_attempt.id,
          'publication_attempt_status', v_attempt.status,
          'expires_at', v_reservation.expires_at,
          'idempotent', true,
          'finalized', false
        );
      end if;
      update private.site_release_reservations
      set status = 'abandoned'
      where id = v_slot.reservation_id and status = 'reserved';
    end if;
  end if;

  insert into private.site_release_reservations(expected_predecessor_id, report_snapshot_id)
  values (v_predecessor_id, p_report_snapshot_id)
  returning * into v_reservation;

  if v_slot_found then
    update private.publication_slots
    set reservation_id = v_reservation.id, site_release_id = null, updated_at = clock_timestamp()
    where report_date = v_snapshot.report_date and batch_id = p_batch_id;
  else
    insert into private.publication_slots(
      report_date, batch_id, input_sha256, content_sha256,
      report_snapshot_id, reservation_id
    ) values (
      v_snapshot.report_date, p_batch_id, p_input_sha256, p_content_sha256,
      p_report_snapshot_id, v_reservation.id
    );
  end if;

  with refs as (
    select sr.report_date, sr.report_snapshot_id, sr.byte_sha256
    from private.site_release_reports sr
    where sr.site_release_id = v_reservation.expected_predecessor_id
      and sr.report_date <> v_snapshot.report_date
    union all
    select v_snapshot.report_date, v_snapshot.id, v_snapshot.byte_sha256
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'report_date', refs.report_date,
    'report_snapshot_id', refs.report_snapshot_id,
    'byte_sha256', refs.byte_sha256
  ) order by refs.report_date, refs.report_snapshot_id), '[]'::jsonb)
  into v_report_refs from refs;

  return jsonb_build_object(
    'reservation_id', v_reservation.id,
    'site_release_id', v_reservation.id,
    'site_release_sequence', v_reservation.sequence,
    'expected_predecessor_id', v_reservation.expected_predecessor_id,
    'report_snapshot_id', v_reservation.report_snapshot_id,
    'reports', v_report_refs,
    'publication_attempt_id', v_attempt.id,
    'publication_attempt_status', v_attempt.status,
    'expires_at', v_reservation.expires_at,
    'idempotent', false,
    'finalized', false
  );
end;
$$;

create or replace function private.fail_ingestion_publication_attempt_v1(
  p_report_date date,
  p_batch_id text,
  p_input_sha256 text,
  p_trigger_kind text,
  p_worker_version text,
  p_error_code text,
  p_error_detail text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_attempt private.publication_attempts%rowtype;
begin
  if p_report_date is null
    or p_batch_id not in ('morning', 'afternoon', 'night', 'lateNight')
    or p_input_sha256 !~ '^[a-f0-9]{64}$'
    or nullif(btrim(p_trigger_kind), '') is null
    or length(p_trigger_kind) > 255
    or nullif(btrim(p_worker_version), '') is null
    or length(p_worker_version) > 255
    or nullif(btrim(p_error_code), '') is null then
    raise exception using errcode = '22023', message = 'Invalid failed publication attempt';
  end if;

  perform pg_advisory_xact_lock(
    42002,
    hashtext(p_report_date::text || ':' || p_batch_id)
  );
  select * into v_attempt
  from private.publication_attempts
  where report_date = p_report_date
    and batch_id = p_batch_id
    and input_sha256 = p_input_sha256
    and status = 'succeeded'
  order by attempt_number desc
  limit 1
  for update;

  if not found then
    select * into v_attempt
    from private.publication_attempts
    where report_date = p_report_date
      and batch_id = p_batch_id
      and input_sha256 = p_input_sha256
    order by attempt_number desc
    limit 1
    for update;
  end if;

  if not found then
    insert into private.publication_attempts(
      report_date, batch_id, input_sha256, attempt_number,
      trigger_kind, worker_version, status, error_code, error_detail, finished_at
    ) values (
      p_report_date, p_batch_id, p_input_sha256, 1,
      p_trigger_kind, p_worker_version, 'failed', left(p_error_code, 255),
      left(coalesce(p_error_detail, ''), 4000), clock_timestamp()
    ) returning * into v_attempt;
  elsif v_attempt.status = 'started' then
    update private.publication_attempts
    set trigger_kind = p_trigger_kind,
        worker_version = p_worker_version,
        status = 'failed',
        error_code = left(p_error_code, 255),
        error_detail = left(coalesce(p_error_detail, ''), 4000),
        finished_at = clock_timestamp()
    where id = v_attempt.id
    returning * into v_attempt;
  end if;

  return jsonb_build_object(
    'publication_attempt_id', v_attempt.id,
    'status', v_attempt.status,
    'idempotent', v_attempt.status = 'succeeded'
  );
end;
$$;

create or replace function private.finalize_site_release_v1(
  reservation_id uuid,
  manifest_object_key text,
  manifest_byte_length bigint,
  manifest_sha256 text,
  content_root_sha256 text,
  schema_version integer,
  taxonomy_version integer,
  serializer_version text,
  search_contract_version text,
  source_contract_version text,
  structured_cutover_date date,
  no_report_days date[],
  dispatch_id uuid,
  dispatch_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reservation private.site_release_reservations%rowtype;
  snapshot private.report_snapshots%rowtype;
  dispatch_mode text;
begin
  perform pg_advisory_xact_lock(42002);
  select * into reservation
  from private.site_release_reservations
  where id = reservation_id
  for update;
  if not found then raise exception 'Unknown site release reservation'; end if;
  if reservation.status = 'finalized' then
    return (select jsonb_build_object(
      'site_release_id', id, 'site_release_sequence', sequence,
      'expected_predecessor_id', expected_predecessor_id, 'idempotent', true
    ) from private.site_releases where id = reservation_id);
  end if;
  if reservation.status <> 'reserved' or reservation.expires_at <= clock_timestamp() then
    raise exception 'Expired or unusable site release reservation';
  end if;
  dispatch_mode := dispatch_payload ->> 'mode';
  if dispatch_mode = 'shadow' then
    perform private.require_setting_v1('shadow_build');
  elsif dispatch_mode = 'production' then
    perform private.require_setting_v1('publication');
  else
    raise exception using errcode = '22023', message = 'Invalid content release dispatch mode';
  end if;
  if jsonb_typeof(dispatch_payload) <> 'object'
    or dispatch_payload ->> 'dispatch_id' <> dispatch_id::text
    or dispatch_payload ->> 'site_release_id' <> reservation.id::text
    or (dispatch_payload ->> 'site_release_sequence')::bigint <> reservation.sequence
    or dispatch_payload ->> 'expected_predecessor_id'
      is distinct from reservation.expected_predecessor_id::text
    or dispatch_payload ->> 'expected_content_sha' <> content_root_sha256
    or dispatch_payload ->> 'code_sha' !~ '^[a-f0-9]{40}$'
    or nullif(btrim(dispatch_payload ->> 'build_environment_version'), '') is null then
    raise exception using errcode = '22023', message = 'Content release dispatch identity mismatch';
  end if;
  if manifest_sha256 !~ '^[a-f0-9]{64}$'
    or manifest_object_key <> 'site-manifests/sha256/' || manifest_sha256 || '.json'
    or content_root_sha256 !~ '^[a-f0-9]{64}$'
    or manifest_byte_length <= 0
    or schema_version < 1
    or taxonomy_version < 1
    or serializer_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
    or search_contract_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
    or source_contract_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' then
    raise exception 'Invalid verified site manifest metadata';
  end if;
  if reservation.expected_predecessor_id is distinct from coalesce(
    (select target_site_release_id from private.release_current_pointer where singleton),
    (select id from private.site_releases order by sequence desc limit 1)
  ) then
    raise exception 'Site release predecessor changed';
  end if;

  select * into snapshot from private.report_snapshots where id = reservation.report_snapshot_id;
  insert into private.site_releases(
    id, sequence, expected_predecessor_id, manifest_object_key, manifest_byte_length,
    manifest_sha256, content_root_sha256, schema_version, taxonomy_version,
    serializer_version, search_contract_version, source_contract_version,
    structured_cutover_date, no_report_days
  ) values (
    reservation.id, reservation.sequence, reservation.expected_predecessor_id,
    manifest_object_key, manifest_byte_length, manifest_sha256, content_root_sha256,
    schema_version, taxonomy_version, serializer_version, search_contract_version,
    source_contract_version, structured_cutover_date, coalesce(no_report_days, '{}')
  );

  if reservation.expected_predecessor_id is not null then
    insert into private.site_release_reports(site_release_id, report_date, report_snapshot_id, byte_sha256)
    select reservation.id, report_date, report_snapshot_id, byte_sha256
    from private.site_release_reports
    where site_release_id = reservation.expected_predecessor_id
      and report_date <> snapshot.report_date;
  end if;
  insert into private.site_release_reports(site_release_id, report_date, report_snapshot_id, byte_sha256)
  values (reservation.id, snapshot.report_date, snapshot.id, snapshot.byte_sha256);

  insert into private.content_outbox(site_release_id, dispatch_id, payload)
  values (reservation.id, dispatch_id, dispatch_payload);
  insert into private.release_deployment_attempts(site_release_id, dispatch_id, event_type)
  values (reservation.id, dispatch_id, 'queued');
  update private.site_release_reservations set status = 'finalized' where id = reservation.id;
  update private.publication_slots slot
  set site_release_id = reservation.id, updated_at = clock_timestamp()
  where slot.reservation_id = reservation.id;
  update private.publication_attempts attempt
  set status = 'succeeded',
      error_code = null,
      error_detail = null,
      finished_at = clock_timestamp()
  from private.publication_slots slot
  where slot.reservation_id = reservation.id
    and attempt.report_date = slot.report_date
    and attempt.batch_id = slot.batch_id
    and attempt.input_sha256 = slot.input_sha256
    and attempt.status = 'started';

  return jsonb_build_object(
    'site_release_id', reservation.id,
    'site_release_sequence', reservation.sequence,
    'expected_predecessor_id', reservation.expected_predecessor_id,
    'dispatch_id', dispatch_id,
    'idempotent', false
  );
end;
$$;

create or replace function private.get_release_report_v1(site_release_id uuid, report_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'site_release_id', site_release_id,
    'report_date', s.report_date,
    'report_snapshot_id', s.id,
    'byte_sha256', s.byte_sha256,
    'byte_length', s.byte_length,
    'object_key', s.object_key,
    'document', s.parsed_document
  )
  from private.site_release_reports sr
  join private.report_snapshots s on s.id = sr.report_snapshot_id
  where sr.site_release_id = get_release_report_v1.site_release_id
    and sr.report_date = get_release_report_v1.report_date
    and exists (
      select 1 from private.release_artifacts a
      where a.site_release_id = get_release_report_v1.site_release_id
        and a.production_verified_at is not null
    )
$$;

create or replace function private.get_release_manifest_v1(site_release_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'site_release_id', id,
    'site_release_sequence', sequence,
    'expected_predecessor_id', expected_predecessor_id,
    'manifest_object_key', manifest_object_key,
    'manifest_byte_length', manifest_byte_length,
    'manifest_sha256', manifest_sha256,
    'content_root_sha256', content_root_sha256,
    'structured_cutover_date', structured_cutover_date,
    'source_contract_version', source_contract_version
  )
  from private.site_releases
  where id = get_release_manifest_v1.site_release_id
    and exists (
      select 1 from private.release_artifacts a
      where a.site_release_id = get_release_manifest_v1.site_release_id
        and a.production_verified_at is not null
    )
$$;

create or replace function private.get_release_item_v1(site_release_id uuid, item_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'site_release_id', site_release_id,
    'report_date', sr.report_date,
    'item', rsi.materialized_document
  )
  from private.site_release_reports sr
  join private.report_snapshot_items rsi on rsi.report_snapshot_id = sr.report_snapshot_id
  where sr.site_release_id = get_release_item_v1.site_release_id
    and rsi.item_id = get_release_item_v1.item_id
    and exists (
      select 1 from private.release_artifacts a
      where a.site_release_id = get_release_item_v1.site_release_id
        and a.production_verified_at is not null
    )
  order by sr.report_date desc
  limit 1
$$;

create or replace function private.search_release_v1(
  site_release_id uuid,
  query_text text,
  result_limit integer default 20,
  before_date date default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with authorized_release as (
    select 1
    from private.release_artifacts a
    where a.site_release_id = search_release_v1.site_release_id
      and a.production_verified_at is not null
  ), candidates as (
    select
      sr.report_date,
      rsi.item_id,
      rsi.materialized_document,
      greatest(
        public.similarity(lower(rsi.materialized_document ->> 'title'), lower(query_text)),
        public.similarity(lower(coalesce(rsi.materialized_document ->> 'summary', '')), lower(query_text))
      ) as rank
    from private.site_release_reports sr
    join private.report_snapshot_items rsi on rsi.report_snapshot_id = sr.report_snapshot_id
    cross join authorized_release
    where sr.site_release_id = search_release_v1.site_release_id
      and (before_date is null or sr.report_date < before_date)
      and (
        lower(rsi.materialized_document ->> 'title') like '%' || lower(query_text) || '%'
        or lower(coalesce(rsi.materialized_document ->> 'summary', '')) like '%' || lower(query_text) || '%'
        or lower(rsi.materialized_document ->> 'title') operator(public.%) lower(query_text)
      )
    order by rank desc, sr.report_date desc, rsi.item_id
    limit least(greatest(result_limit, 1), 100)
  )
  select jsonb_build_object(
    'site_release_id', site_release_id,
    'query', query_text,
    'results', coalesce(jsonb_agg(jsonb_build_object(
      'report_date', report_date, 'item_id', item_id, 'rank', rank, 'item', materialized_document
    ) order by rank desc, report_date desc, item_id), '[]'::jsonb)
  ) from candidates
  having exists (select 1 from authorized_release)
$$;

create or replace function private.get_build_release_report_v1(site_release_id uuid, report_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'site_release_id', site_release_id,
    'report_date', s.report_date,
    'report_snapshot_id', s.id,
    'byte_sha256', s.byte_sha256,
    'byte_length', s.byte_length,
    'object_key', s.object_key,
    'document', s.parsed_document
  )
  from private.site_release_reports sr
  join private.report_snapshots s on s.id = sr.report_snapshot_id
  where sr.site_release_id = get_build_release_report_v1.site_release_id
    and sr.report_date = get_build_release_report_v1.report_date
$$;

create or replace function private.get_build_release_manifest_v1(site_release_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'site_release_id', id,
    'site_release_sequence', sequence,
    'expected_predecessor_id', expected_predecessor_id,
    'manifest_object_key', manifest_object_key,
    'manifest_byte_length', manifest_byte_length,
    'manifest_sha256', manifest_sha256,
    'content_root_sha256', content_root_sha256,
    'structured_cutover_date', structured_cutover_date,
    'source_contract_version', source_contract_version
  )
  from private.site_releases
  where id = get_build_release_manifest_v1.site_release_id
$$;

create or replace function private.get_current_release_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'site_release_id', pointer.target_site_release_id,
    'site_release_sequence', pointer.target_release_sequence,
    'generation', pointer.generation,
    'pages_deployment_id', pointer.pages_deployment_id,
    'manifest_sha256', pointer.manifest_sha256,
    'content_sha256', release.content_root_sha256,
    'artifact_sha256', pointer.artifact_sha256,
    'artifact_fingerprint_sha256', artifact.artifact_fingerprint_sha256,
    'code_sha', artifact.code_sha,
    'build_environment_version', pointer.build_environment_version
  )
  from private.release_current_pointer pointer
  join private.site_releases release on release.id = pointer.target_site_release_id
  join private.release_artifacts artifact on artifact.site_release_id = pointer.target_site_release_id
  where pointer.singleton
$$;

create or replace function private.claim_content_outbox_v1(
  worker_id text,
  lease_seconds integer default 120
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare claimed private.content_outbox%rowtype;
begin
  update private.content_outbox
  set status = 'dead_letter',
      lease_expires_at = null,
      dead_lettered_at = coalesce(dead_lettered_at, clock_timestamp()),
      last_error = coalesce(last_error, 'lease expired after maximum attempts'),
      updated_at = clock_timestamp()
  where attempts >= max_attempts
    and status in ('queued', 'failed', 'claimed', 'dispatched', 'building', 'promoting')
    and (lease_expires_at is null or lease_expires_at <= clock_timestamp());
  update private.content_outbox o set
    status = 'claimed', locked_by = worker_id, locked_at = clock_timestamp(),
    lease_expires_at = clock_timestamp() + make_interval(secs => least(greatest(lease_seconds, 30), 600)),
    attempts = attempts + 1, updated_at = clock_timestamp()
  where o.id = (
    select id from private.content_outbox
    where (
        status in ('queued', 'failed', 'claimed', 'dispatched', 'building', 'promoting')
        or (status = 'preview_verified' and payload ->> 'mode' = 'production')
      )
      and next_attempt_at <= clock_timestamp()
      and (lease_expires_at is null or lease_expires_at <= clock_timestamp())
      and attempts < max_attempts
    order by inserted_at
    for update skip locked
    limit 1
  ) returning * into claimed;
  if not found then return null; end if;
  return jsonb_build_object(
    'outbox_id', claimed.id, 'site_release_id', claimed.site_release_id,
    'dispatch_id', claimed.dispatch_id, 'payload', claimed.payload,
    'lease_expires_at', claimed.lease_expires_at, 'attempt', claimed.attempts
  );
end;
$$;

create or replace function private.record_deployment_event_v1(
  site_release_id uuid,
  dispatch_id uuid,
  event_type text,
  evidence jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into private.release_deployment_attempts(site_release_id, dispatch_id, event_type, evidence)
  values (site_release_id, dispatch_id, event_type, coalesce(evidence, '{}'::jsonb));
  update private.content_outbox o set
    status = case
      when event_type = 'edge_verified' then 'deployed'
      when o.status in ('deployed', 'dead_letter') then o.status
      when event_type = 'building' and o.status in ('queued', 'claimed', 'dispatched', 'failed')
        then 'building'
      when event_type = 'preview_verified' and o.status in ('queued', 'claimed', 'dispatched', 'building', 'failed')
        then 'preview_verified'
      when event_type = 'production_deployed' then 'promoting'
      when event_type = 'failed'
        then case when o.attempts >= o.max_attempts then 'dead_letter' else 'failed' end
      else o.status end,
    github_run_id = coalesce((evidence ->> 'github_run_id')::bigint, o.github_run_id),
    last_error = case
      when event_type = 'failed' and o.status not in ('deployed', 'dead_letter')
        then evidence ->> 'error'
      else o.last_error end,
    next_attempt_at = case
      when event_type = 'failed' and o.status not in ('deployed', 'dead_letter')
        then clock_timestamp() + make_interval(secs =>
          least(3600, (power(2, o.attempts) * 15)::integer) + floor(random() * 15)::integer
        )
      else o.next_attempt_at end,
    dead_lettered_at = case
      when event_type = 'failed' and o.status not in ('deployed', 'dead_letter')
        and o.attempts >= o.max_attempts then clock_timestamp()
      else o.dead_lettered_at end,
    updated_at = clock_timestamp()
  where o.dispatch_id = record_deployment_event_v1.dispatch_id
    and o.site_release_id = record_deployment_event_v1.site_release_id;
  if not found then raise exception 'Deployment event identity mismatch'; end if;
end;
$$;

create or replace function private.register_release_artifact_v1(
  site_release_id uuid,
  object_key text,
  byte_length bigint,
  artifact_sha256 text,
  artifact_fingerprint_sha256 text,
  hash_algorithm text,
  code_sha text,
  build_environment_version text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if register_release_artifact_v1.hash_algorithm not in (
      'sha256-deterministic-tar-v1',
      'sha256-content-addressed-pages-v1'
    )
    or register_release_artifact_v1.object_key <> ('artifacts/sha256/'
      || register_release_artifact_v1.artifact_sha256
      || (case
        when register_release_artifact_v1.hash_algorithm = 'sha256-content-addressed-pages-v1'
          then '.json'
        else '.tar'
      end))
    or register_release_artifact_v1.artifact_sha256 !~ '^[a-f0-9]{64}$'
    or register_release_artifact_v1.artifact_fingerprint_sha256 !~ '^[a-f0-9]{64}$'
    or register_release_artifact_v1.code_sha !~ '^[a-f0-9]{40}$'
    or register_release_artifact_v1.byte_length <= 0 then
    raise exception 'Invalid verified artifact metadata';
  end if;
  insert into private.release_artifacts(
    site_release_id, object_key, byte_length, artifact_sha256, artifact_fingerprint_sha256,
    hash_algorithm, code_sha, build_environment_version
  ) values (
    register_release_artifact_v1.site_release_id,
    register_release_artifact_v1.object_key,
    register_release_artifact_v1.byte_length,
    register_release_artifact_v1.artifact_sha256,
    register_release_artifact_v1.artifact_fingerprint_sha256,
    register_release_artifact_v1.hash_algorithm,
    register_release_artifact_v1.code_sha,
    register_release_artifact_v1.build_environment_version
  ) on conflict on constraint release_artifacts_pkey do nothing;
  if not exists (
    select 1 from private.release_artifacts a
    where a.site_release_id = register_release_artifact_v1.site_release_id
      and a.object_key = register_release_artifact_v1.object_key
      and a.byte_length = register_release_artifact_v1.byte_length
      and a.artifact_sha256 = register_release_artifact_v1.artifact_sha256
      and a.artifact_fingerprint_sha256 = register_release_artifact_v1.artifact_fingerprint_sha256
      and a.hash_algorithm = register_release_artifact_v1.hash_algorithm
      and a.code_sha = register_release_artifact_v1.code_sha
      and a.build_environment_version = register_release_artifact_v1.build_environment_version
  ) then
    raise exception 'Artifact registration collision';
  end if;
end;
$$;

create or replace function private.authorize_production_promotion_v1(
  site_release_id uuid,
  expected_pointer_generation bigint,
  locked_by text,
  lease_seconds integer default 300
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  release private.site_releases%rowtype;
  pointer private.release_current_pointer%rowtype;
  slot private.production_promotion_slot%rowtype;
  next_token bigint;
begin
  perform private.require_setting_v1('publication');
  perform pg_advisory_xact_lock(42003);
  select * into release from private.site_releases where id = site_release_id;
  if not found then raise exception 'Unknown site release'; end if;
  if not exists (
    select 1 from private.release_deployment_attempts
    where private.release_deployment_attempts.site_release_id = authorize_production_promotion_v1.site_release_id
      and event_type = 'preview_verified'
  ) or not exists (
    select 1 from private.release_artifacts
    where private.release_artifacts.site_release_id = authorize_production_promotion_v1.site_release_id
  ) then
    raise exception 'Preview and immutable artifact are required';
  end if;
  select * into pointer from private.release_current_pointer where singleton for update;
  if coalesce(pointer.generation, 0) <> expected_pointer_generation then
    raise exception 'Pointer generation conflict';
  end if;
  if pointer.singleton is not null and (
    release.sequence <= pointer.target_release_sequence
    or release.expected_predecessor_id is distinct from pointer.target_site_release_id
  ) then
    raise exception 'Forward predecessor or sequence conflict';
  end if;
  select * into slot from private.production_promotion_slot
  where project_key = 'bubble-brain-pages' for update;
  if slot.project_key is not null
    and slot.lease_expires_at > clock_timestamp()
    and slot.status not in ('committed', 'rolling_back_failed') then
    raise exception 'Production promotion slot is busy';
  end if;
  next_token := coalesce(slot.fencing_token, 0) + 1;
  insert into private.production_promotion_slot(
    project_key, site_release_id, release_sequence, fencing_token, locked_by,
    lease_expires_at, expected_pointer_generation, status, operation
  ) values (
    'bubble-brain-pages', release.id, release.sequence, next_token, locked_by,
    clock_timestamp() + make_interval(secs => least(greatest(lease_seconds, 60), 600)),
    expected_pointer_generation, 'authorized', 'forward'
  ) on conflict on constraint production_promotion_slot_pkey do update set
    site_release_id = excluded.site_release_id,
    release_sequence = excluded.release_sequence,
    fencing_token = excluded.fencing_token,
    locked_by = excluded.locked_by,
    lease_expires_at = excluded.lease_expires_at,
    expected_pointer_generation = excluded.expected_pointer_generation,
    status = excluded.status,
    operation = excluded.operation,
    rollback_from_site_release_id = null,
    updated_at = clock_timestamp();
  return jsonb_build_object(
    'site_release_id', release.id, 'site_release_sequence', release.sequence,
    'fencing_token', next_token, 'expected_pointer_generation', expected_pointer_generation,
    'lease_expires_at', clock_timestamp() + make_interval(secs => least(greatest(lease_seconds, 60), 600))
  );
end;
$$;

create or replace function private.mark_promotion_deploying_v1(
  site_release_id uuid,
  fencing_token bigint,
  expected_pointer_generation bigint
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update private.production_promotion_slot set
    status = 'deploying', updated_at = clock_timestamp()
  where project_key = 'bubble-brain-pages'
    and private.production_promotion_slot.site_release_id = mark_promotion_deploying_v1.site_release_id
    and private.production_promotion_slot.fencing_token = mark_promotion_deploying_v1.fencing_token
    and private.production_promotion_slot.expected_pointer_generation = mark_promotion_deploying_v1.expected_pointer_generation
    and lease_expires_at > clock_timestamp()
    and status = 'authorized';
  if not found then raise exception 'Stale production fencing token'; end if;
end;
$$;

create or replace function private.commit_production_promotion_v1(
  site_release_id uuid,
  fencing_token bigint,
  expected_pointer_generation bigint,
  pages_deployment_id text,
  manifest_sha256 text,
  artifact_sha256 text,
  build_environment_version text,
  verifier_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare release private.site_releases%rowtype;
declare artifact private.release_artifacts%rowtype;
declare new_generation bigint;
begin
  perform pg_advisory_xact_lock(42003);
  if coalesce((verifier_evidence ->> 'multi_edge_verified')::boolean, false) is not true then
    raise exception 'Multi-edge verifier evidence is required';
  end if;
  if not exists (
    select 1 from private.production_promotion_slot
    where project_key = 'bubble-brain-pages'
      and private.production_promotion_slot.site_release_id = commit_production_promotion_v1.site_release_id
      and private.production_promotion_slot.fencing_token = commit_production_promotion_v1.fencing_token
      and private.production_promotion_slot.expected_pointer_generation = commit_production_promotion_v1.expected_pointer_generation
      and lease_expires_at > clock_timestamp()
      and status in ('deploying', 'verifying')
      and operation = 'forward'
  ) then raise exception 'Stale production fencing token'; end if;
  select * into release from private.site_releases where id = site_release_id;
  select * into artifact from private.release_artifacts
  where private.release_artifacts.site_release_id = commit_production_promotion_v1.site_release_id;
  if release.manifest_sha256 <> manifest_sha256
    or artifact.artifact_sha256 <> commit_production_promotion_v1.artifact_sha256
    or artifact.build_environment_version <> commit_production_promotion_v1.build_environment_version then
    raise exception 'Deployment evidence hash mismatch';
  end if;
  if coalesce((select generation from private.release_current_pointer where singleton), 0)
    <> expected_pointer_generation then
    raise exception 'Pointer generation conflict';
  end if;
  new_generation := expected_pointer_generation + 1;
  insert into private.release_current_pointer(
    singleton, target_site_release_id, target_release_sequence, generation,
    pages_deployment_id, manifest_sha256, artifact_sha256, build_environment_version
  ) values (
    true, release.id, release.sequence, new_generation, pages_deployment_id,
    manifest_sha256, artifact_sha256, build_environment_version
  ) on conflict on constraint release_current_pointer_pkey do update set
    target_site_release_id = excluded.target_site_release_id,
    target_release_sequence = excluded.target_release_sequence,
    generation = excluded.generation,
    pages_deployment_id = excluded.pages_deployment_id,
    manifest_sha256 = excluded.manifest_sha256,
    artifact_sha256 = excluded.artifact_sha256,
    build_environment_version = excluded.build_environment_version,
    updated_at = clock_timestamp();
  update private.release_artifacts set production_verified_at = clock_timestamp()
    where private.release_artifacts.site_release_id = commit_production_promotion_v1.site_release_id;
  update private.production_promotion_slot set status = 'committed', updated_at = clock_timestamp()
    where project_key = 'bubble-brain-pages';
  insert into private.release_deployment_attempts(site_release_id, event_type, evidence)
  values (site_release_id, 'edge_verified', verifier_evidence);
  update private.content_outbox set status = 'deployed', lease_expires_at = null,
    updated_at = clock_timestamp()
  where private.content_outbox.site_release_id = commit_production_promotion_v1.site_release_id
    and status not in ('deployed', 'dead_letter');
  return jsonb_build_object('site_release_id', site_release_id, 'generation', new_generation);
end;
$$;

create or replace function private.authorize_production_rollback_v1(
  target_site_release_id uuid,
  expected_pointer_generation bigint,
  locked_by text,
  reason text,
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
declare target private.site_releases%rowtype;
declare pointer private.release_current_pointer%rowtype;
declare slot private.production_promotion_slot%rowtype;
begin
  perform private.require_setting_v1('publication');
  select * into actor from private.consume_attestation_v1(
    assertion, 'content-control', 'production.rollback', body_sha256, array['Owner']
  );
  if char_length(btrim(reason)) < 8 then raise exception 'Rollback reason is required'; end if;
  perform pg_advisory_xact_lock(42003);
  select * into pointer from private.release_current_pointer where singleton for update;
  if pointer.generation <> expected_pointer_generation
    or pointer.target_site_release_id = target_site_release_id then
    raise exception 'Invalid rollback source generation or target';
  end if;
  select * into target from private.site_releases where id = target_site_release_id;
  if not found or not exists (
    select 1 from private.release_artifacts
    where site_release_id = target.id and production_verified_at is not null
  ) then raise exception 'Rollback target is not production verified'; end if;
  select * into slot from private.production_promotion_slot
    where project_key = 'bubble-brain-pages' for update;
  if slot.project_key is not null
    and slot.lease_expires_at > clock_timestamp()
    and slot.status not in ('committed', 'rolling_back_failed') then
    raise exception 'Production promotion slot is busy';
  end if;
  insert into private.production_promotion_slot(
    project_key, site_release_id, release_sequence, fencing_token, locked_by,
    lease_expires_at, expected_pointer_generation, status, operation,
    rollback_from_site_release_id
  ) values (
    'bubble-brain-pages', target.id, target.sequence, coalesce(slot.fencing_token, 0) + 1,
    locked_by, clock_timestamp() + interval '10 minutes', expected_pointer_generation,
    'rolling_back', 'rollback', pointer.target_site_release_id
  ) on conflict on constraint production_promotion_slot_pkey do update set
    site_release_id = excluded.site_release_id,
    release_sequence = excluded.release_sequence,
    fencing_token = excluded.fencing_token,
    locked_by = excluded.locked_by,
    lease_expires_at = excluded.lease_expires_at,
    expected_pointer_generation = excluded.expected_pointer_generation,
    status = excluded.status,
    operation = excluded.operation,
    rollback_from_site_release_id = excluded.rollback_from_site_release_id,
    updated_at = clock_timestamp();
  insert into private.content_audit_log(
    actor_sub, actor_email, actor_role, action, reason, request_id,
    target, result
  ) values (
    actor.actor_sub, actor.actor_email, actor.actor_role, 'production.rollback.authorize',
    reason, actor.assertion_jti::text,
    jsonb_build_object('from', pointer.target_site_release_id, 'to', target.id), 'authorized'
  );
  return jsonb_build_object(
    'target_site_release_id', target.id,
    'fencing_token', coalesce(slot.fencing_token, 0) + 1,
    'expected_pointer_generation', expected_pointer_generation
  );
end;
$$;

create or replace function private.commit_production_rollback_v1(
  target_site_release_id uuid,
  fencing_token bigint,
  expected_pointer_generation bigint,
  pages_deployment_id text,
  verifier_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare target private.site_releases%rowtype;
declare artifact private.release_artifacts%rowtype;
declare new_generation bigint;
begin
  perform pg_advisory_xact_lock(42003);
  if coalesce((verifier_evidence ->> 'multi_edge_verified')::boolean, false) is not true
    or not exists (
      select 1 from private.production_promotion_slot
      where project_key = 'bubble-brain-pages'
        and site_release_id = target_site_release_id
        and private.production_promotion_slot.fencing_token = commit_production_rollback_v1.fencing_token
        and private.production_promotion_slot.expected_pointer_generation = commit_production_rollback_v1.expected_pointer_generation
        and operation = 'rollback' and status = 'rolling_back'
        and lease_expires_at > clock_timestamp()
    ) then raise exception 'Invalid rollback evidence or fencing token'; end if;
  if (select generation from private.release_current_pointer where singleton)
    <> expected_pointer_generation then raise exception 'Pointer generation conflict'; end if;
  select * into target from private.site_releases where id = target_site_release_id;
  select * into artifact from private.release_artifacts
    where site_release_id = target_site_release_id and production_verified_at is not null;
  if artifact.site_release_id is null then raise exception 'Rollback artifact unavailable'; end if;
  new_generation := expected_pointer_generation + 1;
  update private.release_current_pointer set
    target_site_release_id = target.id,
    target_release_sequence = target.sequence,
    generation = new_generation,
    pages_deployment_id = commit_production_rollback_v1.pages_deployment_id,
    manifest_sha256 = target.manifest_sha256,
    artifact_sha256 = artifact.artifact_sha256,
    build_environment_version = artifact.build_environment_version,
    updated_at = clock_timestamp()
  where singleton;
  update private.production_promotion_slot set status = 'committed', updated_at = clock_timestamp()
    where project_key = 'bubble-brain-pages';
  insert into private.release_deployment_attempts(site_release_id, event_type, evidence)
  values (target.id, 'rollback_committed', verifier_evidence);
  return jsonb_build_object('site_release_id', target.id, 'generation', new_generation);
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
        'sha256_jsonb_v1', 'require_setting_v1', 'consume_attestation_v1',
        'ingest_report_snapshot_v1', 'reserve_site_release_v1',
        'reserve_ingestion_site_release_v1', 'fail_ingestion_publication_attempt_v1',
        'finalize_site_release_v1',
        'get_release_report_v1', 'get_release_manifest_v1', 'get_release_item_v1', 'search_release_v1',
        'get_build_release_report_v1', 'get_build_release_manifest_v1',
        'get_current_release_v1', 'claim_content_outbox_v1', 'record_deployment_event_v1'
        , 'register_release_artifact_v1', 'authorize_production_promotion_v1'
        , 'mark_promotion_deploying_v1', 'commit_production_promotion_v1'
        , 'authorize_production_rollback_v1', 'commit_production_rollback_v1'
      )
  loop
    execute format('revoke all on function %I.%I(%s) from public, anon, authenticated, service_role',
      function_record.nspname, function_record.proname, function_record.args);
  end loop;
end;
$$;

do $$
declare function_record record;
begin
  for function_record in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
  loop
    execute format(
      'alter function %I.%I(%s) owner to content_rpc_owner',
      function_record.nspname, function_record.proname, function_record.args
    );
  end loop;
end;
$$;

grant execute on function private.ingest_report_snapshot_v1(jsonb, text, bigint, text, text, text, text)
  to content_ingestor;
grant execute on function private.reserve_site_release_v1(uuid)
  to content_ingestor, content_editor;
grant execute on function private.reserve_ingestion_site_release_v1(uuid, text, text, text, text, text)
  to content_ingestor;
grant execute on function private.fail_ingestion_publication_attempt_v1(date, text, text, text, text, text, text)
  to content_ingestor;
grant execute on function private.finalize_site_release_v1(
  uuid, text, bigint, text, text, integer, integer, text, text, text, date, date[], uuid, jsonb
) to content_ingestor, content_editor;
grant execute on function private.get_release_report_v1(uuid, date)
  to content_reader, content_editor;
grant execute on function private.get_release_manifest_v1(uuid)
  to content_reader, content_editor;
grant execute on function private.get_release_item_v1(uuid, text)
  to content_reader, content_editor;
grant execute on function private.search_release_v1(uuid, text, integer, date)
  to content_reader, content_editor;
grant execute on function private.get_build_release_report_v1(uuid, date)
  to content_deployer;
grant execute on function private.get_build_release_manifest_v1(uuid)
  to content_deployer;
grant execute on function private.get_current_release_v1()
  to content_reader, content_editor, content_controller, content_deployer;
grant execute on function private.claim_content_outbox_v1(text, integer)
  to content_deployer;
grant execute on function private.record_deployment_event_v1(uuid, uuid, text, jsonb)
  to content_deployer;
grant execute on function private.register_release_artifact_v1(uuid, text, bigint, text, text, text, text, text)
  to content_deployer;
grant execute on function private.authorize_production_promotion_v1(uuid, bigint, text, integer)
  to content_deployer;
grant execute on function private.mark_promotion_deploying_v1(uuid, bigint, bigint)
  to content_deployer;
grant execute on function private.commit_production_promotion_v1(
  uuid, bigint, bigint, text, text, text, text, jsonb
) to content_deployer;
grant execute on function private.authorize_production_rollback_v1(
  uuid, bigint, text, text, jsonb, text
) to content_controller;
grant execute on function private.commit_production_rollback_v1(
  uuid, bigint, bigint, text, jsonb
) to content_deployer;

commit;
