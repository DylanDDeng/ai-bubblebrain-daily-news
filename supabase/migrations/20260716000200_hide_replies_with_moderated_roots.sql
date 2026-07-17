begin;

alter table private.community_settings
  add column if not exists comments_per_hour integer not null default 30,
  add column if not exists comments_per_day integer not null default 100;

alter table private.community_settings
  drop constraint if exists community_settings_comments_per_hour_check,
  drop constraint if exists community_settings_comments_per_day_check,
  drop constraint if exists community_settings_comment_quotas_order;

alter table private.community_settings
  add constraint community_settings_comments_per_hour_check
    check (comments_per_hour between 1 and 1000),
  add constraint community_settings_comments_per_day_check
    check (comments_per_day between 1 and 5000),
  add constraint community_settings_comment_quotas_order
    check (
      comments_per_minute <= comments_per_hour
      and comments_per_hour <= comments_per_day
    );

drop view if exists public.page_comments;

create or replace function public.get_page_comments(
  p_thread_id text,
  p_comment_id uuid default null
)
returns table (
  id uuid,
  thread_id text,
  parent_id uuid,
  user_id uuid,
  type text,
  content text,
  created_at timestamptz,
  display_name text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_thread_id is null
    or p_thread_id <> btrim(p_thread_id)
    or char_length(p_thread_id) not between 7 and 512
    or p_thread_id !~ '^page:/[^[:space:]]+/$'
  then
    raise exception 'Only canonical page threads are readable';
  end if;

  return query
  select
    comments.id,
    comments.thread_id,
    comments.parent_id,
    comments.user_id,
    comments.type,
    comments.content,
    comments.created_at,
    profiles.display_name,
    profiles.avatar_url
  from public.comments comments
  join public.profiles profiles on profiles.id = comments.user_id
  left join public.comments parent on parent.id = comments.parent_id
  where comments.thread_id = p_thread_id
    and (p_comment_id is null or comments.id = p_comment_id)
    and comments.moderation_status = 'visible'
    and (
      comments.parent_id is null
      or (
        parent.id is not null
        and parent.parent_id is null
        and parent.thread_id = comments.thread_id
        and parent.moderation_status = 'visible'
      )
    )
  order by comments.created_at asc, comments.id asc;
end;
$$;

create or replace function public.community_create_comment(
  p_actor_id uuid,
  p_thread_id text,
  p_parent_id uuid,
  p_type text,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings private.community_settings%rowtype;
  created_id uuid;
  effective_type text;
  minute_events bigint;
  hour_events bigint;
  day_events bigint;
begin
  if p_actor_id is null or not exists (select 1 from public.profiles where id = p_actor_id) then
    raise exception 'A ready profile is required';
  end if;
  if p_thread_id is null or p_thread_id !~ '^page:/[^[:space:]]+/$' then
    raise exception 'Only canonical page threads are writable';
  end if;
  if char_length(p_thread_id) > 512 or p_thread_id <> btrim(p_thread_id) then
    raise exception 'Invalid page thread';
  end if;
  if p_content is null or p_content <> btrim(p_content) or char_length(p_content) not between 1 and 4000 then
    raise exception 'Comment content must be trimmed and contain 1 to 4000 characters';
  end if;

  select * into settings
  from private.community_settings
  where singleton
  for share;
  if not coalesce(settings.comments_write_enabled, false) then
    raise exception 'Comment writing is disabled';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 0));
  delete from private.community_rate_events where created_at < now() - interval '1 day';
  select
    count(*) filter (where created_at >= now() - interval '1 minute'),
    count(*) filter (where created_at >= now() - interval '1 hour'),
    count(*)
  into minute_events, hour_events, day_events
  from private.community_rate_events
  where actor_id = p_actor_id
    and created_at >= now() - interval '1 day';

  if minute_events >= settings.comments_per_minute then
    raise exception 'Comment minute rate limit exceeded';
  end if;
  if hour_events >= settings.comments_per_hour then
    raise exception 'Comment hourly rate limit exceeded';
  end if;
  if day_events >= settings.comments_per_day then
    raise exception 'Comment daily rate limit exceeded';
  end if;

  effective_type := case when p_parent_id is null then p_type else 'reply' end;
  if p_parent_id is null and effective_type not in ('question', 'repro', 'suggestion') then
    raise exception 'Invalid root comment type';
  end if;

  insert into private.community_rate_events (actor_id) values (p_actor_id);
  insert into public.comments (thread_id, parent_id, user_id, type, content)
  values (p_thread_id, p_parent_id, p_actor_id, effective_type, p_content)
  returning comments.id into created_id;
  return created_id;
end;
$$;

create or replace function public.community_delete_comment(p_actor_id uuid, p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings private.community_settings%rowtype;
  comment_owner uuid;
begin
  select * into settings
  from private.community_settings
  where singleton
  for share;
  if not coalesce(settings.comments_write_enabled, false) then
    raise exception 'Comment writing is disabled';
  end if;

  select comments.user_id into comment_owner
  from public.comments comments
  where comments.id = p_comment_id
  for update;

  if not found or comment_owner <> p_actor_id then
    raise exception 'Comment was not found or is not owned by this user';
  end if;
  if exists (select 1 from public.comments where parent_id = p_comment_id) then
    raise exception 'A comment with replies cannot be deleted';
  end if;

  delete from public.comments where id = p_comment_id;
  return true;
end;
$$;

revoke all on function public.get_page_comments(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_page_comments(text, uuid) to anon, authenticated, service_role;

revoke all on function public.community_create_comment(uuid, text, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.community_delete_comment(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.admin_get_community_settings() from public, anon, authenticated, service_role;
grant execute on function public.community_create_comment(uuid, text, uuid, text, text) to service_role;
grant execute on function public.community_delete_comment(uuid, uuid) to service_role;
grant execute on function public.admin_get_community_settings() to service_role;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated, service_role;
revoke all on function public.validate_comment_relationship() from public, anon, authenticated, service_role;

commit;
