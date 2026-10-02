-- Canonical release-level rollback for the complete security-containment
-- candidate after all four forward migrations. This rollback preserves every
-- row and keeps the system fail closed; it does not restore legacy privileges
-- or the retired biopsy CSV importer.

\set ON_ERROR_STOP on
begin;

do $fingerprint$
declare
  function_source text;
  role_name text;
  object_name text;
begin
  -- Exact candidate object inventory.
  if to_regprocedure('public.commit_sighting_submission_with_biopsies(uuid)') is null
     or to_regprocedure('public.commit_sighting_submission(uuid)') is null
     or to_regprocedure('public.fn_imports_commit_drone_photos(uuid)') is null
     or to_regprocedure('private.fn_imports_commit_drone_photos_impl(uuid)') is null
     or to_regprocedure('public.fn_imports_commit_biopsies(uuid)') is not null
     or to_regprocedure('private.fn_imports_commit_biopsies_impl(uuid)') is not null
     or to_regprocedure('private.validate_sighting_submission_biopsies()') is null
     or to_regprocedure('private.validate_committed_biopsy_mapping()') is null
     or to_regprocedure('private.prevent_submission_manta_id_change()') is null
     or to_regprocedure('private.validate_biopsy_parent_consistency()') is null
     or to_regprocedure('public.is_admin_user()') is null
     or to_regprocedure('public.admin_set_profile_access(uuid,text,boolean,text)') is null
     or to_regprocedure('private.current_user_is_active_admin()') is null then
    raise exception 'combined security rollback function fingerprint mismatch';
  end if;

  if not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'mantas'
         and column_name = 'submission_manta_id' and data_type = 'text'
     ) or not exists (
       select 1 from pg_indexes
       where schemaname = 'public' and tablename = 'mantas'
         and indexname = 'mantas_sighting_submission_manta_id_uidx'
         and indexdef ~* 'unique.+[(]fk_sighting_id, submission_manta_id[)]'
         and indexdef ~* 'where [(]submission_manta_id is not null[)]'
     ) then
    raise exception 'combined security rollback correlation fingerprint mismatch';
  end if;

  foreach object_name in array array[
    'trg_validate_sighting_submission_biopsies',
    'trg_validate_committed_biopsy_mapping',
    'trg_prevent_submission_manta_id_change',
    'trg_validate_biopsy_parent_consistency',
    'trg_validate_manta_biopsy_children'
  ] loop
    if not exists (
      select 1 from pg_trigger
      where tgname = object_name and not tgisinternal
    ) then
      raise exception 'combined security rollback trigger fingerprint mismatch: %', object_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.sighting_submissions'::regclass
      and tgname = 'trg_validate_committed_biopsy_mapping'
      and tgdeferrable and tginitdeferred and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.biopsies'::regclass
      and tgname = 'trg_validate_biopsy_parent_consistency'
      and tgdeferrable and tginitdeferred and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.mantas'::regclass
      and tgname = 'trg_validate_manta_biopsy_children'
      and tgdeferrable and tginitdeferred and not tgisinternal
  ) then
    raise exception 'combined security rollback deferred-integrity fingerprint mismatch';
  end if;

  select pg_get_functiondef('public.commit_sighting_submission_with_biopsies(uuid)'::regprocedure)
    into function_source;
  if function_source !~* 'auth[.]uid'
     or function_source !~* 'public[.]profiles'
     or function_source !~* 'submission_manta_id'
     or function_source !~* 'public[.]biopsies'
     or function_source !~* 'public[.]commit_sighting_submission' then
    raise exception 'combined security rollback organic wrapper fingerprint mismatch';
  end if;

  select pg_get_functiondef('public.commit_sighting_submission(uuid)'::regprocedure)
    into function_source;
  if function_source !~* 'auth[.]uid'
     or function_source !~* 'public[.]profiles'
     or function_source !~* 'is_active'
     or function_source !~* 'role'
     or function_source !~* 'submission_manta_id' then
    raise exception 'combined security rollback sighting commit fingerprint mismatch';
  end if;

  select pg_get_functiondef('public.fn_imports_commit_drone_photos(uuid)'::regprocedure)
    into function_source;
  if function_source !~* 'auth[.]uid'
     or function_source !~* 'public[.]profiles'
     or function_source !~* 'is_active[^;]+true'
     or function_source !~* 'role[^;]+admin'
     or function_source !~* 'private[.]fn_imports_commit_drone_photos_impl' then
    raise exception 'combined security rollback drone wrapper fingerprint mismatch';
  end if;

  foreach object_name in array array[
    'private.fn_imports_commit_drone_photos_impl(uuid)',
    'private.validate_sighting_submission_biopsies()',
    'private.validate_committed_biopsy_mapping()',
    'private.prevent_submission_manta_id_change()',
    'private.validate_biopsy_parent_consistency()',
    'public.commit_sighting_submission(uuid)',
    'public.commit_sighting_submission_with_biopsies(uuid)',
    'public.fn_imports_commit_drone_photos(uuid)',
    'public.is_admin_user()',
    'public.admin_set_profile_access(uuid,text,boolean,text)',
    'private.current_user_is_active_admin()'
  ] loop
    if not exists (
      select 1 from pg_proc
      where oid = to_regprocedure(object_name)
        and prosecdef
        and coalesce(proconfig, '{}'::text[]) @> array['search_path=""']
    ) then
      raise exception 'combined security rollback safe-search-path fingerprint mismatch: %', object_name;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.commit_sighting_submission_with_biopsies(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.commit_sighting_submission_with_biopsies(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.commit_sighting_submission_with_biopsies(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.fn_imports_commit_drone_photos(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_imports_commit_drone_photos(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.fn_imports_commit_drone_photos(uuid)', 'EXECUTE') then
    raise exception 'combined security rollback public-function grant fingerprint mismatch';
  end if;

  foreach object_name in array array[
    'private.fn_imports_commit_drone_photos_impl(uuid)',
    'private.validate_sighting_submission_biopsies()',
    'private.validate_committed_biopsy_mapping()',
    'private.prevent_submission_manta_id_change()',
    'private.validate_biopsy_parent_consistency()'
  ] loop
    foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(role_name, object_name, 'EXECUTE') then
        raise exception 'combined security rollback private-function grant fingerprint mismatch: % role %', object_name, role_name;
      end if;
    end loop;
  end loop;

  foreach object_name in array array[
    'v_stg_biopsies_norm',
    'v_stg_drone_photos_norm',
    'v_stg_invalid_biopsies',
    'v_stg_invalid_drone_photos'
  ] loop
    if not exists (
      select 1 from pg_class
      where oid = to_regclass(format('public.%I', object_name))
        and coalesce(reloptions, '{}'::text[]) @> array['security_invoker=true']
    ) then
      raise exception 'combined security rollback staging-view fingerprint mismatch: %', object_name;
    end if;
  end loop;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stg_biopsies'
  ) then
    raise exception 'combined security rollback retired-biopsy policy fingerprint mismatch';
  end if;

  object_name := 'stg_drone_photos';
  if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = object_name
        and policyname = object_name || '_admin_ins'
        and coalesce(with_check, '') ~* 'is_admin_user'
    ) or not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = object_name
        and policyname = object_name || '_admin_sel'
        and coalesce(qual, '') ~* 'is_admin_user'
    ) then
    raise exception 'combined security rollback staging-policy fingerprint mismatch: %', object_name;
  end if;

  if not exists (
    select 1 from pg_class
    where oid = 'public.profiles'::regclass
      and relrowsecurity and not relforcerowsecurity
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_select_own'
      and coalesce(qual, '') ~* 'auth[.]uid'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_access_audit'
      and policyname = 'active admins can read user access audit'
      and coalesce(qual, '') ~* 'current_user_is_active_admin'
  ) then
    raise exception 'combined security rollback access-control policy fingerprint mismatch';
  end if;
end
$fingerprint$;

-- Disable organic biopsy submission without removing any tables, columns,
-- rows, identifiers, or integrity guards.
revoke all on function public.commit_sighting_submission_with_biopsies(uuid)
  from public, anon, authenticated, service_role;
drop function public.commit_sighting_submission_with_biopsies(uuid);

create or replace function private.validate_sighting_submission_biopsies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from jsonb_array_elements(coalesce(new.payload->'mantas', '[]'::jsonb)) item
    where item ? 'biopsy' and item->'biopsy' <> 'null'::jsonb
  ) or (
    tg_op = 'UPDATE' and exists (
      select 1
      from jsonb_array_elements(coalesce(old.payload->'mantas', '[]'::jsonb)) item
      where item ? 'biopsy' and item->'biopsy' <> 'null'::jsonb
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Biopsy submission is disabled pending reviewed remediation';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_sighting_submission_biopsies()
  from public, anon, authenticated, service_role;

-- Disable the browser/API drone-import entry point while retaining its private
-- implementation as inaccessible historical code.
revoke all on function public.fn_imports_commit_drone_photos(uuid)
  from public, anon, authenticated, service_role;
drop function public.fn_imports_commit_drone_photos(uuid);
revoke all on function private.fn_imports_commit_drone_photos_impl(uuid)
  from public, anon, authenticated, service_role;

-- Close every staging read/write path, including service/direct API access.
revoke all on table public.stg_biopsies
  from public, anon, authenticated, service_role;
revoke all on sequence public.stg_biopsies_id_seq
  from public, anon, authenticated, service_role;
revoke all on table public.stg_drone_photos
  from public, anon, authenticated, service_role;
revoke all on sequence public.stg_drone_photos_id_seq
  from public, anon, authenticated, service_role;
revoke all on table public.v_stg_biopsies_norm
  from public, anon, authenticated, service_role;
revoke all on table public.v_stg_invalid_biopsies
  from public, anon, authenticated, service_role;
revoke all on table public.v_stg_drone_photos_norm
  from public, anon, authenticated, service_role;
revoke all on table public.v_stg_invalid_drone_photos
  from public, anon, authenticated, service_role;

-- Never reopen direct biopsy writes during rollback.
revoke insert, update, delete on table public.biopsies
  from public, anon, authenticated;
revoke usage, update on sequence public.biopsies_pk_biopsy_id_seq
  from public, anon, authenticated;

do $postcondition$
declare
  role_name text;
  object_name text;
  function_source text;
begin
  if to_regprocedure('public.commit_sighting_submission_with_biopsies(uuid)') is not null
     or to_regprocedure('public.fn_imports_commit_drone_photos(uuid)') is not null
     or to_regprocedure('public.fn_imports_commit_biopsies(uuid)') is not null
     or to_regprocedure('private.fn_imports_commit_biopsies_impl(uuid)') is not null
     or to_regprocedure('private.fn_imports_commit_drone_photos_impl(uuid)') is null then
    raise exception 'combined security rollback left an unsafe executable entry point';
  end if;

  select pg_get_functiondef('private.validate_sighting_submission_biopsies()'::regprocedure)
    into function_source;
  if function_source !~* 'Biopsy submission is disabled pending reviewed remediation' then
    raise exception 'combined security rollback did not install fail-closed biopsy validation';
  end if;

  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(role_name, 'private.fn_imports_commit_drone_photos_impl(uuid)', 'EXECUTE') then
      raise exception 'private drone import remains callable by %', role_name;
    end if;
    foreach object_name in array array[
      'stg_biopsies', 'stg_drone_photos', 'v_stg_biopsies_norm',
      'v_stg_invalid_biopsies', 'v_stg_drone_photos_norm',
      'v_stg_invalid_drone_photos'
    ] loop
      if has_table_privilege(role_name, format('public.%I', object_name), 'SELECT')
         or has_table_privilege(role_name, format('public.%I', object_name), 'INSERT')
         or has_table_privilege(role_name, format('public.%I', object_name), 'UPDATE')
         or has_table_privilege(role_name, format('public.%I', object_name), 'DELETE') then
        raise exception 'staging object remains accessible: % role %', object_name, role_name;
      end if;
    end loop;
    if has_sequence_privilege(role_name, 'public.stg_biopsies_id_seq', 'USAGE')
       or has_sequence_privilege(role_name, 'public.stg_drone_photos_id_seq', 'USAGE') then
      raise exception 'staging sequence remains accessible by %', role_name;
    end if;
  end loop;

  if to_regprocedure('public.is_admin_user()') is null
     or to_regprocedure('private.current_user_is_active_admin()') is null
     or to_regprocedure('public.admin_set_profile_access(uuid,text,boolean,text)') is null
     or to_regprocedure('public.commit_sighting_submission(uuid)') is null
     or not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'profiles'
         and policyname = 'profiles_select_own'
     ) or not exists (
       select 1 from pg_trigger
       where tgrelid = 'public.biopsies'::regclass
         and tgname = 'trg_validate_biopsy_parent_consistency'
         and tgdeferrable and tginitdeferred and not tgisinternal
     ) then
    raise exception 'combined security rollback removed a retained safety control';
  end if;
end
$postcondition$;

notify pgrst, 'reload schema';
commit;
