begin;

create table if not exists public.entity_state (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  favorited boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entity_state_owner_entity_key unique (owner_id, entity_type, entity_id),
  constraint entity_state_type_allowed
    check (entity_type in ('daily_item', 'topic', 'entity', 'image', 'video')),
  constraint entity_state_id_format check (
    entity_id = btrim(entity_id)
    and char_length(entity_id) between 1 and 512
    and case entity_type
      when 'daily_item' then entity_id ~ '^n_[a-f0-9]{64}$'
      when 'topic' then entity_id ~ '^topic_[a-z0-9_]{2,63}$'
      when 'entity' then entity_id ~ '^entity_[a-z0-9_]{2,63}$'
      else true
    end
  ),
  constraint entity_state_timestamp_order check (updated_at >= created_at)
);
alter table public.entity_state enable row level security;

create table if not exists public.annotations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annotations_type_allowed
    check (entity_type in ('daily_item', 'topic', 'entity', 'image', 'video')),
  constraint annotations_entity_id_format check (
    entity_id = btrim(entity_id)
    and char_length(entity_id) between 1 and 512
    and case entity_type
      when 'daily_item' then entity_id ~ '^n_[a-f0-9]{64}$'
      when 'topic' then entity_id ~ '^topic_[a-z0-9_]{2,63}$'
      when 'entity' then entity_id ~ '^entity_[a-z0-9_]{2,63}$'
      else true
    end
  ),
  constraint annotations_content_length
    check (char_length(btrim(content)) between 1 and 4000),
  constraint annotations_timestamp_order check (updated_at >= created_at)
);
alter table public.annotations enable row level security;

create index if not exists entity_state_owner_updated_idx
  on public.entity_state (owner_id, updated_at desc);
create index if not exists entity_state_lookup_idx
  on public.entity_state (entity_type, entity_id);
create index if not exists annotations_owner_updated_idx
  on public.annotations (owner_id, updated_at desc);
create index if not exists annotations_entity_idx
  on public.annotations (entity_type, entity_id, created_at desc);

create or replace function public.touch_private_state_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists entity_state_touch_updated_at on public.entity_state;
create trigger entity_state_touch_updated_at
before update on public.entity_state
for each row execute function public.touch_private_state_updated_at();

drop trigger if exists annotations_touch_updated_at on public.annotations;
create trigger annotations_touch_updated_at
before update on public.annotations
for each row execute function public.touch_private_state_updated_at();

drop policy if exists "Owners can read entity state" on public.entity_state;
create policy "Owners can read entity state"
  on public.entity_state for select
  using ((select auth.uid()) = owner_id);
drop policy if exists "Owners can create entity state" on public.entity_state;
create policy "Owners can create entity state"
  on public.entity_state for insert
  with check ((select auth.uid()) = owner_id);
drop policy if exists "Owners can update entity state" on public.entity_state;
create policy "Owners can update entity state"
  on public.entity_state for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
drop policy if exists "Owners can delete entity state" on public.entity_state;
create policy "Owners can delete entity state"
  on public.entity_state for delete
  using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can read annotations" on public.annotations;
create policy "Owners can read annotations"
  on public.annotations for select
  using ((select auth.uid()) = owner_id);
drop policy if exists "Owners can create annotations" on public.annotations;
create policy "Owners can create annotations"
  on public.annotations for insert
  with check ((select auth.uid()) = owner_id);
drop policy if exists "Owners can update annotations" on public.annotations;
create policy "Owners can update annotations"
  on public.annotations for update
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
drop policy if exists "Owners can delete annotations" on public.annotations;
create policy "Owners can delete annotations"
  on public.annotations for delete
  using ((select auth.uid()) = owner_id);

revoke all on public.entity_state, public.annotations from anon;
grant select, insert, update, delete on public.entity_state, public.annotations to authenticated;

insert into public.entity_state (
  owner_id,
  entity_type,
  entity_id,
  favorited,
  created_at,
  updated_at
)
select
  favorites.user_id,
  case when favorites.image_id like 'video:%' then 'video' else 'image' end,
  btrim(case
    when favorites.image_id like 'video:%' then substr(favorites.image_id, 7)
    else favorites.image_id
  end),
  true,
  favorites.created_at,
  favorites.created_at
from public.favorites
where char_length(
  btrim(
    case
      when favorites.image_id like 'video:%' then substr(favorites.image_id, 7)
      else favorites.image_id
    end
  )
) between 1 and 512
on conflict (owner_id, entity_type, entity_id) do nothing;

commit;
