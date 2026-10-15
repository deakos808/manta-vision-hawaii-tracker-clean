-- Disposable local schema only. No network or live data.
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
create function public.is_admin_user() returns boolean language sql as $$ select true $$;
create table public.sighting_submissions(id uuid primary key, payload jsonb, sighting_date date, status text default 'pending', committed_at timestamptz, committed_pk_sighting_id integer);
create table public.catalog(pk_catalog_id serial primary key,name text,species text);
create table public.sightings(pk_sighting_id serial primary key,sighting_date date,start_time text,end_time text,standardize_survey text,photographer text,island text,sitelocation text,latitude numeric,longitude numeric,location_unknown boolean,notes text);
create table public.mantas(pk_manta_id serial primary key,fk_sighting_id integer,fk_catalog_id integer,submission_manta_id text,gender text,age_class text,size_dw_m numeric,size_m numeric generated always as(size_dw_m) stored);
create table public.photos(pk_photo_id serial primary key,pk_photo_uuid uuid unique default gen_random_uuid(),fk_manta_id integer,fk_sighting_id integer,fk_catalog_id integer,storage_path text,storage_bucket text,original_storage_path text,edit_transform jsonb,file_name2 text,photo_view text check(photo_view in ('ventral','dorsal','other')),is_best_manta_ventral_photo boolean,is_best_manta_dorsal_photo boolean);
create table public.manta_sizes(pk_manta_size_id bigserial primary key,fk_manta_id integer,measurement_type text check(measurement_type in ('width','length','vertical')),size_m numeric,measured_on date,row_sig text unique);
\i supabase/migrations/20261008000257_extend_manta_sizes_size_evidence_contract.sql
\i supabase/migrations/20261009000459_persist_catalog_species.sql
revoke execute on function public.commit_sighting_submission(uuid) from public,anon,authenticated;
insert into public.catalog values (733,'Left Spot','mobula alfredi');
-- Historical evidence has no inferred photo/designation.
insert into public.photos(file_name2,photo_view) values('historical.jpg','ventral');
insert into public.manta_sizes(size_m,row_sig) values(4,'historical');
create function public.assert_true(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function public.test_photo(metric text,value numeric,flag jsonb default 'true'::jsonb) returns jsonb language sql as $$ select jsonb_build_object('id',gen_random_uuid(),'name','fixture.jpg','path','fixture.jpg','view','dorsal','isPhotogrammetry',flag,'measure',jsonb_build_object('source','external','metric',metric,'valueMeters',value,'units','m')) $$;
create function public.test_commit(photos jsonb,manual numeric default 8) returns integer language plpgsql as $$ declare sid uuid:=gen_random_uuid(); result integer; begin
 insert into public.sighting_submissions(id,sighting_date,payload) values(sid,'2026-10-14',jsonb_build_object('mantas',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'matchedCatalogId',733,'size',manual,'photos',photos))));
 perform public.commit_sighting_submission(sid);
 select pk_manta_id into result from public.mantas where fk_sighting_id=(select committed_pk_sighting_id from public.sighting_submissions where id=sid);
 return result;
end $$;
create function public.test_reject(photo jsonb) returns boolean language plpgsql as $$ begin
 perform public.test_commit(jsonb_build_array(photo)); return false;
 exception when others then return true; end $$;

create function public.test_commit_sources(photos jsonb,estimate text,legacy text default null) returns integer language plpgsql as $$ declare sid uuid:=gen_random_uuid(); result integer; begin
 insert into public.sighting_submissions(id,sighting_date,payload) values(sid,'2026-10-14',jsonb_build_object('mantas',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'matchedCatalogId',733,'estimatedSize',estimate,'size',legacy,'photos',photos))));
 perform public.commit_sighting_submission(sid);
 select pk_manta_id into result from public.mantas where fk_sighting_id=(select committed_pk_sighting_id from public.sighting_submissions where id=sid);
 return result;
end $$;
