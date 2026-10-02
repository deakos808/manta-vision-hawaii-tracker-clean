\set ON_ERROR_STOP on
\ir import_authorization_baseline.sql

-- Synthetic Storage metadata proves that rollback never touches Storage state.
create schema storage;
create table storage.objects (
  id uuid primary key,
  bucket_id text not null,
  name text not null,
  metadata jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

-- Convert the shared synthetic import baseline to the exact documented legacy
-- access-control metadata expected by the first candidate migration.
alter table public.profiles enable row level security;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select role = 'admin' and is_active is true
    from public.profiles
    where id = auth.uid()
  ), false);
$$;

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

grant execute on function public.is_admin_user() to public, anon, authenticated, service_role;
grant execute on function public.handle_new_user() to public, anon, authenticated, service_role;
grant all on table public.profiles to anon, authenticated, service_role;

create policy profiles_admin_delete_all on public.profiles
  for delete to authenticated using (public.is_admin_user());
create policy profiles_admin_insert_all on public.profiles
  for insert to authenticated with check (public.is_admin_user());
create policy profiles_admin_select_all on public.profiles
  for select to authenticated using (public.is_admin_user());
create policy profiles_admin_update_all on public.profiles
  for update to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
