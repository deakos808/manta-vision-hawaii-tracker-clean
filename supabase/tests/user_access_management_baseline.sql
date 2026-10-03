-- Synthetic reconstruction of the documented production profiles fingerprint.
-- Contains no production rows or identifiers.
create table public.profiles (
  id uuid primary key,
  email text not null unique,
  role text default 'user' check (role in ('admin', 'user')),
  is_active boolean default true,
  created_at timestamptz default now(),
  constraint profiles_id_auth_users_fk foreign key (id) references auth.users(id) on delete cascade,
  constraint profiles_id_auth_users_fk_2 foreign key (id) references auth.users(id) on delete cascade,
  constraint profiles_id_unique unique (id)
);
alter table public.profiles enable row level security;

create function public.is_admin_user()
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

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to anon, authenticated, service_role;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create policy profiles_admin_delete_all on public.profiles
for delete to authenticated using (is_admin_user());
create policy profiles_admin_insert_all on public.profiles
for insert to authenticated with check (is_admin_user());
create policy profiles_admin_select_all on public.profiles
for select to authenticated using (is_admin_user());
create policy profiles_admin_update_all on public.profiles
for update to authenticated using (is_admin_user()) with check (is_admin_user());
create policy profiles_select_own on public.profiles
for select to authenticated using (id = auth.uid());

grant all privileges on table public.profiles to anon, authenticated, service_role;
