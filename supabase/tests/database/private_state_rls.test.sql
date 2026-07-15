begin;

create extension if not exists pgtap with schema extensions;

select plan(42);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'phase3-user1@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'phase3-user2@example.invalid');

insert into public.profiles (id, display_name)
values
  ('11111111-1111-4111-8111-111111111111', 'Phase 3 user 1'),
  ('22222222-2222-4222-8222-222222222222', 'Phase 3 user 2');

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

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.entity_state (owner_id, entity_type, entity_id, favorited)
    values ('11111111-1111-4111-8111-111111111111', 'daily_item', 'n_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', true)$$,
  'owner can insert entity state'
);
select throws_ok(
  $$insert into public.entity_state (owner_id, entity_type, entity_id, favorited)
    values ('11111111-1111-4111-8111-111111111111', 'daily_item', 'n_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', true)$$,
  '23505',
  'duplicate key value violates unique constraint "entity_state_owner_entity_key"',
  'duplicate entity state is rejected'
);
select throws_ok(
  $$insert into public.entity_state (owner_id, entity_type, entity_id)
    values ('11111111-1111-4111-8111-111111111111', 'typo', 'n_invalid')$$,
  '23514',
  'new row for relation "entity_state" violates check constraint "entity_state_type_allowed"',
  'unknown entity-state types are rejected'
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
  'daily-item state requires a stable news ID'
);
select throws_ok(
  $$insert into public.entity_state (owner_id, entity_type, entity_id)
    values ('11111111-1111-4111-8111-111111111111', 'topic', 'models')$$,
  '23514',
  'new row for relation "entity_state" violates check constraint "entity_state_id_format"',
  'topic state requires a stable topic ID'
);
select is(
  (select count(*) from public.entity_state where entity_id = 'n_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  1::bigint,
  'owner can read own entity state'
);
select throws_ok(
  $$insert into public.entity_state (owner_id, entity_type, entity_id)
    values ('22222222-2222-4222-8222-222222222222', 'daily_item', 'n_cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc')$$,
  '42501',
  'new row violates row-level security policy for table "entity_state"',
  'owner id cannot be forged on insert'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.entity_state where entity_id = 'n_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  0::bigint,
  'second user cannot read first user entity state'
);
with changed as (
  update public.entity_state set favorited = false where entity_id = 'n_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' returning id
)
select is((select count(*) from changed), 0::bigint, 'cross-user entity update changes no rows');
with deleted as (
  delete from public.entity_state where entity_id = 'n_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' returning id
)
select is((select count(*) from deleted), 0::bigint, 'cross-user entity delete changes no rows');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$update public.entity_state set read_at = now() where entity_id = 'n_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'$$,
  'owner can update entity state'
);
select throws_ok(
  $$update public.entity_state
    set owner_id = '22222222-2222-4222-8222-222222222222'
    where entity_id = 'n_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'$$,
  '42501',
  'new row violates row-level security policy for table "entity_state"',
  'entity state update with forged owner is rejected'
);
select lives_ok(
  $$delete from public.entity_state where entity_id = 'n_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'$$,
  'owner can delete entity state'
);

select throws_ok(
  $$insert into public.annotations (owner_id, entity_type, entity_id, content)
    values ('11111111-1111-4111-8111-111111111111', 'daily_item', 'n_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '   ')$$,
  '23514',
  'new row for relation "annotations" violates check constraint "annotations_content_length"',
  'blank annotation is rejected'
);
select throws_ok(
  $$insert into public.annotations (owner_id, entity_type, entity_id, content)
    values ('11111111-1111-4111-8111-111111111111', 'daily_item', 'n_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', repeat('x', 4001))$$,
  '23514',
  'new row for relation "annotations" violates check constraint "annotations_content_length"',
  'annotation longer than 4000 characters is rejected'
);
select throws_ok(
  $$insert into public.annotations (owner_id, entity_type, entity_id, content)
    values ('11111111-1111-4111-8111-111111111111', 'typo', 'n_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'no')$$,
  '23514',
  'new row for relation "annotations" violates check constraint "annotations_type_allowed"',
  'unknown annotation entity types are rejected'
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
  'entity annotations require a stable entity ID'
);
select lives_ok(
  $$insert into public.annotations (owner_id, entity_type, entity_id, content)
    values ('11111111-1111-4111-8111-111111111111', 'daily_item', 'n_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'private note')$$,
  'owner can create an annotation'
);
select throws_ok(
  $$insert into public.annotations (owner_id, entity_type, entity_id, content)
    values ('22222222-2222-4222-8222-222222222222', 'daily_item', 'n_cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'no')$$,
  '42501',
  'new row violates row-level security policy for table "annotations"',
  'annotation owner cannot be forged on insert'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.annotations where entity_id = 'n_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
  0::bigint,
  'second user cannot read first user annotation'
);
with changed as (
  update public.annotations set content = 'cross-user' where entity_id = 'n_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' returning id
)
select is((select count(*) from changed), 0::bigint, 'cross-user annotation update changes no rows');
with deleted as (
  delete from public.annotations where entity_id = 'n_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' returning id
)
select is((select count(*) from deleted), 0::bigint, 'cross-user annotation delete changes no rows');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$update public.annotations set content = 'updated note' where entity_id = 'n_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'$$,
  'owner can update annotation'
);
select throws_ok(
  $$update public.annotations
    set owner_id = '22222222-2222-4222-8222-222222222222'
    where entity_id = 'n_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'$$,
  '42501',
  'new row violates row-level security policy for table "annotations"',
  'annotation update with forged owner is rejected'
);
select lives_ok(
  $$delete from public.annotations where entity_id = 'n_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'$$,
  'owner can delete annotation'
);

reset role;

select has_column('public', 'favorites', 'image_id', 'legacy favorites.image_id remains present');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.favorites (user_id, image_id)
    values ('11111111-1111-4111-8111-111111111111', 'legacy-image-example')$$,
  'legacy image favorite remains writable by the authenticated owner'
);
select lives_ok(
  $$insert into public.favorites (user_id, image_id)
    values ('11111111-1111-4111-8111-111111111111', 'video:legacy-example')$$,
  'legacy video:<id> favorite remains writable by the authenticated owner'
);
select throws_ok(
  $$insert into public.favorites (user_id, image_id)
    values ('11111111-1111-4111-8111-111111111111', 'video:legacy-example')$$,
  '23505',
  'duplicate key value violates unique constraint "favorites_user_id_image_id_key"',
  'legacy duplicate favorite behavior remains unchanged'
);
select is(
  (select count(*) from public.favorites where image_id in ('legacy-image-example', 'video:legacy-example')),
  2::bigint,
  'legacy image and video favorites remain readable by the owner'
);
select lives_ok(
  $$delete from public.favorites where image_id = 'legacy-image-example'$$,
  'legacy image favorite remains deletable by the owner'
);
select is(
  (select count(*) from public.favorites where image_id = 'legacy-image-example'),
  0::bigint,
  'legacy image deletion remains visible to the owner'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.favorites where image_id = 'video:legacy-example'),
  0::bigint,
  'second user cannot read the first user legacy favorite'
);
select lives_ok(
  $$insert into public.favorites (user_id, image_id)
    values ('22222222-2222-4222-8222-222222222222', 'video:legacy-example')$$,
  'second user can independently create the same legacy video favorite'
);
select lives_ok(
  $$delete from public.favorites where image_id = 'video:legacy-example'$$,
  'second user can delete only their own legacy video favorite'
);

reset role;
select is(
  (select count(*) from public.entity_state where owner_id = '11111111-1111-4111-8111-111111111111'),
  0::bigint,
  'legacy writes do not silently mutate generic state without an explicit dual-write client'
);

select * from finish();
rollback;
