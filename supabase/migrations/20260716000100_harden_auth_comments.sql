begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from public.comments
    where thread_id <> btrim(thread_id)
      or char_length(thread_id) not between 7 and 512
      or char_length(btrim(content)) not between 1 and 4000
      or (parent_id is null and type = 'reply')
      or (parent_id is not null and type <> 'reply')
  ) then
    raise exception 'Existing comments violate the community compatibility contract';
  end if;

  if exists (
    select 1
    from public.comments child
    join public.comments parent on parent.id = child.parent_id
    where child.thread_id <> parent.thread_id
      or parent.parent_id is not null
  ) then
    raise exception 'Existing comment relationships violate the two-level thread contract';
  end if;
end;
$$;

create table if not exists private.community_settings (
  singleton boolean primary key default true check (singleton),
  comments_write_enabled boolean not null default false,
  comments_per_minute integer not null default 5 check (comments_per_minute between 1 and 60),
  updated_at timestamptz not null default now()
);

insert into private.community_settings (singleton, comments_write_enabled, comments_per_minute)
values (true, false, 5)
on conflict (singleton) do nothing;

create table if not exists private.community_rate_events (
  actor_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists community_rate_events_actor_created_idx
  on private.community_rate_events (actor_id, created_at desc);

alter table public.profiles
  drop constraint if exists profiles_display_name_format,
  drop constraint if exists profiles_avatar_url_format;

alter table public.profiles
  add constraint profiles_display_name_format check (
    display_name is null
    or (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 80
    )
  ) not valid,
  add constraint profiles_avatar_url_format check (
    avatar_url is null
    or (
      char_length(avatar_url) between 9 and 2048
      and avatar_url ~ '^https://[^[:space:]]+$'
    )
  ) not valid;

alter table public.profiles validate constraint profiles_display_name_format;
alter table public.profiles validate constraint profiles_avatar_url_format;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_name text;
  candidate_avatar text;
begin
  candidate_name := nullif(btrim(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(coalesce(new.email, ''), '@', 1)
  )), '');
  if candidate_name is not null then
    candidate_name := left(candidate_name, 80);
  end if;

  candidate_avatar := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), '');
  if candidate_avatar is not null and (
    candidate_avatar !~ '^https://[^[:space:]]+$'
    or char_length(candidate_avatar) > 2048
  ) then
    candidate_avatar := null;
  end if;

  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, candidate_name, candidate_avatar)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_auth_user on auth.users;
create trigger create_profile_after_auth_user
after insert on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.profiles (id, display_name, avatar_url)
select
  users.id,
  left(nullif(btrim(coalesce(
    users.raw_user_meta_data ->> 'full_name',
    users.raw_user_meta_data ->> 'name',
    split_part(coalesce(users.email, ''), '@', 1)
  )), ''), 80),
  case
    when users.raw_user_meta_data ->> 'avatar_url' ~ '^https://[^[:space:]]+$'
      and char_length(users.raw_user_meta_data ->> 'avatar_url') <= 2048
    then users.raw_user_meta_data ->> 'avatar_url'
    else null
  end
from auth.users users
left join public.profiles profiles on profiles.id = users.id
where profiles.id is null
on conflict (id) do nothing;

alter table public.comments
  add column if not exists moderation_status text not null default 'visible',
  add column if not exists moderated_at timestamptz,
  add column if not exists moderation_reason text;

alter table public.comments
  drop constraint if exists comments_content_check,
  drop constraint if exists comments_content_length,
  drop constraint if exists comments_thread_id_format,
  drop constraint if exists comments_parent_type_consistency,
  drop constraint if exists comments_moderation_status_allowed,
  drop constraint if exists comments_moderation_reason_length;

alter table public.comments
  add constraint comments_content_length
    check (content = btrim(content) and char_length(content) between 1 and 4000) not valid,
  add constraint comments_thread_id_format
    check (
      thread_id = btrim(thread_id)
      and char_length(thread_id) between 7 and 512
      and thread_id ~ '^(page:/|ai-gallery:|ai-video:).+'
    ) not valid,
  add constraint comments_parent_type_consistency
    check (
      (parent_id is null and type in ('question', 'repro', 'suggestion'))
      or (parent_id is not null and type = 'reply')
    ) not valid,
  add constraint comments_moderation_status_allowed
    check (moderation_status in ('visible', 'hidden')) not valid,
  add constraint comments_moderation_reason_length
    check (moderation_reason is null or char_length(btrim(moderation_reason)) between 1 and 500) not valid;

alter table public.comments validate constraint comments_content_length;
alter table public.comments validate constraint comments_thread_id_format;
alter table public.comments validate constraint comments_parent_type_consistency;
alter table public.comments validate constraint comments_moderation_status_allowed;
alter table public.comments validate constraint comments_moderation_reason_length;

create or replace function public.validate_comment_relationship()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_thread text;
  parent_parent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select parent.thread_id, parent.parent_id
    into parent_thread, parent_parent
  from public.comments parent
  where parent.id = new.parent_id
  for key share;

  if not found then
    raise exception 'Comment parent does not exist';
  end if;
  if parent_thread <> new.thread_id then
    raise exception 'Comment reply must use the parent thread';
  end if;
  if parent_parent is not null then
    raise exception 'Only one reply level is supported';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_comment_relationship_before_write on public.comments;
create trigger validate_comment_relationship_before_write
before insert or update of parent_id, thread_id on public.comments
for each row execute function public.validate_comment_relationship();

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
  if (
    select count(*)
    from private.community_rate_events
    where actor_id = p_actor_id and created_at >= now() - interval '1 minute'
  ) >= settings.comments_per_minute then
    raise exception 'Comment rate limit exceeded';
  end if;

  effective_type := case when p_parent_id is null then p_type else 'reply' end;
  if p_parent_id is null and effective_type not in ('question', 'repro', 'suggestion') then
    raise exception 'Invalid root comment type';
  end if;

  insert into private.community_rate_events (actor_id) values (p_actor_id);
  insert into public.comments (thread_id, parent_id, user_id, type, content)
  values (p_thread_id, p_parent_id, p_actor_id, effective_type, p_content)
  returning id into created_id;
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
  writes_enabled boolean;
begin
  select comments_write_enabled into writes_enabled
  from private.community_settings where singleton;
  if not coalesce(writes_enabled, false) then
    raise exception 'Comment writing is disabled';
  end if;
  if exists (select 1 from public.comments where parent_id = p_comment_id) then
    raise exception 'A comment with replies cannot be deleted';
  end if;
  delete from public.comments
  where id = p_comment_id and user_id = p_actor_id;
  if not found then
    raise exception 'Comment was not found or is not owned by this user';
  end if;
  return true;
end;
$$;

create or replace function public.admin_set_comment_writes(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.community_settings
  set comments_write_enabled = p_enabled, updated_at = now()
  where singleton;
  return p_enabled;
end;
$$;

create or replace function public.admin_get_community_settings()
returns table (comments_write_enabled boolean, comments_per_minute integer, updated_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select settings.comments_write_enabled, settings.comments_per_minute, settings.updated_at
  from private.community_settings settings
  where settings.singleton;
$$;

create or replace function public.admin_moderate_comment(
  p_comment_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('visible', 'hidden') then
    raise exception 'Invalid moderation status';
  end if;
  update public.comments
  set
    moderation_status = p_status,
    moderated_at = now(),
    moderation_reason = case when p_status = 'hidden' then nullif(left(btrim(p_reason), 500), '') else null end
  where id = p_comment_id;
  if not found then
    raise exception 'Comment was not found';
  end if;
  return true;
end;
$$;

drop view if exists public.page_comments;
create view public.page_comments
with (security_barrier = true)
as
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
from public.comments
join public.profiles on profiles.id = comments.user_id
where comments.thread_id like 'page:/%'
  and comments.moderation_status = 'visible';

revoke all on table
  public.profiles,
  public.comments,
  public.favorites,
  public.entity_state,
  public.annotations
from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, insert, update, delete on public.entity_state, public.annotations to authenticated;
grant select on public.page_comments to anon, authenticated;

revoke all on function public.community_create_comment(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.community_delete_comment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_set_comment_writes(boolean) from public, anon, authenticated;
revoke all on function public.admin_get_community_settings() from public, anon, authenticated;
revoke all on function public.admin_moderate_comment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.community_create_comment(uuid, text, uuid, text, text) to service_role;
grant execute on function public.community_delete_comment(uuid, uuid) to service_role;
grant execute on function public.admin_set_comment_writes(boolean) to service_role;
grant execute on function public.admin_get_community_settings() to service_role;
grant execute on function public.admin_moderate_comment(uuid, text, text) to service_role;

commit;
