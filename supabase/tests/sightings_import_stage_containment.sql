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

GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.qc_conflicting_survey_ids TO service_role;

CREATE VIEW public.qc_duplicate_survey_ids AS
 SELECT sightings_import_stage.pk_survey_id,
    count(*) AS row_count
   FROM sightings_import_stage
  GROUP BY sightings_import_stage.pk_survey_id
 HAVING count(*) > 1;

GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.qc_duplicate_survey_ids TO service_role;

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

GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.v_sightings_import_stage_typed TO service_role;


CREATE SCHEMA test;
CREATE TABLE test.assertions(phase text,label text);
CREATE TABLE test.operations(phase text,relation_name text,role_name text,operation text,privilege_present boolean,sqlstate text,affected_rows bigint,rows_during bigint);
CREATE FUNCTION test.ok(p text,value boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed [%]: %',p,label; END IF; INSERT INTO test.assertions VALUES(p,label); END $$;
CREATE FUNCTION test.snapshot() RETURNS jsonb LANGUAGE sql AS $$
SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'options',c.reloptions,
 'definition',CASE WHEN c.relkind='v' THEN pg_get_viewdef(c.oid,true) END,
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attacl,pg_get_expr(ad.adbin,ad.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY conname) FROM pg_constraint WHERE conrelid=c.oid OR confrelid=c.oid),
 'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY tgname) FROM pg_trigger WHERE tgrelid=c.oid),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY polname) FROM pg_policy p WHERE polrelid=c.oid),
 'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid) ORDER BY indexrelid) FROM pg_index WHERE indrelid=c.oid),
 'dependencies',(SELECT jsonb_agg(jsonb_build_array(d.refclassid,d.refobjid,d.refobjsubid,d.deptype) ORDER BY d.refclassid,d.refobjid,d.refobjsubid,d.deptype) FROM pg_rewrite r JOIN pg_depend d ON d.objid=r.oid AND d.classid='pg_rewrite'::regclass WHERE r.ev_class=c.oid)) ORDER BY c.relname) FROM pg_class c WHERE c.oid IN ('sightings_import_stage'::regclass,'qc_conflicting_survey_ids'::regclass,'qc_duplicate_survey_ids'::regclass,'v_sightings_import_stage_typed'::regclass)),
 'count',(SELECT count(*) FROM sightings_import_stage),
 'fingerprint',(SELECT md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM sightings_import_stage t),
 'rows',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM sightings_import_stage t),
 'view_acl',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relacl) ORDER BY c.relname) FROM pg_class c WHERE c.oid IN ('qc_conflicting_survey_ids'::regclass,'qc_duplicate_survey_ids'::regclass,'v_sightings_import_stage_typed'::regclass)),
 'view_results',jsonb_build_object('conflicts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM qc_conflicting_survey_ids t),'duplicates',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM qc_duplicate_survey_ids t),'typed',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM v_sightings_import_stage_typed t)));
$$;
CREATE TABLE test.initial AS SELECT test.snapshot() snapshot;
SELECT test.ok('fixture',(SELECT count(*)=28 AND bool_and(atttypid='text'::regtype AND NOT attnotnull AND NOT atthasdef) FROM pg_attribute WHERE attrelid='sightings_import_stage'::regclass AND attnum>0 AND NOT attisdropped),'28 nullable text columns without defaults');
SELECT test.ok('fixture',(SELECT count(*)=0 FROM pg_constraint WHERE conrelid='sightings_import_stage'::regclass OR confrelid='sightings_import_stage'::regclass),'no constraints');
SELECT test.ok('fixture',(SELECT count(*)=0 FROM pg_trigger WHERE tgrelid='sightings_import_stage'::regclass),'no triggers');
SELECT test.ok('fixture',(SELECT count(*)=0 FROM pg_index WHERE indrelid='sightings_import_stage'::regclass),'no indexes');
SELECT test.ok('fixture',(SELECT count(*)=0 FROM pg_policy WHERE polrelid='sightings_import_stage'::regclass),'no policies');
SELECT test.ok('fixture',(SELECT count(*)=1 AND min(row_count)=2 FROM qc_duplicate_survey_ids),'duplicates detected');
SELECT test.ok('fixture',(SELECT count(*)=2 FROM v_sightings_import_stage_typed WHERE pk_survey_id=1 AND sighting_date='2020-01-02' AND latitude=20.5 AND longitude=-156.5 AND total_mantas=2 AND notes='SYNTHETIC'),'real conversion expressions');
SELECT test.ok('fixture',(SELECT count(*)=1 FROM v_sightings_import_stage_typed WHERE pk_survey_id IS NULL AND year IS NULL AND latitude IS NULL AND total_mantas IS NULL),'invalid numeric inputs guarded');
DO $$ BEGIN
 BEGIN
  INSERT INTO sightings_import_stage(pk_survey_id,date2,total_mantas) VALUES('1','01/03/20','3');
  IF NOT EXISTS(SELECT 1 FROM qc_conflicting_survey_ids WHERE pk_survey_id='1' AND raw_rows=3 AND distinct_payloads=2) THEN RAISE EXCEPTION 'conflict detection failed'; END IF;
  RAISE EXCEPTION USING ERRCODE='Z0001';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL; END;
 PERFORM test.ok('fixture',test.snapshot()=(SELECT snapshot FROM test.initial),'conflict fixture rolled back');
END $$;
CREATE FUNCTION test.phase(p text,contained boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rel text; r text; priv text; op text; stmt text; code text; allowed boolean; n bigint; during bigint; before_state jsonb; expected test.operations%ROWTYPE;
BEGIN
 FOREACH rel IN ARRAY ARRAY['sightings_import_stage','qc_conflicting_survey_ids','qc_duplicate_survey_ids','v_sightings_import_stage_typed'] LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   allowed:=r='service_role' OR (rel='sightings_import_stage' AND r='authenticated' AND NOT contained);
   FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    PERFORM test.ok(p,has_table_privilege(r,('public.'||rel)::regclass,priv)=allowed,'exact ACL '||rel||' '||r||' '||priv);
   END LOOP;
   FOREACH op IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
    IF rel<>'sightings_import_stage' AND NOT (op='SELECT' OR (rel='v_sightings_import_stage_typed' AND op='DELETE')) THEN CONTINUE; END IF;
    stmt:=CASE op WHEN 'SELECT' THEN format('SELECT * FROM public.%I',rel) WHEN 'INSERT' THEN format('INSERT INTO public.%I(pk_survey_id) VALUES (''999'')',rel) WHEN 'UPDATE' THEN format('UPDATE public.%I SET notes=''probe'' WHERE pk_survey_id=''2''',rel) WHEN 'DELETE' THEN format('DELETE FROM public.%I WHERE pk_survey_id=''2''',rel) ELSE format('TRUNCATE public.%I',rel) END;
    before_state:=test.snapshot(); n:=NULL; during:=NULL;
    BEGIN
     PERFORM set_config('role',r,true);
     EXECUTE stmt; GET DIAGNOSTICS n=ROW_COUNT;
     -- Reset only after the operation; data inspection is performed as fixture owner.
     PERFORM set_config('role','postgres',true);
     SELECT count(*) INTO during FROM sightings_import_stage;
     RAISE EXCEPTION USING ERRCODE='Z0001',MESSAGE='rollback successful synthetic operation';
    EXCEPTION WHEN SQLSTATE 'Z0001' THEN code:='00000'; WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE;
    END;
    INSERT INTO test.operations VALUES(p,rel,r,op,has_table_privilege(r,('public.'||rel)::regclass,op),code,n,during);
    PERFORM test.ok(p,test.snapshot()=before_state,'operation rollback '||rel||' '||r||' '||op);
    PERFORM test.ok(p,code=CASE WHEN allowed THEN '00000' ELSE '42501' END,'effective operation '||rel||' '||r||' '||op);
    IF allowed THEN
     PERFORM test.ok(p,n=CASE WHEN op='SELECT' THEN CASE rel WHEN 'qc_conflicting_survey_ids' THEN 0 WHEN 'qc_duplicate_survey_ids' THEN 1 ELSE 4 END WHEN op='TRUNCATE' THEN 0 ELSE 1 END,'affected rows '||rel||' '||r||' '||op);
     PERFORM test.ok(p,during=CASE op WHEN 'INSERT' THEN 5 WHEN 'DELETE' THEN 3 WHEN 'TRUNCATE' THEN 0 ELSE 4 END,'rows during probe '||rel||' '||r||' '||op);
    END IF;
    IF r='service_role' AND p<>'baseline' THEN
     SELECT * INTO STRICT expected FROM test.operations WHERE phase='baseline' AND relation_name=rel AND role_name=r AND operation=op;
     PERFORM test.ok(p,ROW(code,n,during) IS NOT DISTINCT FROM ROW(expected.sqlstate,expected.affected_rows,expected.rows_during),'service equivalence '||rel||' '||op);
    END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 PERFORM test.ok(p,test.snapshot()=(SELECT snapshot FROM test.initial),'all structure/content/view fingerprints unchanged');
 PERFORM test.ok(p,(38-CASE WHEN has_table_privilege('authenticated','sightings_import_stage','SELECT') THEN 0 ELSE 1 END)=CASE WHEN contained THEN 37 ELSE 38 END,'projected base metric');
 PERFORM test.ok(p,NOT EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('qc_conflicting_survey_ids'::regclass,'qc_duplicate_survey_ids'::regclass,'v_sightings_import_stage_typed'::regclass) AND has_table_privilege('authenticated',oid,'SELECT')),'zero view exposure delta; global 135 unchanged');
END $$;
SELECT test.phase('baseline',false);
\ir ../migrations/20261110021144_contain_sightings_import_stage_access.sql
SELECT test.phase('forward',true);
\ir ../rollback/20261110021144_contain_sightings_import_stage_access_rollback.sql
SELECT test.phase('rollback',false);
\ir ../migrations/20261110021144_contain_sightings_import_stage_access.sql
SELECT test.phase('reapply',true);
SELECT phase,count(*) assertions_passed FROM test.assertions GROUP BY phase ORDER BY phase;
SELECT count(*) total_assertions FROM test.assertions;
SELECT count(*) operation_probes FROM test.operations;
SELECT * FROM test.operations ORDER BY phase,relation_name,role_name,operation;
