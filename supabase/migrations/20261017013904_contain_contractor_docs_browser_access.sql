-- Batch 2C: remove unused MantaTracker browser access to private contractor-docs.
-- Preserve all objects, bucket metadata, service_role access and unrelated policies.
BEGIN;
DROP POLICY contractor_authenticated_select ON storage.objects;
DROP POLICY contractor_authenticated_insert ON storage.objects;
COMMIT;
