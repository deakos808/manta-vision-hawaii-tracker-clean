-- PROPOSED / UNAPPLIED. Production application requires separate approval.
-- Preserve the legacy import contracts while requiring an authoritative active-admin profile.

begin;

do $fingerprint$
declare
  function_source text;
  expected_privileges constant text[] := array[
    'DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'
  ];
  actual_privileges text[];
  grantee_name text;
  object_name text;
begin
  if to_regnamespace('private') is null
     or to_regprocedure('private.current_user_is_active_admin()') is null
     or to_regprocedure('auth.uid()') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.stg_import_errors') is null
     or to_regclass('public.biopsies') is null
     or to_regclass('public.drone_photos') is null
     or to_regclass('public.stg_biopsies') is null
     or to_regclass('public.stg_drone_photos') is null
     or to_regclass('public.stg_biopsies_id_seq') is null
     or to_regclass('public.stg_drone_photos_id_seq') is null then
    raise exception 'import authorization prerequisite fingerprint mismatch';
  end if;

  select pg_get_functiondef(to_regprocedure('public.is_admin_user()')) into function_source;
  if function_source is null
     or function_source !~* 'auth[.]uid'
     or function_source !~* 'role[^;]+admin'
     or function_source !~* 'is_active[^;]+true'
     or not exists (
       select 1 from pg_proc
       where oid = to_regprocedure('public.is_admin_user()')
         and prosecdef is true
         and proconfig is not null
         and array_to_string(proconfig, ',') ~ '^search_path='
     ) then
    raise exception 'is_admin_user prerequisite fingerprint mismatch';
  end if;

  foreach object_name in array array[
    'fn_imports_commit_biopsies',
    'fn_imports_commit_drone_photos'
  ] loop
    if to_regprocedure(format('public.%I(uuid)', object_name)) is null
       or to_regprocedure(format('private.%I_impl(uuid)', object_name)) is not null then
      raise exception 'import function fingerprint mismatch: %', object_name;
    end if;

    select pg_get_functiondef(to_regprocedure(format('public.%I(uuid)', object_name)))
      into function_source;
    if not exists (
      select 1 from pg_proc
      where oid = to_regprocedure(format('public.%I(uuid)', object_name))
        and prosecdef is true
        and proconfig = array['search_path=public']
    ) or function_source !~* 'insert[[:space:]]+into[[:space:]]+public[.]stg_import_errors'
      or function_source !~* 'jsonb_build_object'
      or function_source ~* 'auth[.]uid'
      or function_source ~* 'public[.]profiles' then
      raise exception 'import function definition fingerprint mismatch: %', object_name;
    end if;

    if not has_function_privilege('anon', format('public.%I(uuid)', object_name), 'EXECUTE')
       or not has_function_privilege('authenticated', format('public.%I(uuid)', object_name), 'EXECUTE')
       or not has_function_privilege('service_role', format('public.%I(uuid)', object_name), 'EXECUTE')
       or not exists (
         select 1
         from pg_proc p
         cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
         where p.oid = to_regprocedure(format('public.%I(uuid)', object_name))
           and acl.grantee = 0
           and acl.privilege_type = 'EXECUTE'
       ) then
      raise exception 'import function grant fingerprint mismatch: %', object_name;
    end if;
  end loop;

  if function_source is null then
    raise exception 'import function fingerprint unavailable';
  end if;

  select pg_get_functiondef(to_regprocedure('public.fn_imports_commit_biopsies(uuid)'))
    into function_source;
  if function_source !~* 'from[[:space:]]+public[.]v_stg_biopsies_norm'
     or function_source !~* 'insert[[:space:]]+into[[:space:]]+public[.]biopsies'
     or function_source !~* '''target''[^;]+''biopsies''' then
    raise exception 'biopsy import contract fingerprint mismatch';
  end if;

  select pg_get_functiondef(to_regprocedure('public.fn_imports_commit_drone_photos(uuid)'))
    into function_source;
  if function_source !~* 'from[[:space:]]+public[.]v_stg_drone_photos_norm'
     or function_source !~* 'insert[[:space:]]+into[[:space:]]+public[.]drone_photos'
     or function_source !~* '''target''[^;]+''drone_photos''' then
    raise exception 'drone-photo import contract fingerprint mismatch';
  end if;

  foreach object_name in array array[
    'v_stg_biopsies_norm',
    'v_stg_drone_photos_norm',
    'v_stg_invalid_biopsies',
    'v_stg_invalid_drone_photos'
  ] loop
    if to_regclass(format('public.%I', object_name)) is null
       or exists (
         select 1 from pg_class
         where oid = to_regclass(format('public.%I', object_name))
           and coalesce(reloptions, '{}'::text[]) @> array['security_invoker=true']
       )
       or not has_table_privilege('anon', format('public.%I', object_name), 'SELECT')
       or not has_table_privilege('authenticated', format('public.%I', object_name), 'SELECT')
       or not has_table_privilege('service_role', format('public.%I', object_name), 'SELECT') then
      raise exception 'import view fingerprint mismatch: %', object_name;
    end if;

    foreach grantee_name in array array['anon', 'authenticated', 'service_role'] loop
      select array_agg(privilege_type order by privilege_type) into actual_privileges
      from information_schema.role_table_grants
      where table_schema = 'public' and table_name = object_name
        and grantee = grantee_name;
      if actual_privileges is distinct from expected_privileges then
        raise exception 'import view grant fingerprint mismatch: % role %', object_name, grantee_name;
      end if;
    end loop;
  end loop;

  select pg_get_viewdef('public.v_stg_biopsies_norm'::regclass, true)
    into function_source;
  if function_source !~* '(public[.])?stg_biopsies'
     or function_source !~* 'try_cast_double'
     or function_source !~* 'latitude'
     or function_source !~* 'longitude' then
    raise exception 'biopsy normalized-view definition fingerprint mismatch';
  end if;

  select pg_get_viewdef('public.v_stg_drone_photos_norm'::regclass, true)
    into function_source;
  if function_source !~* '(public[.])?stg_drone_photos'
     or function_source !~* 'try_cast_double'
     or function_source !~* 'drone[^;]+lat'
     or function_source !~* 'drone[^;]+lon' then
    raise exception 'drone-photo normalized-view definition fingerprint mismatch';
  end if;

  select pg_get_viewdef('public.v_stg_invalid_biopsies'::regclass, true)
    into function_source;
  if function_source !~* '(public[.])?v_stg_biopsies_norm' then
    raise exception 'biopsy invalid-view definition fingerprint mismatch';
  end if;

  select pg_get_viewdef('public.v_stg_invalid_drone_photos'::regclass, true)
    into function_source;
  if function_source !~* '(public[.])?v_stg_drone_photos_norm' then
    raise exception 'drone-photo invalid-view definition fingerprint mismatch';
  end if;

  select pg_get_functiondef(to_regprocedure('public.try_cast_double(text)'))
    into function_source;
  if function_source is null
     or function_source !~* 'nullif_blank'
     or function_source !~* 'double precision'
     or function_source !~* 'exception[[:space:]]+when[[:space:]]+others' then
    raise exception 'try_cast_double behavior fingerprint mismatch';
  end if;

  foreach object_name in array array['stg_biopsies', 'stg_drone_photos'] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = object_name
        and c.relrowsecurity is true and c.relforcerowsecurity is false
    ) then
      raise exception 'import staging RLS fingerprint mismatch: %', object_name;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = object_name
        and policyname = object_name || '_admin_ins'
        and cmd = 'INSERT' and roles = array['authenticated']::name[]
        and coalesce(with_check, '') ~* 'is_admin'
        and coalesce(with_check, '') !~* 'is_admin_user'
    ) or not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = object_name
        and policyname = object_name || '_admin_sel'
        and cmd = 'SELECT' and roles = array['authenticated']::name[]
        and coalesce(qual, '') ~* 'is_admin'
        and coalesce(qual, '') !~* 'is_admin_user'
    ) then
      raise exception 'import staging policy fingerprint mismatch: %', object_name;
    end if;

    foreach grantee_name in array array['anon', 'authenticated', 'service_role'] loop
      select array_agg(privilege_type order by privilege_type) into actual_privileges
      from information_schema.role_table_grants
      where table_schema = 'public' and table_name = object_name
        and grantee = grantee_name;
      if actual_privileges is distinct from expected_privileges then
        raise exception 'import staging grant fingerprint mismatch: % role %', object_name, grantee_name;
      end if;
    end loop;

    foreach grantee_name in array array['anon', 'authenticated', 'service_role'] loop
      if not has_sequence_privilege(grantee_name, format('public.%I_id_seq', object_name), 'SELECT')
         or not has_sequence_privilege(grantee_name, format('public.%I_id_seq', object_name), 'USAGE')
         or not has_sequence_privilege(grantee_name, format('public.%I_id_seq', object_name), 'UPDATE') then
        raise exception 'import staging sequence fingerprint mismatch: % role %', object_name, grantee_name;
      end if;
    end loop;
  end loop;
end
$fingerprint$;

alter function public.fn_imports_commit_biopsies(uuid)
  rename to fn_imports_commit_biopsies_impl;
alter function public.fn_imports_commit_biopsies_impl(uuid)
  set schema private;
alter function private.fn_imports_commit_biopsies_impl(uuid)
  set search_path = '';
revoke all on function private.fn_imports_commit_biopsies_impl(uuid)
  from public, anon, authenticated, service_role;

alter function public.fn_imports_commit_drone_photos(uuid)
  rename to fn_imports_commit_drone_photos_impl;
alter function public.fn_imports_commit_drone_photos_impl(uuid)
  set schema private;
alter function private.fn_imports_commit_drone_photos_impl(uuid)
  set search_path = '';
revoke all on function private.fn_imports_commit_drone_photos_impl(uuid)
  from public, anon, authenticated, service_role;

create function public.fn_imports_commit_biopsies(p_batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or not exists (
    select 1 from public.profiles
    where id = actor_id and role = 'admin' and is_active is true
  ) then
    raise exception using
      errcode = '42501',
      message = 'Active administrator access is required';
  end if;

  return private.fn_imports_commit_biopsies_impl(p_batch);
end;
$$;
revoke all on function public.fn_imports_commit_biopsies(uuid) from public, anon;
grant execute on function public.fn_imports_commit_biopsies(uuid)
  to authenticated, service_role;

create function public.fn_imports_commit_drone_photos(p_batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or not exists (
    select 1 from public.profiles
    where id = actor_id and role = 'admin' and is_active is true
  ) then
    raise exception using
      errcode = '42501',
      message = 'Active administrator access is required';
  end if;

  return private.fn_imports_commit_drone_photos_impl(p_batch);
end;
$$;
revoke all on function public.fn_imports_commit_drone_photos(uuid) from public, anon;
grant execute on function public.fn_imports_commit_drone_photos(uuid)
  to authenticated, service_role;

drop policy stg_biopsies_admin_ins on public.stg_biopsies;
drop policy stg_biopsies_admin_sel on public.stg_biopsies;
create policy stg_biopsies_admin_ins on public.stg_biopsies
for insert to authenticated
with check ((select public.is_admin_user()));
create policy stg_biopsies_admin_sel on public.stg_biopsies
for select to authenticated
using ((select public.is_admin_user()));

drop policy stg_drone_photos_admin_ins on public.stg_drone_photos;
drop policy stg_drone_photos_admin_sel on public.stg_drone_photos;
create policy stg_drone_photos_admin_ins on public.stg_drone_photos
for insert to authenticated
with check ((select public.is_admin_user()));
create policy stg_drone_photos_admin_sel on public.stg_drone_photos
for select to authenticated
using ((select public.is_admin_user()));

revoke all on table public.stg_biopsies from public, anon, authenticated;
grant select, insert on table public.stg_biopsies to authenticated;
revoke all on sequence public.stg_biopsies_id_seq from public, anon, authenticated;
grant usage, select on sequence public.stg_biopsies_id_seq to authenticated;

revoke all on table public.stg_drone_photos from public, anon, authenticated;
grant select, insert on table public.stg_drone_photos to authenticated;
revoke all on sequence public.stg_drone_photos_id_seq from public, anon, authenticated;
grant usage, select on sequence public.stg_drone_photos_id_seq to authenticated;

alter view public.v_stg_biopsies_norm set (security_invoker = true);
alter view public.v_stg_drone_photos_norm set (security_invoker = true);
alter view public.v_stg_invalid_biopsies set (security_invoker = true);
alter view public.v_stg_invalid_drone_photos set (security_invoker = true);

revoke all on table public.v_stg_biopsies_norm from public, anon, authenticated;
revoke all on table public.v_stg_drone_photos_norm from public, anon, authenticated;
revoke all on table public.v_stg_invalid_biopsies from public, anon, authenticated;
revoke all on table public.v_stg_invalid_drone_photos from public, anon, authenticated;
grant select on table public.v_stg_biopsies_norm to authenticated;
grant select on table public.v_stg_drone_photos_norm to authenticated;
grant select on table public.v_stg_invalid_biopsies to authenticated;
grant select on table public.v_stg_invalid_drone_photos to authenticated;

notify pgrst, 'reload schema';

commit;
