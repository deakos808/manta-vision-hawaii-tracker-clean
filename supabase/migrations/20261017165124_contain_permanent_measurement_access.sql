-- Batch 3C: permanent evidence is written through the existing guarded commit
-- and protected service-role maintenance paths. No RLS/schema/data changes.
begin;
revoke all privileges on table public.manta_sizes from anon, authenticated;
revoke all privileges on table public.photo_measurements from anon, authenticated;
commit;
