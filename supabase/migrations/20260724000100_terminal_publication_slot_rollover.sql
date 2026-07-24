begin;

set local role content_rpc_owner;

create or replace function private.prepare_ingestion_publication_slot_v1(
  p_report_snapshot_id uuid,
  p_batch_id text,
  p_input_sha256 text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_snapshot private.report_snapshots%rowtype;
  v_slot private.publication_slots%rowtype;
  v_reservation private.site_release_reservations%rowtype;
  v_previous_release_id uuid;
begin
  if p_batch_id not in (
    'morning', 'afternoon', 'night', 'lateNight', 'lateNightSupplement'
  )
    or p_input_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'Invalid ingestion publication slot identity';
  end if;

  select * into v_snapshot
  from private.report_snapshots
  where id = p_report_snapshot_id;
  if not found
    or v_snapshot.byte_sha256 <> p_input_sha256 then
    raise exception using
      errcode = '22023',
      message = 'Publication slot snapshot identity mismatch';
  end if;

  perform pg_advisory_xact_lock(
    42002,
    hashtext(v_snapshot.report_date::text || ':' || p_batch_id)
  );

  select * into v_slot
  from private.publication_slots
  where report_date = v_snapshot.report_date
    and batch_id = p_batch_id
  for update;
  if not found then
    return jsonb_build_object('reset', false, 'reason', 'slot_absent');
  end if;

  if v_slot.input_sha256 = p_input_sha256
    and v_slot.content_sha256 = p_input_sha256
    and v_slot.report_snapshot_id is not distinct from p_report_snapshot_id then
    return jsonb_build_object('reset', false, 'reason', 'slot_matches');
  end if;

  if v_slot.site_release_id is not null then
    if not exists (
      select 1
      from private.content_outbox outbox
      where outbox.site_release_id = v_slot.site_release_id
    )
      or exists (
        select 1
        from private.content_outbox outbox
        where outbox.site_release_id = v_slot.site_release_id
          and outbox.status not in ('deployed', 'dead_letter')
          and not (
            outbox.status = 'preview_verified'
            and outbox.payload ->> 'mode' = 'shadow'
          )
      )
      or exists (
        select 1
        from private.release_head_claims claim
        where claim.reservation_id = v_slot.site_release_id
      ) then
      raise exception using
        errcode = '55P03',
        message = 'Publication slot release is still active';
    end if;
    v_previous_release_id := v_slot.site_release_id;
  elsif v_slot.reservation_id is not null then
    select * into v_reservation
    from private.site_release_reservations
    where id = v_slot.reservation_id
    for update;
    if not found then
      raise exception 'Publication slot references a missing reservation';
    end if;
    if v_reservation.status = 'reserved'
      and v_reservation.expires_at > clock_timestamp() then
      raise exception using
        errcode = '55P03',
        message = 'Publication slot reservation is still active';
    end if;
    if v_reservation.status = 'reserved' then
      update private.site_release_reservations
      set status = 'abandoned'
      where id = v_reservation.id;
    elsif v_reservation.status <> 'abandoned' then
      raise exception 'Publication slot has an unusable reservation state';
    end if;
  end if;

  delete from private.publication_slots
  where report_date = v_snapshot.report_date
    and batch_id = p_batch_id;

  return jsonb_build_object(
    'reset', true,
    'reason', 'terminal_slot_rollover',
    'previous_site_release_id', v_previous_release_id
  );
end;
$$;

revoke all on function private.prepare_ingestion_publication_slot_v1(uuid, text, text)
  from public, anon, authenticated, service_role,
       content_backup, content_editor, content_controller,
       content_reader, content_deployer;
grant execute on function private.prepare_ingestion_publication_slot_v1(uuid, text, text)
  to content_ingestor;

commit;
