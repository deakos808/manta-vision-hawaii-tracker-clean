-- Exact owner/permanent-reference/admin access for private beta image delivery.
-- Full legacy URLs identify their embedded bucket even when photos.storage_bucket
-- is inconsistent. No row normalization, folder ownership inference or backfill.
BEGIN;

DROP POLICY "Public read for temp-images" ON storage.objects;
DROP POLICY "Public read drone-photo" ON storage.objects;

CREATE POLICY temp_owner_select ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'temp-images'
  AND owner_id = (SELECT auth.uid())::text
  AND EXISTS (
    SELECT 1 FROM public.profiles u
    WHERE u.id = (SELECT auth.uid()) AND u.is_active IS TRUE
      AND u.role IN ('user', 'admin')
  )
);

CREATE POLICY temp_permanent_select ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'temp-images'
  AND EXISTS (
    SELECT 1 FROM public.profiles u
    WHERE u.id = (SELECT auth.uid()) AND u.is_active IS TRUE
      AND u.role IN ('user', 'admin')
  )
  AND EXISTS (
    SELECT 1 FROM public.photos p
    WHERE (p.storage_bucket = 'temp-images' AND p.storage_path = objects.name)
       OR p.storage_path = 'https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/temp-images/' || objects.name
       OR p.thumbnail_url = 'https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/temp-images/' || objects.name
  )
);

CREATE POLICY temp_admin_select ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'temp-images' AND (SELECT public.is_admin_user())
);

CREATE POLICY drone_admin_select ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'drone-photo' AND (SELECT public.is_admin_user())
);

-- Existing drone_draft_insert_active, temp_admin_insert,
-- temp_admin_diagnostic_delete and Service role write drone-photo are unchanged.
UPDATE storage.buckets SET public = false WHERE id IN ('temp-images', 'drone-photo');

COMMIT;
