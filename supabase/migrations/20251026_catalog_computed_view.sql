create or replace view public.v_catalog_computed as
with ms as (
  select
    c.pk_catalog_id,
    s.pk_sighting_id,
    s.sighting_date,
    s.region,
    s.sitelocation,
    s.island,
    m.gender,
    m.age_class,
    coalesce(m.size_disc_len_m, m.size_m, m.estimated_size_m) as size_num,
    coalesce(m.total_biopsies, 0) as biopsies,
    coalesce(m.total_tags, 0)      as tags
  from public.catalog   c
  left join public.mantas    m on m.fk_catalog_id  = c.pk_catalog_id
  left join public.sightings s on s.pk_sighting_id = m.fk_sighting_id
)
select
  ms.pk_catalog_id,

  -- first/last sighting dates
  min(ms.sighting_date) as date_first_sighted,
  max(ms.sighting_date) as date_last_sighted,

  -- last_sex: latest by sighting_date, then newest manta id
  (
    select m1.gender
    from public.mantas m1
    join public.sightings s1 on s1.pk_sighting_id = m1.fk_sighting_id
    where m1.fk_catalog_id = ms.pk_catalog_id and m1.gender is not null
    order by s1.sighting_date desc nulls last, m1.pk_manta_id desc
    limit 1
  ) as last_sex,

  -- last_size: latest size measurement by sighting_date
  (
    select coalesce(m1.size_disc_len_m, m1.size_m, m1.estimated_size_m)
    from public.mantas m1
    join public.sightings s1 on s1.pk_sighting_id = m1.fk_sighting_id
    where m1.fk_catalog_id = ms.pk_catalog_id
      and (m1.size_disc_len_m is not null or m1.size_m is not null or m1.estimated_size_m is not null)
    order by s1.sighting_date desc nulls last, m1.pk_manta_id desc
    limit 1
  ) as last_size,

  -- last_age_class: latest non-null by sighting_date
  (
    select m1.age_class
    from public.mantas m1
    join public.sightings s1 on s1.pk_sighting_id = m1.fk_sighting_id
    where m1.fk_catalog_id = ms.pk_catalog_id and m1.age_class is not null
    order by s1.sighting_date desc nulls last, m1.pk_manta_id desc
    limit 1
  ) as last_age_class,

  -- counts and distinct-year list
  count(distinct ms.pk_sighting_id)                                         as total_sightings,
  sum(ms.biopsies)                                                           as total_biopsies,
  sum(ms.tags)                                                               as total_tags,
  array_remove(array_agg(distinct extract(year from ms.sighting_date)::int), null) as list_years_sighted,
  count(distinct extract(year from ms.sighting_date)::int)                   as count_unique_years_sighted,

  -- distinct text lists (kept as arrays to normalize & compare)
  array_remove(array_agg(distinct nullif(btrim(ms.sitelocation), '')), null) as list_unique_locations,
  array_remove(array_agg(distinct nullif(btrim(ms.region),      '')), null) as list_unique_regions,

  -- pass-through for easy joins/labels
  (select name    from public.catalog c2 where c2.pk_catalog_id = ms.pk_catalog_id) as name,
  (select species from public.catalog c2 where c2.pk_catalog_id = ms.pk_catalog_id) as species
from ms
group by ms.pk_catalog_id;
