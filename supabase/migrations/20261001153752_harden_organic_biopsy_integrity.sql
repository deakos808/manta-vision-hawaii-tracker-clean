-- PROPOSED / UNAPPLIED. Production application requires separate approval.
-- Close the final correlation-field and redundant-parent integrity boundaries
-- without changing sighting, biopsy, size, or measurement data.

begin;

do $fingerprint$
declare
  function_source text;
begin
  if to_regprocedure('public.commit_sighting_submission(uuid)') is null
     or to_regprocedure('public.commit_sighting_submission_with_biopsies(uuid)') is null
     or to_regclass('public.mantas') is null
     or to_regclass('public.biopsies') is null
     or not exists (
       select 1 from pg_attribute
       where attrelid = 'public.mantas'::regclass
         and attname = 'submission_manta_id'
         and not attnotnull and not attisdropped
     )
     or not exists (
       select 1 from pg_indexes
       where schemaname = 'public' and tablename = 'mantas'
         and indexname = 'mantas_sighting_submission_manta_id_uidx'
         and indexdef ~* 'unique.+[(]fk_sighting_id, submission_manta_id[)]'
         and indexdef ~* 'where [(]submission_manta_id is not null[)]'
     ) then
    raise exception 'organic biopsy hardening prerequisite fingerprint mismatch';
  end if;

  select pg_get_functiondef(to_regprocedure('public.commit_sighting_submission(uuid)'))
    into function_source;
  if function_source !~* 'submission_manta_id'
     or function_source ~* 'security definer'
     or function_source ~* 'active user account is required to commit a sighting'
     or not has_function_privilege(
       'authenticated', 'public.commit_sighting_submission(uuid)', 'EXECUTE'
     )
     or not has_table_privilege('anon', 'public.mantas', 'INSERT')
     or not has_table_privilege('authenticated', 'public.mantas', 'INSERT')
     or not has_table_privilege('anon', 'public.mantas', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.mantas', 'UPDATE') then
    raise exception 'sighting commit or manta grant fingerprint mismatch';
  end if;

  if to_regprocedure('private.prevent_submission_manta_id_change()') is not null
     or to_regprocedure('private.validate_biopsy_parent_consistency()') is not null then
    raise exception 'organic biopsy hardening objects already exist';
  end if;
end
$fingerprint$;

-- Keep the established commit body, adding only authoritative authorization.
-- SECURITY DEFINER is required so browser roles can lose direct access to the
-- correlation column while this reviewed workflow can still populate it.
do $patch_commit$
declare
  function_source text;
  old_fragment constant text := E'begin\n  select *\n  into submission_row\n  from public.sighting_submissions\n  where id = sub_id\n  for update;';
  new_fragment constant text := E'begin\n  if auth.uid() is null or not exists (\n    select 1 from public.profiles\n    where id = auth.uid() and is_active is true and role in (''user'', ''admin'')\n  ) then\n    raise exception using errcode = ''42501'', message = ''An active user account is required to commit a sighting'';\n  end if;\n  select *\n  into submission_row\n  from public.sighting_submissions\n  where id = sub_id\n  for update;';
  patched_source text;
begin
  select pg_get_functiondef(to_regprocedure('public.commit_sighting_submission(uuid)'))
    into function_source;
  if function_source is null
     or length(function_source) - length(replace(function_source, old_fragment, ''))
        <> length(old_fragment) then
    raise exception 'sighting commit authorization patch fingerprint mismatch';
  end if;
  patched_source := replace(function_source, old_fragment, new_fragment);
  if patched_source = function_source then
    raise exception 'sighting commit authorization patch was not applied';
  end if;
  execute patched_source;
end
$patch_commit$;

alter function public.commit_sighting_submission(uuid) security definer;
alter function public.commit_sighting_submission(uuid) set search_path = '';
revoke all on function public.commit_sighting_submission(uuid)
  from public, anon, service_role;
grant execute on function public.commit_sighting_submission(uuid) to authenticated;

-- Preserve existing browser inserts and updates for every established column
-- while making only the correlation field inaccessible outside the RPC. The
-- list is derived from the fingerprinted installed table, not duplicated here.
do $column_privileges$
declare
  allowed_columns text;
  role_name text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum)
    into allowed_columns
  from pg_attribute
  where attrelid = 'public.mantas'::regclass
    and attnum > 0 and not attisdropped
    and attname <> 'submission_manta_id';
  if allowed_columns is null then
    raise exception 'manta column privilege inventory is empty';
  end if;
  foreach role_name in array array['anon', 'authenticated'] loop
    execute format('revoke insert, update on table public.mantas from %I', role_name);
    execute format(
      'grant insert (%s), update (%s) on table public.mantas to %I',
      allowed_columns, allowed_columns, role_name
    );
  end loop;
end
$column_privileges$;

create function private.prevent_submission_manta_id_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.submission_manta_id is distinct from new.submission_manta_id then
    raise exception using
      errcode = '42501',
      message = 'Manta submission correlation IDs are immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_submission_manta_id_change()
  from public, anon, authenticated, service_role;

create trigger trg_prevent_submission_manta_id_change
before update of submission_manta_id on public.mantas
for each row execute function private.prevent_submission_manta_id_change();

create function private.validate_biopsy_parent_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_manta_id integer;
begin
  parent_manta_id := case
    when tg_table_name = 'biopsies'
      then (to_jsonb(new)->>'fk_manta_id')::integer
    else (to_jsonb(new)->>'pk_manta_id')::integer
  end;

  if parent_manta_id is null then
    raise exception using
      errcode = '23514',
      message = 'A biopsy requires a manta observation parent';
  end if;

  if exists (
    select 1
    from public.biopsies b
    left join public.mantas m on m.pk_manta_id = b.fk_manta_id
    where b.fk_manta_id = parent_manta_id
      and (
        m.pk_manta_id is null
        or b.fk_sighting_id is distinct from m.fk_sighting_id
        or b.fk_catalog_id is distinct from m.fk_catalog_id
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Biopsy parent references must match the manta observation';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_biopsy_parent_consistency()
  from public, anon, authenticated, service_role;

create constraint trigger trg_validate_biopsy_parent_consistency
after insert or update on public.biopsies
deferrable initially deferred
for each row execute function private.validate_biopsy_parent_consistency();

create constraint trigger trg_validate_manta_biopsy_children
after update on public.mantas
deferrable initially deferred
for each row execute function private.validate_biopsy_parent_consistency();

do $postcondition$
declare
  function_source text;
begin
  select pg_get_functiondef(to_regprocedure('public.commit_sighting_submission(uuid)'))
    into function_source;
  if function_source !~* 'active user account is required to commit a sighting'
     or not exists (
       select 1 from pg_proc
       where oid = 'public.commit_sighting_submission(uuid)'::regprocedure
         and prosecdef
         and coalesce(proconfig, '{}'::text[]) @> array['search_path=""']
     ) then
    raise exception 'sighting commit authorization hardening failed';
  end if;
  if has_function_privilege('anon', 'public.commit_sighting_submission(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.commit_sighting_submission(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.commit_sighting_submission(uuid)', 'EXECUTE') then
    raise exception 'sighting commit execution grants hardening failed';
  end if;
  if has_column_privilege('anon', 'public.mantas', 'submission_manta_id', 'INSERT')
     or has_column_privilege('authenticated', 'public.mantas', 'submission_manta_id', 'INSERT')
     or has_column_privilege('anon', 'public.mantas', 'submission_manta_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.mantas', 'submission_manta_id', 'UPDATE') then
    raise exception 'manta correlation column privilege hardening failed';
  end if;

  if not exists (
       select 1 from pg_trigger
       where tgrelid = 'public.mantas'::regclass
         and tgname = 'trg_prevent_submission_manta_id_change' and not tgisinternal
     )
     or not exists (
       select 1 from pg_trigger
       where tgrelid = 'public.biopsies'::regclass
         and tgname = 'trg_validate_biopsy_parent_consistency'
         and tgdeferrable and tginitdeferred and not tgisinternal
     )
     or not exists (
       select 1 from pg_trigger
       where tgrelid = 'public.mantas'::regclass
         and tgname = 'trg_validate_manta_biopsy_children'
         and tgdeferrable and tginitdeferred and not tgisinternal
     ) then
    raise exception 'organic biopsy integrity trigger hardening failed';
  end if;
end
$postcondition$;

notify pgrst, 'reload schema';
commit;
