create table if not exists public.data_change_audit (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_email text,
  actor_role text,
  source text not null default 'admin_ui',
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  primary_key text not null,
  record_label text,
  reason text not null,
  old_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  changed_fields text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  local_ledger_path text
);

create index if not exists data_change_audit_table_pk_idx
  on public.data_change_audit (table_name, primary_key);

create index if not exists data_change_audit_created_at_idx
  on public.data_change_audit (created_at desc);

create index if not exists data_change_audit_changed_by_idx
  on public.data_change_audit (changed_by);

alter table public.data_change_audit enable row level security;

drop policy if exists "admins can read data change audit" on public.data_change_audit;
create policy "admins can read data change audit"
  on public.data_change_audit
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'database_manager')
    )
  );

drop policy if exists "admins can insert data change audit" on public.data_change_audit;
create policy "admins can insert data change audit"
  on public.data_change_audit
  for insert
  to authenticated
  with check (
    changed_by = auth.uid()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('admin', 'database_manager')
    )
  );

grant select, insert on public.data_change_audit to authenticated;
grant select, insert, update, delete on public.data_change_audit to service_role;
grant usage, select on sequence public.data_change_audit_id_seq to authenticated;
grant usage, select on sequence public.data_change_audit_id_seq to service_role;

notify pgrst, 'reload schema';
