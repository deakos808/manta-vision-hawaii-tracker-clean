-- Parse dates from common formats
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

-- Ground-truth calculated fields that can be derived inside stg_catalog alone
create or replace function public.fn_imports_groundtruth_catalog(p_checks text[] default null)
returns table(
  field text,
  formula text,
  total_rows int,
  matches int,
  mismatches int,
  null_in_csv int,
  missing_dependencies boolean
)
language sql
security definer
set search_path = public
as $$
with s as (
  select
    pk_catalog_id,
    fn_parse_catalog_date(date_first_sighted) as d_first,
    fn_parse_catalog_date(date_last_sighted)  as d_last,
    nullif(regexp_replace(coalesce(days_between_first_last_sighting, days_between_first_last, '')::text, '[^0-9\.\-]', '', 'g'),'')::numeric as v_between,
    nullif(regexp_replace(coalesce(days_since_last_sighting, days_since_last_sighitng, '')::text, '[^0-9\.\-]', '', 'g'),'')::numeric as v_since
  from public.stg_catalog
),
chk as (
  -- Between (days)
  select
    'days_between_first_last:days'::text as field,
    '(date_last_sighted - date_first_sighted)::int'::text as formula,
    count(*) filter (where d_first is not null and d_last is not null) as total_rows,
    count(*) filter (where d_first is not null and d_last is not null and v_between is not null and (d_last - d_first) = v_between::int) as matches,
    count(*) filter (where d_first is not null and d_last is not null and v_between is not null and (d_last - d_first) <> v_between::int) as mismatches,
    count(*) filter (where v_between is null) as null_in_csv,
    false as missing_dependencies
  union all
  -- Between (years ~ numeric, tolerance 0.02y ≈ 7.3 days)
  select
    'days_between_first_last:years'::text,
    '(date_last_sighted - date_first_sighted)/365.25'::text,
    count(*) filter (where d_first is not null and d_last is not null) as total_rows,
    count(*) filter (where d_first is not null and d_last is not null and v_between is not null
                     and abs(((d_last - d_first)/365.25) - v_between::numeric) <= 0.02) as matches,
    count(*) filter (where d_first is not null and d_last is not null and v_between is not null
                     and abs(((d_last - d_first)/365.25) - v_between::numeric) > 0.02) as mismatches,
    count(*) filter (where v_between is null) as null_in_csv,
    false
  union all
  -- Since last sighting (days)
  select
    'days_since_last_sighting'::text,
    '(current_date - date_last_sighted)::int'::text,
    count(*) filter (where d_last is not null) as total_rows,
    count(*) filter (where d_last is not null and v_since is not null and (current_date - d_last) = v_since::int) as matches,
    count(*) filter (where d_last is not null and v_since is not null and (current_date - d_last) <> v_since::int) as mismatches,
    count(*) filter (where v_since is null) as null_in_csv,
    false
  union all
  -- Placeholders for true cross-table formulas (flag as missing deps)
  select 'last_sex'::text, 'latest s.gender by date'::text, 0,0,0,0,true
  union all
  select 'last_size'::text, 'latest size measurement'::text, 0,0,0,0,true
  union all
  select 'list_years_sighted'::text, 'distinct years from sightings'::text, 0,0,0,0,true
  union all
  select 'total_sightings'::text, 'count sightings per catalog'::text, 0,0,0,0,true
)
select *
from chk
where p_checks is null
   or split_part(field, ':', 1) = any (p_checks);
$$;

-- Persist admin-only visibility per table/column
create table if not exists public.field_visibility (
  table_name text not null,
  column_name text not null,
  admin_only boolean not null default false,
  updated_at timestamptz default now(),
  primary key (table_name, column_name)
);

create or replace function public.fn_set_field_visibility(p_table text, p_map jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.field_visibility(table_name, column_name, admin_only, updated_at)
  select p_table, key::text, (p_map->>key)::boolean, now()
  from jsonb_object_keys(p_map) as key
  on conflict (table_name, column_name)
  do update set admin_only = excluded.admin_only, updated_at = now();
end;
$$;

create or replace view public.v_field_visibility as
select * from public.field_visibility;
