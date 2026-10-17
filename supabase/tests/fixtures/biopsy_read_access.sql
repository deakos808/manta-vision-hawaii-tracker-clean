-- Synthetic boundary fixtures; ranking computations are unchanged and not recreated.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private;
grant usage on schema public,auth to authenticated,service_role;
grant usage on schema private to authenticated;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.profiles(id uuid primary key,role text,is_active boolean);
grant select on public.profiles to authenticated;
alter table public.profiles enable row level security;
create policy own_profile on public.profiles for select to authenticated using(id=(select auth.uid()));
create function public.is_admin_user() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and is_active is true)$$;
revoke all on function public.is_admin_user() from public;
grant execute on function public.is_admin_user() to authenticated,service_role;
insert into public.profiles values
 ('00000001-0000-4000-8000-000000000000','admin',true),
 ('00000002-0000-4000-8000-000000000000','user',true),
 ('00000003-0000-4000-8000-000000000000','user',false),
 ('00000005-0000-4000-8000-000000000000','admin',false);
create table public.catalog(pk_catalog_id integer primary key,name text,best_catalog_ventral_thumb_url text,last_gender text,last_age_class text,species text,total_biopsies integer);
create table public.sightings(pk_sighting_id integer primary key,is_mprf boolean);
create table public.mantas(pk_manta_id integer primary key);
create sequence public.biopsies_pk_biopsy_id_seq;
create table public.biopsies (
pk_biopsy_id bigint default nextval('biopsies_pk_biopsy_id_seq'::regclass) not null,
fk_manta_id integer,
fk_sighting_id integer,
fk_catalog_id integer,
sample_date date,
sample_time time without time zone,
collector text,
method text,
island text,
region text,
location text,
tissue_type text,
lab_id text,
notes text,
source text,
raw_sample_id text,
created_at timestamp with time zone default now(),
updated_at timestamp with time zone default now(),primary key(pk_biopsy_id),foreign key(fk_catalog_id) references catalog,foreign key(fk_sighting_id) references sightings,foreign key(fk_manta_id) references mantas);
grant select on public.biopsies to authenticated;
grant all on public.biopsies,public.catalog,public.sightings,public.mantas to service_role;
grant all on sequence public.biopsies_pk_biopsy_id_seq to service_role;
insert into catalog values(733,'SYNTHETIC',null,'Male','Adult','mobula alfredi',1);
insert into sightings values(1,false);insert into mantas values(1);
insert into biopsies(pk_biopsy_id,fk_catalog_id,fk_manta_id,fk_sighting_id,sample_date,collector,lab_id,raw_sample_id,notes) values(10,733,1,1,'2026-01-01','SYNTHETIC','LAB-SECRET','SAMPLE-SECRET','NOTE-SECRET');
-- An ungranted helper reproduces the existing browser helper-permission failure.
create function public.biopsy_test_helper(text) returns text language sql immutable as $$select $1$$;
revoke all on function public.biopsy_test_helper(text) from public;
create view public.kona_biopsy_age_rank_view as select pk_biopsy_id,lab_id,raw_sample_id,notes from public.biopsies;
grant select,insert,update,delete,truncate,references,trigger on public.kona_biopsy_age_rank_view to authenticated,service_role;
create view public.kona_biopsy_age_rank_view_v2 as select pk_biopsy_id,lab_id,raw_sample_id,notes from public.biopsies;
grant select,insert,update,delete,truncate,references,trigger on public.kona_biopsy_age_rank_view_v2 to authenticated,service_role;
create view public.qc_merge_refs_to_retired_catalog_v as select pk_biopsy_id,lab_id,raw_sample_id,notes from public.biopsies;
grant select,insert,update,delete,truncate,references,trigger on public.qc_merge_refs_to_retired_catalog_v to authenticated,service_role;
create view public.kona_parentage_priors as select pk_biopsy_id,lab_id,raw_sample_id,notes from public.biopsies;
grant select,insert,update,delete,truncate,references,trigger on public.kona_parentage_priors to authenticated,service_role;
create view public.kona_biopsy_rank_comparison as select pk_biopsy_id,lab_id,raw_sample_id,notes from public.biopsies;
grant select,insert,update,delete,truncate,references,trigger on public.kona_biopsy_rank_comparison to authenticated,service_role;
create view public.kona_biopsy_age_rank_diag_v1 as select pk_biopsy_id,lab_id,raw_sample_id,notes from public.biopsies;
grant select,insert,update,delete,truncate,references,trigger on public.kona_biopsy_age_rank_diag_v1 to authenticated,service_role;
create view public.kona_biopsy_age_rank_view_v2_full as select pk_biopsy_id,lab_id,raw_sample_id,notes from public.biopsies;
grant select,insert,update,delete,truncate,references,trigger on public.kona_biopsy_age_rank_view_v2_full to authenticated,service_role;
create view public.kona_biopsy_age_rank_view_v3 as select b.fk_catalog_id::integer as pk_catalog_id,null::integer as pk_mprf_catalog_id,'SYNTHETIC'::text as hamer_name,null::text as mprf_name,null::text as gender,null::text as last_age_class,null::numeric as last_size_m,b.pk_biopsy_id::bigint as pk_biopsy_id,public.biopsy_test_helper(b.lab_id)::text as mprf_biopsy_id,b.raw_sample_id::text as jonathan_sample_id,b.fk_manta_id::integer as pk_manta_id,b.sample_date::date as date_of_biopsy,null::date as effective_first_sighting,null::integer as total_years_sighted,null::boolean as ever_seen_as_pup,null::boolean as known_age_from_pup,null::integer as first_year_confirmed_immature,null::integer as first_year_confirmed_mature,null::integer as min_years_known_mature,null::integer as estimated_age_at_last_sighting_years,null::numeric as janice_min_age_at_biopsy_yrs,null::bigint as age_rank_v2,null::numeric as janice_age_rank,null::integer as age_at_last_sighting_years,null::numeric as age_years_at_biopsy,null::integer as first_year,null::integer as last_year,null::integer as maturity_bonus_b,null::integer as relative_age_score_v2,null::numeric as original_relative_age_score,null::bigint as original_relative_age_rank,null::text as age_rank_justification_v2,null::date as mprf_first_sighting_date,null::text as mprf_first_sighting_size,null::text as mprf_last_age_class,null::numeric as mprf_total_years_seen,null::numeric as mprf_size_dw,null::numeric as janice_age_rank_raw,null::numeric as age_years_at_biopsy_v3,null::boolean as known_age_from_pup_v3,null::numeric as maturity_bonus_b_v3,null::numeric as relative_age_score_v3,1::bigint as age_rank_v3,null::text as age_rank_justification_v3 from public.biopsies b;
grant select,insert,update,delete,truncate,references,trigger on public.kona_biopsy_age_rank_view_v3 to authenticated,service_role;
create view public.qc_issue_summary_v as select pk_biopsy_id,lab_id,raw_sample_id,notes from public.biopsies;
grant select,insert,update,delete,truncate,references,trigger on public.qc_issue_summary_v to authenticated,service_role;
create view public.kona_biopsy_all_samples_v2 as select pk_biopsy_id,lab_id,raw_sample_id,notes from public.biopsies;
grant select,insert,update,delete,truncate,references,trigger on public.kona_biopsy_all_samples_v2 to authenticated,service_role;
create view public.kona_biopsy_all_samples_v3_export as select pk_biopsy_id,lab_id,raw_sample_id,notes from public.biopsies;
grant select,insert,update,delete,truncate,references,trigger on public.kona_biopsy_all_samples_v3_export to authenticated,service_role;

-- Existing Production catalog/sighting read grants for old-client compatibility probes.
grant select on public.catalog, public.sightings to authenticated;
