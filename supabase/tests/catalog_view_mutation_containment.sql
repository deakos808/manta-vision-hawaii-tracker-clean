-- DISPOSABLE LOCAL DATABASE ONLY. Never run this fixture against Supabase.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('fixture.admin',true),'false')='true' $$;
CREATE TABLE public.catalog ("pk_catalog_id" integer,
"catalog_uuid" uuid,
"name" text,
"species" text,
"date_first_sighted" date,
"date_last_sighted" date,
"days_between_first_last" integer,
"notes" text,
"best_photo_id" text,
"best_dorsal_photo_id" text,
"best_cat_ventral_id" integer,
"best_cat_dorsal_id" integer,
"best_cat_mask_ventral_id" integer,
"best_cat_mask_ventral_id_int" integer,
"best_photo_url" text,
"best_catalog_photo_url" text,
"pk_catalog_uuid" uuid,
"merged_into_pk_catalog_id" integer,
"best_catalog_ventral_thumb_url" text,
"last_age_class" text,
"list_unique_locations" text,
"list_unique_regions" text,
"years_between_first_last" numeric,
"days_since_last_sighting" integer,
"list_years_sighted" integer[],
"count_unique_years_sighted" integer,
"total_sightings" integer,
"total_biopsies" integer,
"total_tags" integer,
"last_size_m" numeric,
"last_gender" text,
"is_mprf" boolean);
ALTER TABLE public.catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_read ON public.catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY catalog_admin_all ON public.catalog FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
GRANT ALL ON public.catalog TO authenticated,service_role;
CREATE VIEW public.catalog_no_mprf AS  SELECT catalog.pk_catalog_id,
    catalog.catalog_uuid,
    catalog.name,
    catalog.species,
    catalog.date_first_sighted,
    catalog.date_last_sighted,
    catalog.days_between_first_last,
    catalog.notes,
    catalog.best_photo_id,
    catalog.best_dorsal_photo_id,
    catalog.best_cat_ventral_id,
    catalog.best_cat_dorsal_id,
    catalog.best_cat_mask_ventral_id,
    catalog.best_cat_mask_ventral_id_int,
    catalog.best_photo_url,
    catalog.best_catalog_photo_url,
    catalog.pk_catalog_uuid,
    catalog.merged_into_pk_catalog_id,
    catalog.best_catalog_ventral_thumb_url,
    catalog.last_age_class,
    catalog.list_unique_locations,
    catalog.list_unique_regions,
    catalog.years_between_first_last,
    catalog.days_since_last_sighting,
    catalog.list_years_sighted,
    catalog.count_unique_years_sighted,
    catalog.total_sightings,
    catalog.total_biopsies,
    catalog.total_tags,
    catalog.last_size_m,
    catalog.last_gender,
    catalog.is_mprf
   FROM catalog
  WHERE COALESCE(catalog.is_mprf, false) = false;
GRANT ALL ON public.catalog_no_mprf TO authenticated,service_role;
INSERT INTO public.catalog(pk_catalog_id,name,is_mprf) VALUES(733,'SYNTHETIC Left Spot',false),(734,'SYNTHETIC excluded',true);
CREATE FUNCTION public.assert_ok(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION public.assert_denied(sql text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE sql; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: %',label; RETURN; END;
 RAISE EXCEPTION 'FAIL: expected 42501: %',label;
END $$;
CREATE TEMP TABLE baseline AS SELECT
 (SELECT relacl::text FROM pg_class WHERE oid='public.catalog_no_mprf'::regclass) acl,
 pg_get_viewdef('public.catalog_no_mprf'::regclass,true) definition,
 (SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY policyname)::text) FROM pg_policies p WHERE schemaname='public' AND tablename='catalog') policies,
 (SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY pk_catalog_id)::text) FROM public.catalog c) data;
SET ROLE authenticated;
SET fixture.admin='false';
DO $$ DECLARE n integer; BEGIN
 UPDATE public.catalog SET name=name WHERE pk_catalog_id=733; GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM assert_ok(n=0,'baseline contributor direct catalog update blocked by RLS');
 UPDATE public.catalog_no_mprf SET name=name WHERE pk_catalog_id=733; GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM assert_ok(n=1,'baseline owner view bypass reproduced with synthetic row');
END $$;
RESET ROLE;
\ir ../migrations/20261016170017_contain_catalog_view_mutations.sql
SELECT assert_ok(has_table_privilege('authenticated','public.catalog_no_mprf','SELECT'),'SELECT grant retained');
SELECT assert_ok(NOT has_table_privilege('authenticated','public.catalog_no_mprf',p),p||' revoked')
 FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
SET ROLE authenticated;
SET fixture.admin='false';
SELECT assert_ok((SELECT count(*)=1 FROM public.catalog_no_mprf),'contributor view SELECT/filter retained');
SELECT assert_denied('INSERT INTO public.catalog_no_mprf(pk_catalog_id,name) VALUES (735,''synthetic'')','contributor INSERT denied');
SELECT assert_denied('UPDATE public.catalog_no_mprf SET name=''tampered'' WHERE pk_catalog_id=733','contributor UPDATE denied');
SELECT assert_denied('DELETE FROM public.catalog_no_mprf WHERE pk_catalog_id=733','contributor DELETE denied');
SET fixture.admin='true';
SELECT assert_ok((SELECT count(*)=1 FROM public.catalog_no_mprf),'admin view SELECT retained');
SELECT assert_denied('UPDATE public.catalog_no_mprf SET name=name WHERE pk_catalog_id=733','admin also cannot write through view');
DO $$ DECLARE n integer; BEGIN
 UPDATE public.catalog SET name=name WHERE pk_catalog_id=733; GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM assert_ok(n=1,'admin direct catalog update still works');
END $$;
RESET ROLE;
SET ROLE anon;
SELECT assert_denied('SELECT * FROM public.catalog_no_mprf','anon SELECT denied');
SELECT assert_denied('INSERT INTO public.catalog_no_mprf(pk_catalog_id) VALUES(735)','anon INSERT denied');
SELECT assert_denied('UPDATE public.catalog_no_mprf SET name=name','anon UPDATE denied');
SELECT assert_denied('DELETE FROM public.catalog_no_mprf','anon DELETE denied');
RESET ROLE;
SET ROLE service_role;
SELECT assert_ok((SELECT count(*)=1 FROM public.catalog_no_mprf),'service SELECT retained');
DO $$ DECLARE n integer; BEGIN
 UPDATE public.catalog_no_mprf SET name=name WHERE pk_catalog_id=733; GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM assert_ok(n=1,'service view update retained');
 INSERT INTO public.catalog_no_mprf(pk_catalog_id,name,is_mprf) VALUES(735,'service fixture',false);
 DELETE FROM public.catalog_no_mprf WHERE pk_catalog_id=735; GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM assert_ok(n=1,'service INSERT/DELETE retained');
END $$;
RESET ROLE;
SELECT assert_ok((SELECT definition=pg_get_viewdef('public.catalog_no_mprf'::regclass,true) FROM baseline),'view definition unchanged');
SELECT assert_ok((SELECT policies=(SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY policyname)::text) FROM pg_policies p WHERE schemaname='public' AND tablename='catalog') FROM baseline),'catalog RLS policies unchanged');
SELECT assert_ok((SELECT data=(SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY pk_catalog_id)::text) FROM public.catalog c) FROM baseline),'synthetic content fingerprint unchanged');
\ir ../rollback/20261016170017_contain_catalog_view_mutations_rollback.sql
SELECT assert_ok((SELECT acl=(SELECT relacl::text FROM pg_class WHERE oid='public.catalog_no_mprf'::regclass) FROM baseline),'rollback exact ACL restored');
