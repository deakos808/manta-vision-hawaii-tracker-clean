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
  select
    'days_between_first_last:days'::text as field,
    '(date_last_sighted - date_first_sighted)::int'::text as formula,
    count(*) filter (where d_first is not null and d_last is not null) as total_rows,
    count(*) filter (where d_first is not null and d_last is not null and v_between is not null and (d_last - d_first) = v_between::int) as matches,
    count(*) filter (where d_first is not null and d_last is not null and v_between is not null and (d_last - d_first) <> v_between::int) as mismatches,
    count(*) filter (where v_between is null) as null_in_csv,
    false as missing_dependencies
  from s
  union all
  select
    'days_between_first_last:years'::text,
    '(date_last_sighted - date_first_sighted)/365.25'::text,
    count(*) filter (where d_first is not null and d_last is not null),
    count(*) filter (where d_first is not null and d_last is not null and v_between is not null
                     and abs(((d_last - d_first)/365.25) - v_between::numeric) <= 0.02),
    count(*) filter (where d_first is not null and d_last is not null and v_between is not null
                     and abs(((d_last - d_first)/365.25) - v_between::numeric) > 0.02),
    count(*) filter (where v_between is null),
    false
  from s
  union all
  select
    'days_since_last_sighting'::text,
    '(current_date - date_last_sighted)::int'::text,
    count(*) filter (where d_last is not null),
    count(*) filter (where d_last is not null and v_since is not null and (current_date - d_last) = v_since::int),
    count(*) filter (where d_last is not null and v_since is not null and (current_date - d_last) <> v_since::int),
    count(*) filter (where v_since is null),
    false
  from s
  union all
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

grant execute on function public.fn_imports_groundtruth_catalog(text[]) to authenticated;
grant execute on function public.fn_parse_catalog_date(text) to authenticated;
