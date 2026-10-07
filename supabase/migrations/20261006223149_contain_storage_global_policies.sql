-- DRAFT ONLY: not applied. Baseline audited 2026-10-06.
-- Policy-only containment: no grants, bucket flags, objects, tables or RPC changes.
-- PUBLIC manta-images still serves known submission URLs without SELECT RLS.
-- Permanent public URLs/listing remain; submission metadata is owner/admin scoped.
-- Immutable Add Sighting uploads need INSERT, original re-edit needs SELECT.
-- Drone UUID is generated before DB insertion: no existing owner relation yet.
-- Calibration admin routes use signed URLs, upload(upsert:true), and remove.
-- CSV admin diagnostics only list. No repository usage of contractor-docs/pdfs.
-- Unchanged contractor anon access and drone service-role access remain.
-- Active-admin INSERT preserves root imports and contributor derivative re-edits.
-- Admin temp INSERT preserves legacy/diagnostic uploads; only the diagnostic
-- cleanup path receives DELETE. No manta UPDATE/DELETE or temp UPDATE added.
-- Authenticated contractor SELECT/INSERT retains the former effective access.
begin;

drop policy "Authenticated uploads g3dtj2_0" on storage.objects;
drop policy "if users need to read/view uploaded images g3dtj2_0" on storage.objects;
drop policy "Authenticated Upload Access" on storage.objects;
drop policy "Public read access to manta-images" on storage.objects;

create policy manta_submission_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'manta-images' and (storage.foldername(name))[1] = 'submissions' and (storage.foldername(name))[2] = (select auth.uid())::text and exists (select 1 from public.profiles where id = (select auth.uid()) and is_active is true and role in ('user', 'admin')));

create policy manta_permanent_select on storage.objects for select to public
using (bucket_id = 'manta-images' and name <> 'submissions' and name not like 'submissions/%');

create policy manta_submission_select_own on storage.objects for select to authenticated
using (bucket_id = 'manta-images' and (storage.foldername(name))[1] = 'submissions' and (storage.foldername(name))[2] = (select auth.uid())::text and exists (select 1 from public.profiles where id = (select auth.uid()) and is_active is true and role in ('user', 'admin')));

create policy manta_submission_select_admin on storage.objects for select to authenticated
using (bucket_id = 'manta-images' and (storage.foldername(name))[1] = 'submissions' and (select public.is_admin_user()));

create policy drone_draft_insert_active on storage.objects for insert to authenticated
with check (bucket_id = 'temp-images' and (storage.foldername(name))[1] = 'drone' and exists (select 1 from public.profiles where id = (select auth.uid()) and is_active is true and role in ('user', 'admin')));

create policy calibration_admin_select on storage.objects for select to authenticated
using (bucket_id = 'calibration-images' and (select public.is_admin_user()));

create policy calibration_admin_insert on storage.objects for insert to authenticated
with check (bucket_id = 'calibration-images' and (select public.is_admin_user()));

create policy calibration_admin_update on storage.objects for update to authenticated
using (bucket_id = 'calibration-images' and (select public.is_admin_user()))
with check (bucket_id = 'calibration-images' and (select public.is_admin_user()));

create policy calibration_admin_delete on storage.objects for delete to authenticated
using (bucket_id = 'calibration-images' and (select public.is_admin_user()));

create policy csv_uploads_admin_select on storage.objects for select to authenticated
using (bucket_id = 'csv-uploads' and (select public.is_admin_user()));

create policy manta_admin_insert on storage.objects for insert to authenticated
with check (bucket_id = 'manta-images' and (select public.is_admin_user()));

create policy temp_admin_insert on storage.objects for insert to authenticated
with check (bucket_id = 'temp-images' and (select public.is_admin_user()));

create policy temp_admin_diagnostic_delete on storage.objects for delete to authenticated
using (bucket_id = 'temp-images' and name like 'diagnostics/diagnostic-%.txt' and array_length(storage.foldername(name), 1) = 1 and (select public.is_admin_user()));

create policy contractor_authenticated_select on storage.objects for select to authenticated
using (bucket_id = 'contractor-docs');

create policy contractor_authenticated_insert on storage.objects for insert to authenticated
with check (bucket_id = 'contractor-docs');

commit;
