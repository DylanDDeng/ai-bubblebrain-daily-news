begin;

create extension if not exists pgtap with schema extensions;

select plan(54);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'phase3-user1@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'phase3-user2@example.invalid');

update public.profiles
set display_name = case id
  when '11111111-1111-4111-8111-111111111111' then 'Phase 3 user 1'
  when '22222222-2222-4222-8222-222222222222' then 'Phase 3 user 2'
end
where id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
);

insert into public.entity_state (owner_id, entity_type, entity_id, favorited)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'daily_item',
    'n_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    true
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'topic',
    'topic_models',
    false
  );

insert into public.annotations (owner_id, entity_type, entity_id, content)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'daily_item',
    'n_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'private note'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'entity',
    'entity_openai',
    'second private note'
  );

insert into public.favorites (user_id, image_id)
values
  ('11111111-1111-4111-8111-111111111111', 'legacy-image-example'),
  ('22222222-2222-4222-8222-222222222222', 'video:legacy-example');

select ok(
  not has_table_privilege('anon', 'public.entity_state', 'select'),
  'anon cannot select entity state'
);
select ok(
  not has_table_privilege('anon', 'public.entity_state', 'insert'),
  'anon cannot insert entity state'
);
select ok(
  not has_table_privilege('anon', 'public.annotations', 'select'),
  'anon cannot select annotations'
);
select ok(
  not has_table_privilege('anon', 'public.annotations', 'insert'),
  'anon cannot insert annotations'
);
select ok(
  not has_table_privilege('anon', 'public.favorites', 'select'),
  'anon cannot select legacy favorites'
);
select ok(
  not has_table_privilege('anon', 'public.favorites', 'insert'),
  'anon cannot insert legacy favorites'
);

select ok(
  has_table_privilege('authenticated', 'public.entity_state', 'select'),
  'authenticated users retain read access to their own entity state'
);
select ok(
  not has_table_privilege('authenticated', 'public.entity_state', 'insert'),
  'authenticated users cannot insert entity state'
);
select ok(
  not has_table_privilege('authenticated', 'public.entity_state', 'update'),
  'authenticated users cannot update entity state'
);
select ok(
  not has_table_privilege('authenticated', 'public.entity_state', 'delete'),
  'authenticated users cannot delete entity state'
);
select ok(
  has_table_privilege('authenticated', 'public.annotations', 'select'),
  'authenticated users retain read access to their own annotations'
);
select ok(
  not has_table_privilege('authenticated', 'public.annotations', 'insert'),
  'authenticated users cannot insert annotations'
);
select ok(
  not has_table_privilege('authenticated', 'public.annotations', 'update'),
  'authenticated users cannot update annotations'
);
select ok(
  not has_table_privilege('authenticated', 'public.annotations', 'delete'),
  'authenticated users cannot delete annotations'
);
select ok(
  has_table_privilege('authenticated', 'public.favorites', 'select'),
  'authenticated users retain read access to their own legacy favorites'
);
select ok(
  not has_table_privilege('authenticated', 'public.favorites', 'insert'),
  'authenticated users cannot insert legacy favorites'
);
select ok(
  not has_table_privilege('authenticated', 'public.favorites', 'update'),
  'authenticated users cannot update legacy favorites'
);
select ok(
  not has_table_privilege('authenticated', 'public.favorites', 'delete'),
  'authenticated users cannot delete legacy favorites'
);

select throws_ok(
  $$insert into public.entity_state (owner_id, entity_type, entity_id, favorited)
    values ('11111111-1111-4111-8111-111111111111', 'daily_item', 'n_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', true)$$,
  '23505',
  'duplicate key value violates unique constraint "entity_state_owner_entity_key"',
  'entity-state uniqueness remains enforced for trusted writers'
);
select throws_ok(
  $$insert into public.entity_state (owner_id, entity_type, entity_id)
    values ('11111111-1111-4111-8111-111111111111', 'typo', 'n_invalid')$$,
  '23514',
  'new row for relation "entity_state" violates check constraint "entity_state_type_allowed"',
  'unknown entity-state types remain rejected'
);
select throws_ok(
  $$insert into public.entity_state (owner_id, entity_type, entity_id)
    values ('11111111-1111-4111-8111-111111111111', 'image', ' padded-id ')$$,
  '23514',
  'new row for relation "entity_state" violates check constraint "entity_state_id_format"',
  'entity-state IDs must already be trimmed'
);
select throws_ok(
  $$insert into public.entity_state (owner_id, entity_type, entity_id)
    values ('11111111-1111-4111-8111-111111111111', 'daily_item', 'not-a-news-id')$$,
  '23514',
  'new row for relation "entity_state" violates check constraint "entity_state_id_format"',
  'daily-item state still requires a stable news ID'
);
select throws_ok(
  $$insert into public.entity_state (owner_id, entity_type, entity_id)
    values ('11111111-1111-4111-8111-111111111111', 'topic', 'models')$$,
  '23514',
  'new row for relation "entity_state" violates check constraint "entity_state_id_format"',
  'topic state still requires a stable topic ID'
);

select throws_ok(
  $$insert into public.annotations (owner_id, entity_type, entity_id, content)
    values ('11111111-1111-4111-8111-111111111111', 'daily_item', 'n_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '   ')$$,
  '23514',
  'new row for relation "annotations" violates check constraint "annotations_content_length"',
  'blank annotation remains rejected for trusted writers'
);
select throws_ok(
  $$insert into public.annotations (owner_id, entity_type, entity_id, content)
    values ('11111111-1111-4111-8111-111111111111', 'daily_item', 'n_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', repeat('x', 4001))$$,
  '23514',
  'new row for relation "annotations" violates check constraint "annotations_content_length"',
  'annotation longer than 4000 characters remains rejected'
);
select throws_ok(
  $$insert into public.annotations (owner_id, entity_type, entity_id, content)
    values ('11111111-1111-4111-8111-111111111111', 'typo', 'n_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'no')$$,
  '23514',
  'new row for relation "annotations" violates check constraint "annotations_type_allowed"',
  'unknown annotation entity types remain rejected'
);
select throws_ok(
  $$insert into public.annotations (owner_id, entity_type, entity_id, content)
    values ('11111111-1111-4111-8111-111111111111', 'image', ' padded-id ', 'no')$$,
  '23514',
  'new row for relation "annotations" violates check constraint "annotations_entity_id_format"',
  'annotation entity IDs must already be trimmed'
);
select throws_ok(
  $$insert into public.annotations (owner_id, entity_type, entity_id, content)
    values ('11111111-1111-4111-8111-111111111111', 'entity', 'openai', 'no')$$,
  '23514',
  'new row for relation "annotations" violates check constraint "annotations_entity_id_format"',
  'entity annotations still require a stable entity ID'
);
select throws_ok(
  $$insert into public.favorites (user_id, image_id)
    values ('11111111-1111-4111-8111-111111111111', 'legacy-image-example')$$,
  '23505',
  'duplicate key value violates unique constraint "favorites_user_id_image_id_key"',
  'legacy favorite uniqueness remains enforced for trusted writers'
);
select has_column('public', 'favorites', 'image_id', 'legacy favorites.image_id remains present');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.entity_state where owner_id = '11111111-1111-4111-8111-111111111111'),
  1::bigint,
  'first user can read their preserved entity state'
);
select is(
  (select count(*) from public.entity_state where owner_id = '22222222-2222-4222-8222-222222222222'),
  0::bigint,
  'first user cannot read second user entity state'
);
select is(
  (select count(*) from public.annotations where owner_id = '11111111-1111-4111-8111-111111111111'),
  1::bigint,
  'first user can read their preserved annotation'
);
select is(
  (select count(*) from public.annotations where owner_id = '22222222-2222-4222-8222-222222222222'),
  0::bigint,
  'first user cannot read second user annotation'
);
select is(
  (select count(*) from public.favorites where user_id = '11111111-1111-4111-8111-111111111111'),
  1::bigint,
  'first user can read their preserved legacy favorite'
);
select is(
  (select count(*) from public.favorites where user_id = '22222222-2222-4222-8222-222222222222'),
  0::bigint,
  'first user cannot read second user legacy favorite'
);

select throws_ok(
  $$insert into public.entity_state (owner_id, entity_type, entity_id)
    values ('11111111-1111-4111-8111-111111111111', 'topic', 'topic_security')$$,
  '42501',
  'permission denied for table entity_state',
  'authenticated browser cannot insert entity state'
);
select throws_ok(
  $$update public.entity_state set favorited = false
    where owner_id = '11111111-1111-4111-8111-111111111111'$$,
  '42501',
  'permission denied for table entity_state',
  'authenticated browser cannot update entity state'
);
select throws_ok(
  $$delete from public.entity_state
    where owner_id = '11111111-1111-4111-8111-111111111111'$$,
  '42501',
  'permission denied for table entity_state',
  'authenticated browser cannot delete entity state'
);
select throws_ok(
  $$insert into public.annotations (owner_id, entity_type, entity_id, content)
    values ('11111111-1111-4111-8111-111111111111', 'topic', 'topic_security', 'blocked')$$,
  '42501',
  'permission denied for table annotations',
  'authenticated browser cannot insert annotations'
);
select throws_ok(
  $$update public.annotations set content = 'blocked'
    where owner_id = '11111111-1111-4111-8111-111111111111'$$,
  '42501',
  'permission denied for table annotations',
  'authenticated browser cannot update annotations'
);
select throws_ok(
  $$delete from public.annotations
    where owner_id = '11111111-1111-4111-8111-111111111111'$$,
  '42501',
  'permission denied for table annotations',
  'authenticated browser cannot delete annotations'
);
select throws_ok(
  $$insert into public.favorites (user_id, image_id)
    values ('11111111-1111-4111-8111-111111111111', 'blocked-image')$$,
  '42501',
  'permission denied for table favorites',
  'authenticated browser cannot insert legacy favorites'
);
select throws_ok(
  $$update public.favorites set image_id = 'blocked-image'
    where user_id = '11111111-1111-4111-8111-111111111111'$$,
  '42501',
  'permission denied for table favorites',
  'authenticated browser cannot update legacy favorites'
);
select throws_ok(
  $$delete from public.favorites
    where user_id = '11111111-1111-4111-8111-111111111111'$$,
  '42501',
  'permission denied for table favorites',
  'authenticated browser cannot delete legacy favorites'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.entity_state where owner_id = '22222222-2222-4222-8222-222222222222'),
  1::bigint,
  'second user can read their preserved entity state'
);
select is(
  (select count(*) from public.entity_state where owner_id = '11111111-1111-4111-8111-111111111111'),
  0::bigint,
  'second user cannot read first user entity state'
);
select is(
  (select count(*) from public.annotations where owner_id = '22222222-2222-4222-8222-222222222222'),
  1::bigint,
  'second user can read their preserved annotation'
);
select is(
  (select count(*) from public.annotations where owner_id = '11111111-1111-4111-8111-111111111111'),
  0::bigint,
  'second user cannot read first user annotation'
);
select is(
  (select count(*) from public.favorites where user_id = '22222222-2222-4222-8222-222222222222'),
  1::bigint,
  'second user can read their preserved legacy favorite'
);
select is(
  (select count(*) from public.favorites where user_id = '11111111-1111-4111-8111-111111111111'),
  0::bigint,
  'second user cannot read first user legacy favorite'
);

reset role;

select is((select count(*) from public.entity_state), 2::bigint, 'failed browser writes preserve entity state rows');
select is((select count(*) from public.annotations), 2::bigint, 'failed browser writes preserve annotation rows');
select is((select count(*) from public.favorites), 2::bigint, 'failed browser writes preserve legacy favorite rows');

select * from finish();
rollback;
