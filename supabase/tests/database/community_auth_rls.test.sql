begin;

create extension if not exists pgtap with schema extensions;
select plan(52);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('33333333-3333-4333-8333-333333333333', 'community-a@example.invalid', '{"full_name":"Community A","avatar_url":"https://example.invalid/a.png"}'),
  ('44444444-4444-4444-8444-444444444444', 'community-b@example.invalid', '{"full_name":"Community B"}');

select is(
  (select count(*) from public.profiles where id in (
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444'
  )),
  2::bigint,
  'auth users receive profiles atomically'
);

select is(
  (select display_name from public.profiles where id = '33333333-3333-4333-8333-333333333333'),
  'Community A',
  'profile trigger copies a safe display name'
);

select ok(not has_table_privilege('anon', 'public.comments', 'select'), 'anon cannot select comments base table');
select ok(not has_table_privilege('authenticated', 'public.comments', 'insert'), 'browser cannot insert comments directly');
select ok(not has_table_privilege('authenticated', 'public.comments', 'delete'), 'browser cannot delete comments directly');
select ok(not has_table_privilege('authenticated', 'public.comments', 'truncate'), 'browser cannot truncate comments');
select is(to_regclass('public.page_comments'), null::regclass, 'security-definer page comments view is removed');
select ok(has_function_privilege('anon', 'public.get_page_comments(text,uuid)', 'execute'), 'anon can execute the narrow page-comment reader');
select ok(has_function_privilege('authenticated', 'public.get_page_comments(text,uuid)', 'execute'), 'authenticated users can execute the narrow page-comment reader');
select ok(not has_function_privilege('anon', 'public.community_create_comment(uuid,text,uuid,text,text)', 'execute'), 'anon cannot execute the create RPC');
select ok(not has_function_privilege('authenticated', 'public.community_delete_comment(uuid,uuid)', 'execute'), 'browser cannot execute the delete RPC');
select ok(not has_function_privilege('anon', 'public.handle_new_auth_user()', 'execute'), 'anon cannot execute the auth trigger function');
select ok(not has_function_privilege('authenticated', 'public.handle_new_auth_user()', 'execute'), 'authenticated cannot execute the auth trigger function');
select ok(not has_function_privilege('anon', 'public.validate_comment_relationship()', 'execute'), 'anon cannot execute the relationship trigger function');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use the private schema');
select ok(not has_table_privilege('anon', 'public.favorites', 'select'), 'anon cannot read favorites');
select ok(
  not has_table_privilege('authenticated', 'public.favorites', 'insert')
    and not has_table_privilege('authenticated', 'public.favorites', 'update')
    and not has_table_privilege('authenticated', 'public.favorites', 'delete'),
  'archived favorites are read-only to browsers'
);
select ok(
  not has_table_privilege('authenticated', 'public.entity_state', 'insert')
    and not has_table_privilege('authenticated', 'public.entity_state', 'update')
    and not has_table_privilege('authenticated', 'public.entity_state', 'delete'),
  'unused entity state is read-only to browsers'
);
select ok(
  not has_table_privilege('authenticated', 'public.annotations', 'insert')
    and not has_table_privilege('authenticated', 'public.annotations', 'update')
    and not has_table_privilege('authenticated', 'public.annotations', 'delete'),
  'unused annotations are read-only to browsers'
);
select ok(not has_table_privilege('authenticated', 'public.profiles', 'delete'), 'profiles cannot be deleted by the browser');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'update'), 'profiles are read-only to browsers');

select throws_ok(
  $$select public.community_create_comment(
    '33333333-3333-4333-8333-333333333333',
    'page:/daily/2026/07/2026-07-16/', null, 'question', 'Writes are off'
  )$$,
  'P0001',
  'Comment writing is disabled',
  'database kill switch is fail closed'
);

select is(public.admin_set_comment_writes(true), true, 'admin RPC enables comment writes');

delete from private.community_rate_events;
update private.community_settings
set comments_per_minute = 1, comments_per_hour = 2, comments_per_day = 3
where singleton;
insert into private.community_rate_events (actor_id, created_at)
values ('33333333-3333-4333-8333-333333333333', now());
select throws_ok(
  $$select public.community_create_comment(
    '33333333-3333-4333-8333-333333333333',
    'page:/daily/2026/07/2026-07-16/', null, 'question', 'Minute quota'
  )$$,
  'P0001',
  'Comment minute rate limit exceeded',
  'per-minute quota is enforced'
);

delete from private.community_rate_events;
update private.community_settings
set comments_per_minute = 1, comments_per_hour = 1, comments_per_day = 2
where singleton;
insert into private.community_rate_events (actor_id, created_at)
values ('33333333-3333-4333-8333-333333333333', now() - interval '10 minutes');
select throws_ok(
  $$select public.community_create_comment(
    '33333333-3333-4333-8333-333333333333',
    'page:/daily/2026/07/2026-07-16/', null, 'question', 'Hourly quota'
  )$$,
  'P0001',
  'Comment hourly rate limit exceeded',
  'per-hour quota is enforced'
);

delete from private.community_rate_events;
update private.community_settings
set comments_per_minute = 1, comments_per_hour = 1, comments_per_day = 1
where singleton;
insert into private.community_rate_events (actor_id, created_at)
values ('33333333-3333-4333-8333-333333333333', now() - interval '2 hours');
select throws_ok(
  $$select public.community_create_comment(
    '33333333-3333-4333-8333-333333333333',
    'page:/daily/2026/07/2026-07-16/', null, 'question', 'Daily quota'
  )$$,
  'P0001',
  'Comment daily rate limit exceeded',
  'per-day quota is enforced'
);

delete from private.community_rate_events;
update private.community_settings
set comments_per_minute = 5, comments_per_hour = 30, comments_per_day = 100
where singleton;

create temporary table community_ids (name text primary key, id uuid not null);
insert into community_ids
select 'root-a', public.community_create_comment(
  '33333333-3333-4333-8333-333333333333',
  'page:/daily/2026/07/2026-07-16/', null, 'question', 'A root question'
);

select is(
  (select count(*) from public.get_page_comments('page:/daily/2026/07/2026-07-16/', null) where content = 'A root question'),
  1::bigint,
  'page root appears through the narrow reader'
);

insert into community_ids
select 'reply-b', public.community_create_comment(
  '44444444-4444-4444-8444-444444444444',
  'page:/daily/2026/07/2026-07-16/',
  (select id from community_ids where name = 'root-a'),
  'reply',
  'A reply'
);

select is(
  (select count(*) from public.get_page_comments('page:/daily/2026/07/2026-07-16/', null) where content = 'A reply'),
  1::bigint,
  'valid reply appears through the narrow reader'
);
select is(
  (select count(*) from public.get_page_comments(
    'page:/daily/2026/07/2026-07-16/',
    (select id from community_ids where name = 'root-a')
  )),
  1::bigint,
  'reader can retrieve one visible comment by id'
);
select is(
  (select count(*) from public.get_page_comments('page:/daily/2026/07/missing/', null)),
  0::bigint,
  'reader returns no rows for an empty canonical page thread'
);
select throws_ok(
  $$select * from public.get_page_comments('ai-gallery:01', null)$$,
  'P0001',
  'Only canonical page threads are readable',
  'reader rejects non-page threads'
);

select throws_ok(
  $$select public.community_create_comment(
    '33333333-3333-4333-8333-333333333333',
    'page:/daily/2026/07/2026-07-16/', null, 'reply', 'Bad root type'
  )$$,
  'P0001',
  'Invalid root comment type',
  'root reply type is rejected'
);

select throws_ok(
  $$select public.community_create_comment(
    '33333333-3333-4333-8333-333333333333',
    'ai-gallery:01', null, 'question', 'Wrong surface'
  )$$,
  'P0001',
  'Only canonical page threads are writable',
  'gallery threads cannot be written through community API'
);

select throws_ok(
  $$select public.community_create_comment(
    '33333333-3333-4333-8333-333333333333',
    'page:/daily/2026/07/other/',
    (select id from community_ids where name = 'root-a'),
    'reply', 'Cross thread'
  )$$,
  'P0001',
  'Comment reply must use the parent thread',
  'cross-thread reply is rejected'
);

select throws_ok(
  $$select public.community_create_comment(
    '33333333-3333-4333-8333-333333333333',
    'page:/daily/2026/07/2026-07-16/',
    (select id from community_ids where name = 'reply-b'),
    'reply', 'Third level'
  )$$,
  'P0001',
  'Only one reply level is supported',
  'reply to reply is rejected'
);

select throws_ok(
  $$select public.community_create_comment(
    '33333333-3333-4333-8333-333333333333',
    'page:/daily/2026/07/2026-07-16/', null, 'question', '   '
  )$$,
  'P0001',
  'Comment content must be trimmed and contain 1 to 4000 characters',
  'blank comment is rejected'
);

select throws_ok(
  $$select public.community_create_comment(
    '33333333-3333-4333-8333-333333333333',
    'page:/daily/2026/07/2026-07-16/', null, 'question', repeat('x', 4001)
  )$$,
  'P0001',
  'Comment content must be trimmed and contain 1 to 4000 characters',
  'overlong comment is rejected'
);

select throws_ok(
  $$select public.community_delete_comment(
    '44444444-4444-4444-8444-444444444444',
    (select id from community_ids where name = 'root-a')
  )$$,
  'P0001',
  'Comment was not found or is not owned by this user',
  'cross-user root deletion is rejected before reply details are exposed'
);

select throws_ok(
  $$select public.community_delete_comment(
    '33333333-3333-4333-8333-333333333333',
    (select id from community_ids where name = 'root-a')
  )$$,
  'P0001',
  'A comment with replies cannot be deleted',
  'owner cannot delete a root with replies'
);

select ok(
  pg_get_functiondef('public.community_delete_comment(uuid,uuid)'::regprocedure) ilike '%for update%',
  'delete RPC locks the target comment before checking replies'
);

select is(
  public.admin_moderate_comment(
    (select id from community_ids where name = 'root-a'),
    'hidden',
    'test moderation'
  ),
  true,
  'admin can hide a comment'
);

select is(
  (select count(*) from public.get_page_comments('page:/daily/2026/07/2026-07-16/', null) where content = 'A root question'),
  0::bigint,
  'hidden roots disappear from the narrow reader'
);
select is(
  (select count(*) from public.get_page_comments('page:/daily/2026/07/2026-07-16/', null) where content = 'A reply'),
  0::bigint,
  'visible replies disappear with a hidden root'
);

select is(
  public.admin_moderate_comment(
    (select id from community_ids where name = 'root-a'),
    'visible',
    null
  ),
  true,
  'admin can restore a comment'
);
select is(
  (select count(*) from public.get_page_comments('page:/daily/2026/07/2026-07-16/', null) where content = 'A reply'),
  1::bigint,
  'restoring a root restores its visible replies'
);

select throws_ok(
  $$select public.community_delete_comment(
    '33333333-3333-4333-8333-333333333333',
    (select id from community_ids where name = 'reply-b')
  )$$,
  'P0001',
  'Comment was not found or is not owned by this user',
  'cross-user leaf deletion is rejected'
);

select is(
  public.community_delete_comment(
    '44444444-4444-4444-8444-444444444444',
    (select id from community_ids where name = 'reply-b')
  ),
  true,
  'owner can delete a leaf reply'
);

insert into public.comments (thread_id, parent_id, user_id, type, content)
values ('ai-gallery:999', null, '33333333-3333-4333-8333-333333333333', 'question', 'Archived gallery comment');

select throws_ok(
  $$select public.admin_moderate_comment(
    (select id from public.comments where content = 'Archived gallery comment'),
    'hidden',
    'must stay archived'
  )$$,
  'P0001',
  'Page comment was not found',
  'admin moderation cannot mutate archived Gallery or Video comments'
);

select is(
  (select count(*) from public.get_page_comments('page:/daily/2026/07/2026-07-16/', null) where content = 'Archived gallery comment'),
  0::bigint,
  'non-page comments stay inaccessible through the public reader'
);

select is(public.admin_set_comment_writes(false), false, 'admin RPC disables comment writes');

select throws_ok(
  $$select public.community_delete_comment(
    '33333333-3333-4333-8333-333333333333',
    (select id from community_ids where name = 'root-a')
  )$$,
  'P0001',
  'Comment writing is disabled',
  'kill switch also blocks deletion'
);

select is((select count(*) from public.profiles where id = '33333333-3333-4333-8333-333333333333'), 1::bigint, 'test profile remains scoped inside transaction');

select * from finish();
rollback;
