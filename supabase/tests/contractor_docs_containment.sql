-- DISPOSABLE POSTGRESQL ONLY. Synthetic metadata, no files or live credentials.
-- Full captured live storage.objects policy set; minimal helper/table fixtures.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA storage;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA storage,auth,public TO anon,authenticated,service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT '00000000-0000-0000-0000-000000000001'::uuid$$;
CREATE FUNCTION is_admin_user() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
CREATE TABLE profiles(id uuid,is_active boolean,role text);
INSERT INTO profiles VALUES(auth.uid(),true,'user');
CREATE TABLE photos(storage_bucket text,original_storage_path text,storage_path text,thumbnail_url text);
GRANT SELECT ON profiles,photos TO anon,authenticated,service_role;
CREATE TABLE storage.objects(id integer PRIMARY KEY,bucket_id text,name text,owner_id text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON storage.objects TO service_role;
INSERT INTO storage.objects VALUES(1,'contractor-docs','synthetic/document.pdf',NULL);
CREATE POLICY "Service role write drone-photo" ON storage.objects AS PERMISSIVE FOR ALL TO service_role USING ((bucket_id = 'drone-photo'::text)) WITH CHECK ((bucket_id = 'drone-photo'::text));
CREATE POLICY "calibration_admin_delete" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'calibration-images'::text) AND ( SELECT is_admin_user() AS is_admin_user)));
CREATE POLICY "calibration_admin_insert" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'calibration-images'::text) AND ( SELECT is_admin_user() AS is_admin_user)));
CREATE POLICY "calibration_admin_select" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'calibration-images'::text) AND ( SELECT is_admin_user() AS is_admin_user)));
CREATE POLICY "calibration_admin_update" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'calibration-images'::text) AND ( SELECT is_admin_user() AS is_admin_user))) WITH CHECK (((bucket_id = 'calibration-images'::text) AND ( SELECT is_admin_user() AS is_admin_user)));
CREATE POLICY "contractor_authenticated_insert" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'contractor-docs'::text));
CREATE POLICY "contractor_authenticated_select" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING ((bucket_id = 'contractor-docs'::text));
CREATE POLICY "csv_uploads_admin_select" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'csv-uploads'::text) AND ( SELECT is_admin_user() AS is_admin_user)));
CREATE POLICY "drone_admin_select" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'drone-photo'::text) AND ( SELECT is_admin_user() AS is_admin_user)));
CREATE POLICY "drone_draft_insert_active" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'temp-images'::text) AND ((storage.foldername(name))[1] = 'drone'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_active IS TRUE) AND (profiles.role = ANY (ARRAY['user'::text, 'admin'::text])))))));
CREATE POLICY "manta_admin_insert" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'manta-images'::text) AND ( SELECT is_admin_user() AS is_admin_user)));
CREATE POLICY "manta_permanent_select" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'manta-images'::text) AND (EXISTS ( SELECT 1
   FROM profiles u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.is_active IS TRUE) AND (u.role = ANY (ARRAY['user'::text, 'admin'::text]))))) AND (EXISTS ( SELECT 1
   FROM photos p
  WHERE ((p.storage_bucket = 'manta-images'::text) AND (objects.name IS DISTINCT FROM p.original_storage_path) AND ((p.storage_path = objects.name) OR (p.storage_path = ('https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/manta-images/'::text || objects.name)) OR (p.thumbnail_url = ('https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/manta-images/'::text || objects.name))))))));
CREATE POLICY "manta_submission_insert_own" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'manta-images'::text) AND ((storage.foldername(name))[1] = 'submissions'::text) AND ((storage.foldername(name))[2] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_active IS TRUE) AND (profiles.role = ANY (ARRAY['user'::text, 'admin'::text])))))));
CREATE POLICY "manta_submission_select_admin" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'manta-images'::text) AND ((storage.foldername(name))[1] = 'submissions'::text) AND ( SELECT is_admin_user() AS is_admin_user)));
CREATE POLICY "manta_submission_select_own" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'manta-images'::text) AND ((storage.foldername(name))[1] = 'submissions'::text) AND ((storage.foldername(name))[2] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_active IS TRUE) AND (profiles.role = ANY (ARRAY['user'::text, 'admin'::text])))))));
CREATE POLICY "temp_admin_diagnostic_delete" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'temp-images'::text) AND (name ~~ 'diagnostics/diagnostic-%.txt'::text) AND (array_length(storage.foldername(name), 1) = 1) AND ( SELECT is_admin_user() AS is_admin_user)));
CREATE POLICY "temp_admin_insert" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'temp-images'::text) AND ( SELECT is_admin_user() AS is_admin_user)));
CREATE POLICY "temp_admin_select" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'temp-images'::text) AND ( SELECT is_admin_user() AS is_admin_user)));
CREATE POLICY "temp_owner_select" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'temp-images'::text) AND (owner_id = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM profiles u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.is_active IS TRUE) AND (u.role = ANY (ARRAY['user'::text, 'admin'::text])))))));
CREATE POLICY "temp_permanent_select" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'temp-images'::text) AND (EXISTS ( SELECT 1
   FROM profiles u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.is_active IS TRUE) AND (u.role = ANY (ARRAY['user'::text, 'admin'::text]))))) AND (EXISTS ( SELECT 1
   FROM photos p
  WHERE (((p.storage_bucket = 'temp-images'::text) AND (p.storage_path = objects.name)) OR (p.storage_path = ('https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/temp-images/'::text || objects.name)) OR (p.thumbnail_url = ('https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/temp-images/'::text || objects.name)))))));
CREATE FUNCTION assert_ok(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END$$;
CREATE FUNCTION snapshot() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object(
'rows',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o),
'definition',(SELECT jsonb_agg(jsonb_build_object('name',attname,'type',atttypid,'null',attnotnull) ORDER BY attnum) FROM pg_attribute WHERE attrelid='storage.objects'::regclass AND attnum>0 AND NOT attisdropped),
'acl',(SELECT relacl::text FROM pg_class WHERE oid='storage.objects'::regclass),
'owner',(SELECT relowner FROM pg_class WHERE oid='storage.objects'::regclass),
'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass)) $$;
CREATE TABLE baseline AS SELECT snapshot() state,(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='storage') policies;
CREATE FUNCTION check_state(broad boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r text; n integer; allowed boolean;
BEGIN
FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
 allowed:=r='service_role' OR (r='authenticated' AND broad);
 EXECUTE format('SET LOCAL ROLE %I',r);
 SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='contractor-docs';
 PERFORM assert_ok(n=CASE WHEN allowed THEN 1 ELSE 0 END,r||' list/read visibility');
 -- Subtransaction sentinel rolls back every successful synthetic upload.
 BEGIN
  INSERT INTO storage.objects VALUES(2,'contractor-docs','synthetic/upload.pdf',NULL);
  IF NOT allowed THEN RAISE EXCEPTION 'Unexpected insert'; END IF;
  RAISE EXCEPTION SQLSTATE 'ZX001' USING MESSAGE='rollback successful synthetic upload';
 EXCEPTION WHEN insufficient_privilege THEN
  IF allowed THEN RAISE EXCEPTION 'Unexpected insert denial'; END IF;
 WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
 PERFORM assert_ok(true,r||' upload authorization');
 BEGIN
  UPDATE storage.objects SET name='synthetic/changed.pdf' WHERE id=1;
  GET DIAGNOSTICS n=ROW_COUNT;
  PERFORM assert_ok(n=CASE WHEN r='service_role' THEN 1 ELSE 0 END,r||' update');
  DELETE FROM storage.objects WHERE id=1;
  GET DIAGNOSTICS n=ROW_COUNT;
  PERFORM assert_ok(n=CASE WHEN r='service_role' THEN 1 ELSE 0 END,r||' delete');
  RAISE EXCEPTION SQLSTATE 'ZX001' USING MESSAGE='rollback synthetic update/delete';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 RESET ROLE;
END LOOP;
PERFORM assert_ok(snapshot()=(SELECT state FROM baseline),'metadata/ACL/ownership/RLS unchanged');
PERFORM assert_ok(
 (SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='storage' AND policyname NOT IN ('contractor_authenticated_select','contractor_authenticated_insert')) =
 (SELECT jsonb_agg(p ORDER BY p->>'policyname') FROM baseline,jsonb_array_elements(policies) p WHERE p->>'policyname' NOT IN ('contractor_authenticated_select','contractor_authenticated_insert')),
 'unrelated policies unchanged');
END $$;
SELECT check_state(true);
\ir ../migrations/20261017013904_contain_contractor_docs_browser_access.sql
SELECT check_state(false);
\ir ../rollback/20261017013904_contain_contractor_docs_browser_access_rollback.sql
SELECT assert_ok((SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='storage')=(SELECT policies FROM baseline),'exact rollback policies');
SELECT check_state(true);
\ir ../migrations/20261017013904_contain_contractor_docs_browser_access.sql
SELECT check_state(false);
