-- Restores exact prior policy names, roles, commands and predicates.
begin;

drop policy manta_admin_insert on storage.objects;
drop policy temp_admin_insert on storage.objects;
drop policy temp_admin_diagnostic_delete on storage.objects;
drop policy contractor_authenticated_select on storage.objects;
drop policy contractor_authenticated_insert on storage.objects;

drop policy manta_submission_insert_own on storage.objects;
drop policy manta_permanent_select on storage.objects;
drop policy manta_submission_select_own on storage.objects;
drop policy manta_submission_select_admin on storage.objects;
drop policy drone_draft_insert_active on storage.objects;
drop policy calibration_admin_select on storage.objects;
drop policy calibration_admin_insert on storage.objects;
drop policy calibration_admin_update on storage.objects;
drop policy calibration_admin_delete on storage.objects;
drop policy csv_uploads_admin_select on storage.objects;

create policy "Authenticated uploads g3dtj2_0" on storage.objects for insert to authenticated
with check (true);

create policy "if users need to read/view uploaded images g3dtj2_0" on storage.objects for select to public
using (true);

create policy "Authenticated Upload Access" on storage.objects for insert to authenticated
with check (bucket_id = 'manta-images'::text);

create policy "Public read access to manta-images" on storage.objects for select to public
using (bucket_id = 'manta-images'::text);

commit;
