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
language plpgsql
security definer
set search_path = public
as $$
declare
  has_view boolean := to_regclass('public.v_catalog_computed') is not null;
begin
  return query
  with s as (
    select
      pk_catalog_id,

      -- dates and numeric CSVs (normalized)
      fn_parse_catalog_date(date_first_sighted) as d_first,
      fn_parse_catalog_date(date_last_sighted)  as d_last,
      nullif(regexp_replace(coalesce(days_between_first_last_sighting, days_between_first_last, '')::text,'[^0-9\.\-]','','g'),'')::numeric as v_between,
      nullif(regexp_replace(coalesce(days_since_last_sighting,  days_since_last_sighitng, '')::text,'[^0-9\.\-]','','g'),'')::numeric as v_since,

      -- CSV scalar fields
      nullif(btrim(last_sex), '') as csv_last_sex,
      nullif(regexp_replace(coalesce(last_size, c_last_size, '')::text, '[^0-9\.\-]', '', 'g'),'')::numeric as csv_last_size,
      nullif(regexp_replace(coalesce(total_biopsies,'')::text, '[^0-9]', '', 'g'),'')::int    as csv_total_biopsies,
      nullif(regexp_replace(coalesce(total_sightings,'')::text,'[^0-9]', '', 'g'),'')::int    as csv_total_sightings,
      nullif(regexp_replace(coalesce(total_tags,'')::text,     '[^0-9]', '', 'g'),'')::int    as csv_total_tags,
      nullif(regexp_replace(coalesce(count_unique_years_sighted,'')::text,'[^0-9]','','g'),'')::int as csv_count_unique_years,
      nullif(btrim(last_age_class), '') as csv_last_age_class,

      -- CSV list fields normalized to sorted strings
      nullif(btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(coalesce(list_years_sighted,''), chr(11), ',', 'g'),
          '[;| ]+', ',', 'g'),
        ',+', ',', 'g')
      ), '') as csv_years_list_norm,

      nullif(btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(coalesce(list_unique_locations,'')), chr(11), ',', 'g'),
          '[;|]+', ',', 'g'),
        ',+', ',', 'g')
      ), '') as csv_locations_norm,

      nullif(btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(coalesce(list_unique_regions,'')), chr(11), ',', 'g'),
          '[;|]+', ',', 'g'),
        ',+', ',', 'g')
      ), '') as csv_regions_norm
    from public.stg_catalog
  ),
  vc as (
    select * from public.v_catalog_computed
  ),
  joined as (
    select
      s.*,
      vc.date_first_sighted,
      vc.date_last_sighted,
      vc.last_sex,
      vc.last_size,
      vc.last_age_class,
      vc.total_biopsies,
      vc.total_sightings,
      vc.total_tags,
      vc.count_unique_years_sighted,
      vc.list_years_sighted,
      vc.list_unique_locations,
      vc.list_unique_regions
    from s
    left join vc using (pk_catalog_id)
  ),
  norm as (
    select
      j.*,

      case when j.list_years_sighted is null then null
           else array_to_string((select array_agg(distinct y order by y) from unnest(j.list_years_sighted) y), ',')
      end as vc_years_list_norm,

      case when j.list_unique_locations is null then null
           else array_to_string((select array_agg(distinct lower(btrim(y)) order by lower(btrim(y))) from unnest(j.list_unique_locations) y), ',')
      end as vc_locations_norm,

      case when j.list_unique_regions is null then null
           else array_to_string((select array_agg(distinct lower(btrim(y)) order by lower(btrim(y))) from unnest(j.list_unique_regions) y), ',')
      end as vc_regions_norm
    from joined j
  ),
  rows as (
    -- days between (days)
    select
      'days_between_first_last:days'::text as field,
      '(date_last_sighted - date_first_sighted)::int'::text as formula,
      count(*) filter (where d_first is not null and d_last is not null) as total_rows,
      count(*) filter (where d_first is not null and d_last is not null and v_between is not null and (d_last - d_first) = v_between::int) as matches,
      count(*) filter (where d_first is not null and d_last is not null and v_between is not null and (d_last - d_first) <> v_between::int) as mismatches,
      count(*) filter (where v_between is null) as null_in_csv,
      false as missing_dependencies
    from norm

    union all
    -- days between (years)
    select
      'days_between_first_last:years',
      '(date_last_sighted - date_first_sighted)/365.25',
      count(*) filter (where d_first is not null and d_last is not null),
      count(*) filter (where d_first is not null and d_last is not null and v_between is not null and abs(((d_last - d_first)/365.25) - v_between::numeric) <= 0.02),
      count(*) filter (where d_first is not null and d_last is not null and v_between is not null and abs(((d_last - d_first)/365.25) - v_between::numeric) > 0.02),
      count(*) filter (where v_between is null),
      false
    from norm

    union all
    -- days since last sighting
    select
      'days_since_last_sighting',
      '(current_date - date_last_sighted)::int',
      count(*) filter (where d_last is not null),
      count(*) filter (where d_last is not null and v_since is not null and (current_date - d_last) = v_since::int),
      count(*) filter (where d_last is not null and v_since is not null and (current_date - d_last) <> v_since::int),
      count(*) filter (where v_since is null),
      false
    from norm

    union all
    -- last_sex
    select
      'last_sex',
      'latest s.gender by date',
      count(*),
      count(*) filter (where has_view and lower(coalesce(csv_last_sex,'')) = lower(coalesce(last_sex,''))),
      count(*) filter (where has_view and csv_last_sex is not null and last_sex is not null and lower(csv_last_sex) <> lower(last_sex)),
      count(*) filter (where csv_last_sex is null),
      not has_view
    from norm

    union all
    -- last_size
    select
      'last_size',
      'latest size measurement',
      count(*),
      count(*) filter (where has_view and csv_last_size is not null and last_size is not null and csv_last_size::numeric = last_size::numeric),
      count(*) filter (where has_view and csv_last_size is not null and last_size is not null and csv_last_size::numeric <> last_size::numeric),
      count(*) filter (where csv_last_size is null),
      not has_view
    from norm

    union all
    -- last_age_class
    select
      'last_age_class',
      'latest age_class by date',
      count(*),
      count(*) filter (where has_view and lower(coalesce(csv_last_age_class,'')) = lower(coalesce(last_age_class,''))),
      count(*) filter (where has_view and csv_last_age_class is not null and last_age_class is not null and lower(csv_last_age_class) <> lower(last_age_class)),
      count(*) filter (where csv_last_age_class is null),
      not has_view
    from norm

    union all
    -- totals
    select
      'total_biopsies',
      'count of biopsies',
      count(*),
      count(*) filter (where has_view and csv_total_biopsies = total_biopsies),
      count(*) filter (where has_view and csv_total_biopsies is not null and total_biopsies is not null and csv_total_biopsies <> total_biopsies),
      count(*) filter (where csv_total_biopsies is null),
      not has_view
    from norm

    union all
    select
      'total_sightings',
      'count sightings per catalog',
      count(*),
      count(*) filter (where has_view and csv_total_sightings = total_sightings),
      count(*) filter (where has_view and csv_total_sightings is not null and total_sightings is not null and csv_total_sightings <> total_sightings),
      count(*) filter (where csv_total_sightings is null),
      not has_view
    from norm

    union all
    select
      'total_tags',
      'count tags',
      count(*),
      count(*) filter (where has_view and csv_total_tags = total_tags),
      count(*) filter (where has_view and csv_total_tags is not null and total_tags is not null and csv_total_tags <> total_tags),
      count(*) filter (where csv_total_tags is null),
      not has_view
    from norm

    union all
    -- distinct years
    select
      'count_unique_years_sighted',
      'distinct years count',
      count(*),
      count(*) filter (where has_view and csv_count_unique_years = count_unique_years_sighted),
      count(*) filter (where has_view and csv_count_unique_years is not null and count_unique_years_sighted is not null and csv_count_unique_years <> count_unique_years_sighted),
      count(*) filter (where csv_count_unique_years is null),
      not has_view
    from norm

    union all
    -- set equality on lists (CSV normalized string vs view-normalized string)
    select
      'list_years_sighted',
      'normalized set equal (CSV vs view)',
      count(*),
      count(*) filter (where has_view and csv_years_list_norm is not null and vc_years_list_norm is not null and csv_years_list_norm = vc_years_list_norm),
      count(*) filter (where has_view and csv_years_list_norm is not null and vc_years_list_norm is not null and csv_years_list_norm <> vc_years_list_norm),
      count(*) filter (where csv_years_list_norm is null),
      not has_view
    from norm

    union all
    select
      'list_unique_locations',
      'normalized set equal (CSV vs view)',
      count(*),
      count(*) filter (where has_view and csv_locations_norm is not null and vc_locations_norm is not null and csv_locations_norm = vc_locations_norm),
      count(*) filter (where has_view and csv_locations_norm is not null and vc_locations_norm is not null and csv_locations_norm <> vc_locations_norm),
      count(*) filter (where csv_locations_norm is null),
      not has_view
    from norm

    union all
    select
      'list_unique_regions',
      'normalized set equal (CSV vs view)',
      count(*),
      count(*) filter (where has_view and csv_regions_norm is not null and vc_regions_norm is not null and csv_regions_norm = vc_regions_norm),
      count(*) filter (where has_view and csv_regions_norm is not null and vc_regions_norm is not null and csv_regions_norm <> vc_regions_norm),
      count(*) filter (where csv_regions_norm is null),
      not has_view
    from norm
  )
  select *
  from rows
  where p_checks is null
     or split_part(field, ':', 1) = any (p_checks);
end;
$$;

grant execute on function public.fn_imports_groundtruth_catalog(text[]) to authenticated;

-- Optional: fetch sample mismatches for a given field
create or replace function public.fn_imports_groundtruth_catalog_mismatches(p_field text, p_limit int default 50)
returns table(pk_catalog_id int, csv_value text, view_value text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with s as (
    select
      pk_catalog_id,
      fn_parse_catalog_date(date_first_sighted) as d_first,
      fn_parse_catalog_date(date_last_sighted)  as d_last,
      nullif(regexp_replace(coalesce(days_between_first_last_sighting, days_between_first_last, '')::text,'[^0-9\.\-]','','g'),'')::numeric as v_between,
      nullif(regexp_replace(coalesce(days_since_last_sighting,  days_since_last_sighitng, '')::text,'[^0-9\.\-]','','g'),'')::numeric as v_since,
      nullif(btrim(last_sex), '') as csv_last_sex,
      nullif(regexp_replace(coalesce(last_size, c_last_size, '')::text, '[^0-9\.\-]', '', 'g'),'')::numeric as csv_last_size,
      nullif(regexp_replace(coalesce(total_biopsies,'')::text, '[^0-9]', '', 'g'),'')::int    as csv_total_biopsies,
      nullif(regexp_replace(coalesce(total_sightings,'')::text,'[^0-9]', '', 'g'),'')::int    as csv_total_sightings,
      nullif(regexp_replace(coalesce(total_tags,'')::text,     '[^0-9]', '', 'g'),'')::int    as csv_total_tags,
      nullif(regexp_replace(coalesce(count_unique_years_sighted,'')::text,'[^0-9]','','g'),'')::int as csv_count_unique_years,
      nullif(btrim(last_age_class), '') as csv_last_age_class,
      nullif(btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(coalesce(list_years_sighted,''), chr(11), ',', 'g'),
          '[;| ]+', ',', 'g'),
        ',+', ',', 'g')
      ), '') as csv_years_list_norm,
      nullif(btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(coalesce(list_unique_locations,'')), chr(11), ',', 'g'),
          '[;|]+', ',', 'g'),
        ',+', ',', 'g')
      ), '') as csv_locations_norm,
      nullif(btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(coalesce(list_unique_regions,'')), chr(11), ',', 'g'),
          '[;|]+', ',', 'g'),
        ',+', ',', 'g')
      ), '') as csv_regions_norm
    from public.stg_catalog
  ),
  vc as (select * from public.v_catalog_computed),
  j as (
    select s.*, vc.*
    from s left join vc using (pk_catalog_id)
  ),
  norm as (
    select
      j.*,
      case when j.list_years_sighted is null then null
           else array_to_string((select array_agg(distinct y order by y) from unnest(j.list_years_sighted) y), ',')
      end as vc_years_list_norm,
      case when j.list_unique_locations is null then null
           else array_to_string((select array_agg(distinct lower(btrim(y)) order by lower(btrim(y))) from unnest(j.list_unique_locations) y), ',')
      end as vc_locations_norm,
      case when j.list_unique_regions is null then null
           else array_to_string((select array_agg(distinct lower(btrim(y)) order by lower(btrim(y))) from unnest(j.list_unique_regions) y), ',')
      end as vc_regions_norm
    from j
  )
  select * from (
    -- Switch based on p_field
    select pk_catalog_id, v_between::text as csv_value, (date_last_sighted - date_first_sighted)::int::text as view_value
      from norm
      where p_field = 'days_between_first_last:days'
        and v_between is not null
        and (date_last_sighted is not null and date_first_sighted is not null)
        and (date_last_sighted - date_first_sighted) <> v_between::int

    union all
    select pk_catalog_id, v_since::text, (current_date - date_last_sighted)::int::text
      from norm
      where p_field = 'days_since_last_sighting'
        and v_since is not null and date_last_sighted is not null
        and (current_date - date_last_sighted) <> v_since::int

    union all
    select pk_catalog_id, csv_last_sex, last_sex
      from norm
      where p_field = 'last_sex'
        and csv_last_sex is not null and last_sex is not null
        and lower(csv_last_sex) <> lower(last_sex)

    union all
    select pk_catalog_id, csv_last_size::text, last_size::text
      from norm
      where p_field = 'last_size'
        and csv_last_size is not null and last_size is not null
        and csv_last_size::numeric <> last_size::numeric

    union all
    select pk_catalog_id, csv_last_age_class, last_age_class
      from norm
      where p_field = 'last_age_class'
        and csv_last_age_class is not null and last_age_class is not null
        and lower(csv_last_age_class) <> lower(last_age_class)

    union all
    select pk_catalog_id, csv_total_biopsies::text, total_biopsies::text
      from norm
      where p_field = 'total_biopsies'
        and csv_total_biopsies is not null and total_biopsies is not null
        and csv_total_biopsies <> total_biopsies

    union all
    select pk_catalog_id, csv_total_sightings::text, total_sightings::text
      from norm
      where p_field = 'total_sightings'
        and csv_total_sightings is not null and total_sightings is not null
        and csv_total_sightings <> total_sightings

    union all
    select pk_catalog_id, csv_total_tags::text, total_tags::text
      from norm
      where p_field = 'total_tags'
        and csv_total_tags is not null and total_tags is not null
        and csv_total_tags <> total_tags

    union all
    select pk_catalog_id, csv_count_unique_years::text, count_unique_years_sighted::text
      from norm
      where p_field = 'count_unique_years_sighted'
        and csv_count_unique_years is not null and count_unique_years_sighted is not null
        and csv_count_unique_years <> count_unique_years_sighted

    union all
    select pk_catalog_id, csv_years_list_norm, vc_years_list_norm
      from norm
      where p_field = 'list_years_sighted'
        and csv_years_list_norm is not null and vc_years_list_norm is not null
        and csv_years_list_norm <> vc_years_list_norm

    union all
    select pk_catalog_id, csv_locations_norm, vc_locations_norm
      from norm
      where p_field = 'list_unique_locations'
        and csv_locations_norm is not null and vc_locations_norm is not null
        and csv_locations_norm <> vc_locations_norm

    union all
    select pk_catalog_id, csv_regions_norm, vc_regions_norm
      from norm
      where p_field = 'list_unique_regions'
        and csv_regions_norm is not null and vc_regions_norm is not null
        and csv_regions_norm <> vc_regions_norm
  ) z
  limit p_limit;
end;
$$;

grant execute on function public.fn_imports_groundtruth_catalog_mismatches(text,int) to authenticated;
