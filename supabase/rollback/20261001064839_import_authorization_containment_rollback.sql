-- Fail-closed rollback for import authorization containment.
-- Preserves all data and the locked legacy implementations, but removes the
-- browser-callable commit API until a reviewed forward migration is applied.

\set ON_ERROR_STOP on
begin;

do $fingerprint$
declare
  function_source text;
  object_name text;
begin
  foreach object_name in array array[
    'fn_imports_commit_biopsies',
    'fn_imports_commit_drone_photos'
  ] loop
    if to_regprocedure(format('public.%I(uuid)', object_name)) is null
       or to_regprocedure(format('private.%I_impl(uuid)', object_name)) is null then
      raise exception 'contained import function rollback fingerprint mismatch: %', object_name;
    end if;

    select pg_get_functiondef(to_regprocedure(format('public.%I(uuid)', object_name)))
      into function_source;
    if function_source !~* 'auth[.]uid'
       or function_source !~* 'public[.]profiles'
       or function_source !~* 'role[^;]+admin'
       or function_source !~* 'is_active[^;]+true'
       or function_source !~* ('private[.]' || object_name || '_impl') then
      raise exception 'contained import wrapper rollback fingerprint mismatch: %', object_name;
    end if;

    if has_function_privilege('anon', format('public.%I(uuid)', object_name), 'EXECUTE')
       or not has_function_privilege('authenticated', format('public.%I(uuid)', object_name), 'EXECUTE')
       or not has_function_privilege('service_role', format('public.%I(uuid)', object_name), 'EXECUTE') then
      raise exception 'contained import grant rollback fingerprint mismatch: %', object_name;
    end if;
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
    ) or has_table_privilege('anon', format('public.%I', object_name), 'SELECT')
      or not has_table_privilege('authenticated', format('public.%I', object_name), 'SELECT') then
      raise exception 'contained import view rollback fingerprint mismatch: %', object_name;
    end if;
  end loop;
end
$fingerprint$;

revoke all on function public.fn_imports_commit_biopsies(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.fn_imports_commit_drone_photos(uuid)
  from public, anon, authenticated, service_role;
drop function public.fn_imports_commit_biopsies(uuid);
drop function public.fn_imports_commit_drone_photos(uuid);

revoke all on function private.fn_imports_commit_biopsies_impl(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.fn_imports_commit_drone_photos_impl(uuid)
  from public, anon, authenticated, service_role;

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
revoke all on table public.v_stg_drone_photos_norm
  from public, anon, authenticated, service_role;
revoke all on table public.v_stg_invalid_biopsies
  from public, anon, authenticated, service_role;
revoke all on table public.v_stg_invalid_drone_photos
  from public, anon, authenticated, service_role;

do $postcondition$
declare
  grantee_name text;
  object_name text;
begin
  foreach object_name in array array[
    'fn_imports_commit_biopsies',
    'fn_imports_commit_drone_photos'
  ] loop
    if to_regprocedure(format('public.%I(uuid)', object_name)) is not null
       or to_regprocedure(format('private.%I_impl(uuid)', object_name)) is null
       or not exists (
         select 1 from pg_proc
         where oid = to_regprocedure(format('private.%I_impl(uuid)', object_name))
           and prosecdef is true
           and proconfig is not null
           and array_to_string(proconfig, ',') ~ '^search_path='
       ) then
      raise exception 'fail-closed import function rollback failed: %', object_name;
    end if;
    foreach grantee_name in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(
        grantee_name,
        format('private.%I_impl(uuid)', object_name),
        'EXECUTE'
      ) then
        raise exception 'private import implementation remains callable: % role %', object_name, grantee_name;
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
      raise exception 'fail-closed import view security mismatch: %', object_name;
    end if;
    foreach grantee_name in array array['anon', 'authenticated', 'service_role'] loop
      if has_table_privilege(grantee_name, format('public.%I', object_name), 'SELECT') then
        raise exception 'fail-closed import view remains readable: % role %', object_name, grantee_name;
      end if;
    end loop;
  end loop;

  foreach object_name in array array['stg_biopsies', 'stg_drone_photos'] loop
    foreach grantee_name in array array['anon', 'authenticated', 'service_role'] loop
      if has_table_privilege(grantee_name, format('public.%I', object_name), 'SELECT')
         or has_table_privilege(grantee_name, format('public.%I', object_name), 'INSERT') then
        raise exception 'fail-closed import staging access remains: % role %', object_name, grantee_name;
      end if;
    end loop;
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
      raise exception 'authoritative import staging policy rollback mismatch: %', object_name;
    end if;
  end loop;
end
$postcondition$;

notify pgrst, 'reload schema';
commit;
