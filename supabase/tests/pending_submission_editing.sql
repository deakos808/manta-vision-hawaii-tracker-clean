-- Run ONLY against the isolated Phase A fixture, never live scientific data.
-- Requires the ownership baseline, Phase A migration, profiles/auth.uid and
-- stub commit functions (see local harness). Each assertion uses real Postgres ACL/RLS.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database() <> 'jon_pending_test' then raise exception 'Disposable local database required'; end if;
end $$;
create function pg_temp.assert_ok(ok boolean, label text) returns void language plpgsql as $$ begin
 if ok is not true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label;
end $$;
create function pg_temp.assert_error(statement text, expected text, label text) returns void language plpgsql as $$ begin
 begin execute statement; exception when others then
   if sqlstate = expected then raise notice 'PASS: %',label; return; end if;
   raise exception 'FAIL: % unexpected SQLSTATE %: %',label,sqlstate,sqlerrm;
 end;
 raise exception 'FAIL: % unexpectedly allowed',label;
end $$;
insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004');
insert into public.profiles values
 ('00000000-0000-4000-8000-000000000001','user',true),
 ('00000000-0000-4000-8000-000000000002','user',true),
 ('00000000-0000-4000-8000-000000000003','admin',true),
 ('00000000-0000-4000-8000-000000000004','admin',false);
insert into public.sighting_submissions(id,email,submitted_by,payload,status) values
 ('10000000-0000-4000-8000-000000000001','a@example.invalid','00000000-0000-4000-8000-000000000001','{"date":"2026-10-12","notes":"original","preserved":"extra metadata","mantas":[{"id":"m","matchedCatalogId":733,"photos":[{"id":"p","originalPath":"source","storageBucket":"manta-images","path":"old","measure":{"dwCm":314}}]}]}','pending'),
 ('10000000-0000-4000-8000-000000000002','b@example.invalid','00000000-0000-4000-8000-000000000002','{"mantas":[]}','pending'),
 ('10000000-0000-4000-8000-000000000003','a@example.invalid','00000000-0000-4000-8000-000000000001','{"mantas":[]}','committed'),
 ('10000000-0000-4000-8000-000000000004','a@example.invalid','00000000-0000-4000-8000-000000000001','{"mantas":[]}','rejected'),
 ('10000000-0000-4000-8000-000000000005','legacy@example.invalid',null,'{"mantas":[]}','pending');
\if :baseline
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
insert into public.sighting_submissions(email,payload) values ('new@example.invalid','{"mantas":[]}');
select pg_temp.assert_ok((select count(*)=4 from public.sighting_submissions),'A/B current schema: new contributor INSERT remains available');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
update public.sighting_submissions set payload=payload || '{"notes":"legacy admin saved"}' where id='10000000-0000-4000-8000-000000000001' and status='pending';
select pg_temp.assert_ok((select payload->>'notes'='legacy admin saved' from public.sighting_submissions where id='10000000-0000-4000-8000-000000000001'),'A/B current schema: baseline/new-client fallback Admin save works');
select public.commit_sighting_submission('10000000-0000-4000-8000-000000000001');
select pg_temp.assert_ok((select status='committed' from public.sighting_submissions where id='10000000-0000-4000-8000-000000000001'),'A/B current schema: legacy approval works');
select pg_temp.assert_ok(to_regprocedure('public.pending_submission_edit_protocol()') is null,'A/B current schema: capability absent');
\else
set local role anon;
select pg_temp.assert_error('select public.pending_submission_edit_protocol()','42501','anonymous cannot execute capability function');
select pg_temp.assert_error('select * from public.sighting_submissions','42501','anonymous cannot read submissions');
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',0,'{}')$q$,'42501','anonymous cannot execute save');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_ok((select count(*)=3 from public.sighting_submissions),'A sees only owned records');
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000002',0,'{}')$q$,'42501','A cannot edit B');
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000005',0,'{}')$q$,'42501','A cannot claim legacy NULL owner');
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000003',0,'{}')$q$,'40001','committed is read-only');
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000004',0,'{}')$q$,'40001','rejected is read-only');
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',0,'{}','commit')$q$,'42501','contributor cannot approve');
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',0,'{}','reject')$q$,'42501','contributor cannot reject');
update public.sighting_submissions set status='committed' where id='10000000-0000-4000-8000-000000000001';
select pg_temp.assert_ok((select status='pending' from public.sighting_submissions where id='10000000-0000-4000-8000-000000000001'),'direct contributor UPDATE remains blocked by RLS');
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',0,'{"status":"committed"}')$q$,'P0001','protected fields cannot be patched');
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',0,'{"mantas":[{"photos":[{"id":"p","originalPath":"tampered","storageBucket":"manta-images"}]}]}')$q$,'P0001','retained photo source immutable');
select pg_temp.assert_ok(public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',0,'{"notes":"  contributor edits  ","date":"2026-10-11"}')->>'revision'='1','owner saves with revision increment');
-- C: legacy Admin form was loaded at revision zero. Both direct writes and
-- separate approval RPCs must be denied; they may not skip the new contract.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_error($q$update public.sighting_submissions set payload=payload || '{"notes":"original"}' where id='10000000-0000-4000-8000-000000000001' and status='pending'$q$,'40001','C: stale legacy Admin payload overwrite denied');
do $$ begin
  begin
    update public.sighting_submissions set edit_revision=999 where id='10000000-0000-4000-8000-000000000001';
    raise exception 'Legacy revision tamper unexpectedly succeeded';
  exception when serialization_failure then
    perform pg_temp.assert_ok(sqlerrm like 'Client upgrade required.%Reload%', 'C: direct revision tamper returns human-safe reload guidance');
  end;
end $$;
select pg_temp.assert_error($q$update public.sighting_submissions set status='rejected' where id='10000000-0000-4000-8000-000000000001'$q$,'40001','C: both legacy list rejection paths denied');
select pg_temp.assert_error($q$select public.commit_sighting_submission('10000000-0000-4000-8000-000000000001')$q$,'42501','C: legacy direct base approval denied');
select pg_temp.assert_error($q$select public.commit_sighting_submission_with_biopsies('10000000-0000-4000-8000-000000000001')$q$,'42501','C: legacy direct biopsy approval denied');
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',null,'{}')$q$,'PT409','D: null revision cannot bypass concurrency');
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',0,'{"notes":"stale admin"}')$q$,'PT409','multi-actor: Admin revision zero cannot overwrite contributor revision one');
select pg_temp.assert_ok((select edit_revision=1 and payload->>'notes'='  contributor edits  ' from public.sighting_submissions where id='10000000-0000-4000-8000-000000000001'),'C/D: all denied writes preserve revision one and content');
select pg_temp.assert_ok(public.pending_submission_edit_protocol()=1,'D: explicit protocol available');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
insert into public.sighting_submissions(email,payload) values ('new@example.invalid','{"mantas":[]}');
select pg_temp.assert_ok((select edit_revision=0 from public.sighting_submissions where email='new@example.invalid'),'C/D: new INSERT is unaffected and starts at revision zero');
select pg_temp.assert_ok((select payload->>'notes'='  contributor edits  ' and payload->>'preserved'='extra metadata' and sighting_date='2026-10-11' and manta_count=1 and photo_count=1 and status='pending' and reviewer_email is null from public.sighting_submissions where id='10000000-0000-4000-8000-000000000001'),'save preserves metadata and synchronizes summaries without review/status changes');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',1,'{}')$q$,'42501','B cannot edit A');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',1,'{}')$q$,'42501','inactive admin cannot edit');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_ok((select count(*)=6 from public.sighting_submissions),'admin retains all review access');
select pg_temp.assert_ok(public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',1,'{"notes":"admin reviewed"}')->>'revision'='2','admin edits owned-by-contributor pending row');
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',1,'{}','reject')$q$,'PT409','stale rejection blocked');
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',1,'{}','commit')$q$,'PT409','stale approval blocked');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',1,'{"notes":"stale"}')$q$,'PT409','contributor stale save cannot overwrite Admin');
select pg_temp.assert_ok((select payload->>'notes'='admin reviewed' and edit_revision=2 from public.sighting_submissions where id='10000000-0000-4000-8000-000000000001'),'conflict leaves Admin content intact');
select pg_temp.assert_ok(public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',2,'{"mantas":[{"id":"m","matchedCatalogId":733,"photos":[{"id":"p","originalPath":"source","storageBucket":"manta-images","path":"prepared-new","measure":{"dwCm":314}}]}]}')->>'revision'='3','crop re-edit retains identity/source/measurement and saves derivative');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',3,'{"notes":"fail approval"}','commit')$q$,'P0001','failed approval rolls back save');
select pg_temp.assert_ok((select edit_revision=3 and payload->>'notes'='admin reviewed' from public.sighting_submissions where id='10000000-0000-4000-8000-000000000001'),'failed commit did not partially save');
select pg_temp.assert_ok(public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',3,'{}','commit')->>'status'='committed','atomic approval delegates to existing base function');
select pg_temp.assert_ok((select edit_revision=4 from public.sighting_submissions where id='10000000-0000-4000-8000-000000000001'),'atomic approval advances revision exactly once');
select pg_temp.assert_error($q$select public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000001',4,'{}')$q$,'40001','finalized record cannot reopen');
select pg_temp.assert_ok(public.save_pending_sighting_submission('10000000-0000-4000-8000-000000000002',0,'{"mantas":[{"photos":[],"biopsy":{"collected":true}}]}','commit')->>'status'='committed','organic biopsy approval delegates to wrapper');
reset role;
select pg_temp.assert_ok((select count(*)=1 from public.test_commit_calls where kind='biopsy'),'wrapper invoked exactly once');
\endif
rollback;
