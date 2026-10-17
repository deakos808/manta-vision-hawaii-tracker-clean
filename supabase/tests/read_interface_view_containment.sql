-- DISPOSABLE LOCAL DATABASE ONLY. No live credentials or scientific data.
-- Exact captured view definitions/types; synthetic base tables omit unrelated triggers/constraints.
-- Admin base-table policy is a fixture equivalent, not a copy of all Production policies.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE FUNCTION assert_ok(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION assert_denied(q text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE q; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: %',label; RETURN; END; RAISE EXCEPTION 'FAIL: expected 42501: %',label; END $$;
CREATE OR REPLACE FUNCTION public.fn_parse_catalog_date(t text)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when t is null or length(btrim(t)) = 0 then null
    when t ~ '^\d{4}-\d{2}-\d{2}$' then t::date
    when t ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(t, 'MM/DD/YYYY')
    when t ~ '^\d{1,2}/\d{1,2}/\d{2}$'  then to_date(t, 'MM/DD/YY')
    else null
  end
$function$
;
REVOKE EXECUTE ON FUNCTION fn_parse_catalog_date(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_parse_catalog_date(text) TO service_role;
CREATE TABLE public.manta_match_results ("id" uuid,"manta_id" uuid,"fk_catalog_id" uuid,"true_match_rank" integer,"match_score" double precision,"flag_for_review" boolean,"inserted_at" timestamp with time zone,"pk_manta_id" integer,"pk_catalog_id" integer);
ALTER TABLE public.manta_match_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_read ON public.manta_match_results FOR SELECT TO authenticated USING(true);
CREATE POLICY fixture_admin ON public.manta_match_results FOR ALL TO authenticated USING(current_setting('fixture.admin',true)='true') WITH CHECK(current_setting('fixture.admin',true)='true');
GRANT ALL ON public.manta_match_results TO authenticated,service_role;
CREATE TABLE public.mantas ("pk_manta_id" integer,"manta_uuid" uuid,"fk_catalog_id" integer,"fk_sighting_id" integer,"best_ventral_photo_id" text,"ref_biometrics_id" text,"best_manta_ventral_photo_url" text,"best_ventral_photo_id_int" integer,"best_manta_ventral_photo_url2" text,"gender" text,"age_class" text,"size_m_legacy" numeric,"estimated_size_m" numeric,"jon_sizze_m" numeric,"species" text,"total_biopsies" integer,"total_tags" integer,"ref_biopsy_id" text,"ref_ptt_id" text,"injury_type" text,"injury_notes" text,"photographer" text,"mp_number" text,"updated_at" timestamp with time zone,"jon_size_m" numeric,"best_manta_dorsal_photo_url" text,"new_best_manta_ventral_photo_id" integer,"new_best_manta_dorsal_photo_id" integer,"best_manta_photo_url" text,"fk_catalog_uuid" uuid,"fk_sighting_uuid" uuid,"pk_manta_uuid" uuid,"size_scale_px" numeric,"size_disc_len_px" numeric,"size_scale_actual_cm" numeric,"size_disc_len_m" numeric,"size_disc_width_m" numeric,"size_dw_m" numeric,"size_m" numeric,"is_mprf" boolean,"name" text,"mprf_external_manta_id" integer,"mprf_date" date,"pk_mprf_catalog_id" integer,"mprf_comments" text,"mprf_status" text,"sighting_date" date,"no_ventral_photos" boolean,"catalog_unknown" boolean,"submission_manta_id" text);
ALTER TABLE public.mantas ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_read ON public.mantas FOR SELECT TO authenticated USING(true);
CREATE POLICY fixture_admin ON public.mantas FOR ALL TO authenticated USING(current_setting('fixture.admin',true)='true') WITH CHECK(current_setting('fixture.admin',true)='true');
GRANT ALL ON public.mantas TO authenticated,service_role;
CREATE TABLE public.stg_catalog ("pk_catalog_id" integer,"name" text,"species" text,"date_first_sighted" text,"date_last_sighted" text,"days_between_first_last" text,"days_between_first_last_sighting" text,"days_since_last_sighting" text,"days_since_last_sighitng" text,"notes" text,"src_file" text,"loaded_at" timestamp with time zone,"last_age_class" text,"list_unique_locations" text,"list_unique_regions" text,"total_sightings" text,"last_sex" text,"last_size" text,"c_last_size" text,"list_years_sighted" text,"total_biopsies" text,"total_tags" text);
ALTER TABLE public.stg_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_read ON public.stg_catalog FOR SELECT TO authenticated USING(true);
CREATE POLICY fixture_admin ON public.stg_catalog FOR ALL TO authenticated USING(current_setting('fixture.admin',true)='true') WITH CHECK(current_setting('fixture.admin',true)='true');
GRANT ALL ON public.stg_catalog TO authenticated,service_role;
CREATE TABLE public.temp_drone_photos ("id" uuid,"created_at" timestamp with time zone,"draft_id" uuid,"path" text,"url" text,"taken_date" date,"taken_time" text,"lat" double precision,"lon" double precision,"total_mantas" integer);
ALTER TABLE public.temp_drone_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_read ON public.temp_drone_photos FOR SELECT TO authenticated USING(true);
CREATE POLICY fixture_admin ON public.temp_drone_photos FOR ALL TO authenticated USING(current_setting('fixture.admin',true)='true') WITH CHECK(current_setting('fixture.admin',true)='true');
GRANT ALL ON public.temp_drone_photos TO authenticated,service_role;
CREATE TABLE public.temp_drone_sightings ("id" uuid,"created_at" timestamp with time zone,"pilot" text,"email" text,"phone" text,"date" date,"time" text,"island" text,"location" text,"latitude" double precision,"longitude" double precision,"notes" text,"status" text,"committed_at" timestamp with time zone,"start_time" text,"end_time" text,"no_mantas_seen" boolean,"total_mantas_observed" integer,"times_unknown" boolean);
ALTER TABLE public.temp_drone_sightings ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_read ON public.temp_drone_sightings FOR SELECT TO authenticated USING(true);
CREATE POLICY fixture_admin ON public.temp_drone_sightings FOR ALL TO authenticated USING(current_setting('fixture.admin',true)='true') WITH CHECK(current_setting('fixture.admin',true)='true');
GRANT ALL ON public.temp_drone_sightings TO authenticated,service_role;
CREATE VIEW public.manta_match_results_view AS  SELECT manta_match_results.id,
    manta_match_results.pk_manta_id,
    manta_match_results.pk_catalog_id,
    manta_match_results.true_match_rank,
    manta_match_results.match_score,
    manta_match_results.flag_for_review,
    manta_match_results.inserted_at
   FROM manta_match_results;
GRANT ALL ON public.manta_match_results_view TO authenticated,service_role;
CREATE VIEW public.mantas_missing_sighting AS  SELECT mantas.pk_manta_id,
    mantas.fk_catalog_id,
    mantas.fk_sighting_id,
    mantas.is_mprf,
    mantas.pk_mprf_catalog_id,
    mantas.mprf_external_manta_id,
    mantas.gender,
    mantas.age_class,
    mantas.updated_at
   FROM mantas
  WHERE mantas.fk_sighting_id IS NULL;
GRANT ALL ON public.mantas_missing_sighting TO authenticated,service_role;
CREATE VIEW public.stg_v_catalog_type_warnings AS  SELECT s.pk_catalog_id,
    s.date_first_sighted AS date_first_sighted_raw,
    s.date_last_sighted AS date_last_sighted_raw,
        CASE
            WHEN s.date_first_sighted IS NOT NULL AND btrim(s.date_first_sighted) <> ''::text AND fn_parse_catalog_date(s.date_first_sighted) IS NULL THEN 'bad date_first_sighted'::text
            WHEN s.date_last_sighted IS NOT NULL AND btrim(s.date_last_sighted) <> ''::text AND fn_parse_catalog_date(s.date_last_sighted) IS NULL THEN 'bad date_last_sighted'::text
            ELSE NULL::text
        END AS issue
   FROM stg_catalog s
  WHERE s.date_first_sighted IS NOT NULL AND btrim(s.date_first_sighted) <> ''::text AND fn_parse_catalog_date(s.date_first_sighted) IS NULL OR s.date_last_sighted IS NOT NULL AND btrim(s.date_last_sighted) <> ''::text AND fn_parse_catalog_date(s.date_last_sighted) IS NULL;
GRANT ALL ON public.stg_v_catalog_type_warnings TO authenticated,service_role;
CREATE VIEW public.v_sizes_manta_rows_v1 AS  SELECT m.pk_manta_id,
    m.fk_catalog_id,
    m.fk_sighting_id,
    m.name,
    m.species,
    m.gender,
    m.age_class,
    m.size_m AS manta_size_m,
    COALESCE(m.best_manta_photo_url, m.best_manta_ventral_photo_url, m.best_manta_ventral_photo_url2) AS thumbnail_url,
    m.is_mprf,
    m.sighting_date
   FROM mantas m
  WHERE m.size_m IS NOT NULL;
GRANT ALL ON public.v_sizes_manta_rows_v1 TO authenticated,service_role;
CREATE VIEW public.v_temp_drone_sightings_summary AS  SELECT s.id,
    s.created_at,
    s.pilot,
    s.email,
    s.phone,
    s.date,
    s."time",
    s.start_time,
    s.end_time,
    s.times_unknown,
    s.no_mantas_seen,
    s.total_mantas_observed,
    s.island,
    s.location,
    s.latitude,
    s.longitude,
    s.notes,
    s.status,
    s.committed_at,
    ( SELECT count(*) AS count
           FROM temp_drone_photos p
          WHERE p.draft_id = s.id) AS photo_count
   FROM temp_drone_sightings s;
GRANT ALL ON public.v_temp_drone_sightings_summary TO authenticated,service_role;
INSERT INTO mantas(pk_manta_id,name,size_m) VALUES(1,'synthetic',2);
INSERT INTO manta_match_results(pk_manta_id) VALUES(1);
INSERT INTO stg_catalog(pk_catalog_id,date_first_sighted) VALUES(1,'invalid');
INSERT INTO temp_drone_sightings(id,pilot) VALUES('00000000-0000-0000-0000-000000000001','synthetic');
CREATE TEMP TABLE baseline AS SELECT c.oid,c.relname,c.relacl::text acl,pg_get_viewdef(c.oid,true) definition FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='v';
SET ROLE authenticated;
SELECT assert_denied('SELECT * FROM stg_v_catalog_type_warnings','pre-existing parser EXECUTE denial documented');
RESET ROLE;
\ir ../migrations/20261016173020_contain_read_interface_view_mutations.sql
SELECT assert_ok(has_table_privilege('authenticated','manta_match_results_view','SELECT'),'manta_match_results_view SELECT retained');
SELECT assert_ok(NOT has_table_privilege('authenticated','manta_match_results_view',p),'manta_match_results_view '||p||' revoked') FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
SET ROLE authenticated;
SET fixture.admin='false';
SELECT assert_ok((SELECT count(*)=1 FROM manta_match_results_view),'manta_match_results_view contributor reads synthetic row');
SELECT assert_denied('INSERT INTO manta_match_results_view(pk_manta_id) VALUES(NULL)','manta_match_results_view INSERT denied');
SELECT assert_denied('UPDATE manta_match_results_view SET pk_manta_id=pk_manta_id','manta_match_results_view UPDATE denied');
SELECT assert_denied('DELETE FROM manta_match_results_view','manta_match_results_view DELETE denied');
SET fixture.admin='true';
SELECT assert_denied('UPDATE manta_match_results_view SET pk_manta_id=pk_manta_id','manta_match_results_view admin view write denied intentionally');
RESET ROLE;
SET ROLE anon;
SELECT assert_denied('SELECT * FROM manta_match_results_view','manta_match_results_view anon unchanged');
RESET ROLE;
SET ROLE service_role;
SELECT assert_ok((SELECT count(*)=1 FROM manta_match_results_view),'manta_match_results_view service read retained');
UPDATE manta_match_results_view SET pk_manta_id=pk_manta_id;
RESET ROLE;
SELECT assert_ok(has_table_privilege('authenticated','mantas_missing_sighting','SELECT'),'mantas_missing_sighting SELECT retained');
SELECT assert_ok(NOT has_table_privilege('authenticated','mantas_missing_sighting',p),'mantas_missing_sighting '||p||' revoked') FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
SET ROLE authenticated;
SET fixture.admin='false';
SELECT assert_ok((SELECT count(*)=1 FROM mantas_missing_sighting),'mantas_missing_sighting contributor reads synthetic row');
SELECT assert_denied('INSERT INTO mantas_missing_sighting(pk_manta_id) VALUES(NULL)','mantas_missing_sighting INSERT denied');
SELECT assert_denied('UPDATE mantas_missing_sighting SET pk_manta_id=pk_manta_id','mantas_missing_sighting UPDATE denied');
SELECT assert_denied('DELETE FROM mantas_missing_sighting','mantas_missing_sighting DELETE denied');
SET fixture.admin='true';
SELECT assert_denied('UPDATE mantas_missing_sighting SET pk_manta_id=pk_manta_id','mantas_missing_sighting admin view write denied intentionally');
RESET ROLE;
SET ROLE anon;
SELECT assert_denied('SELECT * FROM mantas_missing_sighting','mantas_missing_sighting anon unchanged');
RESET ROLE;
SET ROLE service_role;
SELECT assert_ok((SELECT count(*)=1 FROM mantas_missing_sighting),'mantas_missing_sighting service read retained');
UPDATE mantas_missing_sighting SET pk_manta_id=pk_manta_id;
RESET ROLE;
SELECT assert_ok(has_table_privilege('authenticated','v_sizes_manta_rows_v1','SELECT'),'v_sizes_manta_rows_v1 SELECT retained');
SELECT assert_ok(NOT has_table_privilege('authenticated','v_sizes_manta_rows_v1',p),'v_sizes_manta_rows_v1 '||p||' revoked') FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
SET ROLE authenticated;
SET fixture.admin='false';
SELECT assert_ok((SELECT count(*)=1 FROM v_sizes_manta_rows_v1),'v_sizes_manta_rows_v1 contributor reads synthetic row');
SELECT assert_denied('INSERT INTO v_sizes_manta_rows_v1(pk_manta_id) VALUES(NULL)','v_sizes_manta_rows_v1 INSERT denied');
SELECT assert_denied('UPDATE v_sizes_manta_rows_v1 SET pk_manta_id=pk_manta_id','v_sizes_manta_rows_v1 UPDATE denied');
SELECT assert_denied('DELETE FROM v_sizes_manta_rows_v1','v_sizes_manta_rows_v1 DELETE denied');
SET fixture.admin='true';
SELECT assert_denied('UPDATE v_sizes_manta_rows_v1 SET pk_manta_id=pk_manta_id','v_sizes_manta_rows_v1 admin view write denied intentionally');
RESET ROLE;
SET ROLE anon;
SELECT assert_denied('SELECT * FROM v_sizes_manta_rows_v1','v_sizes_manta_rows_v1 anon unchanged');
RESET ROLE;
SET ROLE service_role;
SELECT assert_ok((SELECT count(*)=1 FROM v_sizes_manta_rows_v1),'v_sizes_manta_rows_v1 service read retained');
UPDATE v_sizes_manta_rows_v1 SET pk_manta_id=pk_manta_id;
RESET ROLE;
SELECT assert_ok(has_table_privilege('authenticated','stg_v_catalog_type_warnings','SELECT'),'stg_v_catalog_type_warnings SELECT retained');
SELECT assert_ok(NOT has_table_privilege('authenticated','stg_v_catalog_type_warnings',p),'stg_v_catalog_type_warnings '||p||' revoked') FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
SET ROLE authenticated;
SET fixture.admin='false';
SELECT assert_denied('SELECT * FROM stg_v_catalog_type_warnings','stg_v_catalog_type_warnings existing parser denial unchanged');
SELECT assert_denied('INSERT INTO stg_v_catalog_type_warnings(pk_catalog_id) VALUES(NULL)','stg_v_catalog_type_warnings INSERT denied');
SELECT assert_denied('UPDATE stg_v_catalog_type_warnings SET pk_catalog_id=pk_catalog_id','stg_v_catalog_type_warnings UPDATE denied');
SELECT assert_denied('DELETE FROM stg_v_catalog_type_warnings','stg_v_catalog_type_warnings DELETE denied');
SET fixture.admin='true';
SELECT assert_denied('UPDATE stg_v_catalog_type_warnings SET pk_catalog_id=pk_catalog_id','stg_v_catalog_type_warnings admin view write denied intentionally');
RESET ROLE;
SET ROLE anon;
SELECT assert_denied('SELECT * FROM stg_v_catalog_type_warnings','stg_v_catalog_type_warnings anon unchanged');
RESET ROLE;
SET ROLE service_role;
SELECT assert_ok((SELECT count(*)=1 FROM stg_v_catalog_type_warnings),'stg_v_catalog_type_warnings service read retained');
UPDATE stg_v_catalog_type_warnings SET pk_catalog_id=pk_catalog_id;
RESET ROLE;
SELECT assert_ok(has_table_privilege('authenticated','v_temp_drone_sightings_summary','SELECT'),'v_temp_drone_sightings_summary SELECT retained');
SELECT assert_ok(NOT has_table_privilege('authenticated','v_temp_drone_sightings_summary',p),'v_temp_drone_sightings_summary '||p||' revoked') FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
SET ROLE authenticated;
SET fixture.admin='false';
SELECT assert_ok((SELECT count(*)=1 FROM v_temp_drone_sightings_summary),'v_temp_drone_sightings_summary contributor reads synthetic row');
SELECT assert_denied('INSERT INTO v_temp_drone_sightings_summary(pilot) VALUES(NULL)','v_temp_drone_sightings_summary INSERT denied');
SELECT assert_denied('UPDATE v_temp_drone_sightings_summary SET pilot=pilot','v_temp_drone_sightings_summary UPDATE denied');
SELECT assert_denied('DELETE FROM v_temp_drone_sightings_summary','v_temp_drone_sightings_summary DELETE denied');
SET fixture.admin='true';
SELECT assert_denied('UPDATE v_temp_drone_sightings_summary SET pilot=pilot','v_temp_drone_sightings_summary admin view write denied intentionally');
RESET ROLE;
SET ROLE anon;
SELECT assert_denied('SELECT * FROM v_temp_drone_sightings_summary','v_temp_drone_sightings_summary anon unchanged');
RESET ROLE;
SET ROLE service_role;
SELECT assert_ok((SELECT count(*)=1 FROM v_temp_drone_sightings_summary),'v_temp_drone_sightings_summary service read retained');
UPDATE v_temp_drone_sightings_summary SET pilot=pilot;
RESET ROLE;
SET ROLE authenticated;
SET fixture.admin='true';
DO $$ DECLARE n integer; BEGIN UPDATE mantas SET name=name WHERE pk_manta_id=1; GET DIAGNOSTICS n=ROW_COUNT; PERFORM assert_ok(n=1,'admin intended base-table update works'); DELETE FROM temp_drone_sightings WHERE id='00000000-0000-0000-0000-000000000001'; GET DIAGNOSTICS n=ROW_COUNT; PERFORM assert_ok(n=1,'admin drone base-table delete works'); END $$;
RESET ROLE;
SELECT assert_ok(definition=pg_get_viewdef(oid,true),relname||' definition unchanged') FROM baseline;
SELECT assert_ok(has_table_privilege('service_role',oid,p),relname||' service '||p||' retained') FROM baseline CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
\ir ../rollback/20261016173020_contain_read_interface_view_mutations_rollback.sql
SELECT assert_ok(acl=(SELECT relacl::text FROM pg_class WHERE pg_class.oid=baseline.oid),relname||' exact rollback ACL') FROM baseline;
