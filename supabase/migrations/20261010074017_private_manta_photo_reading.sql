-- DRAFT ONLY — DO NOT APPLY until authenticated readers and role smoke tests pass.
-- Approved prepared images are identified by permanent photos references, not
-- pathname. Original source files do not become available to general browsers.
begin;
drop policy manta_permanent_select on storage.objects;
create policy manta_permanent_select on storage.objects
as permissive for select to authenticated
using (
  bucket_id = 'manta-images'
  and exists (
    select 1 from public.profiles u
    where u.id = (select auth.uid()) and u.is_active is true
      and u.role in ('user', 'admin')
  )
  and exists (
    select 1 from public.photos p
    where p.storage_bucket = 'manta-images'
      and storage.objects.name is distinct from p.original_storage_path
      and (
        p.storage_path = storage.objects.name
        or p.storage_path = 'https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/manta-images/' || storage.objects.name
        or p.thumbnail_url = 'https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/manta-images/' || storage.objects.name
      )
  )
);
-- Existing active-owner and active-admin submission SELECT policies, all
-- INSERT policies, and service-role access remain unchanged. The owner's
-- existing namespace access continues; this adds no cross-user original read.
update storage.buckets set public = false where id = 'manta-images';
commit;
