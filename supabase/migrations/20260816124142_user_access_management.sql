-- PROPOSED / UNAPPLIED. Production application requires separate approval.
-- The opening block is a fail-closed fingerprint of the documented production baseline.
do $$
declare
  expected_privileges constant text[] := array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'];
  actual_privileges text[];
  function_source text;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'profiles'
      and c.relrowsecurity is true and c.relforcerowsecurity is false
  ) then
    raise exception 'profiles RLS fingerprint mismatch';
  end if;

  if (select array_agg(policyname order by policyname) from pg_policies where schemaname = 'public' and tablename = 'profiles')
     is distinct from array[
       'profiles_admin_delete_all', 'profiles_admin_insert_all', 'profiles_admin_select_all',
       'profiles_admin_update_all', 'profiles_select_own'
     ]::name[] then
    raise exception 'profiles policy-name fingerprint mismatch';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_admin_delete_all' and cmd = 'DELETE' and roles = array['authenticated']::name[]
      and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'is_admin_user'
      and with_check is null
  ) or not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_admin_insert_all' and cmd = 'INSERT' and roles = array['authenticated']::name[]
      and qual is null and regexp_replace(coalesce(with_check, ''), '[[:space:]()]', '', 'g') = 'is_admin_user'
  ) or not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_admin_select_all' and cmd = 'SELECT' and roles = array['authenticated']::name[]
      and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'is_admin_user'
      and with_check is null
  ) or not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_admin_update_all' and cmd = 'UPDATE' and roles = array['authenticated']::name[]
      and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'is_admin_user'
      and regexp_replace(coalesce(with_check, ''), '[[:space:]()]', '', 'g') = 'is_admin_user'
  ) or not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_select_own' and cmd = 'SELECT' and roles = array['authenticated']::name[]
      and regexp_replace(coalesce(qual, ''), '[[:space:]()]', '', 'g') = 'id=auth.uid'
      and with_check is null
  ) then
    raise exception 'profiles policy-definition fingerprint mismatch';
  end if;

  foreach function_source in array array['anon', 'authenticated', 'service_role'] loop
    select array_agg(privilege_type order by privilege_type) into actual_privileges
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'profiles' and grantee = function_source;
    if actual_privileges is distinct from expected_privileges then
      raise exception 'profiles grant fingerprint mismatch for role %', function_source;
    end if;
  end loop;

  if to_regprocedure('public.is_admin_user()') is null then
    raise exception 'is_admin_user fingerprint mismatch: function missing';
  end if;
  select pg_get_functiondef(to_regprocedure('public.is_admin_user()')) into function_source;
  if not exists (
    select 1 from pg_proc
    where oid = to_regprocedure('public.is_admin_user()') and prosecdef is true
      and proconfig = array['search_path=public']
  ) or function_source !~* 'auth[.]uid' or function_source !~* 'role[^;]+admin'
     or function_source !~* 'coalesce[^;]+is_active[^;]+true' then
    raise exception 'is_admin_user definition fingerprint mismatch';
  end if;
  if not has_function_privilege('anon', 'public.is_admin_user()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.is_admin_user()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.is_admin_user()', 'EXECUTE') then
    raise exception 'is_admin_user grant fingerprint mismatch';
  end if;

  if to_regprocedure('public.handle_new_user()') is null then
    raise exception 'handle_new_user fingerprint mismatch: function missing';
  end if;
  select pg_get_functiondef(to_regprocedure('public.handle_new_user()')) into function_source;
  if not exists (
    select 1 from pg_proc
    where oid = to_regprocedure('public.handle_new_user()') and prosecdef is true and proconfig is null
  ) or function_source !~* 'insert[[:space:]]+into[[:space:]]+(public[.])?profiles'
     or function_source !~* 'new[.]id' or function_source !~* 'new[.]email' then
    raise exception 'handle_new_user definition fingerprint mismatch';
  end if;
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
      and t.tgfoid = to_regprocedure('public.handle_new_user()')
  ) then
    raise exception 'handle_new_user trigger fingerprint mismatch';
  end if;
  if not has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.handle_new_user()', 'EXECUTE') then
    raise exception 'handle_new_user grant fingerprint mismatch';
  end if;

  if exists (select 1 from public.profiles where role is null or is_active is null) then
    raise exception 'profiles contains null role or is_active values';
  end if;
  if exists (select 1 from public.profiles where role not in ('admin', 'user')) then
    raise exception 'profiles contains an unsupported role';
  end if;
end
$$;

alter table public.profiles alter column role set not null;
alter table public.profiles alter column is_active set not null;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and is_active is true
  );
$$;
revoke all on function public.is_admin_user() from public, anon;
grant execute on function public.is_admin_user() to authenticated, service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role, is_active)
  values (new.id, new.email, 'user', true);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;

drop policy profiles_admin_delete_all on public.profiles;
drop policy profiles_admin_insert_all on public.profiles;
drop policy profiles_admin_select_all on public.profiles;
drop policy profiles_admin_update_all on public.profiles;
-- profiles_select_own remains unchanged so users can read their own live access status.

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.current_user_is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and is_active is true
  );
$$;
revoke all on function private.current_user_is_active_admin() from public, anon;
grant execute on function private.current_user_is_active_admin() to authenticated;

create table public.user_access_audit (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event_type text not null check (event_type in (
    'invitation', 'recovery', 'role_change', 'suspension', 'reactivation',
    'privileged_action_failure'
  )),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  outcome text not null check (outcome in ('attempted', 'success', 'failure')),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  details jsonb not null default '{}'::jsonb
);
alter table public.user_access_audit enable row level security;
revoke all on table public.user_access_audit from public, anon, authenticated;
grant select on table public.user_access_audit to authenticated;
grant select, insert, update on table public.user_access_audit to service_role;
grant usage, select on sequence public.user_access_audit_id_seq to service_role;

create policy "active admins can read user access audit"
on public.user_access_audit for select to authenticated
using ((select private.current_user_is_active_admin()));

create or replace function public.admin_set_profile_access(
  target_user_id uuid,
  requested_role text,
  requested_is_active boolean,
  change_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  active_admin_count integer;
  event_name text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('manta-active-admin-floor'));
  select * into actor_profile from public.profiles where id = actor_id for share;
  if not found then raise exception 'Acting account has no application profile'; end if;
  if actor_profile.role <> 'admin' or actor_profile.is_active is not true then
    raise exception 'Active administrator access is required';
  end if;
  if requested_role not in ('admin', 'user') then raise exception 'Invalid application role'; end if;
  if change_reason is null or char_length(pg_catalog.btrim(change_reason)) not between 3 and 500 then
    raise exception 'A valid change reason is required';
  end if;

  select * into target_profile from public.profiles where id = target_user_id for update;
  if not found then raise exception 'Target application profile does not exist'; end if;
  if actor_id = target_user_id and target_profile.role = 'admin' and target_profile.is_active is true
     and (requested_role <> 'admin' or requested_is_active is not true) then
    raise exception 'Administrators cannot demote or suspend themselves';
  end if;
  if target_profile.role = 'admin' and target_profile.is_active is true
     and (requested_role <> 'admin' or requested_is_active is not true) then
    select count(*) into active_admin_count
    from public.profiles where role = 'admin' and is_active is true;
    if active_admin_count <= 2 then raise exception 'At least two active administrators must remain'; end if;
  end if;

  update public.profiles set role = requested_role, is_active = requested_is_active
  where id = target_user_id;
  event_name := case
    when target_profile.is_active is true and requested_is_active is false then 'suspension'
    when target_profile.is_active is false and requested_is_active is true then 'reactivation'
    else 'role_change'
  end;
  insert into public.user_access_audit (event_type, actor_user_id, target_user_id, outcome, reason, details)
  values (
    event_name, actor_id, target_user_id, 'success', pg_catalog.btrim(change_reason),
    pg_catalog.jsonb_build_object(
      'old_role', target_profile.role, 'new_role', requested_role,
      'old_active', target_profile.is_active, 'new_active', requested_is_active
    )
  );
end;
$$;
revoke all on function public.admin_set_profile_access(uuid, text, boolean, text) from public, anon;
grant execute on function public.admin_set_profile_access(uuid, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';
