-- Manual rollback to the documented profiles policy/grant/function baseline.
drop function if exists public.admin_set_profile_access(uuid, text, boolean, text);
drop policy if exists "active admins can read user access audit" on public.user_access_audit;
drop table if exists public.user_access_audit;
drop function if exists private.current_user_is_active_admin();

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and coalesce(is_active, true)
  );
$$;
revoke all on function public.is_admin_user() from public;
grant execute on function public.is_admin_user() to anon, authenticated, service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;
alter function public.handle_new_user() reset all;
revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to anon, authenticated, service_role;

create policy profiles_admin_delete_all on public.profiles
for delete to authenticated using (is_admin_user());
create policy profiles_admin_insert_all on public.profiles
for insert to authenticated with check (is_admin_user());
create policy profiles_admin_select_all on public.profiles
for select to authenticated using (is_admin_user());
create policy profiles_admin_update_all on public.profiles
for update to authenticated using (is_admin_user()) with check (is_admin_user());

grant all privileges on table public.profiles to anon, authenticated, service_role;
alter table public.profiles alter column role drop not null;
alter table public.profiles alter column is_active drop not null;
notify pgrst, 'reload schema';
