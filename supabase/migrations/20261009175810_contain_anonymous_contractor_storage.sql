-- DRAFT ONLY: not applied. contractor-docs is already private.
-- Authenticated SELECT/INSERT and service-role access remain unchanged.
-- No bucket flags, objects, application rows, functions, or other policies change.
begin;
drop policy "allow anon read path metadata for contractor-docs" on storage.objects;
drop policy "allow anon upload to contractor-docs" on storage.objects;
commit;
