-- === CATALOG STAGING (loose) ===
create table if not exists public.stg_catalog (
  pk_catalog_id int,
  species text,
  name text,
  date_last_sighted text,
  date_first_sighted text,
  days_between_first_last_sighting text,
  days_since_last_sighitng text,
  last_sex text,
  c_last_size text,
  last_age_class text,
  last_size text,
  list_unique_locations text,
  list_unique_regions text,
  list_years_sighted text,
  total_biopsies text,
  total_sightings text,
  total_tags text,
  count_unique_years_sighted text,
  src_file text,
  loaded_at timestamptz default now()
);

-- duplicates by pk
create or replace view public.stg_v_catalog_dupe_pk as
select pk_catalog_id, count(*) as c
from public.stg_catalog
group by pk_catalog_id
having count(*) > 1;

-- type/format warnings (non-strict patterns)
create or replace view public.stg_v_catalog_type_warnings as
select
  s.*,
  (s.date_last_sighted is not null and s.date_last_sighted !~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2}$' and s.date_last_sighted !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') as bad_date_last_format,
  (s.date_first_sighted is not null and s.date_first_sighted !~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2}$' and s.date_first_sighted !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') as bad_date_first_format,
  (s.days_between_first_last_sighting ~ '[^0-9\.]') as days_between_non_numeric,
  (s.days_since_last_sighitng ~ '[^0-9]') as days_since_last_non_integer,
  (s.total_biopsies ~ '[^0-9]') as total_biopsies_non_integer,
  (s.total_sightings ~ '[^0-9]') as total_sightings_non_integer,
  (s.total_tags ~ '[^0-9]') as total_tags_non_integer,
  (s.count_unique_years_sighted ~ '[^0-9]') as count_unique_years_non_integer,
  (s.last_sex is not null and lower(s.last_sex) not in ('male','female','unknown')) as invalid_last_sex,
  (s.list_years_sighted ~ '[^\d,\-;|\x0b ]') as years_list_suspicious_chars
from public.stg_catalog s
where
  (s.date_last_sighted is not null and s.date_last_sighted !~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2}$' and s.date_last_sighted !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  or (s.date_first_sighted is not null and s.date_first_sighted !~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2}$' and s.date_first_sighted !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  or (s.days_between_first_last_sighting ~ '[^0-9\.]')
  or (s.days_since_last_sighitng ~ '[^0-9]')
  or (s.total_biopsies ~ '[^0-9]')
  or (s.total_sightings ~ '[^0-9]')
  or (s.total_tags ~ '[^0-9]')
  or (s.count_unique_years_sighted ~ '[^0-9]')
  or (s.last_sex is not null and lower(s.last_sex) not in ('male','female','unknown'))
  or (s.list_years_sighted ~ '[^\d,\-;|\x0b ]');

-- add sightings FK check to mantas staging
create or replace view public.stg_v_mantas_missing_fk_sighting as
select s.*
from public.stg_mantas s
left join public.sightings g on g.pk_sighting_id = s.fk_sighting_id
where s.fk_sighting_id is not null and g.pk_sighting_id is null;

-- extend dry-run summary to include catalog and the new FK check
create or replace view public.stg_summary as
select
  (select count(*) from public.stg_catalog)                          as catalog_rows,
  (select count(*) from public.stg_v_catalog_dupe_pk)                as catalog_dupe_pk,
  (select count(*) from public.stg_v_catalog_type_warnings)          as catalog_type_warnings,
  (select count(*) from public.stg_mantas)                           as mantas_rows,
  (select count(*) from public.stg_v_mantas_dupe_pk)                 as mantas_dupe_pk,
  (select count(*) from public.stg_v_mantas_missing_fk_catalog)      as mantas_missing_fk_catalog,
  (select count(*) from public.stg_v_mantas_missing_fk_sighting)     as mantas_missing_fk_sighting,
  (select count(*) from public.stg_photos)                           as photos_rows,
  (select count(*) from public.stg_v_photos_missing_fk_manta)        as photos_missing_fk_manta;

-- introspection helpers (optional persistent views)
create or replace view public.v_db_primary_keys as
select tc.table_schema, tc.table_name, kcu.column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
 and tc.table_name   = kcu.table_name
where tc.constraint_type = 'PRIMARY KEY';

create or replace view public.v_db_foreign_keys as
select
  tc.table_schema as src_schema,
  tc.table_name   as src_table,
  kcu.column_name as src_column,
  ccu.table_schema as dst_schema,
  ccu.table_name   as dst_table,
  ccu.column_name  as dst_column,
  tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY';

create or replace view public.v_db_tables_and_views as
select table_schema, table_name, table_type
from information_schema.tables
where table_schema not in ('pg_catalog','information_schema');
