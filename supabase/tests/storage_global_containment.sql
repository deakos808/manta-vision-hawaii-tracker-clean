\set ON_ERROR_STOP on
-- DRAFT: disposable database ONLY, after the forward migration.
-- Never run on live Supabase. Synthetic metadata only, no Storage API uploads.
-- Actual RLS assertions, not a duplicate implementation of policy predicates.
begin;
insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
select ('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
'authenticated','authenticated','storage-policy-'||n||'@example.invalid','{}','{}'
from generate_series(1,4) n;
-- Existing auth trigger creates profiles; fail below if it does not.
update public.profiles set is_active=true,role='user'
where id in ('71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002');
update public.profiles set is_active=true,role='admin' where id='71000000-0000-4000-8000-000000000003';
update public.profiles set is_active=false,role='user' where id='71000000-0000-4000-8000-000000000004';
do $$ begin
 assert (select count(*) from public.profiles where id::text like '71000000-0000-4000-8000-%')=4;
 assert (select relrowsecurity from pg_class where oid='storage.objects'::regclass);
 assert not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
 and policyname in ('Authenticated uploads g3dtj2_0','if users need to read/view uploaded images g3dtj2_0','Authenticated Upload Access','Public read access to manta-images'));
end $$;

create function pg_temp.expect_insert(b text,n text,allowed boolean) returns void
language plpgsql security invoker as $$
begin
 begin
  insert into storage.objects(bucket_id,name) values(b,n);
  if not allowed then raise exception 'Unexpected INSERT: %/%',b,n; end if;
 exception when insufficient_privilege then
  if allowed then raise exception 'Required INSERT denied: %/%',b,n; end if;
 end;
end $$;

insert into storage.objects(bucket_id,name) values
('manta-images','submissions/71000000-0000-4000-8000-000000000002/s/m/p/original.jpg'),
('manta-images','photos/containment-test/original.jpg'),
('manta-images','containment-root.jpg'),
('calibration-images','calibration/containment-test/source.jpg'),
('csv-uploads','containment-test.csv'),
('pdfs','containment-test.pdf');
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_insert('manta-images','submissions/71000000-0000-4000-8000-000000000001/s/m/p/original.jpg',true);
select pg_temp.expect_insert('manta-images','submissions/71000000-0000-4000-8000-000000000001/s/m/p/prepared-new.jpg',true);
select pg_temp.expect_insert('manta-images','submissions/71000000-0000-4000-8000-000000000002/s/m/p/prepared-other.jpg',false);
select pg_temp.expect_insert('manta-images','photos/new.jpg',false);
select pg_temp.expect_insert('manta-images','arbitrary.jpg',false);
select pg_temp.expect_insert('temp-images','drone/test/photo.jpg',true);
select pg_temp.expect_insert('temp-images','arbitrary.jpg',false);
select pg_temp.expect_insert('calibration-images','calibration/forbidden.jpg',false);
select pg_temp.expect_insert('csv-uploads','forbidden.csv',false);
select pg_temp.expect_insert('pdfs','forbidden.pdf',false);
select pg_temp.expect_insert('drone-photo','forbidden.jpg',false);
select pg_temp.expect_insert('contractor-docs','authenticated-test.pdf',true);
do $$ declare affected integer; begin
 assert exists(select 1 from storage.objects where name='submissions/71000000-0000-4000-8000-000000000001/s/m/p/original.jpg');
 assert not exists(select 1 from storage.objects where name='submissions/71000000-0000-4000-8000-000000000002/s/m/p/original.jpg');
 assert exists(select 1 from storage.objects where name='photos/containment-test/original.jpg');
 assert exists(select 1 from storage.objects where bucket_id='manta-images' and name='containment-root.jpg');
 assert exists(select 1 from storage.objects where bucket_id='contractor-docs' and name='authenticated-test.pdf');
 assert not exists(select 1 from storage.objects where bucket_id in ('calibration-images','csv-uploads','pdfs'));
 update storage.objects set metadata='{}' where name='submissions/71000000-0000-4000-8000-000000000001/s/m/p/original.jpg';
 get diagnostics affected=row_count; assert affected=0;
 delete from storage.objects where name='submissions/71000000-0000-4000-8000-000000000001/s/m/p/original.jpg';
 get diagnostics affected=row_count; assert affected=0;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_insert('manta-images','submissions/anon/test.jpg',false);
select pg_temp.expect_insert('contractor-docs','anon-test.pdf',true);
do $$ begin
 assert not exists(select 1 from storage.objects where bucket_id='manta-images' and name like 'submissions/%');
 assert exists(select 1 from storage.objects where name='photos/containment-test/original.jpg');
 assert exists(select 1 from storage.objects where bucket_id='manta-images' and name='containment-root.jpg');
 assert exists(select 1 from storage.objects where bucket_id='contractor-docs' and name='authenticated-test.pdf');
 assert not exists(select 1 from storage.objects where bucket_id in ('calibration-images','csv-uploads','pdfs'));
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
select pg_temp.expect_insert('calibration-images','calibration/containment-test/admin.jpg',true);
select pg_temp.expect_insert('csv-uploads','admin-forbidden.csv',false);
select pg_temp.expect_insert('manta-images','submissions/71000000-0000-4000-8000-000000000001/s/m/p/prepared-admin.jpg',true);
select pg_temp.expect_insert('manta-images','photos/containment-test/admin-import.jpg',true);
select pg_temp.expect_insert('manta-images','admin-root-import.jpg',true);
select pg_temp.expect_insert('temp-images','diagnostics/diagnostic-containment.txt',true);
select pg_temp.expect_insert('temp-images','legacy/admin-photo.jpg',true);
do $$ declare affected integer; begin
 assert exists(select 1 from storage.objects where name='submissions/71000000-0000-4000-8000-000000000002/s/m/p/original.jpg');
 assert exists(select 1 from storage.objects where name='containment-test.csv');
 assert exists(select 1 from storage.objects where bucket_id='contractor-docs' and name='anon-test.pdf');
 delete from storage.objects where bucket_id='temp-images' and name='diagnostics/diagnostic-containment.txt';
 get diagnostics affected=row_count; assert affected=1;
 delete from storage.objects where bucket_id='temp-images' and name='legacy/admin-photo.jpg';
 get diagnostics affected=row_count; assert affected=0;
 update storage.objects set metadata='{}' where name='admin-root-import.jpg';
 get diagnostics affected=row_count; assert affected=0;
 delete from storage.objects where name='admin-root-import.jpg';
 get diagnostics affected=row_count; assert affected=0;
 assert exists(select 1 from storage.objects where name='calibration/containment-test/source.jpg');
 update storage.objects set metadata='{}' where name='calibration/containment-test/admin.jpg';
 get diagnostics affected=row_count; assert affected=1;
 delete from storage.objects where name='calibration/containment-test/admin.jpg';
 get diagnostics affected=row_count; assert affected=1;
 update storage.objects set metadata='{}' where name='containment-test.csv';
 get diagnostics affected=row_count; assert affected=0;
 delete from storage.objects where name='containment-test.csv';
 get diagnostics affected=row_count; assert affected=0;
end $$;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000004',true);
select pg_temp.expect_insert('manta-images','submissions/71000000-0000-4000-8000-000000000004/s/m/p/original.jpg',false);
select pg_temp.expect_insert('temp-images','drone/inactive/photo.jpg',false);
select pg_temp.expect_insert('calibration-images','calibration/inactive.jpg',false);
reset role;
rollback;
