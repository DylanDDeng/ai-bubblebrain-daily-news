begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

select has_table('private', 'library_items', 'content library table exists');
select is(
  (select count(*) from private.library_items
   where locale = 'zh-CN' and kind like 'highlight_%'),
  35::bigint,
  'all Chinese Highlights are imported'
);
select is(
  (select count(*) from private.library_items
   where locale = 'en' and kind like 'highlight_%'),
  24::bigint,
  'all English Highlights are imported'
);
select is(
  (select count(*) from private.library_items
   where locale = 'zh-CN' and kind = 'highlight_article'),
  6::bigint,
  'six Chinese Highlights retain internal article routes'
);
select is(
  (select count(*) from private.library_items
   where locale = 'zh-CN' and kind = 'prompt'),
  12::bigint,
  'all Chinese Prompt articles are imported'
);
select ok(
  (select min(char_length(metadata ->> 'body_markdown')) > 100
   from private.library_items where kind = 'prompt'),
  'Prompt imports retain their complete Markdown bodies'
);
select is(
  (select count(*) from private.library_items
   where locale = 'zh-CN' and kind = 'model_eval'),
  18::bigint,
  'all Chinese model evaluation cards are imported'
);
select is(
  (select count(*) from private.library_items
   where locale = 'en' and kind = 'model_eval'),
  8::bigint,
  'all existing English model evaluation cards are imported'
);
set local role content_rpc_owner;
select is(
  private.list_public_highlights_v1('zh-CN', 200) ->> 'item_count',
  '35',
  'public highlight RPC returns the complete published collection'
);
select is(
  private.list_public_prompts_v1('zh-CN', 200) ->> 'item_count',
  '12',
  'public Prompt RPC returns the complete published collection'
);
select ok(
  position(
    '把自己当作我的专家助理' in
    (private.get_public_prompt_v1('zh-CN', 'prompt-gpt-5-full-potential') ->> 'body_markdown')
  ) > 0,
  'public Prompt detail RPC returns the stored body'
);
select is(
  private.list_public_model_evals_v1('zh-CN', 2026, 200) ->> 'item_count',
  '6',
  'public model evaluation RPC applies the year filter'
);
reset role;
select ok(
  has_function_privilege('content_reader', 'private.list_public_highlights_v1(text,integer)', 'execute')
    and not has_function_privilege('content_reader', 'private.read_admin_highlights_v1(jsonb,jsonb,text)', 'execute')
    and not has_function_privilege('content_reader', 'private.create_highlight_v1(text,text,text,text,text,text[],text,text,uuid,jsonb,text)', 'execute'),
  'public reader can only invoke the public highlight listing'
);
select ok(
  has_function_privilege('content_editor', 'private.read_admin_highlights_v1(jsonb,jsonb,text)', 'execute')
    and has_function_privilege('content_editor', 'private.create_highlight_v1(text,text,text,text,text,text[],text,text,uuid,jsonb,text)', 'execute'),
  'routine editor can use attested highlight read and create RPCs'
);
select ok(
  has_function_privilege('content_reader', 'private.list_public_prompts_v1(text,integer)', 'execute')
    and has_function_privilege('content_reader', 'private.get_public_prompt_v1(text,text)', 'execute')
    and has_function_privilege('content_reader', 'private.list_public_model_evals_v1(text,integer,integer)', 'execute')
    and not has_function_privilege('content_reader', 'private.read_admin_library_v1(jsonb,jsonb,text)', 'execute'),
  'public reader can read Prompt and model evaluation RPCs without Admin access'
);
select ok(
  not exists (
    select 1 from unnest(array[
      'content_ingestor', 'content_editor', 'content_controller',
      'content_reader', 'content_deployer'
    ]) role_name
    where has_table_privilege(role_name, 'private.library_items', 'select')
      or has_table_privilege(role_name, 'private.library_items', 'insert')
      or has_table_privilege(role_name, 'private.library_items', 'update')
      or has_table_privilege(role_name, 'private.library_items', 'delete')
  ),
  'runtime roles cannot bypass library RPCs through the base table'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class relation
   join pg_namespace namespace on namespace.oid = relation.relnamespace
   where namespace.nspname = 'private' and relation.relname = 'library_items'),
  'library table uses forced RLS'
);
set local role content_rpc_owner;
select throws_ok(
  $$select private.create_highlight_v1(
    'zh-CN', 'test', '', 'https://example.com', null, '{}', 'published',
    'test reason', gen_random_uuid(), '{}'::jsonb, repeat('a', 64)
  )$$,
  '42501',
  'Content capability is disabled: admin_draft',
  'manual highlight writes fail closed with the editorial capability'
);
reset role;

select * from finish();
rollback;
