-- Emergency reversal only: restores broad authenticated read/upload access.
-- No object, bucket, role grant or unrelated policy changes.
BEGIN;
CREATE POLICY contractor_authenticated_select ON storage.objects AS PERMISSIVE
FOR SELECT TO authenticated USING (bucket_id = 'contractor-docs'::text);
CREATE POLICY contractor_authenticated_insert ON storage.objects AS PERMISSIVE
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'contractor-docs'::text);
COMMIT;
