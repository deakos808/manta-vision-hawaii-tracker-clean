-- Restores the audited pre-transition public delivery and permanent policy.
-- No objects, scientific rows, other policies, or other buckets are changed.
begin;
drop policy manta_permanent_select on storage.objects;
create policy manta_permanent_select on storage.objects
as permissive for select to public
using ((bucket_id = 'manta-images'::text) and (name <> 'submissions'::text) and (name !~~ 'submissions/%'::text));
update storage.buckets set public = true where id = 'manta-images';
commit;
