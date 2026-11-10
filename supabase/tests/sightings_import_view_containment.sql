-- DISPOSABLE DATABASE ONLY. Exact Production view definitions; synthetic rows.

-- Base column types match Production; no live data or credentials.

\set ON_ERROR_STOP on

CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;

GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;

CREATE TABLE public.sightings_import_stage("pk_survey_id" text,"date2" text,"month_name" text,"year" text,"survey_no" text,"sighting_no" text,"island" text,"region" text,"sitelocation" text,"latitude" text,"longitude" text,"start_time" text,"end_time" text,"organization" text,"photographer" text,"total_mantas" text,"skunks" text,"behavior" text,"injuries_observed" text,"tidal_state" text,"day_night" text,"notes" text,"standardize_survey" text,"total_manta_ids" text,"list_manta_ids" text,"total_mantas_sized" text,"total_mantas_biopsied" text,"total_survey_time" text);

GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON sightings_import_stage TO authenticated,service_role;

INSERT INTO sightings_import_stage(pk_survey_id,date2,year,latitude,longitude,total_mantas,notes) VALUES ('1','01/02/20','2020','20.5','-156.5','2',' SYNTHETIC '),('1','01/02/20','2020','20.5','-156.5','2',' SYNTHETIC '),('2','02/03/21','2021','21','-157','1','SYNTHETIC UNIQUE'),('bad','','invalid','invalid','','bad','SYNTHETIC NULLS');

CREATE VIEW public.qc_conflicting_survey_ids AS
 SELECT sightings_import_stage.pk_survey_id,
    count(*) AS raw_rows,
    count(DISTINCT (((((((((((((COALESCE(sightings_import_stage.date2, ''::text) || '|'::text) || COALESCE(sightings_import_stage.survey_no, ''::text)) || '|'::text) || COALESCE(sightings_import_stage.sighting_no, ''::text)) || '|'::text) || COALESCE(sightings_import_stage.island, ''::text)) || '|'::text) || COALESCE(sightings_import_stage.region, ''::text)) || '|'::text) || COALESCE(sightings_import_stage.sitelocation, ''::text)) || '|'::text) || COALESCE(sightings_import_stage.total_mantas, ''::text)) || '|'::text) || COALESCE(sightings_import_stage.list_manta_ids, ''::text)) AS distinct_payloads
   FROM sightings_import_stage
  GROUP BY sightings_import_stage.pk_survey_id
 HAVING count(*) > 1 AND count(DISTINCT (((((((((((((COALESCE(sightings_import_stage.date2, ''::text) || '|'::text) || COALESCE(sightings_import_stage.survey_no, ''::text)) || '|'::text) || COALESCE(sightings_import_stage.sighting_no, ''::text)) || '|'::text) || COALESCE(sightings_import_stage.island, ''::text)) || '|'::text) || COALESCE(sightings_import_stage.region, ''::text)) || '|'::text) || COALESCE(sightings_import_stage.sitelocation, ''::text)) || '|'::text) || COALESCE(sightings_import_stage.total_mantas, ''::text)) || '|'::text) || COALESCE(sightings_import_stage.list_manta_ids, ''::text)) > 1;

GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.qc_conflicting_survey_ids TO authenticated,service_role;

CREATE VIEW public.qc_duplicate_survey_ids AS
 SELECT sightings_import_stage.pk_survey_id,
    count(*) AS row_count
   FROM sightings_import_stage
  GROUP BY sightings_import_stage.pk_survey_id
 HAVING count(*) > 1;

GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.qc_duplicate_survey_ids TO authenticated,service_role;

CREATE VIEW public.v_sightings_import_stage_typed AS
 SELECT
        CASE
            WHEN NULLIF(TRIM(BOTH FROM sightings_import_stage.pk_survey_id), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM sightings_import_stage.pk_survey_id)::integer
            ELSE NULL::integer
        END AS pk_survey_id,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM sightings_import_stage.date2), ''::text) IS NOT NULL THEN to_date(TRIM(BOTH FROM sightings_import_stage.date2), 'MM/DD/YY'::text)
            ELSE NULL::date
        END AS sighting_date,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.month_name), ''::text) AS month_name,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM sightings_import_stage.year), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM sightings_import_stage.year)::integer
            ELSE NULL::integer
        END AS year,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM sightings_import_stage.survey_no), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM sightings_import_stage.survey_no)::integer
            ELSE NULL::integer
        END AS survey_no,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM sightings_import_stage.sighting_no), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM sightings_import_stage.sighting_no)::integer
            ELSE NULL::integer
        END AS sighting_no,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.island), ''::text) AS island,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.region), ''::text) AS region,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.sitelocation), ''::text) AS sitelocation,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM sightings_import_stage.latitude), ''::text) ~ '^[-+]?[0-9]*\.?[0-9]+$'::text THEN TRIM(BOTH FROM sightings_import_stage.latitude)::numeric
            ELSE NULL::numeric
        END AS latitude,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM sightings_import_stage.longitude), ''::text) ~ '^[-+]?[0-9]*\.?[0-9]+$'::text THEN TRIM(BOTH FROM sightings_import_stage.longitude)::numeric
            ELSE NULL::numeric
        END AS longitude,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.start_time), ''::text) AS start_time,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.end_time), ''::text) AS end_time,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.organization), ''::text) AS organization,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.photographer), ''::text) AS photographer,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM sightings_import_stage.total_mantas), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM sightings_import_stage.total_mantas)::integer
            ELSE NULL::integer
        END AS total_mantas,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.skunks), ''::text) AS skunks,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.behavior), ''::text) AS behavior,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.injuries_observed), ''::text) AS injuries_observed,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.tidal_state), ''::text) AS tidal_state,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.day_night), ''::text) AS day_night,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.notes), ''::text) AS notes,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.standardize_survey), ''::text) AS standardize_survey,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM sightings_import_stage.total_manta_ids), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM sightings_import_stage.total_manta_ids)::integer
            ELSE NULL::integer
        END AS total_manta_ids,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.list_manta_ids), ''::text) AS list_manta_ids,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM sightings_import_stage.total_mantas_sized), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM sightings_import_stage.total_mantas_sized)::integer
            ELSE NULL::integer
        END AS total_mantas_sized,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM sightings_import_stage.total_mantas_biopsied), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM sightings_import_stage.total_mantas_biopsied)::integer
            ELSE NULL::integer
        END AS total_mantas_biopsied,
    NULLIF(TRIM(BOTH FROM sightings_import_stage.total_survey_time), ''::text) AS total_survey_time
   FROM sightings_import_stage;

GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.v_sightings_import_stage_typed TO authenticated,service_role;

CREATE SCHEMA test;
CREATE TABLE test.assertions(label text);
CREATE TABLE test.operations(phase text,view_name text,role_name text,operation text,privilege_present boolean,structural_mask integer,sqlstate text);
CREATE FUNCTION test.ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; INSERT INTO test.assertions VALUES(label); END $$;
CREATE FUNCTION test.snapshot() RETURNS jsonb LANGUAGE sql AS $$
SELECT jsonb_build_object('views',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,'options',c.reloptions,'definition',pg_get_viewdef(c.oid,true),'definition_md5',md5(pg_get_viewdef(c.oid,true)),'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid,a.atttypmod,a.attacl) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'dependencies',(SELECT jsonb_agg(jsonb_build_array(d.refclassid,d.refobjid,d.refobjsubid,d.deptype) ORDER BY d.refclassid,d.refobjid,d.refobjsubid,d.deptype) FROM pg_rewrite r JOIN pg_depend d ON d.objid=r.oid AND d.classid='pg_rewrite'::regclass WHERE r.ev_class=c.oid),'mask',pg_relation_is_updatable(c.oid,true)) ORDER BY c.relname) FROM pg_class c WHERE c.oid IN ('qc_conflicting_survey_ids'::regclass,'qc_duplicate_survey_ids'::regclass,'v_sightings_import_stage_typed'::regclass)),
'base_meta',(SELECT to_jsonb(c) FROM pg_class c WHERE c.oid='sightings_import_stage'::regclass),
'stage',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM sightings_import_stage t));
$$;
CREATE FUNCTION test.results() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('conflicts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM qc_conflicting_survey_ids t),'duplicates',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM qc_duplicate_survey_ids t),'typed',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM v_sightings_import_stage_typed t)); $$;
CREATE TABLE test.initial AS SELECT test.snapshot() snapshot,test.results() results;
SELECT test.ok((SELECT count(*)=0 FROM qc_conflicting_survey_ids),'fixture no false conflict');
SELECT test.ok((SELECT count(*)=1 AND min(row_count)=2 FROM qc_duplicate_survey_ids),'fixture duplicate detection');
SELECT test.ok((SELECT count(*)=4 FROM v_sightings_import_stage_typed),'fixture typed row count');
SELECT test.ok((SELECT count(*)=2 FROM v_sightings_import_stage_typed WHERE pk_survey_id=1 AND sighting_date='2020-01-02' AND latitude=20.5 AND longitude=-156.5 AND total_mantas=2 AND notes='SYNTHETIC'),'fixture typed conversion');
SELECT test.ok((SELECT count(*)=1 FROM v_sightings_import_stage_typed WHERE pk_survey_id IS NULL AND sighting_date IS NULL AND year IS NULL AND latitude IS NULL AND total_mantas IS NULL),'fixture guarded null conversion');
DO $$ BEGIN
 BEGIN
  INSERT INTO sightings_import_stage(pk_survey_id,date2,total_mantas) VALUES('1','01/03/20','3');
  IF NOT EXISTS(SELECT 1 FROM qc_conflicting_survey_ids WHERE pk_survey_id='1' AND raw_rows=3 AND distinct_payloads=2) THEN RAISE EXCEPTION 'conflict detection failed'; END IF;
  RAISE EXCEPTION USING ERRCODE='Z0001';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL; END;
 PERFORM test.ok(test.snapshot()=(SELECT snapshot FROM test.initial),'conflict fixture rolled back');
END $$;
CREATE FUNCTION test.phase(p text,contained boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v text; r text; priv text; op text; stmt text; code text; mask integer; allowed boolean; col text; lit text; expected text; before_state jsonb;
BEGIN
 FOREACH v IN ARRAY ARRAY['qc_conflicting_survey_ids','qc_duplicate_survey_ids','v_sightings_import_stage_typed'] LOOP
  mask:=pg_relation_is_updatable(('public.'||v)::regclass,true);
  PERFORM test.ok(mask=CASE v WHEN 'v_sightings_import_stage_typed' THEN 16 ELSE 0 END,p||' updatability '||v);
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    allowed:=r='service_role' OR (r='authenticated' AND NOT contained);
    PERFORM test.ok(has_table_privilege(r,('public.'||v)::regclass,priv)=allowed,p||' ACL '||v||' '||r||' '||priv);
   END LOOP;
   FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
    col:='pk_survey_id';
    lit:='999';
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
     PERFORM test.ok((code='00000')=(op='SELECT' OR (v='v_sightings_import_stage_typed' AND op='DELETE')),p||' baseline structural outcome '||v||' '||r||' '||op);
    ELSE
     SELECT sqlstate INTO expected FROM test.operations WHERE phase='baseline' AND view_name=v AND role_name=r AND operation=op;
     PERFORM test.ok(code=expected,p||' original-role equivalence '||v||' '||r||' '||op);
    END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 PERFORM test.ok(test.snapshot()=(SELECT snapshot FROM test.initial),p||' complete metadata/base content unchanged');
 PERFORM test.ok(test.results()=(SELECT results FROM test.initial),p||' full view results unchanged');
END $$;
SELECT test.phase('baseline',false);
\ir ../migrations/20261110011759_contain_sightings_import_view_access.sql
SELECT test.phase('forward',true);
\ir ../rollback/20261110011759_contain_sightings_import_view_access_rollback.sql
SELECT test.phase('rollback',false);
\ir ../migrations/20261110011759_contain_sightings_import_view_access.sql
SELECT test.phase('reapply',true);
SELECT count(*) AS assertions_passed FROM test.assertions;
SELECT * FROM test.operations ORDER BY phase,view_name,role_name,operation;
