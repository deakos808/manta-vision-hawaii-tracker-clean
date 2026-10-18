-- Executed only by the disposable local runner, never against a linked project.
create role service_role;
-- Mirror the active wrapper ACL before the guarded pending workflow is loaded.
revoke all on function public.commit_sighting_submission_with_biopsies(uuid) from public, anon, authenticated;
create schema private;
create function auth.test_uid() returns uuid language sql as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),'11111111-1111-4111-8111-111111111111')::uuid$$;
create or replace function auth.uid() returns uuid language sql as $$select auth.test_uid()$$;
create table profiles(id uuid primary key,role text,is_active boolean);
insert into profiles values ('11111111-1111-4111-8111-111111111111','admin',true),('22222222-2222-4222-8222-222222222222','user',true);
create or replace function public.is_admin_user() returns boolean language sql as $$select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and is_active)$$;
grant usage on schema auth, private to authenticated;
grant select on profiles to authenticated;
alter table sighting_submissions add column submitted_by uuid default auth.uid(), add column email text, add column manta_count integer, add column photo_count integer, add column reviewer_email text, add column reviewed_at timestamptz, add column rejected_at timestamptz, add column reject_reason text;
alter table sightings add column total_mantas_biopsied integer;
create table biopsies(pk_biopsy_id serial primary key,fk_manta_id integer,fk_sighting_id integer,fk_catalog_id integer,sample_date date,sample_time time,collector text,method text,island text,location text,tissue_type text,lab_id text,notes text,source text,raw_sample_id text);
-- Minimal deferred trigger needed by the unchanged wrapper; association/counts checked below.
create function test_biopsy_constraint() returns trigger language plpgsql as $$begin return new; end$$;
create constraint trigger trg_validate_committed_biopsy_mapping after update on sighting_submissions deferrable initially deferred for each row execute function test_biopsy_constraint();
\i supabase/migrations/20261013055511_edit_pending_sighting_submissions.sql
\i supabase/migrations/20261014074119_return_pending_edit_conflicts_without_retry.sql
create temporary table before_acl as select oid,proacl,prosecdef,proconfig from pg_proc where oid in ('public.commit_sighting_submission(uuid)'::regprocedure,'public.commit_sighting_submission_with_biopsies(uuid)'::regprocedure,'public.save_pending_sighting_submission(uuid,integer,jsonb,text)'::regprocedure,'private.save_pending_sighting_submission(uuid,integer,jsonb,text)'::regprocedure);
create temporary table before_photo_security as select relacl,relrowsecurity,relforcerowsecurity from pg_class where oid='public.photos'::regclass;
\i supabase/migrations/20261018005538_persist_photo_injury_designation.sql
select assert_true((select is_nullable='YES' and column_default is null and data_type='boolean' from information_schema.columns where table_schema='public' and table_name='photos' and column_name='is_injury'),'one nullable boolean without default');
select assert_true((select is_injury is null from photos where file_name2='historical.jpg'),'historical injury stays unknown');
select assert_true(not exists(select 1 from before_acl b join pg_proc p using(oid) where (p.proacl,p.prosecdef,p.proconfig) is distinct from (b.proacl,b.prosecdef,b.proconfig)),'function ACL/security/search path unchanged');
select assert_true((select (c.relacl,c.relrowsecurity,c.relforcerowsecurity) is not distinct from (b.relacl,b.relrowsecurity,b.relforcerowsecurity) from pg_class c cross join before_photo_security b where c.oid='public.photos'::regclass),'photo ACL and RLS unchanged');
-- Existing regression suite runs before new synthetic observations.
\i supabase/tests/external_photo_measurements.sql
select test_commit(jsonb_build_array(test_photo('dw',3)||'{"isInjury":true,"injuryModifiers":["predation","entanglement"]}',test_photo('dw',3)||'{"isInjury":false}',test_photo('dw',3)||'{"isInjury":null}',test_photo('dw',3))) as flags \gset
select assert_true((select count(*)=4 and count(*) filter(where is_injury)=1 and count(*) filter(where not is_injury)=1 and count(*) filter(where is_injury is null)=2 and bool_and(photo_view='dorsal' and is_photogrammetry) from photos where fk_manta_id=:flags),'injury true false null absent and overlapping view/designation');
select assert_true(test_reject(test_photo('dw',3)||'{"isInjury":"true"}'),'string injury rejected');
select assert_true(test_reject(test_photo('dw',3)||'{"isInjury":1}'),'numeric injury rejected');
-- Both guarded Admin paths, plus contributor pending save/reopen.
insert into sighting_submissions(id,email,sighting_date,payload) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','local@example.invalid','2026-10-17',jsonb_build_object('mantas',jsonb_build_array(jsonb_build_object('id','manta-a','matchedCatalogId',733,'estimatedSize','9','photos',jsonb_build_array(test_photo('dw',3)||'{"isInjury":true,"injuryModifiers":["predation","entanglement"]}')))));
set role authenticated;
select public.save_pending_sighting_submission('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',0,'{}','save');
reset role;
select assert_true((select edit_revision=1 and payload#>>'{mantas,0,photos,0,isInjury}'='true' and payload#>>'{mantas,0,estimatedSize}'='9' from sighting_submissions where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'save/reopen preserves overlapping photo evidence and independent estimate');
set role authenticated;
select public.save_pending_sighting_submission('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1,'{}','commit');
reset role;
select assert_true((select p.is_injury and p.is_photogrammetry and p.photo_view='dorsal' from photos p join sighting_submissions s on s.committed_pk_sighting_id=p.fk_sighting_id where s.id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'guarded Admin commit persists injury');
insert into sighting_submissions(id,email,sighting_date,payload) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','local@example.invalid','2026-10-17',jsonb_build_object('mantas',jsonb_build_array(jsonb_build_object('id','manta-b','matchedCatalogId',733,'photos',jsonb_build_array(test_photo('dw',3)||'{"isInjury":true,"injuryModifiers":["predation","entanglement"]}'),'biopsy',jsonb_build_object('collected',true,'sampleDate','2026-10-17','collector','Synthetic','method','Synthetic','tissueType','skin')))));
set role authenticated;
select public.save_pending_sighting_submission('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',0,'{}','commit');
reset role;
select assert_true((select count(*)=1 and bool_and(p.is_injury and p.is_photogrammetry and p.photo_view='dorsal') from photos p join sighting_submissions s on s.committed_pk_sighting_id=p.fk_sighting_id join biopsies b on b.fk_manta_id=p.fk_manta_id where s.id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'active biopsy-compatible Admin commit persists injury and correct parent association');
select assert_true(not has_function_privilege('authenticated','public.commit_sighting_submission(uuid)','execute') and not has_function_privilege('authenticated','public.commit_sighting_submission_with_biopsies(uuid)','execute'),'direct commit entrypoints stay closed');
-- Prepared-image provenance branch preserves injury alongside the original path.
select test_commit(jsonb_build_array(test_photo('dw',3.2) || '{"isInjury":true,"injuryModifiers":["predation","entanglement"],"storageBucket":"manta-images","path":"fixture/prepared.jpg","originalPath":"fixture/original.jpg","editTransform":{"version":"rotate-crop-v1","rotationDegrees":0,"originalWidth":500,"originalHeight":292,"exifOrientation":1,"rotatedWidth":500,"rotatedHeight":292,"crop":{"x":0,"y":0,"width":500,"height":292},"outputWidth":500,"outputHeight":292}}'::jsonb)) as injured_prepared \gset
select assert_true((select is_injury and injury_modifiers=ARRAY['predation','entanglement']::text[] and is_photogrammetry and photo_view='dorsal' and original_storage_path='fixture/original.jpg' from photos where fk_manta_id=:injured_prepared),'prepared provenance branch persists independent injury');
-- Contributor can save/reopen injury JSON, but cannot approve any scientific write.
insert into sighting_submissions(id,submitted_by,email,sighting_date,payload) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','local@example.invalid','2026-10-17',jsonb_build_object('mantas',jsonb_build_array(jsonb_build_object('id','manta-c','matchedCatalogId',733,'estimatedSize','6.5','photos',jsonb_build_array(test_photo('dw',3)||'{"isInjury":true,"injuryModifiers":["predation","entanglement"]}')))));
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
set role authenticated;
select public.save_pending_sighting_submission('cccccccc-cccc-4ccc-8ccc-cccccccccccc',0,'{}','save');
do $$begin
 begin
   perform public.save_pending_sighting_submission('cccccccc-cccc-4ccc-8ccc-cccccccccccc',1,'{}','commit');
   raise exception 'Non-admin approval unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
end$$;
reset role;
select assert_true((select status='pending' and edit_revision=1 and payload#>>'{mantas,0,photos,0,isInjury}'='true' and payload#>>'{mantas,0,estimatedSize}'='6.5' from sighting_submissions where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'),'contributor injury/estimate pending round trip with approval still denied');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);

select assert_true((select injury_modifiers is null from photos where file_name2='historical.jpg'),'historical modifiers remain NULL');
select test_commit(jsonb_build_array(test_photo('dw',3)||'{"isInjury":true,"injuryModifiers":["predation"]}',test_photo('dw',3)||'{"isInjury":true,"injuryModifiers":["entanglement"]}',test_photo('dw',3)||'{"isInjury":true,"injuryModifiers":["predation","entanglement"]}',test_photo('dw',3)||'{"isInjury":false,"injuryModifiers":[]}',test_photo('dw',3)||'{"isInjury":null,"injuryModifiers":null}')) as modifiers \gset
select assert_true((select count(*) filter(where injury_modifiers=ARRAY['predation'])=1 and count(*) filter(where injury_modifiers=ARRAY['entanglement'])=1 and count(*) filter(where injury_modifiers=ARRAY['predation','entanglement'])=1 and count(*) filter(where injury_modifiers='{}')=1 and count(*) filter(where injury_modifiers is null)=1 from photos where fk_manta_id=:modifiers),'all modifier combinations and nullable semantics');
select assert_true(test_reject(test_photo('dw',3)||'{"isInjury":false,"injuryModifiers":["predation"]}'),'explicit false cannot persist active modifiers');
select assert_true(test_reject(test_photo('dw',3)||'{"isInjury":true,"injuryModifiers":["other"]}'),'unsupported injury category rejected');
select assert_true(test_reject(test_photo('dw',3)||'{"isInjury":true,"injuryModifiers":[null]}'),'null array element rejected');
select assert_true(test_reject(test_photo('dw',3)||'{"isInjury":true,"injuryModifiers":"predation"}'),'scalar modifiers rejected');
select assert_true(test_reject(test_photo('dw',3)||'{"isInjury":true,"injuryModifiers":[1]}'),'non-string modifier rejected');
-- Guarded pending saves validate the same fields before any revision/payload change.
insert into sighting_submissions(id,submitted_by,email,payload) values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','22222222-2222-4222-8222-222222222222','local@example.invalid','{"mantas":[]}');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
set role authenticated;
do $$declare bad jsonb; begin
 foreach bad in array ARRAY['{"isInjury":false,"injuryModifiers":["predation"]}'::jsonb,'{"isInjury":true,"injuryModifiers":["collision"]}'::jsonb,'{"isInjury":true,"injuryModifiers":"predation"}'::jsonb,'{"isInjury":true,"injuryModifiers":[null]}'::jsonb] loop
   begin
     perform public.save_pending_sighting_submission('dddddddd-dddd-4ddd-8ddd-dddddddddddd',0,jsonb_build_object('mantas',jsonb_build_array(jsonb_build_object('photos',jsonb_build_array(bad)))),'save');
     raise exception 'INVALID_INJURY_ACCEPTED';
   exception when others then if sqlerrm='INVALID_INJURY_ACCEPTED' then raise; end if; end;
 end loop;
end$$;
reset role;
select assert_true((select edit_revision=0 and payload='{"mantas":[]}'::jsonb from sighting_submissions where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'),'invalid pending injury edits leave payload and revision unchanged');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
do $$begin
 begin insert into photos(file_name2,photo_view,is_injury,injury_modifiers) values('invalid.jpg','other',false,ARRAY['predation']);raise exception 'Missing consistency constraint';exception when check_violation then null;end;
 begin insert into photos(file_name2,photo_view,is_injury,injury_modifiers) values('invalid.jpg','other',true,ARRAY['collision']);raise exception 'Missing category constraint';exception when check_violation then null;end;
end$$;
select assert_true(not exists(select 1 from photos where file_name2='invalid.jpg'),'permanent table integrity constraints reject invalid modifier evidence');
select assert_true(not exists(select 1 from before_acl b join pg_proc p using(oid) where (p.proacl,p.prosecdef,p.proconfig) is distinct from (b.proacl,b.prosecdef,b.proconfig)),'all guarded function privileges/security/search paths remain unchanged');
