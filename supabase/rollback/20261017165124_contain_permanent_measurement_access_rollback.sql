-- Emergency reversal: restores ordinary authenticated permanent-evidence
-- read/mutation exposure. Anon remains denied; all other ACLs stay unchanged.
begin;
grant select, insert, update, delete on table public.manta_sizes to authenticated;
grant select, insert, update, delete on table public.photo_measurements to authenticated;
commit;
