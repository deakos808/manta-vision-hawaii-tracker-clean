-- Batch 3E-A: compatibility stage. Existing table/view access is unchanged.
-- Public guarded wrappers execute owner-only private implementations.
begin;
-- No caller-supplied SQL, filters, identity, or column selection.
create function private.admin_biopsy_browse() returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or public.is_admin_user() is not true then
    raise exception using errcode = '42501', message = 'Active administrator access required';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb)
    from (
      select b.pk_biopsy_id, b.fk_catalog_id, b.fk_manta_id, b.fk_sighting_id, b.sample_date,
        case when c.pk_catalog_id is null then null else jsonb_build_object(
          'pk_catalog_id', c.pk_catalog_id, 'name', c.name,
          'best_catalog_ventral_thumb_url', c.best_catalog_ventral_thumb_url,
          'last_gender', c.last_gender, 'last_age_class', c.last_age_class,
          'species', c.species, 'total_biopsies', c.total_biopsies) end as catalog,
        case when s.pk_sighting_id is null then null
          else jsonb_build_object('is_mprf', s.is_mprf) end as sightings
      from public.biopsies b
      left join public.catalog c on c.pk_catalog_id = b.fk_catalog_id
      left join public.sightings s on s.pk_sighting_id = b.fk_sighting_id
      order by b.created_at desc
      limit 2000
    ) rows
  );
end;
$function$;
revoke all on function private.admin_biopsy_browse() from public, anon, authenticated, service_role;
alter function private.admin_biopsy_browse() owner to postgres;

create function public.admin_biopsy_browse() returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or public.is_admin_user() is not true then
    raise exception using errcode = '42501', message = 'Active administrator access required';
  end if;
  return private.admin_biopsy_browse();
end;
$function$;
alter function public.admin_biopsy_browse() owner to postgres;
revoke all on function public.admin_biopsy_browse() from public, anon, authenticated, service_role;
grant execute on function public.admin_biopsy_browse() to authenticated;

-- No caller-supplied SQL, filters, identity, or column selection.
create function private.admin_biopsy_age_ranking() returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or public.is_admin_user() is not true then
    raise exception using errcode = '42501', message = 'Active administrator access required';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb)
    from (
      select v.pk_catalog_id,
        v.pk_mprf_catalog_id,
        v.hamer_name,
        v.mprf_name,
        v.gender,
        v.last_age_class,
        v.last_size_m,
        v.pk_biopsy_id,
        v.mprf_biopsy_id,
        v.jonathan_sample_id,
        v.pk_manta_id,
        v.date_of_biopsy,
        v.effective_first_sighting,
        v.total_years_sighted,
        v.ever_seen_as_pup,
        v.known_age_from_pup,
        v.first_year_confirmed_immature,
        v.first_year_confirmed_mature,
        v.min_years_known_mature,
        v.estimated_age_at_last_sighting_years,
        v.janice_min_age_at_biopsy_yrs,
        v.age_rank_v2,
        v.janice_age_rank,
        v.age_at_last_sighting_years,
        v.age_years_at_biopsy,
        v.first_year,
        v.last_year,
        v.maturity_bonus_b,
        v.relative_age_score_v2,
        v.original_relative_age_score,
        v.original_relative_age_rank,
        v.age_rank_justification_v2,
        v.mprf_first_sighting_date,
        v.mprf_first_sighting_size,
        v.mprf_last_age_class,
        v.mprf_total_years_seen,
        v.mprf_size_dw,
        v.janice_age_rank_raw,
        v.age_years_at_biopsy_v3,
        v.known_age_from_pup_v3,
        v.maturity_bonus_b_v3,
        v.relative_age_score_v3,
        v.age_rank_v3,
        v.age_rank_justification_v3
      from public.kona_biopsy_age_rank_view_v3 v
      order by v.age_rank_v3 asc
    ) rows
  );
end;
$function$;
revoke all on function private.admin_biopsy_age_ranking() from public, anon, authenticated, service_role;
alter function private.admin_biopsy_age_ranking() owner to postgres;

create function public.admin_biopsy_age_ranking() returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or public.is_admin_user() is not true then
    raise exception using errcode = '42501', message = 'Active administrator access required';
  end if;
  return private.admin_biopsy_age_ranking();
end;
$function$;
alter function public.admin_biopsy_age_ranking() owner to postgres;
revoke all on function public.admin_biopsy_age_ranking() from public, anon, authenticated, service_role;
grant execute on function public.admin_biopsy_age_ranking() to authenticated;

commit;
