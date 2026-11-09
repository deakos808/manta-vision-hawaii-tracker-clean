-- DISPOSABLE DATABASE ONLY. Synthetic rows; exact Production view definitions.
-- Base fixtures contain the columns used by the views, not unrelated production
-- constraints/defaults. Equivalence is measured within this fixture across phases.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.kona_biopsy_consolidated(sample_no text,psn_id text,mprf_id integer,mprf_manta_name text,pk_catalog_id integer,hamer_name text);
CREATE TABLE public.sightings(pk_sighting_id integer,sighting_date date,island text,region text,sitelocation text,latitude numeric,longitude numeric);
CREATE TABLE public._bak_all_session(pk_sighting_id integer,lat_prev numeric,lon_prev numeric,backup_name text);
CREATE TABLE public.location_overrides(island text,sitelocation text,lat_offshore numeric,lon_offshore numeric);
CREATE TABLE public.mantas_import_stage(pk_manta_id text,fk_catalog_id text,fk_sighting_id text,best_ventral_photo_id text,ref_biopsy_id text,ref_tag_id text);
INSERT INTO kona_biopsy_consolidated VALUES ('SYNTHETIC','TEST-GENETIC',1,'Test manta',1,'Test manta');
INSERT INTO sightings VALUES (1,'2020-01-01','Test Island','Test Region','Test Site',20,-156),(2,'2020-01-02','Test Island','Test Site','Test Site',NULL,NULL);
INSERT INTO _bak_all_session VALUES (1,20,-156,'SYNTHETIC');
INSERT INTO location_overrides VALUES ('Test Island','Test Site',20,-156);
INSERT INTO mantas_import_stage VALUES ('1','1','1','1','1','1'),('invalid','','2','','','');
ALTER TABLE sightings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,service_role;

CREATE VIEW public.kona_biopsy_audit AS
 SELECT kona_biopsy_consolidated.sample_no AS hamer_biopsy_id,
    kona_biopsy_consolidated.psn_id AS jonathan_genetic_id,
    kona_biopsy_consolidated.mprf_id AS mprf_catalog_id,
    kona_biopsy_consolidated.mprf_manta_name,
    kona_biopsy_consolidated.pk_catalog_id AS hamer_catalog_id,
    kona_biopsy_consolidated.hamer_name
   FROM kona_biopsy_consolidated;
GRANT ALL ON public.kona_biopsy_audit TO authenticated,service_role;

CREATE VIEW public.sightings_location_audit AS
 WITH curr AS (
         SELECT s.pk_sighting_id,
            s.sighting_date,
            s.island,
            s.region,
            TRIM(BOTH FROM s.sitelocation) AS sitelocation,
            round(s.latitude, 5) AS lat,
            round(s.longitude, 5) AS lon,
            lower(replace(replace(replace(s.island, 'ʻ'::text, ''::text), '’'::text, ''::text), ''''::text, ''::text)) AS isl_norm,
            lower(TRIM(BOTH FROM s.sitelocation)) AS loc_norm
           FROM sightings s
        ), canon_src AS (
         SELECT DISTINCT ON (d.isl_norm, d.loc_norm) d.pk_sighting_id AS pk_canon,
            d.isl_norm,
            d.loc_norm,
            round(d.latitude, 5) AS lat5,
            round(d.longitude, 5) AS lon5
           FROM ( SELECT lower(replace(replace(replace(sightings.island, 'ʻ'::text, ''::text), '’'::text, ''::text), ''''::text, ''::text)) AS isl_norm,
                    lower(TRIM(BOTH FROM sightings.sitelocation)) AS loc_norm,
                    sightings.latitude,
                    sightings.longitude,
                    sightings.sighting_date,
                    sightings.pk_sighting_id
                   FROM sightings
                  WHERE sightings.latitude IS NOT NULL AND sightings.longitude IS NOT NULL) d
          ORDER BY d.isl_norm, d.loc_norm, d.sighting_date, d.pk_sighting_id
        ), bak AS (
         SELECT DISTINCT ON (_bak_all_session.pk_sighting_id) _bak_all_session.pk_sighting_id,
            _bak_all_session.lat_prev,
            _bak_all_session.lon_prev
           FROM _bak_all_session
          WHERE _bak_all_session.lat_prev IS NOT NULL AND _bak_all_session.lon_prev IS NOT NULL
          ORDER BY _bak_all_session.pk_sighting_id, _bak_all_session.backup_name
        ), ov AS (
         SELECT lower(replace(replace(replace(location_overrides.island, 'ʻ'::text, ''::text), '’'::text, ''::text), ''''::text, ''::text)) AS isl_norm,
            lower(TRIM(BOTH FROM location_overrides.sitelocation)) AS loc_norm,
            round(location_overrides.lat_offshore, 5) AS lat_off,
            round(location_overrides.lon_offshore, 5) AS lon_off
           FROM location_overrides
          WHERE location_overrides.lat_offshore IS NOT NULL AND location_overrides.lon_offshore IS NOT NULL
        )
 SELECT c.pk_sighting_id,
    c.sighting_date,
    c.island,
    c.region,
    c.sitelocation,
    c.lat,
    c.lon,
        CASE
            WHEN c.lat IS NULL OR c.lon IS NULL THEN 'missing'::text
            WHEN o.lat_off IS NOT NULL AND c.lat = o.lat_off AND c.lon = o.lon_off THEN 'web_offshore'::text
            WHEN b.pk_sighting_id IS NOT NULL AND b.lat_prev = c.lat AND b.lon_prev = c.lon THEN 'original'::text
            WHEN cs.lat5 IS NOT NULL AND c.lat = cs.lat5 AND c.lon = cs.lon5 THEN
            CASE
                WHEN cs.pk_canon = c.pk_sighting_id THEN 'canonical_earliest'::text
                ELSE 'copied_from_same'::text
            END
            ELSE 'unknown'::text
        END AS source_flag
   FROM curr c
     LEFT JOIN bak b ON b.pk_sighting_id = c.pk_sighting_id
     LEFT JOIN ov o ON o.isl_norm = c.isl_norm AND o.loc_norm = c.loc_norm
     LEFT JOIN canon_src cs ON cs.isl_norm = c.isl_norm AND cs.loc_norm = c.loc_norm;
GRANT ALL ON public.sightings_location_audit TO authenticated,service_role;

CREATE VIEW public.v_mantas_import_stage_typed AS
 SELECT
        CASE
            WHEN NULLIF(TRIM(BOTH FROM mantas_import_stage.pk_manta_id), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM mantas_import_stage.pk_manta_id)::integer
            ELSE NULL::integer
        END AS pk_manta_id,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM mantas_import_stage.fk_catalog_id), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM mantas_import_stage.fk_catalog_id)::integer
            ELSE NULL::integer
        END AS fk_catalog_id,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM mantas_import_stage.fk_sighting_id), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM mantas_import_stage.fk_sighting_id)::integer
            ELSE NULL::integer
        END AS fk_sighting_id,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM mantas_import_stage.best_ventral_photo_id), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM mantas_import_stage.best_ventral_photo_id)::integer
            ELSE NULL::integer
        END AS best_ventral_photo_id,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM mantas_import_stage.ref_biopsy_id), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM mantas_import_stage.ref_biopsy_id)::integer
            ELSE NULL::integer
        END AS ref_biopsy_id,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM mantas_import_stage.ref_tag_id), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM mantas_import_stage.ref_tag_id)::integer
            ELSE NULL::integer
        END AS ref_tag_id
   FROM mantas_import_stage;
GRANT ALL ON public.v_mantas_import_stage_typed TO authenticated,service_role;

CREATE SCHEMA test;
CREATE TABLE test.assertions(label text);
CREATE TABLE test.operations(phase text,view_name text,role_name text,operation text,privilege_present boolean,structural_mask integer,sqlstate text);
CREATE FUNCTION test.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; INSERT INTO test.assertions VALUES(label); END $$;
CREATE FUNCTION test.snapshot() RETURNS jsonb LANGUAGE sql AS $$
SELECT jsonb_build_object('views',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,'options',c.reloptions,'definition',pg_get_viewdef(c.oid,true),'definition_md5',md5(pg_get_viewdef(c.oid,true)),'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid,a.atttypmod,a.attacl) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'dependencies',(SELECT jsonb_agg(jsonb_build_array(d.refclassid,d.refobjid,d.refobjsubid,d.deptype) ORDER BY d.refclassid,d.refobjid,d.refobjsubid,d.deptype) FROM pg_rewrite r JOIN pg_depend d ON d.objid=r.oid AND d.classid='pg_rewrite'::regclass WHERE r.ev_class=c.oid),'mask',pg_relation_is_updatable(c.oid,true)) ORDER BY c.relname) FROM pg_class c WHERE c.oid IN ('kona_biopsy_audit'::regclass,'sightings_location_audit'::regclass,'v_mantas_import_stage_typed'::regclass)),
'base_meta',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.relname) FROM pg_class c WHERE c.oid IN ('kona_biopsy_consolidated'::regclass,'sightings'::regclass,'_bak_all_session'::regclass,'location_overrides'::regclass,'mantas_import_stage'::regclass)),
'kona',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM kona_biopsy_consolidated t),
'sightings',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM sightings t),
'backup',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM _bak_all_session t),
'overrides',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM location_overrides t),
'stage',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM mantas_import_stage t));
$$;
CREATE TABLE test.initial AS SELECT test.snapshot() snapshot;
CREATE FUNCTION test.phase(p text,contained boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v text; r text; priv text; op text; stmt text; code text; mask integer; allowed boolean; col text; lit text; expected text; before_state jsonb;
BEGIN
 FOREACH v IN ARRAY ARRAY['kona_biopsy_audit','sightings_location_audit','v_mantas_import_stage_typed'] LOOP
  mask:=pg_relation_is_updatable(('public.'||v)::regclass,true);
  PERFORM test.ok(mask=CASE v WHEN 'kona_biopsy_audit' THEN 28 WHEN 'sightings_location_audit' THEN 0 ELSE 16 END,p||' updatability '||v);
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    allowed:=r='service_role' OR (r='authenticated' AND NOT contained);
    PERFORM test.ok(has_table_privilege(r,('public.'||v)::regclass,priv)=allowed,p||' ACL '||v||' '||r||' '||priv);
   END LOOP;
   FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    col:=CASE WHEN v='kona_biopsy_audit' THEN 'hamer_name' WHEN v='sightings_location_audit' THEN 'pk_sighting_id' ELSE 'pk_manta_id' END;
    lit:=CASE WHEN v='kona_biopsy_audit' THEN quote_literal('SYNTHETIC EDIT') ELSE '999' END;
    stmt:=CASE op WHEN 'SELECT' THEN format('SELECT * FROM public.%I',v) WHEN 'INSERT' THEN format('INSERT INTO public.%I (%I) VALUES (%s)',v,col,lit) WHEN 'UPDATE' THEN format('UPDATE public.%I SET %I=%s',v,col,lit) ELSE format('DELETE FROM public.%I',v) END;
    before_state:=test.snapshot();
    -- Every operation, including successful writes, rolls back in its own subtransaction.
    BEGIN
     PERFORM set_config('role',r,true);
     EXECUTE stmt;
     RAISE EXCEPTION USING ERRCODE='Z0001',MESSAGE='rollback successful synthetic probe';
    EXCEPTION WHEN SQLSTATE 'Z0001' THEN code:='00000'; WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE;
    END;
    INSERT INTO test.operations VALUES(p,v,r,op,has_table_privilege(r,('public.'||v)::regclass,op),mask,code);
    PERFORM test.ok(test.snapshot()=before_state,p||' probe rollback '||v||' '||r||' '||op);
    IF r='anon' OR (contained AND r='authenticated') THEN
     PERFORM test.ok(code<>'00000',p||' browser denied '||v||' '||r||' '||op);
    ELSIF p='baseline' THEN
     PERFORM test.ok((code='00000')=(op='SELECT' OR v='kona_biopsy_audit' OR (v='v_mantas_import_stage_typed' AND op='DELETE')),p||' baseline structural outcome '||v||' '||r||' '||op);
    ELSE
     SELECT sqlstate INTO expected FROM test.operations WHERE phase='baseline' AND view_name=v AND role_name=r AND operation=op;
     PERFORM test.ok(code=expected,p||' original-role equivalence '||v||' '||r||' '||op);
    END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 PERFORM test.ok(test.snapshot()=(SELECT snapshot FROM test.initial),p||' complete metadata/base content unchanged');
END $$;
SELECT test.phase('baseline',false);
\ir ../migrations/20261109201840_contain_legacy_view_access.sql
SELECT test.phase('forward',true);
\ir ../rollback/20261109201840_contain_legacy_view_access_rollback.sql
SELECT test.phase('rollback',false);
\ir ../migrations/20261109201840_contain_legacy_view_access.sql
SELECT test.phase('reapply',true);
SELECT count(*) AS assertions_passed FROM test.assertions;
SELECT * FROM test.operations ORDER BY phase,view_name,role_name,operation;
