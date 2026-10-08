-- Removes only the new alias configuration, including its policies/index/constraints.
-- Any subsequently reviewed alias assignments would be removed with this table.
begin;
drop table public.contributor_legacy_aliases;
commit;
