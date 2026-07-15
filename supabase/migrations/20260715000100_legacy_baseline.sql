begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_id text not null,
  created_at timestamptz default now()
);
alter table public.favorites enable row level security;

create unique index if not exists favorites_user_id_image_id_key
  on public.favorites (user_id, image_id);
create index if not exists favorites_user_created_idx
  on public.favorites (user_id, created_at desc);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null,
  parent_id uuid references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'question'
    check (type in ('question', 'repro', 'suggestion', 'reply')),
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table public.comments enable row level security;

create index if not exists comments_thread_created_idx
  on public.comments (thread_id, created_at desc);
create index if not exists comments_parent_created_idx
  on public.comments (parent_id, created_at desc);
create index if not exists comments_user_created_idx
  on public.comments (user_id, created_at desc);

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert with check ((select auth.uid()) = id);
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users can view their own favorites" on public.favorites;
drop policy if exists "Users can view own favorites" on public.favorites;
create policy "Users can view own favorites"
  on public.favorites for select using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert their own favorites" on public.favorites;
drop policy if exists "Users can insert own favorites" on public.favorites;
create policy "Users can insert own favorites"
  on public.favorites for insert with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own favorites" on public.favorites;
drop policy if exists "Users can delete own favorites" on public.favorites;
create policy "Users can delete own favorites"
  on public.favorites for delete using ((select auth.uid()) = user_id);

drop policy if exists "Comments are viewable by everyone" on public.comments;
create policy "Comments are viewable by everyone"
  on public.comments for select using (true);
drop policy if exists "Authenticated users can create comments" on public.comments;
create policy "Authenticated users can create comments"
  on public.comments for insert
  with check (
    (select auth.role()) = 'authenticated'
    and (select auth.uid()) = user_id
    and (
      parent_id is null
      or exists (
        select 1
        from public.comments parent
        where parent.id = comments.parent_id
          and parent.thread_id = comments.thread_id
          and parent.parent_id is null
      )
    )
  );
drop policy if exists "Users can delete their own comments without replies" on public.comments;
create policy "Users can delete their own comments without replies"
  on public.comments for delete
  using (
    (select auth.uid()) = user_id
    and not exists (
      select 1 from public.comments child where child.parent_id = comments.id
    )
  );

grant select, insert, update on public.profiles to authenticated;
grant select, insert, delete on public.favorites to authenticated;
grant select, insert, delete on public.comments to authenticated;
grant select on public.profiles, public.comments to anon;

commit;
