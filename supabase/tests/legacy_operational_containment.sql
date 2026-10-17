-- DISPOSABLE LOCAL DATABASE ONLY. Synthetic rows, captured column types/view SQL.
-- Table fixtures omit production defaults/FKs/checks; this test isolates ACL behavior.
-- Exact live seven-privilege baseline, owner postgres and disabled RLS are reproduced.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
GRANT USAGE, CREATE ON SCHEMA public TO anon,authenticated,service_role;
CREATE FUNCTION assert_ok(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION assert_denied(q text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE q; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: %',label; RETURN; END; RAISE EXCEPTION 'FAIL: expected 42501: %',label; END $$;
CREATE FUNCTION fixture_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TABLE public.contractor_vessel_documents ("id" uuid PRIMARY KEY,"vessel_id" uuid,"document_type" text,"file_path" text,"file_name" text,"notes" text,"uploaded_at" timestamp with time zone);
CREATE TABLE public.contractor_work_log_divers ("id" uuid PRIMARY KEY,"work_log_id" uuid,"diver_id" uuid,"worked" boolean,"dive_count" integer,"day_rate_override" numeric(10,2),"notes" text,"created_at" timestamp with time zone,"updated_at" timestamp with time zone,"payment_status" text,"paid_date" date,"diver_invoice_id" uuid,"invoice_status" text,"diver_invoice_item_id" uuid);
CREATE TABLE public.contractor_work_logs ("id" uuid PRIMARY KEY,"work_date" date,"project_name" text,"location_name" text,"vessel_id" uuid,"dedicated_captain" boolean,"weather_day" boolean,"notes" text,"created_at" timestamp with time zone,"updated_at" timestamp with time zone,"project_task_code_id" uuid,"vessel_invoice_id" uuid,"vessel_invoice_status" text,"vessel_payment_status" text);
CREATE TABLE public.contractors_divers ("id" uuid PRIMARY KEY,"full_name" text,"email" text,"phone" text,"default_day_rate" numeric(10,2),"qb_vendor_ref" text,"is_active" boolean,"notes" text,"created_at" timestamp with time zone,"updated_at" timestamp with time zone);
CREATE TABLE public.contractors_vessels ("id" uuid PRIMARY KEY,"vendor_name" text,"contact_name" text,"email" text,"phone" text,"vessel_name" text,"weekly_rate" numeric(10,2),"no_captain_deduction" numeric(10,2),"qb_vendor_ref" text,"is_active" boolean,"notes" text,"created_at" timestamp with time zone,"updated_at" timestamp with time zone,"daily_rate" numeric(12,2),"owner_name" text,"owner_email" text,"owner_phone" text,"insurance_file_path" text,"insurance_file_name" text,"photo_file_path" text,"photo_file_name" text,"contract_file_path" text,"contract_file_name" text);
CREATE TABLE public.project_task_codes ("id" uuid PRIMARY KEY,"client_id" uuid,"contract_id" uuid,"task_code" text,"task_name" text,"description" text,"is_billable" boolean,"is_active" boolean,"sort_order" integer,"created_at" timestamp with time zone,"updated_at" timestamp with time zone);
CREATE TABLE public.contractor_credentials ("id" uuid PRIMARY KEY,"diver_id" uuid,"doc_type" text,"file_path" text,"issue_date" date,"expiration_date" date,"notes" text,"created_at" timestamp with time zone,"updated_at" timestamp with time zone,"doc_category" text,"doc_subtype" text,"verification_status" text,"is_required" boolean,"ach_received" boolean,"ach_verified" boolean,"payment_ready" boolean,"ss_card_received" boolean,"ss_card_verified" boolean);

INSERT INTO contractors_divers(id,full_name,default_day_rate) VALUES('00000000-0000-0000-0000-000000000001','Synthetic diver',100);
INSERT INTO contractors_vessels(id,vendor_name,vessel_name,weekly_rate,no_captain_deduction) VALUES('00000000-0000-0000-0000-000000000001','Synthetic vendor','Synthetic vessel',700,10);
INSERT INTO contractor_work_logs(id,work_date,vessel_id,weather_day,dedicated_captain) VALUES('00000000-0000-0000-0000-000000000001','2026-01-01','00000000-0000-0000-0000-000000000001',false,false);
INSERT INTO contractor_work_log_divers(id,work_log_id,diver_id,worked,dive_count) VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001',true,2);
INSERT INTO project_task_codes(id,task_code) VALUES('00000000-0000-0000-0000-000000000001','SYNTHETIC');
INSERT INTO contractor_vessel_documents(id,vessel_id,file_name) VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','synthetic.txt');
INSERT INTO contractor_credentials(id,diver_id,doc_category,doc_subtype,expiration_date,verification_status) VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','dive_credential','cpr','2099-01-01','verified');
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON contractor_credentials TO service_role;
CREATE VIEW public.v_contractor_diver_clearance_status AS  WITH required_docs AS (
         SELECT t.doc_subtype,
            t.doc_category
           FROM ( VALUES ('aaus_reciprocity'::text,'dive_credential'::text), ('medical_clearance'::text,'dive_credential'::text), ('cpr'::text,'dive_credential'::text), ('first_aid'::text,'dive_credential'::text), ('oxygen_provider'::text,'dive_credential'::text)) t(doc_subtype, doc_category)
        ), latest_docs AS (
         SELECT DISTINCT ON (c.diver_id, c.doc_category, c.doc_subtype) c.diver_id,
            c.doc_category,
            c.doc_subtype,
            c.expiration_date,
            c.verification_status
           FROM contractor_credentials c
          ORDER BY c.diver_id, c.doc_category, c.doc_subtype, c.expiration_date DESC NULLS LAST, c.created_at DESC
        ), doc_matrix AS (
         SELECT d.id AS diver_id,
            d.full_name,
            r.doc_category,
            r.doc_subtype,
            ld.expiration_date,
            ld.verification_status
           FROM contractors_divers d
             CROSS JOIN required_docs r
             LEFT JOIN latest_docs ld ON ld.diver_id = d.id AND ld.doc_category = r.doc_category AND ld.doc_subtype = r.doc_subtype
        )
 SELECT doc_matrix.diver_id,
    doc_matrix.full_name,
        CASE
            WHEN count(*) FILTER (WHERE doc_matrix.expiration_date IS NULL) > 0 THEN 'missing'::text
            WHEN count(*) FILTER (WHERE doc_matrix.verification_status = 'rejected'::text) > 0 THEN 'missing'::text
            WHEN count(*) FILTER (WHERE doc_matrix.expiration_date < CURRENT_DATE) > 0 THEN 'expired'::text
            WHEN count(*) FILTER (WHERE doc_matrix.expiration_date <= (CURRENT_DATE + 30)) > 0 THEN 'expiring_soon'::text
            ELSE 'cleared'::text
        END AS clearance_status,
    count(*) FILTER (WHERE doc_matrix.expiration_date IS NULL OR doc_matrix.verification_status = 'rejected'::text) AS missing_required_count,
    count(*) FILTER (WHERE doc_matrix.expiration_date < CURRENT_DATE) AS expired_required_count,
    count(*) FILTER (WHERE doc_matrix.expiration_date >= CURRENT_DATE AND doc_matrix.expiration_date <= (CURRENT_DATE + 30)) AS expiring_soon_count
   FROM doc_matrix
  GROUP BY doc_matrix.diver_id, doc_matrix.full_name;
CREATE VIEW public.v_contractor_diver_monthly_summary AS  SELECT date_trunc('month'::text, wl.work_date::timestamp with time zone)::date AS month_start,
    d.id AS diver_id,
    d.full_name,
    count(*) FILTER (WHERE wld.worked = true AND wl.weather_day = false) AS worked_days,
    COALESCE(sum(
        CASE
            WHEN wld.worked = true AND wl.weather_day = false THEN COALESCE(wld.day_rate_override, d.default_day_rate)
            ELSE 0::numeric
        END), 0::numeric)::numeric(10,2) AS total_due,
    COALESCE(sum(
        CASE
            WHEN wld.worked = true AND wl.weather_day = false THEN wld.dive_count
            ELSE 0
        END), 0::bigint) AS total_dives
   FROM contractors_divers d
     LEFT JOIN contractor_work_log_divers wld ON wld.diver_id = d.id
     LEFT JOIN contractor_work_logs wl ON wl.id = wld.work_log_id
  GROUP BY (date_trunc('month'::text, wl.work_date::timestamp with time zone)::date), d.id, d.full_name;
CREATE VIEW public.v_contractor_vessel_monthly_summary AS  SELECT date_trunc('month'::text, wl.work_date::timestamp with time zone)::date AS month_start,
    v.id AS vessel_id,
    v.vendor_name,
    v.vessel_name,
    count(*) FILTER (WHERE wl.weather_day = false) AS vessel_days,
    count(*) FILTER (WHERE wl.weather_day = false AND wl.dedicated_captain = false) AS no_captain_days,
    COALESCE(sum(
        CASE
            WHEN wl.weather_day = false THEN v.weekly_rate / 7.0 -
            CASE
                WHEN wl.dedicated_captain = false THEN v.no_captain_deduction
                ELSE 0::numeric
            END
            ELSE 0::numeric
        END), 0::numeric)::numeric(10,2) AS total_due
   FROM contractors_vessels v
     LEFT JOIN contractor_work_logs wl ON wl.vessel_id = v.id
  GROUP BY (date_trunc('month'::text, wl.work_date::timestamp with time zone)::date), v.id, v.vendor_name, v.vessel_name;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.contractors_divers TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.contractors_vessels TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.contractor_work_logs TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.contractor_work_log_divers TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.project_task_codes TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.contractor_vessel_documents TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.v_contractor_diver_clearance_status TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.v_contractor_diver_monthly_summary TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.v_contractor_vessel_monthly_summary TO authenticated,service_role;
CREATE FUNCTION fixture_state(t regclass) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE contents jsonb;
BEGIN
EXECUTE format('SELECT jsonb_build_object(''count'',count(*),''hash'',md5(coalesce(string_agg(to_jsonb(x)::text,'''' ORDER BY to_jsonb(x)::text),''''))) FROM %s x',t) INTO contents;
RETURN jsonb_build_object('data',contents,
'relation',(SELECT jsonb_build_object('owner',relowner,'rls',relrowsecurity,'force',relforcerowsecurity,'options',reloptions,'view',CASE WHEN relkind='v' THEN pg_get_viewdef(oid,true) END) FROM pg_class WHERE oid=t),
'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY attnum) FROM pg_attribute a WHERE attrelid=t),
'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY oid) FROM pg_constraint c WHERE conrelid=t),
'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY indexrelid) FROM pg_index i WHERE indrelid=t));
END $$;
CREATE TEMP TABLE baseline AS SELECT c.oid,c.relname,c.relkind,fixture_state(c.oid) state,
(SELECT jsonb_agg(to_jsonb(a) ORDER BY grantor,grantee,privilege_type) FROM aclexplode(c.relacl) a) acl,
(SELECT jsonb_agg(to_jsonb(a) ORDER BY grantor,grantee,privilege_type) FROM aclexplode(c.relacl) a WHERE grantee='service_role'::regrole) service_acl
FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('contractors_divers','contractors_vessels','contractor_work_logs','contractor_work_log_divers','project_task_codes','contractor_vessel_documents','v_contractor_diver_clearance_status','v_contractor_diver_monthly_summary','v_contractor_vessel_monthly_summary');
CREATE FUNCTION check_contained() RETURNS void LANGUAGE plpgsql AS $$
DECLARE b record; r text; p text; count_rows bigint;
BEGIN
FOR b IN SELECT * FROM baseline ORDER BY relname LOOP
FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
PERFORM assert_ok(NOT has_table_privilege(r,b.oid,p),b.relname||' '||r||' '||p||' absent');
END LOOP;
EXECUTE format('SET LOCAL ROLE %I',r);
PERFORM assert_denied(format('SELECT * FROM public.%I',b.relname),b.relname||' '||r||' SELECT');
-- Actual mutation denial probes only for tables, never non-updatable views.
IF b.relkind='r' THEN
PERFORM assert_denied(format('INSERT INTO public.%I(id) VALUES(''00000000-0000-0000-0000-000000000002'')',b.relname),b.relname||' INSERT');
PERFORM assert_denied(format('UPDATE public.%I SET id=id WHERE false',b.relname),b.relname||' UPDATE');
PERFORM assert_denied(format('DELETE FROM public.%I WHERE false',b.relname),b.relname||' DELETE');
PERFORM assert_denied(format('TRUNCATE public.%I',b.relname),b.relname||' TRUNCATE');
PERFORM assert_denied(format('CREATE TABLE public.ref_probe(id uuid REFERENCES public.%I(id))',b.relname),b.relname||' REFERENCES');
PERFORM assert_denied(format('CREATE TRIGGER probe BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION fixture_trigger()',b.relname),b.relname||' TRIGGER');
END IF;
RESET ROLE;
END LOOP;
PERFORM assert_ok(b.service_acl=(SELECT jsonb_agg(to_jsonb(a) ORDER BY grantor,grantee,privilege_type) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=b.oid AND grantee='service_role'::regrole),b.relname||' service exact ACL');
SET LOCAL ROLE service_role;
EXECUTE format('SELECT count(*) FROM public.%I',b.relname) INTO count_rows;
PERFORM assert_ok(count_rows>0,b.relname||' service SELECT works');
RESET ROLE;
PERFORM assert_ok(b.state=fixture_state(b.oid),b.relname||' contents/definition/ownership/RLS unchanged');
END LOOP;
END $$;
-- Demonstrate the original owner-security indirect exposure using synthetic rows.
SET ROLE authenticated;
SELECT assert_ok((SELECT count(*) FROM v_contractor_diver_clearance_status)=1,'baseline owner-security view readable despite credential-table denial');
RESET ROLE;
\ir ../migrations/20261017005114_contain_legacy_operational_tables_and_views.sql
SELECT check_contained();
\ir ../rollback/20261017005114_contain_legacy_operational_tables_and_views_rollback.sql
SELECT assert_ok(acl=(SELECT jsonb_agg(to_jsonb(a) ORDER BY grantor,grantee,privilege_type) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=baseline.oid),relname||' exact rollback ACL') FROM baseline;
SELECT assert_ok(state=fixture_state(oid),relname||' rollback contents/definition/ownership/RLS unchanged') FROM baseline;
\ir ../migrations/20261017005114_contain_legacy_operational_tables_and_views.sql
SELECT check_contained();
