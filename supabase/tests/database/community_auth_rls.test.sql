begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

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
select ok(has_table_privilege('anon', 'public.page_comments', 'select'), 'anon can read the filtered page comment view');
select ok(not has_table_privilege('anon', 'public.favorites', 'select'), 'anon cannot read favorites');
select ok(not has_table_privilege('authenticated', 'public.favorites', 'update'), 'legacy favorites cannot be updated');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'delete'), 'profiles cannot be deleted by the browser');

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

create temporary table community_ids (name text primary key, id uuid not null);
insert into community_ids
select 'root-a', public.community_create_comment(
  '33333333-3333-4333-8333-333333333333',
  'page:/daily/2026/07/2026-07-16/', null, 'question', 'A root question'
);

select is((select count(*) from public.page_comments where content = 'A root question'), 1::bigint, 'page root appears in public view');

insert into community_ids
select 'reply-b', public.community_create_comment(
  '44444444-4444-4444-8444-444444444444',
  'page:/daily/2026/07/2026-07-16/',
  (select id from community_ids where name = 'root-a'),
  'reply',
  'A reply'
);

select is((select count(*) from public.page_comments where content = 'A reply'), 1::bigint, 'valid reply appears in public view');

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
  'A comment with replies cannot be deleted',
  'root with replies cannot be deleted'
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

select is(
  public.admin_moderate_comment(
    (select id from community_ids where name = 'root-a'),
    'hidden',
    'test moderation'
  ),
  true,
  'admin can hide a comment'
);

select is((select count(*) from public.page_comments where content = 'A root question'), 0::bigint, 'hidden comments disappear from public view');

select is(
  public.admin_moderate_comment(
    (select id from community_ids where name = 'root-a'),
    'visible',
    null
  ),
  true,
  'admin can restore a comment'
);

insert into public.comments (thread_id, parent_id, user_id, type, content)
values ('ai-gallery:999', null, '33333333-3333-4333-8333-333333333333', 'question', 'Archived gallery comment');

select is((select count(*) from public.page_comments where content = 'Archived gallery comment'), 0::bigint, 'non-page comments stay private from the public view');

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
