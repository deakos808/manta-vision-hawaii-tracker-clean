\set ON_ERROR_STOP on
-- Disposable database only: realistic UUID/auth/profile and result fixtures.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text, is_active boolean);
INSERT INTO public.profiles VALUES
('00000000-0000-0000-0000-000000000001','contributor',true),
('00000000-0000-0000-0000-000000000002','admin',true),
('00000000-0000-0000-0000-000000000003','admin',false);
CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and is_active is true
  );
$function$;

REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated,service_role;
CREATE TABLE public.catalog(catalog_uuid uuid PRIMARY KEY);
CREATE TABLE public.mantas(manta_uuid uuid PRIMARY KEY);
CREATE TABLE public.manta_match_results(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
manta_id uuid UNIQUE REFERENCES public.mantas(manta_uuid) ON DELETE CASCADE,
fk_catalog_id uuid REFERENCES public.catalog(catalog_uuid) ON DELETE CASCADE,
true_match_rank integer, match_score double precision, flag_for_review boolean DEFAULT false,
inserted_at timestamptz DEFAULT now(), pk_manta_id integer, pk_catalog_id integer);
CREATE VIEW public.manta_match_results_view AS SELECT id,pk_manta_id,pk_catalog_id,true_match_rank,match_score,flag_for_review,inserted_at FROM public.manta_match_results;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.manta_match_results TO authenticated;
GRANT SELECT ON public.manta_match_results_view TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.manta_match_results, public.manta_match_results_view TO service_role;
INSERT INTO public.manta_match_results(id,pk_manta_id,pk_catalog_id,true_match_rank,match_score)
VALUES ('10000000-0000-0000-0000-000000000001',42,733,1,0.97);
CREATE FUNCTION public.assert_ok(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION public.assert_denied(statement text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: %',label; RETURN; END;
  RAISE EXCEPTION 'FAIL: expected permission denial: %',label;
END $$;
CREATE FUNCTION public.fixture_state() RETURNS jsonb LANGUAGE sql AS $$
SELECT jsonb_build_object(
'objects',(SELECT jsonb_agg(jsonb_build_object('name',relname,'acl',relacl::text,'rls',relrowsecurity,'force',relforcerowsecurity,'owner',relowner,'options',reloptions) ORDER BY relname) FROM pg_class WHERE oid IN ('public.manta_match_results'::regclass,'public.manta_match_results_view'::regclass)),
'view',pg_get_viewdef('public.manta_match_results_view',true),
'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY attnum) FROM pg_attribute a WHERE attrelid='public.manta_match_results'::regclass AND attnum>0),
'constraints',(SELECT jsonb_agg(pg_get_constraintdef(oid) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.manta_match_results'::regclass),
'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='public' AND tablename='manta_match_results'),
'admin_helper',pg_get_functiondef('public.is_admin_user()'::regprocedure),
'data',(SELECT md5(string_agg(to_jsonb(r)::text,'|' ORDER BY id)) FROM public.manta_match_results r));
$$;
CREATE TEMP TABLE baseline AS SELECT public.fixture_state() state;
\ir ../migrations/20261017080445_contain_match_result_diagnostics.sql
\echo 'forward'
SELECT public.assert_ok((SELECT bool_and(relowner='postgres'::regrole) FROM pg_class WHERE oid IN ('public.manta_match_results'::regclass,'public.manta_match_results_view'::regclass)),'forward: ownership unchanged');
SELECT public.assert_ok((SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_class WHERE oid='public.manta_match_results'::regclass),'forward: base RLS enabled');
SELECT public.assert_ok((SELECT reloptions=ARRAY['security_invoker=true'] FROM pg_class WHERE oid='public.manta_match_results_view'::regclass),'forward: invoker mode enabled');
SELECT public.assert_ok((public.fixture_state()->'data')=(SELECT state->'data' FROM baseline),'forward: content unchanged');
SELECT public.assert_ok((public.fixture_state()->'view')=(SELECT state->'view' FROM baseline),'forward: view query unchanged');
SELECT public.assert_ok((public.fixture_state()->'columns')=(SELECT state->'columns' FROM baseline),'forward: columns unchanged');
SELECT public.assert_ok((public.fixture_state()->'constraints')=(SELECT state->'constraints' FROM baseline),'forward: constraints unchanged');
SELECT public.assert_ok((public.fixture_state()->'admin_helper')=(SELECT state->'admin_helper' FROM baseline),'forward: admin helper unchanged');
SELECT public.assert_ok(has_table_privilege('service_role',t,p),'forward: service privilege '||t||' '||p) FROM unnest(ARRAY['manta_match_results','manta_match_results_view']) t CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
SELECT public.assert_ok(NOT has_table_privilege('anon',t,p),'forward: anon privilege absent '||t||' '||p) FROM unnest(ARRAY['manta_match_results','manta_match_results_view']) t CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
SET ROLE anon;
SELECT public.assert_denied('SELECT * FROM public.manta_match_results','forward: anon base SELECT');
SELECT public.assert_denied('SELECT * FROM public.manta_match_results_view','forward: anon view SELECT');
SELECT public.assert_denied('INSERT INTO public.manta_match_results(pk_manta_id) VALUES(9)','forward: anon mutation');
SELECT public.assert_denied('UPDATE public.manta_match_results SET match_score=0','forward: anon mutation');
SELECT public.assert_denied('DELETE FROM public.manta_match_results','forward: anon mutation');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=0,'forward: contributor base visibility');
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results_view)=0,'forward: contributor view visibility - no bypass');
-- Exact browser projection/order.
SELECT public.assert_ok((SELECT count(*) FROM (SELECT pk_manta_id,pk_catalog_id,true_match_rank,match_score FROM public.manta_match_results_view ORDER BY true_match_rank ASC) q)=0,'forward: contributor browser query');
SELECT public.assert_denied('INSERT INTO public.manta_match_results(pk_manta_id) VALUES(9)','forward: contributor mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results SET match_score=0','forward: contributor mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results','forward: contributor mutation denied');
SELECT public.assert_denied('INSERT INTO public.manta_match_results_view(pk_manta_id) VALUES(9)','forward: contributor mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results_view SET match_score=0','forward: contributor mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results_view','forward: contributor mutation denied');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=1,'forward: active admin base visibility');
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results_view)=1,'forward: active admin view visibility - no bypass');
-- Exact browser projection/order.
SELECT public.assert_ok((SELECT count(*) FROM (SELECT pk_manta_id,pk_catalog_id,true_match_rank,match_score FROM public.manta_match_results_view ORDER BY true_match_rank ASC) q)=1,'forward: active admin browser query');
SELECT public.assert_denied('INSERT INTO public.manta_match_results(pk_manta_id) VALUES(9)','forward: active admin mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results SET match_score=0','forward: active admin mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results','forward: active admin mutation denied');
SELECT public.assert_denied('INSERT INTO public.manta_match_results_view(pk_manta_id) VALUES(9)','forward: active admin mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results_view SET match_score=0','forward: active admin mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results_view','forward: active admin mutation denied');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=0,'forward: inactive admin base visibility');
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results_view)=0,'forward: inactive admin view visibility - no bypass');
-- Exact browser projection/order.
SELECT public.assert_ok((SELECT count(*) FROM (SELECT pk_manta_id,pk_catalog_id,true_match_rank,match_score FROM public.manta_match_results_view ORDER BY true_match_rank ASC) q)=0,'forward: inactive admin browser query');
SELECT public.assert_denied('INSERT INTO public.manta_match_results(pk_manta_id) VALUES(9)','forward: inactive admin mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results SET match_score=0','forward: inactive admin mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results','forward: inactive admin mutation denied');
SELECT public.assert_denied('INSERT INTO public.manta_match_results_view(pk_manta_id) VALUES(9)','forward: inactive admin mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results_view SET match_score=0','forward: inactive admin mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results_view','forward: inactive admin mutation denied');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=0,'forward: missing profile base visibility');
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results_view)=0,'forward: missing profile view visibility - no bypass');
-- Exact browser projection/order.
SELECT public.assert_ok((SELECT count(*) FROM (SELECT pk_manta_id,pk_catalog_id,true_match_rank,match_score FROM public.manta_match_results_view ORDER BY true_match_rank ASC) q)=0,'forward: missing profile browser query');
SELECT public.assert_denied('INSERT INTO public.manta_match_results(pk_manta_id) VALUES(9)','forward: missing profile mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results SET match_score=0','forward: missing profile mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results','forward: missing profile mutation denied');
SELECT public.assert_denied('INSERT INTO public.manta_match_results_view(pk_manta_id) VALUES(9)','forward: missing profile mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results_view SET match_score=0','forward: missing profile mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results_view','forward: missing profile mutation denied');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=0,'forward: no identity base visibility');
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results_view)=0,'forward: no identity view visibility - no bypass');
-- Exact browser projection/order.
SELECT public.assert_ok((SELECT count(*) FROM (SELECT pk_manta_id,pk_catalog_id,true_match_rank,match_score FROM public.manta_match_results_view ORDER BY true_match_rank ASC) q)=0,'forward: no identity browser query');
SELECT public.assert_denied('INSERT INTO public.manta_match_results(pk_manta_id) VALUES(9)','forward: no identity mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results SET match_score=0','forward: no identity mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results','forward: no identity mutation denied');
SELECT public.assert_denied('INSERT INTO public.manta_match_results_view(pk_manta_id) VALUES(9)','forward: no identity mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results_view SET match_score=0','forward: no identity mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results_view','forward: no identity mutation denied');
RESET ROLE;
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=1,'forward: service read');
INSERT INTO public.manta_match_results(id,pk_manta_id) VALUES('10000000-0000-0000-0000-000000000002',9);
UPDATE public.manta_match_results SET match_score=0.8 WHERE id='10000000-0000-0000-0000-000000000002';
SELECT public.assert_ok((SELECT match_score=0.8 FROM public.manta_match_results WHERE id='10000000-0000-0000-0000-000000000002'),'forward: service insert/update');
DELETE FROM public.manta_match_results WHERE id='10000000-0000-0000-0000-000000000002';
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=1,'forward: service delete');
ROLLBACK;
CREATE TEMP TABLE forward_state AS SELECT public.fixture_state() state;
\ir ../rollback/20261017080445_contain_match_result_diagnostics_rollback.sql
SELECT public.assert_ok(public.fixture_state()=(SELECT state FROM baseline),'rollback restores exact state');
\echo 'rollback'
SELECT public.assert_ok((SELECT bool_and(relowner='postgres'::regrole) FROM pg_class WHERE oid IN ('public.manta_match_results'::regclass,'public.manta_match_results_view'::regclass)),'rollback: ownership unchanged');
SELECT public.assert_ok((public.fixture_state()->'data')=(SELECT state->'data' FROM baseline),'rollback: content unchanged');
SELECT public.assert_ok((public.fixture_state()->'view')=(SELECT state->'view' FROM baseline),'rollback: view query unchanged');
SELECT public.assert_ok((public.fixture_state()->'columns')=(SELECT state->'columns' FROM baseline),'rollback: columns unchanged');
SELECT public.assert_ok((public.fixture_state()->'constraints')=(SELECT state->'constraints' FROM baseline),'rollback: constraints unchanged');
SELECT public.assert_ok((public.fixture_state()->'admin_helper')=(SELECT state->'admin_helper' FROM baseline),'rollback: admin helper unchanged');
SELECT public.assert_ok(has_table_privilege('service_role',t,p),'rollback: service privilege '||t||' '||p) FROM unnest(ARRAY['manta_match_results','manta_match_results_view']) t CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
SELECT public.assert_ok(NOT has_table_privilege('anon',t,p),'rollback: anon privilege absent '||t||' '||p) FROM unnest(ARRAY['manta_match_results','manta_match_results_view']) t CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
SET ROLE anon;
SELECT public.assert_denied('SELECT * FROM public.manta_match_results','rollback: anon base SELECT');
SELECT public.assert_denied('SELECT * FROM public.manta_match_results_view','rollback: anon view SELECT');
SELECT public.assert_denied('INSERT INTO public.manta_match_results(pk_manta_id) VALUES(9)','rollback: anon mutation');
SELECT public.assert_denied('UPDATE public.manta_match_results SET match_score=0','rollback: anon mutation');
SELECT public.assert_denied('DELETE FROM public.manta_match_results','rollback: anon mutation');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=1,'rollback: contributor base visibility');
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results_view)=1,'rollback: contributor view visibility - no bypass');
-- Exact browser projection/order.
SELECT public.assert_ok((SELECT count(*) FROM (SELECT pk_manta_id,pk_catalog_id,true_match_rank,match_score FROM public.manta_match_results_view ORDER BY true_match_rank ASC) q)=1,'rollback: contributor browser query');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=1,'rollback: active admin base visibility');
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results_view)=1,'rollback: active admin view visibility - no bypass');
-- Exact browser projection/order.
SELECT public.assert_ok((SELECT count(*) FROM (SELECT pk_manta_id,pk_catalog_id,true_match_rank,match_score FROM public.manta_match_results_view ORDER BY true_match_rank ASC) q)=1,'rollback: active admin browser query');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=1,'rollback: inactive admin base visibility');
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results_view)=1,'rollback: inactive admin view visibility - no bypass');
-- Exact browser projection/order.
SELECT public.assert_ok((SELECT count(*) FROM (SELECT pk_manta_id,pk_catalog_id,true_match_rank,match_score FROM public.manta_match_results_view ORDER BY true_match_rank ASC) q)=1,'rollback: inactive admin browser query');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=1,'rollback: missing profile base visibility');
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results_view)=1,'rollback: missing profile view visibility - no bypass');
-- Exact browser projection/order.
SELECT public.assert_ok((SELECT count(*) FROM (SELECT pk_manta_id,pk_catalog_id,true_match_rank,match_score FROM public.manta_match_results_view ORDER BY true_match_rank ASC) q)=1,'rollback: missing profile browser query');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=1,'rollback: no identity base visibility');
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results_view)=1,'rollback: no identity view visibility - no bypass');
-- Exact browser projection/order.
SELECT public.assert_ok((SELECT count(*) FROM (SELECT pk_manta_id,pk_catalog_id,true_match_rank,match_score FROM public.manta_match_results_view ORDER BY true_match_rank ASC) q)=1,'rollback: no identity browser query');
RESET ROLE;
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=1,'rollback: service read');
INSERT INTO public.manta_match_results(id,pk_manta_id) VALUES('10000000-0000-0000-0000-000000000002',9);
UPDATE public.manta_match_results SET match_score=0.8 WHERE id='10000000-0000-0000-0000-000000000002';
SELECT public.assert_ok((SELECT match_score=0.8 FROM public.manta_match_results WHERE id='10000000-0000-0000-0000-000000000002'),'rollback: service insert/update');
DELETE FROM public.manta_match_results WHERE id='10000000-0000-0000-0000-000000000002';
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=1,'rollback: service delete');
ROLLBACK;
\ir ../migrations/20261017080445_contain_match_result_diagnostics.sql
SELECT public.assert_ok(public.fixture_state()=(SELECT state FROM forward_state),'reapply restores exact contained state');
\echo 'reapply'
SELECT public.assert_ok((SELECT bool_and(relowner='postgres'::regrole) FROM pg_class WHERE oid IN ('public.manta_match_results'::regclass,'public.manta_match_results_view'::regclass)),'reapply: ownership unchanged');
SELECT public.assert_ok((SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_class WHERE oid='public.manta_match_results'::regclass),'reapply: base RLS enabled');
SELECT public.assert_ok((SELECT reloptions=ARRAY['security_invoker=true'] FROM pg_class WHERE oid='public.manta_match_results_view'::regclass),'reapply: invoker mode enabled');
SELECT public.assert_ok((public.fixture_state()->'data')=(SELECT state->'data' FROM baseline),'reapply: content unchanged');
SELECT public.assert_ok((public.fixture_state()->'view')=(SELECT state->'view' FROM baseline),'reapply: view query unchanged');
SELECT public.assert_ok((public.fixture_state()->'columns')=(SELECT state->'columns' FROM baseline),'reapply: columns unchanged');
SELECT public.assert_ok((public.fixture_state()->'constraints')=(SELECT state->'constraints' FROM baseline),'reapply: constraints unchanged');
SELECT public.assert_ok((public.fixture_state()->'admin_helper')=(SELECT state->'admin_helper' FROM baseline),'reapply: admin helper unchanged');
SELECT public.assert_ok(has_table_privilege('service_role',t,p),'reapply: service privilege '||t||' '||p) FROM unnest(ARRAY['manta_match_results','manta_match_results_view']) t CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
SELECT public.assert_ok(NOT has_table_privilege('anon',t,p),'reapply: anon privilege absent '||t||' '||p) FROM unnest(ARRAY['manta_match_results','manta_match_results_view']) t CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
SET ROLE anon;
SELECT public.assert_denied('SELECT * FROM public.manta_match_results','reapply: anon base SELECT');
SELECT public.assert_denied('SELECT * FROM public.manta_match_results_view','reapply: anon view SELECT');
SELECT public.assert_denied('INSERT INTO public.manta_match_results(pk_manta_id) VALUES(9)','reapply: anon mutation');
SELECT public.assert_denied('UPDATE public.manta_match_results SET match_score=0','reapply: anon mutation');
SELECT public.assert_denied('DELETE FROM public.manta_match_results','reapply: anon mutation');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=0,'reapply: contributor base visibility');
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results_view)=0,'reapply: contributor view visibility - no bypass');
-- Exact browser projection/order.
SELECT public.assert_ok((SELECT count(*) FROM (SELECT pk_manta_id,pk_catalog_id,true_match_rank,match_score FROM public.manta_match_results_view ORDER BY true_match_rank ASC) q)=0,'reapply: contributor browser query');
SELECT public.assert_denied('INSERT INTO public.manta_match_results(pk_manta_id) VALUES(9)','reapply: contributor mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results SET match_score=0','reapply: contributor mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results','reapply: contributor mutation denied');
SELECT public.assert_denied('INSERT INTO public.manta_match_results_view(pk_manta_id) VALUES(9)','reapply: contributor mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results_view SET match_score=0','reapply: contributor mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results_view','reapply: contributor mutation denied');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=1,'reapply: active admin base visibility');
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results_view)=1,'reapply: active admin view visibility - no bypass');
-- Exact browser projection/order.
SELECT public.assert_ok((SELECT count(*) FROM (SELECT pk_manta_id,pk_catalog_id,true_match_rank,match_score FROM public.manta_match_results_view ORDER BY true_match_rank ASC) q)=1,'reapply: active admin browser query');
SELECT public.assert_denied('INSERT INTO public.manta_match_results(pk_manta_id) VALUES(9)','reapply: active admin mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results SET match_score=0','reapply: active admin mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results','reapply: active admin mutation denied');
SELECT public.assert_denied('INSERT INTO public.manta_match_results_view(pk_manta_id) VALUES(9)','reapply: active admin mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results_view SET match_score=0','reapply: active admin mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results_view','reapply: active admin mutation denied');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=0,'reapply: inactive admin base visibility');
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results_view)=0,'reapply: inactive admin view visibility - no bypass');
-- Exact browser projection/order.
SELECT public.assert_ok((SELECT count(*) FROM (SELECT pk_manta_id,pk_catalog_id,true_match_rank,match_score FROM public.manta_match_results_view ORDER BY true_match_rank ASC) q)=0,'reapply: inactive admin browser query');
SELECT public.assert_denied('INSERT INTO public.manta_match_results(pk_manta_id) VALUES(9)','reapply: inactive admin mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results SET match_score=0','reapply: inactive admin mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results','reapply: inactive admin mutation denied');
SELECT public.assert_denied('INSERT INTO public.manta_match_results_view(pk_manta_id) VALUES(9)','reapply: inactive admin mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results_view SET match_score=0','reapply: inactive admin mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results_view','reapply: inactive admin mutation denied');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=0,'reapply: missing profile base visibility');
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results_view)=0,'reapply: missing profile view visibility - no bypass');
-- Exact browser projection/order.
SELECT public.assert_ok((SELECT count(*) FROM (SELECT pk_manta_id,pk_catalog_id,true_match_rank,match_score FROM public.manta_match_results_view ORDER BY true_match_rank ASC) q)=0,'reapply: missing profile browser query');
SELECT public.assert_denied('INSERT INTO public.manta_match_results(pk_manta_id) VALUES(9)','reapply: missing profile mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results SET match_score=0','reapply: missing profile mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results','reapply: missing profile mutation denied');
SELECT public.assert_denied('INSERT INTO public.manta_match_results_view(pk_manta_id) VALUES(9)','reapply: missing profile mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results_view SET match_score=0','reapply: missing profile mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results_view','reapply: missing profile mutation denied');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=0,'reapply: no identity base visibility');
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results_view)=0,'reapply: no identity view visibility - no bypass');
-- Exact browser projection/order.
SELECT public.assert_ok((SELECT count(*) FROM (SELECT pk_manta_id,pk_catalog_id,true_match_rank,match_score FROM public.manta_match_results_view ORDER BY true_match_rank ASC) q)=0,'reapply: no identity browser query');
SELECT public.assert_denied('INSERT INTO public.manta_match_results(pk_manta_id) VALUES(9)','reapply: no identity mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results SET match_score=0','reapply: no identity mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results','reapply: no identity mutation denied');
SELECT public.assert_denied('INSERT INTO public.manta_match_results_view(pk_manta_id) VALUES(9)','reapply: no identity mutation denied');
SELECT public.assert_denied('UPDATE public.manta_match_results_view SET match_score=0','reapply: no identity mutation denied');
SELECT public.assert_denied('DELETE FROM public.manta_match_results_view','reapply: no identity mutation denied');
RESET ROLE;
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=1,'reapply: service read');
INSERT INTO public.manta_match_results(id,pk_manta_id) VALUES('10000000-0000-0000-0000-000000000002',9);
UPDATE public.manta_match_results SET match_score=0.8 WHERE id='10000000-0000-0000-0000-000000000002';
SELECT public.assert_ok((SELECT match_score=0.8 FROM public.manta_match_results WHERE id='10000000-0000-0000-0000-000000000002'),'reapply: service insert/update');
DELETE FROM public.manta_match_results WHERE id='10000000-0000-0000-0000-000000000002';
SELECT public.assert_ok((SELECT count(*) FROM public.manta_match_results)=1,'reapply: service delete');
ROLLBACK;
