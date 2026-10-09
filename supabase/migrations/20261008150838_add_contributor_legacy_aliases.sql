-- Draft: explicit reviewed identity configuration only. No assignments/backfill.
begin;
create table public.contributor_legacy_aliases (
  user_id uuid not null references auth.users(id) on delete cascade,
  photographer_alias text not null
    check (photographer_alias = btrim(photographer_alias) and photographer_alias <> ''),
  primary key (user_id, photographer_alias)
);
-- Normalization prevents conflicting assignments; historical lookups remain EXACT.
create unique index contributor_legacy_aliases_normalized_key
  on public.contributor_legacy_aliases (lower(btrim(photographer_alias)));
alter table public.contributor_legacy_aliases enable row level security;
revoke all on public.contributor_legacy_aliases from public, anon, authenticated;
grant select on public.contributor_legacy_aliases to authenticated;
grant all on public.contributor_legacy_aliases to service_role;
create policy legacy_aliases_select_own_active
on public.contributor_legacy_aliases for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and is_active is true and role in ('user', 'admin')
  )
);
create policy legacy_aliases_select_admin
on public.contributor_legacy_aliases for select to authenticated
using ((select public.is_admin_user()));
-- No client write grants or write policies. Assignments are deliberate backend operations.
commit;
