-- DRAFT rollback: restores exactly the two audited anonymous policies.
-- Restores anonymous contractor-doc metadata/read and upload exposure.
-- Does not change bucket visibility or any objects.
begin;
create policy "allow anon read path metadata for contractor-docs"
on storage.objects as permissive for select to anon
using (bucket_id = 'contractor-docs'::text);
create policy "allow anon upload to contractor-docs"
on storage.objects as permissive for insert to anon
with check (bucket_id = 'contractor-docs'::text);
commit;
