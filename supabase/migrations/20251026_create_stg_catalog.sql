-- Minimal staging for catalog CSVs (store raw text for flexible parsing)
create table if not exists public.stg_catalog (
  pk_catalog_id int,
  name text,
  species text,
  date_first_sighted text,
  date_last_sighted text,
  days_between_first_last text,
  days_between_first_last_sighting text,
  days_since_last_sighting text,
  days_since_last_sighitng text,
  notes text,
  src_file text,
  loaded_at timestamptz default now()
);

-- Duplicate PKs in staging
create or replace view public.stg_v_catalog_dupe_pk as
select pk_catalog_id, count(*) c
from public.stg_catalog
where pk_catalog_id is not null
group by pk_catalog_id
having count(*) > 1;

-- Type warnings (bad date strings)
create or replace function public.fn_parse_catalog_date(t text)
returns date
language sql
immutable
as $$
  select case
    when t is null or length(btrim(t)) = 0 then null
    when t ~ '^\d{4}-\d{2}-\d{2}$' then t::date
    when t ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(t, 'MM/DD/YYYY')
    when t ~ '^\d{1,2}/\d{1,2}/\d{2}$'  then to_date(t, 'MM/DD/YY')
    else null
  end
$$;

create or replace view public.stg_v_catalog_type_warnings as
select
  s.pk_catalog_id,
  s.date_first_sighted as date_first_sighted_raw,
  s.date_last_sighted  as date_last_sighted_raw,
  case
    when s.date_first_sighted is not null and fn_parse_catalog_date(s.date_first_sighted) is null then 'bad date_first_sighted'
    when s.date_last_sighted  is not null and fn_parse_catalog_date(s.date_last_sighted)  is null then 'bad date_last_sighted'
  end as issue
from public.stg_catalog s
where (
  (s.date_first_sighted is not null and fn_parse_catalog_date(s.date_first_sighted) is null) or
  (s.date_last_sighted  is not null and fn_parse_catalog_date(s.date_last_sighted)  is null)
);

-- Merge preview (rough)
create or replace view public.stg_merge_preview_catalog as
select
  count(*) filter (where c.pk_catalog_id is null) as will_insert,
  count(*) filter (where c.pk_catalog_id is not null) as will_update,
  0 as will_update_changed_only,
  (select count(*) from public.stg_catalog) as total_staged
from public.stg_catalog s
left join public.catalog c on c.pk_catalog_id = s.pk_catalog_id;

-- Summary (catalog-only pieces used by the UI)
create or replace view public.stg_summary as
select
  (select count(*) from public.stg_catalog)                        as catalog_rows,
  (select count(*) from public.stg_v_catalog_dupe_pk)              as catalog_dupe_pk,
  (select count(*) from public.stg_v_catalog_type_warnings)        as catalog_type_warnings,
  (select count(*) from public.stg_catalog where pk_catalog_id is null) as catalog_missing_required;
