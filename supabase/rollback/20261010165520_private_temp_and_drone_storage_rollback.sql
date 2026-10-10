-- Exact policy/visibility rollback. Warning: restores public delivery and broad
-- temp-image SELECT. No Storage objects or application rows are altered.
BEGIN;
DROP POLICY temp_owner_select ON storage.objects;
DROP POLICY temp_permanent_select ON storage.objects;
DROP POLICY temp_admin_select ON storage.objects;
DROP POLICY drone_admin_select ON storage.objects;

CREATE POLICY "Public read for temp-images" ON storage.objects
FOR SELECT TO public USING (bucket_id = 'temp-images'::text);
CREATE POLICY "Public read drone-photo" ON storage.objects
FOR SELECT TO anon USING (bucket_id = 'drone-photo'::text);

UPDATE storage.buckets SET public = true WHERE id IN ('temp-images', 'drone-photo');
COMMIT;
