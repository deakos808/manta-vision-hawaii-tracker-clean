-- PROPOSED / UNAPPLIED. Apply only after schema-only reconciliation and review.
-- Fail rather than silently coexisting with an unknown permissive profiles policy.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  ) then
    raise exception 'profiles already has policies; reconcile them before applying this migration';
  end if;
end
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.current_user_is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active is true
  );
$$;

revoke all on function private.current_user_is_active_admin() from public, anon;
grant execute on function private.current_user_is_active_admin() to authenticated;

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

create policy "profile owners and active admins can read profiles"
on public.profiles for select to authenticated
using (id = auth.uid() or private.current_user_is_active_admin());

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
using (private.current_user_is_active_admin());

create or replace function private.create_default_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, email, role, is_active)
  values (new.id, new.email, 'user', true)
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.create_default_profile_for_auth_user() from public, anon, authenticated;

drop trigger if exists create_default_application_profile on auth.users;
create trigger create_default_application_profile
after insert on auth.users
for each row execute function private.create_default_profile_for_auth_user();

create or replace function public.admin_set_profile_access(
  target_user_id uuid,
  requested_role text,
  requested_is_active boolean,
  change_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := auth.uid();
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  active_admin_count integer;
  event_name text;
begin
  select * into actor_profile from public.profiles where id = actor_id for share;
  if not found then raise exception 'Acting account has no application profile'; end if;
  if actor_profile.role <> 'admin' or actor_profile.is_active is not true then
    raise exception 'Active administrator access is required';
  end if;
  if requested_role not in ('admin', 'user') then raise exception 'Invalid application role'; end if;
  if char_length(btrim(change_reason)) not between 3 and 500 then raise exception 'A valid change reason is required'; end if;

  select * into target_profile from public.profiles where id = target_user_id for update;
  if not found then raise exception 'Target application profile does not exist'; end if;

  if actor_id = target_user_id
     and target_profile.role = 'admin' and target_profile.is_active is true
     and (requested_role <> 'admin' or requested_is_active is not true) then
    raise exception 'Administrators cannot demote or suspend themselves';
  end if;

  if target_profile.role = 'admin' and target_profile.is_active is true
     and (requested_role <> 'admin' or requested_is_active is not true) then
    perform pg_advisory_xact_lock(hashtext('manta-active-admin-floor'));
    select count(*) into active_admin_count
    from public.profiles where role = 'admin' and is_active is true;
    if active_admin_count <= 2 then raise exception 'At least two active administrators must remain'; end if;
  end if;

  update public.profiles
  set role = requested_role, is_active = requested_is_active
  where id = target_user_id;

  event_name := case
    when target_profile.is_active is true and requested_is_active is false then 'suspension'
    when target_profile.is_active is false and requested_is_active is true then 'reactivation'
    else 'role_change'
  end;
  insert into public.user_access_audit (
    event_type, actor_user_id, target_user_id, outcome, reason, details
  ) values (
    event_name, actor_id, target_user_id, 'success', btrim(change_reason),
    jsonb_build_object(
      'old_role', target_profile.role,
      'new_role', requested_role,
      'old_active', target_profile.is_active,
      'new_active', requested_is_active
    )
  );
end;
$$;

revoke all on function public.admin_set_profile_access(uuid, text, boolean, text) from public, anon;
grant execute on function public.admin_set_profile_access(uuid, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';
