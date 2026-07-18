begin;

-- Logical backups run outside the request path with a credential that can
-- bypass forced RLS only for tables belonging to the content subsystem.
-- The role has no mutation, role-management, schema-create or TEMP rights.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'content_backup') then
    create role content_backup
      login
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      noreplication
      bypassrls
      connection limit 2;
  elsif exists (
    select 1
    from pg_roles
    where rolname = 'content_backup'
      and (
        not rolcanlogin
        or rolsuper
        or rolcreatedb
        or rolcreaterole
        or rolinherit
        or rolreplication
        or not rolbypassrls
      )
  ) then
    raise exception 'Unsafe pre-existing content_backup role';
  end if;
end;
$$;

alter role content_backup connection limit 2;

do $$
declare
  relation_name text;
begin
  execute format(
    'revoke all on database %I from content_backup',
    current_database()
  );
  execute format(
    'grant connect on database %I to content_backup',
    current_database()
  );

  revoke all on schema private from content_backup;
  grant usage on schema private to content_backup;

  revoke all on all tables in schema private from content_backup;
  revoke all on all sequences in schema private from content_backup;

  for relation_name in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relkind in ('r', 'p')
      and c.relname ~ '^(admin_|consumed_attestation_jtis$|content_|daily_|editorial_|global_|preview_|production_|publication_|recovery_|release_|report_|site_)'
  loop
    execute format(
      'grant select on table private.%I to content_backup',
      relation_name
    );
  end loop;

  for relation_name in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private'
      and c.relkind = 'S'
      and c.relname ~ '^(admin_|consumed_attestation_jtis|content_|daily_|editorial_|global_|preview_|production_|publication_|recovery_|release_|report_|site_)'
  loop
    execute format(
      'grant select on sequence private.%I to content_backup',
      relation_name
    );
  end loop;
end;
$$;

commit;
