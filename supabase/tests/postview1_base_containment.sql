-- DISPOSABLE ONLY. Exact target schemas and live view/RPC definitions; synthetic data.
-- Supporting tables retain required column types, not unrelated constraints/defaults.
-- auth.uid/is_admin_user are test identity stubs; no live Auth connection.
\set ON_ERROR_STOP on
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA private; CREATE SCHEMA auth; CREATE SCHEMA test;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.admin',true),'false')='true' $$;
CREATE TABLE public._bak_all_session ("pk_sighting_id" integer, "lat_prev" numeric, "lon_prev" numeric, "backup_name" text);
GRANT ALL ON public._bak_all_session TO authenticated,service_role;
CREATE TABLE public.biopsies ("pk_biopsy_id" bigint, "fk_manta_id" integer, "fk_sighting_id" integer, "fk_catalog_id" integer, "sample_date" date, "sample_time" time without time zone, "collector" text, "method" text, "island" text, "region" text, "location" text, "tissue_type" text, "lab_id" text, "notes" text, "source" text, "raw_sample_id" text, "created_at" timestamp with time zone, "updated_at" timestamp with time zone);
GRANT ALL ON public.biopsies TO authenticated,service_role;
CREATE TABLE public.catalog ("pk_catalog_id" integer, "catalog_uuid" uuid, "name" text, "species" text, "date_first_sighted" date, "date_last_sighted" date, "days_between_first_last" integer, "notes" text, "best_photo_id" text, "best_dorsal_photo_id" text, "best_cat_ventral_id" integer, "best_cat_dorsal_id" integer, "best_cat_mask_ventral_id" integer, "best_cat_mask_ventral_id_int" integer, "best_photo_url" text, "best_catalog_photo_url" text, "pk_catalog_uuid" uuid, "merged_into_pk_catalog_id" integer, "best_catalog_ventral_thumb_url" text, "last_age_class" text, "list_unique_locations" text, "list_unique_regions" text, "years_between_first_last" numeric, "days_since_last_sighting" integer, "list_years_sighted" integer[], "count_unique_years_sighted" integer, "total_sightings" integer, "total_biopsies" integer, "total_tags" integer, "last_size_m" numeric, "last_gender" text, "is_mprf" boolean, "is_mprf_added" boolean, "total_sighting_days" integer, "biopsy_role" text, "biopsy_role_reason" text, "age_at_first_kona_biopsy_years" numeric, "age_at_first_kona_biopsy_confidence" text, "parent_probability" numeric, "parent_child_probability_reason" text, "relative_age_score" numeric, "relative_age_rank_kona" integer, "relative_age_percentile_kona" numeric, "MPRF_first_sighted_date" date, "MPRF_total_years_seen" integer, "MPRF_age_class_at_first_sighting" text, "mprf_date_first_sighted" date, "deceased" text, "mprf_blackmorph" text, "mprf_pupinitially" text, "mprf_current_maturity" text, "mprf_size_estimate" numeric, "mprf_maturity_comment" text, "is_retired" boolean);
GRANT ALL ON public.catalog TO authenticated,service_role;
CREATE TABLE public.kona_biopsy_consolidated ("sample_no" text NOT NULL, "psn_id" text, "has_whitney" boolean, "has_eli" boolean, "include_in_age_rank" boolean, "mprf_id" integer, "mprf_manta_name" text, "pk_catalog_id" integer, "hamer_name" text, "biopsy_date" date, "sex" text, "size_at_biopsy_m" numeric, "age_class_at_biopsy" text, "ek_sighting_location" text, "ek_sample_location" text, "ek_next_time_resighted" text, "ek_last_sighted_as_of" text, "age_years_for_ranking" numeric, "relative_age_score" numeric, "relative_age_rank" integer, "relative_age_percentile" numeric, "age_rank_reason" text, "hamer_first_sighting_date" date, "mprf_first_sighting_date" date, "hamer_first_size_m" numeric, "hamer_first_size_date" date, "hamer_last_size_m" numeric, "hamer_last_size_date" date, "mprf_age_class_at_first_sighting" text, "hamer_total_years_seen" integer, "mprf_total_years_seen" integer, PRIMARY KEY (sample_no));
GRANT ALL ON public.kona_biopsy_consolidated TO authenticated,service_role;
CREATE TABLE public.location_overrides ("island" text, "region" text, "sitelocation" text, "lat_found" numeric, "lon_found" numeric, "lat_offshore" numeric, "lon_offshore" numeric, "geocoder_note" text);
GRANT ALL ON public.location_overrides TO authenticated,service_role;
CREATE TABLE public.mantas ("pk_manta_id" integer, "manta_uuid" uuid, "fk_catalog_id" integer, "fk_sighting_id" integer, "best_ventral_photo_id" text, "ref_biometrics_id" text, "best_manta_ventral_photo_url" text, "best_ventral_photo_id_int" integer, "best_manta_ventral_photo_url2" text, "gender" text, "age_class" text, "size_m_legacy" numeric, "estimated_size_m" numeric, "jon_sizze_m" numeric, "species" text, "total_biopsies" integer, "total_tags" integer, "ref_biopsy_id" text, "ref_ptt_id" text, "injury_type" text, "injury_notes" text, "photographer" text, "mp_number" text, "updated_at" timestamp with time zone, "jon_size_m" numeric, "best_manta_dorsal_photo_url" text, "new_best_manta_ventral_photo_id" integer, "new_best_manta_dorsal_photo_id" integer, "best_manta_photo_url" text, "fk_catalog_uuid" uuid, "fk_sighting_uuid" uuid, "pk_manta_uuid" uuid, "size_scale_px" numeric, "size_disc_len_px" numeric, "size_scale_actual_cm" numeric, "size_disc_len_m" numeric, "size_disc_width_m" numeric, "size_dw_m" numeric, "size_m" numeric, "is_mprf" boolean, "name" text, "mprf_external_manta_id" integer, "mprf_date" date, "pk_mprf_catalog_id" integer, "mprf_comments" text, "mprf_status" text, "sighting_date" date, "no_ventral_photos" boolean, "catalog_unknown" boolean, "submission_manta_id" text);
GRANT ALL ON public.mantas TO authenticated,service_role;
CREATE TABLE public.mantas_import_stage ("pk_manta_id" text, "fk_catalog_id" text, "fk_sighting_id" text, "best_ventral_photo_id" text, "ref_biopsy_id" text, "ref_tag_id" text);
GRANT ALL ON public.mantas_import_stage TO authenticated,service_role;
CREATE TABLE public.mprf_catalog_map ("pk_mprf_catalog_id" integer, "pk_catalog_id" integer, "created_at" timestamp with time zone, "maturity_code" text, "mprf_species" text, "mprf_last_gender" text, "mprf_first_sighting_date" text);
GRANT ALL ON public.mprf_catalog_map TO authenticated,service_role;
CREATE TABLE public.sightings ("pk_sighting_id" integer, "sighting_date" date, "month_name" text, "year" integer, "survey_no" integer, "sighting_no" integer, "island" text, "region" text, "sitelocation" text, "latitude" numeric, "longitude" numeric, "start_time" text, "end_time" text, "organization" text, "photographer" text, "total_mantas" integer, "skunks" text, "behavior" text, "injuries_observed" text, "tidal_state" text, "day_night" text, "notes" text, "standardize_survey" text, "total_manta_ids" integer, "list_manta_ids" text, "total_mantas_sized" integer, "total_mantas_biopsied" integer, "total_survey_time" text, "population" text, "sighting_uuid" uuid, "pk_sighting_uuid" uuid, "sighting_year" integer, "mprf_external_id" text, "location" text, "is_mprf" boolean, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "pk_mprf_sighting_id" text, "pk_mprf_catalog_id_list" integer[], "plankton" integer, "water_temp" numeric, "number_of_boats" integer, "number_of_divers" integer, "number_of_snorkelers" integer, "list_manta_ids_2" text, "list_catalog_ids" text, "location_unknown" boolean);
GRANT ALL ON public.sightings TO authenticated,service_role;
CREATE TABLE public.stg_eli_keller_biopsies ("mprf_sample_number" text, "mprf_biopsy_date" text, "mprf_manta_name" text, "pk_mprf_catalog_id" bigint, "mprf_gender" text, "mprf_location" text, "mprf_area_sampled" text, "mprf_photos" text, "mprf_manta_identifier" text, "mprf_biopsier" text, "mprf_post_biopsy_resight" text, "mprf_last_resight_date" text);
GRANT ALL ON public.stg_eli_keller_biopsies TO authenticated,service_role;
CREATE TABLE public.stg_jonathan_whiteny_biopsies ("No" bigint, "jon_psn_sequence_number" text, "mprf_sample_number" text, "jon_population" text, "mprf_sample_number2" text, "jon_biopsy_date" text, "jon_manta_name" text, "pk_mprf_catalog_id" text, "jon_gender" text, "mprf_biopsy_location" text, "mprf_area_sampled" text, "mprf_photos" text, "mprf_manta_identifier" text, "mprf_biopsier" text, "hamer_manta_name" text, "pk_catalog_id" text, "pk_biopsy_id" text, "size_at_biopsy" text, "jon_age_class_at_biopsy" text, "jon_first_sighting_date" text, "jon_included_age_rank" boolean);
GRANT ALL ON public.stg_jonathan_whiteny_biopsies TO authenticated,service_role;
CREATE TABLE public.stg_kona_biopsy_age_ranking_janice ("pk_mprf_catalog_id" integer, "mprf_manta_name" text, "mprf_gender" text, "mprf_first_sighting_date" date, "mprf_first_sighting_size" text, "mprf_last_age_class" text, "mprf_biopsy_date" timestamp without time zone, "janice_min_age_at_biopsy" numeric, "mprf_last_resight_date" timestamp without time zone, "mprf_total_years_seen" numeric, "mprf_size_dw" numeric, "janice_age_rank" numeric);
GRANT ALL ON public.stg_kona_biopsy_age_ranking_janice TO authenticated,service_role;
CREATE TABLE public.stg_mprf_catalog ("id" bigint, "import_batch_id" uuid, "source_file" text, "row_no" integer, "pk_mprf_catalog_id_text" text, "name_text" text, "species_text" text, "last_gender_text" text, "last_age_class_text" text, "date_first_sighted_text" text, "raw" jsonb);
GRANT ALL ON public.stg_mprf_catalog TO authenticated,service_role;
INSERT INTO kona_biopsy_consolidated(sample_no,psn_id,pk_catalog_id) VALUES('SYNTHETIC','SYNTHETIC',1);
INSERT INTO _bak_all_session VALUES(1,20,-156,'SYNTHETIC');
INSERT INTO mantas_import_stage VALUES('1','1','1','','','');
INSERT INTO catalog(pk_catalog_id,name,total_biopsies,date_first_sighted,date_last_sighted) VALUES(1,'SYNTHETIC',1,'2010-01-01','2020-01-01');
INSERT INTO sightings(pk_sighting_id,sighting_date,island) VALUES(1,'2020-01-01','Big Island');
INSERT INTO biopsies(pk_biopsy_id,fk_catalog_id,fk_sighting_id,sample_date) VALUES(1,1,1,'2020-01-01');
CREATE OR REPLACE FUNCTION public.nullif_blank(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  select nullif(btrim($1),'')
$function$
;
CREATE OR REPLACE FUNCTION public.try_cast_int(p_text text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  return (nullif_blank(p_text))::integer;
exception when others then
  return null;
end $function$
;
CREATE VIEW public.kona_biopsy_age_rank_view AS  WITH kona_biopsy_sightings AS (
         SELECT b.fk_catalog_id,
            b.pk_biopsy_id,
            b.sample_date,
            s.pk_sighting_id,
            s.sighting_date,
            s.island
           FROM biopsies b
             JOIN sightings s ON s.pk_sighting_id = b.fk_sighting_id
          WHERE b.fk_catalog_id IS NOT NULL AND s.island = 'Big Island'::text
        ), kona_catalogs AS (
         SELECT kbs.fk_catalog_id,
            min(kbs.sample_date) AS first_biopsy_date,
            max(kbs.sample_date) AS last_biopsy_date,
            count(DISTINCT kbs.pk_biopsy_id) AS kona_biopsy_count
           FROM kona_biopsy_sightings kbs
          GROUP BY kbs.fk_catalog_id
        ), base AS (
         SELECT c.pk_catalog_id,
            mcm.pk_mprf_catalog_id,
            c.name,
            c.last_gender AS gender,
            c.last_age_class,
            c.last_size_m,
            c.date_first_sighted,
            c.date_last_sighted,
            COALESCE(
                CASE
                    WHEN c."MPRF_total_years_seen" IS NOT NULL AND c.count_unique_years_sighted IS NOT NULL AND c."MPRF_total_years_seen" > c.count_unique_years_sighted THEN c."MPRF_total_years_seen"
                    WHEN c."MPRF_total_years_seen" IS NOT NULL AND c.count_unique_years_sighted IS NULL THEN c."MPRF_total_years_seen"
                    ELSE NULL::integer
                END, c.count_unique_years_sighted,
                CASE
                    WHEN c.date_first_sighted IS NOT NULL AND c.date_last_sighted IS NOT NULL THEN (EXTRACT(year FROM c.date_last_sighted) - EXTRACT(year FROM c.date_first_sighted) + 1::numeric)::integer
                    ELSE NULL::integer
                END) AS years_seen,
            c.total_biopsies,
            c.total_sightings,
            kc.first_biopsy_date,
            kc.last_biopsy_date,
            kc.kona_biopsy_count,
            c.age_at_first_kona_biopsy_years,
            c.age_at_first_kona_biopsy_confidence,
            c.parent_probability,
            c.parent_child_probability_reason,
            c.biopsy_role,
            c.biopsy_role_reason,
            c."MPRF_first_sighted_date",
            c."MPRF_total_years_seen",
            c."MPRF_age_class_at_first_sighting",
                CASE
                    WHEN c."MPRF_first_sighted_date" IS NOT NULL AND (c.date_first_sighted IS NULL OR c."MPRF_first_sighted_date" < c.date_first_sighted) THEN c."MPRF_first_sighted_date"
                    ELSE c.date_first_sighted
                END AS effective_first_sighted_date
           FROM catalog c
             JOIN kona_catalogs kc ON kc.fk_catalog_id = c.pk_catalog_id
             LEFT JOIN mprf_catalog_map mcm ON mcm.pk_catalog_id = c.pk_catalog_id
          WHERE c.total_biopsies IS NOT NULL AND c.total_biopsies > 0
        ), with_maturity AS (
         SELECT b.pk_catalog_id,
            b.pk_mprf_catalog_id,
            b.name,
            b.gender,
            b.last_age_class,
            b.last_size_m,
            b.date_first_sighted,
            b.date_last_sighted,
            b.effective_first_sighted_date,
            b.years_seen,
            b.total_biopsies,
            b.total_sightings,
            b.first_biopsy_date,
            b.last_biopsy_date,
            b.kona_biopsy_count,
                CASE
                    WHEN b.age_at_first_kona_biopsy_years IS NOT NULL THEN b.age_at_first_kona_biopsy_years
                    WHEN b."MPRF_age_class_at_first_sighting" ~~* 'pup%'::text AND b.effective_first_sighted_date IS NOT NULL AND b.first_biopsy_date IS NOT NULL THEN GREATEST(EXTRACT(year FROM b.first_biopsy_date)::integer - EXTRACT(year FROM b.effective_first_sighted_date)::integer, 0)::numeric
                    ELSE NULL::numeric
                END AS age_at_first_kona_biopsy_years,
                CASE
                    WHEN b.age_at_first_kona_biopsy_years IS NOT NULL THEN b.age_at_first_kona_biopsy_confidence
                    WHEN b."MPRF_age_class_at_first_sighting" ~~* 'pup%'::text AND b.effective_first_sighted_date IS NOT NULL AND b.first_biopsy_date IS NOT NULL THEN 'actual'::text
                    ELSE b.age_at_first_kona_biopsy_confidence
                END AS age_at_first_kona_biopsy_confidence,
            b.parent_probability,
            b.parent_child_probability_reason,
            b.biopsy_role,
            b.biopsy_role_reason,
            b."MPRF_first_sighted_date",
            b."MPRF_total_years_seen",
            b."MPRF_age_class_at_first_sighting",
            EXTRACT(year FROM b.effective_first_sighted_date)::integer AS first_year,
            EXTRACT(year FROM b.first_biopsy_date)::integer AS biopsy_year,
                CASE
                    WHEN b.last_age_class ~~* 'adult%'::text THEN true
                    WHEN b.gender = 'Male'::text AND b.last_size_m IS NOT NULL AND b.last_size_m >= 2.8 THEN true
                    WHEN b.gender = 'Female'::text AND b.last_size_m IS NOT NULL AND b.last_size_m >= 3.4 THEN true
                    ELSE false
                END AS is_mature_size_or_ageclass,
            COALESCE(
                CASE
                    WHEN b.age_at_first_kona_biopsy_years IS NOT NULL THEN b.age_at_first_kona_biopsy_years
                    WHEN b."MPRF_age_class_at_first_sighting" ~~* 'pup%'::text AND b.effective_first_sighted_date IS NOT NULL AND b.first_biopsy_date IS NOT NULL THEN GREATEST(EXTRACT(year FROM b.first_biopsy_date)::integer - EXTRACT(year FROM b.effective_first_sighted_date)::integer, 0)::numeric
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN b.effective_first_sighted_date IS NOT NULL AND b.first_biopsy_date IS NOT NULL THEN GREATEST(EXTRACT(year FROM b.first_biopsy_date)::integer - EXTRACT(year FROM b.effective_first_sighted_date)::integer, 0)::numeric
                    ELSE NULL::numeric
                END) AS age_years_for_ranking
           FROM base b
        ), scored AS (
         SELECT w.pk_catalog_id,
            w.pk_mprf_catalog_id,
            w.name,
            w.gender,
            w.last_age_class,
            w.last_size_m,
            w.date_first_sighted,
            w.date_last_sighted,
            w.effective_first_sighted_date,
            w.years_seen,
            w.total_biopsies,
            w.total_sightings,
            w.first_biopsy_date,
            w.last_biopsy_date,
            w.kona_biopsy_count,
            w.age_at_first_kona_biopsy_years,
            w.age_at_first_kona_biopsy_confidence,
            w.parent_probability,
            w.parent_child_probability_reason,
            w.biopsy_role,
            w.biopsy_role_reason,
            w.first_year,
            w.biopsy_year,
            w.is_mature_size_or_ageclass,
            w.age_years_for_ranking,
            w."MPRF_first_sighted_date",
            w."MPRF_total_years_seen",
            w."MPRF_age_class_at_first_sighting",
            COALESCE(w.age_years_for_ranking, 0::numeric) + 0.5 * COALESCE(w.years_seen, 0)::numeric +
                CASE
                    WHEN w.is_mature_size_or_ageclass THEN 2.0
                    ELSE 0.0
                END + COALESCE(w.last_size_m, 0::numeric) AS relative_age_score
           FROM with_maturity w
        ), ranked AS (
         SELECT s.pk_catalog_id,
            s.pk_mprf_catalog_id,
            s.name,
            s.gender,
            s.last_age_class,
            s.last_size_m,
            s.date_first_sighted,
            s.date_last_sighted,
            s.effective_first_sighted_date,
            s.years_seen,
            s.total_biopsies,
            s.total_sightings,
            s.first_biopsy_date,
            s.last_biopsy_date,
            s.kona_biopsy_count,
            s.age_at_first_kona_biopsy_years,
            s.age_at_first_kona_biopsy_confidence,
            s.parent_probability,
            s.parent_child_probability_reason,
            s.biopsy_role,
            s.biopsy_role_reason,
            s.first_year,
            s.biopsy_year,
            s.is_mature_size_or_ageclass,
            s.age_years_for_ranking,
            s.relative_age_score,
            s."MPRF_first_sighted_date",
            s."MPRF_total_years_seen",
            s."MPRF_age_class_at_first_sighting",
            rank() OVER (ORDER BY s.relative_age_score DESC) AS relative_age_rank,
                CASE
                    WHEN count(*) OVER () <= 1 THEN 1.0
                    ELSE (rank() OVER (ORDER BY s.relative_age_score DESC) - 1)::numeric / NULLIF(count(*) OVER () - 1, 0)::numeric
                END AS relative_age_percentile,
            count(*) OVER () AS total_animals
           FROM scored s
        )
 SELECT r.pk_catalog_id,
    r.name,
    r.gender,
    r.last_age_class,
    r.last_size_m,
    r.date_first_sighted,
    r.date_last_sighted,
    r.years_seen,
    r.total_biopsies,
    r.total_sightings,
    r.first_biopsy_date,
    r.last_biopsy_date,
    r.kona_biopsy_count,
    r.age_at_first_kona_biopsy_years,
    r.age_at_first_kona_biopsy_confidence,
    r.parent_probability,
    r.parent_child_probability_reason,
    r.biopsy_role,
    r.biopsy_role_reason,
    r.first_year,
    r.biopsy_year,
    r.is_mature_size_or_ageclass,
    r.age_years_for_ranking,
    r.relative_age_score,
    r.relative_age_rank,
    r.relative_age_percentile,
    TRIM(BOTH ' '::text FROM concat_ws(' '::text,
        CASE
            WHEN r.age_years_for_ranking IS NOT NULL THEN ((('Biopsied about '::text || round(r.age_years_for_ranking, 1)::text) || ' year'::text) ||
            CASE
                WHEN r.age_years_for_ranking = 1::numeric THEN ''::text
                ELSE 's'::text
            END) || ' after first Kona sighting,'::text
            ELSE 'Age at first Kona biopsy unknown; ranking relies more on years seen and maturity,'::text
        END,
        CASE
            WHEN r.years_seen IS NOT NULL AND r.years_seen > 1 THEN ('seen across '::text || r.years_seen::text) || ' Kona years,'::text
            WHEN r.years_seen = 1 THEN 'seen in 1 Kona year,'::text
            ELSE NULL::text
        END,
        CASE
            WHEN r.is_mature_size_or_ageclass AND r.last_size_m IS NOT NULL AND r.gender = 'Male'::text THEN ('male at '::text || round(r.last_size_m, 2)::text) || 'm (≥ 2.8m mature threshold),'::text
            WHEN r.is_mature_size_or_ageclass AND r.last_size_m IS NOT NULL AND r.gender = 'Female'::text THEN ('female at '::text || round(r.last_size_m, 2)::text) || 'm (≥ 3.4m mature threshold),'::text
            WHEN r.is_mature_size_or_ageclass THEN 'classified as adult / mature-size,'::text
            WHEN r.last_size_m IS NOT NULL THEN ('below estimated mature size ('::text || round(r.last_size_m, 2)::text) || 'm),'::text
            ELSE NULL::text
        END,
        CASE
            WHEN r.last_age_class ~~* 'pup%'::text THEN 'last age class recorded as pup, indicating very young early history,'::text
            WHEN r.last_age_class ~~* 'juvenile%'::text THEN 'last age class recorded as juvenile, suggesting younger relative age,'::text
            WHEN r.last_age_class ~~* 'adult%'::text THEN 'last age class recorded as adult, supporting older age,'::text
            ELSE NULL::text
        END,
        CASE
            WHEN r.age_at_first_kona_biopsy_years IS NOT NULL AND r.age_at_first_kona_biopsy_confidence IS NOT NULL THEN ((('explicit age estimate of ~'::text || round(r.age_at_first_kona_biopsy_years, 1)::text) || ' years at first Kona biopsy ('::text) || r.age_at_first_kona_biopsy_confidence) || ' confidence),'::text
            WHEN r.age_at_first_kona_biopsy_years IS NOT NULL THEN ('explicit age estimate of ~'::text || round(r.age_at_first_kona_biopsy_years, 1)::text) || ' years at first Kona biopsy,'::text
            ELSE NULL::text
        END,
        CASE
            WHEN r."MPRF_age_class_at_first_sighting" ~~* 'pup%'::text THEN 'first sighting recorded as pup / newborn, providing a near birth-year age anchor,'::text
            ELSE NULL::text
        END,
        CASE
            WHEN r.parent_probability IS NOT NULL AND r.parent_probability >= 0.8 THEN 'high probability of being a parent from calf associations,'::text
            WHEN r.parent_probability IS NOT NULL AND r.parent_probability >= 0.5 THEN 'moderate probability of being a parent,'::text
            ELSE NULL::text
        END,
        CASE
            WHEN r.biopsy_role IS NOT NULL THEN ('biopsy role: '::text || r.biopsy_role) || ','::text
            ELSE NULL::text
        END,
        CASE
            WHEN r.total_animals IS NOT NULL THEN
            CASE
                WHEN r.relative_age_rank = 1 THEN ((('oldest of '::text || r.total_animals::text) || ' ranked Kona biopsy mantas (rank 1 of '::text) || r.total_animals::text) || ').'::text
                WHEN r.relative_age_rank <= GREATEST(1, (0.1 * r.total_animals::numeric)::integer) THEN ((('among the oldest ~10% (rank '::text || r.relative_age_rank::text) || ' of '::text) || r.total_animals::text) || ').'::text
                WHEN r.relative_age_rank <= GREATEST(1, (0.25 * r.total_animals::numeric)::integer) THEN ((('within the oldest ~25% (rank '::text || r.relative_age_rank::text) || ' of '::text) || r.total_animals::text) || ').'::text
                ELSE ((((('rank '::text || r.relative_age_rank::text) || ' of '::text) || r.total_animals::text) || ' by relative age score (percentile ~'::text) || round(r.relative_age_percentile * 100::numeric, 1)::text) || '%; 0% = oldest, 100% = youngest).'::text
            END
            ELSE NULL::text
        END)) AS age_rank_reason,
    r.pk_mprf_catalog_id,
    r.effective_first_sighted_date,
    r."MPRF_first_sighted_date",
    r."MPRF_total_years_seen",
    r."MPRF_age_class_at_first_sighting"
   FROM ranked r;
REVOKE ALL ON public.kona_biopsy_age_rank_view FROM PUBLIC,anon,authenticated; GRANT ALL ON public.kona_biopsy_age_rank_view TO service_role;
CREATE VIEW public.kona_biopsy_audit AS  SELECT kona_biopsy_consolidated.sample_no AS hamer_biopsy_id,
    kona_biopsy_consolidated.psn_id AS jonathan_genetic_id,
    kona_biopsy_consolidated.mprf_id AS mprf_catalog_id,
    kona_biopsy_consolidated.mprf_manta_name,
    kona_biopsy_consolidated.pk_catalog_id AS hamer_catalog_id,
    kona_biopsy_consolidated.hamer_name
   FROM kona_biopsy_consolidated;
REVOKE ALL ON public.kona_biopsy_audit FROM PUBLIC,anon,authenticated; GRANT ALL ON public.kona_biopsy_audit TO service_role;
CREATE VIEW public.sightings_location_audit AS  WITH curr AS (
         SELECT s.pk_sighting_id,
            s.sighting_date,
            s.island,
            s.region,
            TRIM(BOTH FROM s.sitelocation) AS sitelocation,
            round(s.latitude, 5) AS lat,
            round(s.longitude, 5) AS lon,
            lower(replace(replace(replace(s.island, 'ʻ'::text, ''::text), '’'::text, ''::text), ''''::text, ''::text)) AS isl_norm,
            lower(TRIM(BOTH FROM s.sitelocation)) AS loc_norm
           FROM sightings s
        ), canon_src AS (
         SELECT DISTINCT ON (d.isl_norm, d.loc_norm) d.pk_sighting_id AS pk_canon,
            d.isl_norm,
            d.loc_norm,
            round(d.latitude, 5) AS lat5,
            round(d.longitude, 5) AS lon5
           FROM ( SELECT lower(replace(replace(replace(sightings.island, 'ʻ'::text, ''::text), '’'::text, ''::text), ''''::text, ''::text)) AS isl_norm,
                    lower(TRIM(BOTH FROM sightings.sitelocation)) AS loc_norm,
                    sightings.latitude,
                    sightings.longitude,
                    sightings.sighting_date,
                    sightings.pk_sighting_id
                   FROM sightings
                  WHERE sightings.latitude IS NOT NULL AND sightings.longitude IS NOT NULL) d
          ORDER BY d.isl_norm, d.loc_norm, d.sighting_date, d.pk_sighting_id
        ), bak AS (
         SELECT DISTINCT ON (_bak_all_session.pk_sighting_id) _bak_all_session.pk_sighting_id,
            _bak_all_session.lat_prev,
            _bak_all_session.lon_prev
           FROM _bak_all_session
          WHERE _bak_all_session.lat_prev IS NOT NULL AND _bak_all_session.lon_prev IS NOT NULL
          ORDER BY _bak_all_session.pk_sighting_id, _bak_all_session.backup_name
        ), ov AS (
         SELECT lower(replace(replace(replace(location_overrides.island, 'ʻ'::text, ''::text), '’'::text, ''::text), ''''::text, ''::text)) AS isl_norm,
            lower(TRIM(BOTH FROM location_overrides.sitelocation)) AS loc_norm,
            round(location_overrides.lat_offshore, 5) AS lat_off,
            round(location_overrides.lon_offshore, 5) AS lon_off
           FROM location_overrides
          WHERE location_overrides.lat_offshore IS NOT NULL AND location_overrides.lon_offshore IS NOT NULL
        )
 SELECT c.pk_sighting_id,
    c.sighting_date,
    c.island,
    c.region,
    c.sitelocation,
    c.lat,
    c.lon,
        CASE
            WHEN c.lat IS NULL OR c.lon IS NULL THEN 'missing'::text
            WHEN o.lat_off IS NOT NULL AND c.lat = o.lat_off AND c.lon = o.lon_off THEN 'web_offshore'::text
            WHEN b.pk_sighting_id IS NOT NULL AND b.lat_prev = c.lat AND b.lon_prev = c.lon THEN 'original'::text
            WHEN cs.lat5 IS NOT NULL AND c.lat = cs.lat5 AND c.lon = cs.lon5 THEN
            CASE
                WHEN cs.pk_canon = c.pk_sighting_id THEN 'canonical_earliest'::text
                ELSE 'copied_from_same'::text
            END
            ELSE 'unknown'::text
        END AS source_flag
   FROM curr c
     LEFT JOIN bak b ON b.pk_sighting_id = c.pk_sighting_id
     LEFT JOIN ov o ON o.isl_norm = c.isl_norm AND o.loc_norm = c.loc_norm
     LEFT JOIN canon_src cs ON cs.isl_norm = c.isl_norm AND cs.loc_norm = c.loc_norm;
REVOKE ALL ON public.sightings_location_audit FROM PUBLIC,anon,authenticated; GRANT ALL ON public.sightings_location_audit TO service_role;
CREATE VIEW public.v_mantas_import_stage_typed AS  SELECT
        CASE
            WHEN NULLIF(TRIM(BOTH FROM mantas_import_stage.pk_manta_id), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM mantas_import_stage.pk_manta_id)::integer
            ELSE NULL::integer
        END AS pk_manta_id,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM mantas_import_stage.fk_catalog_id), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM mantas_import_stage.fk_catalog_id)::integer
            ELSE NULL::integer
        END AS fk_catalog_id,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM mantas_import_stage.fk_sighting_id), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM mantas_import_stage.fk_sighting_id)::integer
            ELSE NULL::integer
        END AS fk_sighting_id,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM mantas_import_stage.best_ventral_photo_id), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM mantas_import_stage.best_ventral_photo_id)::integer
            ELSE NULL::integer
        END AS best_ventral_photo_id,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM mantas_import_stage.ref_biopsy_id), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM mantas_import_stage.ref_biopsy_id)::integer
            ELSE NULL::integer
        END AS ref_biopsy_id,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM mantas_import_stage.ref_tag_id), ''::text) ~ '^[0-9]+$'::text THEN TRIM(BOTH FROM mantas_import_stage.ref_tag_id)::integer
            ELSE NULL::integer
        END AS ref_tag_id
   FROM mantas_import_stage;
REVOKE ALL ON public.v_mantas_import_stage_typed FROM PUBLIC,anon,authenticated; GRANT ALL ON public.v_mantas_import_stage_typed TO service_role;
CREATE VIEW public.v_stg_mprf_catalog_norm AS  SELECT stg_mprf_catalog.id,
    stg_mprf_catalog.import_batch_id,
    stg_mprf_catalog.source_file,
    stg_mprf_catalog.row_no,
    stg_mprf_catalog.raw,
    try_cast_int(stg_mprf_catalog.pk_mprf_catalog_id_text) AS pk_mprf_catalog_id,
    nullif_blank(stg_mprf_catalog.name_text) AS name,
    nullif_blank(stg_mprf_catalog.species_text) AS species,
    nullif_blank(stg_mprf_catalog.last_gender_text) AS last_gender,
    nullif_blank(stg_mprf_catalog.last_age_class_text) AS last_age_class,
    nullif_blank(stg_mprf_catalog.date_first_sighted_text) AS date_first_sighted,
    try_cast_int(stg_mprf_catalog.pk_mprf_catalog_id_text) IS NOT NULL AND nullif_blank(stg_mprf_catalog.name_text) IS NOT NULL AS is_valid,
    row_number() OVER (PARTITION BY stg_mprf_catalog.import_batch_id, (lower(nullif_blank(stg_mprf_catalog.name_text))) ORDER BY stg_mprf_catalog.row_no, stg_mprf_catalog.id) AS dup_rank
   FROM stg_mprf_catalog;
REVOKE ALL ON public.v_stg_mprf_catalog_norm FROM PUBLIC,anon,authenticated; GRANT ALL ON public.v_stg_mprf_catalog_norm TO service_role;
CREATE VIEW public.kona_biopsy_age_rank_view_v2 AS  WITH base_kona AS (
         SELECT v.pk_catalog_id,
            v.pk_mprf_catalog_id,
            v.name,
            mc.name AS mprf_name,
            v.gender,
            v.last_age_class,
            v.last_size_m,
            v.date_first_sighted,
            v.date_last_sighted,
            v.effective_first_sighted_date,
            v.years_seen,
            v.total_biopsies,
            v.total_sightings,
            v.first_biopsy_date,
            v.last_biopsy_date,
            v.kona_biopsy_count,
            v.age_years_for_ranking,
            v.relative_age_score AS original_relative_age_score,
            v.relative_age_rank AS original_relative_age_rank,
            v.relative_age_percentile AS original_relative_age_percentile,
            v.age_rank_reason AS original_age_rank_reason,
            v.first_year,
            v.biopsy_year,
            v.is_mature_size_or_ageclass,
            v."MPRF_first_sighted_date",
            v."MPRF_total_years_seen",
            v."MPRF_age_class_at_first_sighting",
            EXTRACT(year FROM v.date_last_sighted)::integer AS last_year,
            j.mprf_first_sighting_date AS janice_first_sighted,
            j.mprf_total_years_seen AS janice_years_seen,
            j.mprf_last_age_class AS janice_age_class,
            j.janice_min_age_at_biopsy AS janice_min_age_at_biopsy_yrs,
            j.janice_age_rank
           FROM kona_biopsy_age_rank_view v
             LEFT JOIN stg_kona_biopsy_age_ranking_janice j ON j.pk_mprf_catalog_id = v.pk_mprf_catalog_id
             LEFT JOIN v_stg_mprf_catalog_norm mc ON mc.pk_mprf_catalog_id = v.pk_mprf_catalog_id
        ), maturity_events AS (
         SELECT m.fk_catalog_id AS pk_catalog_id,
            EXTRACT(year FROM s.sighting_date)::integer AS sighting_year,
            m.age_class,
            m.size_dw_m,
            COALESCE(m.gender, c.last_gender) AS encounter_gender,
                CASE
                    WHEN m.age_class ~~* 'adult%'::text THEN true
                    WHEN COALESCE(m.gender, c.last_gender) = 'Male'::text AND m.size_dw_m IS NOT NULL AND m.size_dw_m >= 2.8 THEN true
                    WHEN COALESCE(m.gender, c.last_gender) = 'Female'::text AND m.size_dw_m IS NOT NULL AND m.size_dw_m >= 3.4 THEN true
                    ELSE false
                END AS is_mature_here,
                CASE
                    WHEN m.age_class ~~* 'pup%'::text OR m.age_class ~~* 'juvenile%'::text THEN true
                    WHEN COALESCE(m.gender, c.last_gender) = 'Male'::text AND m.size_dw_m IS NOT NULL AND m.size_dw_m < 2.8 THEN true
                    WHEN COALESCE(m.gender, c.last_gender) = 'Female'::text AND m.size_dw_m IS NOT NULL AND m.size_dw_m < 3.4 THEN true
                    ELSE false
                END AS is_clearly_immature_here,
                CASE
                    WHEN m.age_class ~~* 'pup%'::text THEN true
                    ELSE false
                END AS is_pup_here
           FROM mantas m
             JOIN sightings s ON s.pk_sighting_id = m.fk_sighting_id
             JOIN catalog c ON c.pk_catalog_id = m.fk_catalog_id
          WHERE s.island = 'Big Island'::text
        ), maturity_agg AS (
         SELECT maturity_events.pk_catalog_id,
            min(
                CASE
                    WHEN maturity_events.is_mature_here THEN maturity_events.sighting_year
                    ELSE NULL::integer
                END) AS first_mature_year_raw,
            max(
                CASE
                    WHEN maturity_events.is_clearly_immature_here THEN maturity_events.sighting_year
                    ELSE NULL::integer
                END) AS last_immature_year_raw,
            min(
                CASE
                    WHEN maturity_events.is_clearly_immature_here THEN maturity_events.sighting_year
                    ELSE NULL::integer
                END) AS first_immature_year_raw,
            min(
                CASE
                    WHEN maturity_events.is_pup_here THEN maturity_events.sighting_year
                    ELSE NULL::integer
                END) AS first_pup_year_raw
           FROM maturity_events
          GROUP BY maturity_events.pk_catalog_id
        ), biopsy_info AS (
         SELECT b.fk_catalog_id AS pk_catalog_id,
            min(b.pk_biopsy_id) AS pk_biopsy_id,
            min(b.sample_date) AS date_of_biopsy,
            min(b.lab_id) AS mprf_biopsy_id,
            min(b.raw_sample_id) AS jonathan_sample_id,
            min(b.fk_manta_id) AS pk_manta_id
           FROM biopsies b
             JOIN sightings s ON s.pk_sighting_id = b.fk_sighting_id
          WHERE b.fk_catalog_id IS NOT NULL AND s.island = 'Big Island'::text
          GROUP BY b.fk_catalog_id
        ), scored_prep AS (
         SELECT bk.pk_catalog_id,
            bk.pk_mprf_catalog_id,
            bk.name,
            bk.mprf_name,
            bk.gender,
            bk.last_age_class,
            bk.last_size_m,
            bk.date_first_sighted,
            bk.date_last_sighted,
            bk.effective_first_sighted_date,
            bk.years_seen,
            bk.total_biopsies,
            bk.total_sightings,
            bk.first_biopsy_date,
            bk.last_biopsy_date,
            bk.kona_biopsy_count,
            bk.age_years_for_ranking,
            bk.original_relative_age_score,
            bk.original_relative_age_rank,
            bk.original_relative_age_percentile,
            bk.original_age_rank_reason,
            bk.first_year,
            bk.biopsy_year,
            bk.is_mature_size_or_ageclass,
            bk."MPRF_first_sighted_date",
            bk."MPRF_total_years_seen",
            bk."MPRF_age_class_at_first_sighting",
            bk.last_year,
            bk.janice_first_sighted,
            bk.janice_years_seen,
            bk.janice_age_class,
            bk.janice_min_age_at_biopsy_yrs,
            bk.janice_age_rank,
            bi.pk_biopsy_id,
            bi.date_of_biopsy,
            bi.mprf_biopsy_id,
            bi.jonathan_sample_id,
            bi.pk_manta_id,
            ma.first_mature_year_raw,
            ma.last_immature_year_raw,
            ma.first_immature_year_raw,
            ma.first_pup_year_raw,
            bk.last_year - bk.first_year AS age_at_last_sighting_years,
            ma.first_pup_year_raw IS NOT NULL OR bk."MPRF_age_class_at_first_sighting" ~~* 'pup%'::text OR bk.janice_age_class ~~* 'pup%'::text AS ever_seen_as_pup,
            ( SELECT min(t.val) AS min
                   FROM unnest(ARRAY[ma.first_mature_year_raw,
                        CASE
                            WHEN (bk.last_year - bk.first_year) > 10 THEN bk.first_year
                            ELSE NULL::integer
                        END,
                        CASE
                            WHEN bk."MPRF_age_class_at_first_sighting" ~~* 'adult%'::text OR bk.janice_age_class ~~* 'adult%'::text THEN bk.first_year
                            ELSE NULL::integer
                        END]) t(val)) AS first_mature_year_effective
           FROM base_kona bk
             LEFT JOIN maturity_agg ma ON ma.pk_catalog_id = bk.pk_catalog_id
             LEFT JOIN biopsy_info bi ON bi.pk_catalog_id = bk.pk_catalog_id
        ), scored_v2 AS (
         SELECT sp.pk_catalog_id,
            sp.pk_mprf_catalog_id,
            sp.name,
            sp.mprf_name,
            sp.gender,
            sp.last_age_class,
            sp.last_size_m,
            sp.date_first_sighted,
            sp.date_last_sighted,
            sp.effective_first_sighted_date,
            sp.years_seen,
            sp.total_biopsies,
            sp.total_sightings,
            sp.first_biopsy_date,
            sp.last_biopsy_date,
            sp.kona_biopsy_count,
            sp.age_years_for_ranking,
            sp.original_relative_age_score,
            sp.original_relative_age_rank,
            sp.original_relative_age_percentile,
            sp.original_age_rank_reason,
            sp.first_year,
            sp.biopsy_year,
            sp.is_mature_size_or_ageclass,
            sp."MPRF_first_sighted_date",
            sp."MPRF_total_years_seen",
            sp."MPRF_age_class_at_first_sighting",
            sp.last_year,
            sp.janice_first_sighted,
            sp.janice_years_seen,
            sp.janice_age_class,
            sp.janice_min_age_at_biopsy_yrs,
            sp.janice_age_rank,
            sp.pk_biopsy_id,
            sp.date_of_biopsy,
            sp.mprf_biopsy_id,
            sp.jonathan_sample_id,
            sp.pk_manta_id,
            sp.first_mature_year_raw,
            sp.last_immature_year_raw,
            sp.first_immature_year_raw,
            sp.first_pup_year_raw,
            sp.age_at_last_sighting_years,
            sp.ever_seen_as_pup,
            sp.first_mature_year_effective,
                CASE
                    WHEN sp.first_mature_year_effective IS NOT NULL THEN GREATEST(sp.last_year - sp.first_mature_year_effective, 0)
                    ELSE NULL::integer
                END AS years_mature_before_last_sighting,
                CASE
                    WHEN sp.first_mature_year_effective IS NOT NULL THEN
                    CASE
                        WHEN (sp.last_year - sp.first_mature_year_effective) >= 10 THEN 4
                        WHEN (sp.last_year - sp.first_mature_year_effective) >= 7 THEN 3
                        WHEN (sp.last_year - sp.first_mature_year_effective) >= 4 THEN 2
                        WHEN (sp.last_year - sp.first_mature_year_effective) >= 2 THEN 1
                        ELSE 0
                    END
                    ELSE 0
                END AS maturity_bonus_b,
            sp.age_at_last_sighting_years +
                CASE
                    WHEN sp.first_mature_year_effective IS NOT NULL THEN
                    CASE
                        WHEN (sp.last_year - sp.first_mature_year_effective) >= 10 THEN 4
                        WHEN (sp.last_year - sp.first_mature_year_effective) >= 7 THEN 3
                        WHEN (sp.last_year - sp.first_mature_year_effective) >= 4 THEN 2
                        WHEN (sp.last_year - sp.first_mature_year_effective) >= 2 THEN 1
                        ELSE 0
                    END
                    ELSE 0
                END AS relative_age_score_v2
           FROM scored_prep sp
        ), ranked_v2 AS (
         SELECT s.pk_catalog_id,
            s.pk_mprf_catalog_id,
            s.name,
            s.mprf_name,
            s.gender,
            s.last_age_class,
            s.last_size_m,
            s.date_first_sighted,
            s.date_last_sighted,
            s.effective_first_sighted_date,
            s.years_seen,
            s.total_biopsies,
            s.total_sightings,
            s.first_biopsy_date,
            s.last_biopsy_date,
            s.kona_biopsy_count,
            s.age_years_for_ranking,
            s.original_relative_age_score,
            s.original_relative_age_rank,
            s.original_relative_age_percentile,
            s.original_age_rank_reason,
            s.first_year,
            s.biopsy_year,
            s.is_mature_size_or_ageclass,
            s."MPRF_first_sighted_date",
            s."MPRF_total_years_seen",
            s."MPRF_age_class_at_first_sighting",
            s.last_year,
            s.janice_first_sighted,
            s.janice_years_seen,
            s.janice_age_class,
            s.janice_min_age_at_biopsy_yrs,
            s.janice_age_rank,
            s.pk_biopsy_id,
            s.date_of_biopsy,
            s.mprf_biopsy_id,
            s.jonathan_sample_id,
            s.pk_manta_id,
            s.first_mature_year_raw,
            s.last_immature_year_raw,
            s.first_immature_year_raw,
            s.first_pup_year_raw,
            s.age_at_last_sighting_years,
            s.ever_seen_as_pup,
            s.first_mature_year_effective,
            s.years_mature_before_last_sighting,
            s.maturity_bonus_b,
            s.relative_age_score_v2,
            rank() OVER (ORDER BY s.relative_age_score_v2 DESC) AS relative_age_rank_v2,
            count(*) OVER () AS total_animals_v2
           FROM scored_v2 s
        )
 SELECT r.pk_catalog_id,
    r.pk_mprf_catalog_id,
    r.name AS hamer_name,
    r.mprf_name,
    r.gender,
    r.last_age_class,
    r.last_size_m,
    r.pk_biopsy_id,
    r.mprf_biopsy_id,
    r.jonathan_sample_id,
    r.pk_manta_id,
    r.date_of_biopsy,
    r.effective_first_sighted_date AS effective_first_sighting,
    r.years_seen AS total_years_sighted,
    r.ever_seen_as_pup,
    r.ever_seen_as_pup AND r.effective_first_sighted_date IS NOT NULL AS known_age_from_pup,
    r.first_immature_year_raw AS first_year_confirmed_immature,
    r.first_mature_year_effective AS first_year_confirmed_mature,
    r.years_mature_before_last_sighting AS min_years_known_mature,
        CASE
            WHEN NOT r.ever_seen_as_pup AND r.age_at_last_sighting_years IS NOT NULL THEN r.age_at_last_sighting_years
            ELSE NULL::integer
        END AS estimated_age_at_last_sighting_years,
    r.janice_min_age_at_biopsy_yrs,
    r.relative_age_rank_v2 AS age_rank_v2,
    r.janice_age_rank,
    r.age_at_last_sighting_years,
    r.age_years_for_ranking AS age_years_at_biopsy,
    r.first_year,
    r.last_year,
    r.maturity_bonus_b,
    r.relative_age_score_v2,
    r.original_relative_age_score,
    r.original_relative_age_rank,
    TRIM(BOTH ' '::text FROM concat_ws(' '::text, r.original_age_rank_reason, (('Minimum age at last sighting is ~'::text || r.age_at_last_sighting_years::text) || ' year'::text) ||
        CASE
            WHEN r.age_at_last_sighting_years = 1 THEN ';'::text
            ELSE 's;'::text
        END,
        CASE
            WHEN r.years_mature_before_last_sighting IS NOT NULL THEN ((('Mature for at least ~'::text || r.years_mature_before_last_sighting::text) || ' year'::text) ||
            CASE
                WHEN r.years_mature_before_last_sighting = 1 THEN ''::text
                ELSE 's'::text
            END) || ' before last recorded Kona sighting;'::text
            ELSE 'Insufficient maturity data before last sighting;'::text
        END,
        CASE
            WHEN r.maturity_bonus_b > 0 THEN ('Applied Option B maturity bonus of '::text || r.maturity_bonus_b::text) || ' to the age score;'::text
            ELSE 'No maturity bonus applied;'::text
        END, ((('Final rank (older = lower rank number): '::text || r.relative_age_rank_v2::text) || ' of '::text) || r.total_animals_v2::text) || '.'::text)) AS age_rank_justification_v2
   FROM ranked_v2 r
  ORDER BY r.relative_age_rank_v2;
REVOKE ALL ON public.kona_biopsy_age_rank_view_v2 FROM PUBLIC,anon,authenticated; GRANT ALL ON public.kona_biopsy_age_rank_view_v2 TO service_role;
CREATE VIEW public.kona_biopsy_rank_comparison AS  SELECT k.sample_no,
    k.psn_id,
    k.has_whitney,
    k.has_eli,
    k.include_in_age_rank,
    k.mprf_id,
    k.mprf_manta_name,
    k.pk_catalog_id,
    k.hamer_name,
    k.biopsy_date,
    k.sex,
    k.size_at_biopsy_m,
    k.age_class_at_biopsy,
    k.ek_sighting_location,
    k.ek_sample_location,
    k.ek_next_time_resighted,
    k.ek_last_sighted_as_of,
    k.age_years_for_ranking AS snapshot_age_years_for_ranking,
    k.relative_age_score AS snapshot_relative_age_score,
    k.relative_age_rank AS snapshot_relative_age_rank,
    k.relative_age_percentile AS snapshot_relative_age_percentile,
    k.age_rank_reason AS snapshot_age_rank_reason,
    k.hamer_first_sighting_date,
    k.mprf_first_sighting_date,
    k.hamer_first_size_m,
    k.hamer_first_size_date,
    k.hamer_last_size_m,
    k.hamer_last_size_date,
    k.mprf_age_class_at_first_sighting,
    k.hamer_total_years_seen,
    k.mprf_total_years_seen,
    v.years_seen AS model_years_seen,
    v.total_biopsies AS model_total_biopsies,
    v.total_sightings AS model_total_sightings,
    v.age_years_for_ranking AS model_age_years_for_ranking,
    v.relative_age_score AS model_relative_age_score,
    v.relative_age_rank AS model_relative_age_rank,
    v.relative_age_percentile AS model_relative_age_percentile,
    v.age_rank_reason AS model_age_rank_reason,
    j.janice_age_rank AS janice_age_ranking,
    j.janice_min_age_at_biopsy AS janice_min_age_at_biopsy_yrs,
    j.mprf_total_years_seen AS janice_years_seen,
    j.mprf_size_dw AS janice_last_dw,
    j.mprf_last_age_class AS janice_age_class
   FROM kona_biopsy_consolidated k
     LEFT JOIN kona_biopsy_age_rank_view v ON v.pk_catalog_id = k.pk_catalog_id
     LEFT JOIN stg_kona_biopsy_age_ranking_janice j ON j.pk_mprf_catalog_id = k.mprf_id;
REVOKE ALL ON public.kona_biopsy_rank_comparison FROM PUBLIC,anon,authenticated; GRANT ALL ON public.kona_biopsy_rank_comparison TO service_role;
CREATE VIEW public.kona_biopsy_age_rank_view_v2_full AS  SELECT v2.pk_catalog_id,
    v2.pk_mprf_catalog_id,
    v2.hamer_name,
    v2.mprf_name,
    v2.gender,
    v2.last_age_class,
    v2.last_size_m,
    v2.pk_biopsy_id,
    v2.mprf_biopsy_id,
    v2.jonathan_sample_id,
    v2.pk_manta_id,
    v2.date_of_biopsy,
    v2.effective_first_sighting,
    v2.total_years_sighted,
    v2.ever_seen_as_pup,
    v2.known_age_from_pup,
    v2.first_year_confirmed_immature,
    v2.first_year_confirmed_mature,
    v2.min_years_known_mature,
    v2.estimated_age_at_last_sighting_years,
    v2.janice_min_age_at_biopsy_yrs,
    v2.age_rank_v2,
    v2.janice_age_rank,
    v2.age_at_last_sighting_years,
    v2.age_years_at_biopsy,
    v2.first_year,
    v2.last_year,
    v2.maturity_bonus_b,
    v2.relative_age_score_v2,
    v2.original_relative_age_score,
    v2.original_relative_age_rank,
    v2.age_rank_justification_v2,
    k.sample_no,
    k.psn_id,
    k.include_in_age_rank,
    k.mprf_id,
    k.sex AS comparison_sex
   FROM kona_biopsy_age_rank_view_v2 v2
     LEFT JOIN kona_biopsy_rank_comparison k ON k.pk_catalog_id = v2.pk_catalog_id;
REVOKE ALL ON public.kona_biopsy_age_rank_view_v2_full FROM PUBLIC,anon,authenticated; GRANT ALL ON public.kona_biopsy_age_rank_view_v2_full TO service_role;
CREATE VIEW public.kona_biopsy_age_rank_view_v3 AS  WITH base AS (
         SELECT v.pk_catalog_id,
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
            j.mprf_first_sighting_date,
            j.mprf_first_sighting_size,
            j.mprf_last_age_class,
            j.mprf_total_years_seen,
            j.mprf_size_dw,
            j.janice_age_rank AS janice_age_rank_raw
           FROM kona_biopsy_age_rank_view_v2 v
             LEFT JOIN mprf_catalog_map mcm ON mcm.pk_catalog_id = v.pk_catalog_id
             LEFT JOIN stg_kona_biopsy_age_ranking_janice j ON j.pk_mprf_catalog_id = mcm.pk_mprf_catalog_id
        ), scored AS (
         SELECT base.pk_catalog_id,
            base.pk_mprf_catalog_id,
            base.hamer_name,
            base.mprf_name,
            base.gender,
            base.last_age_class,
            base.last_size_m,
            base.pk_biopsy_id,
            base.mprf_biopsy_id,
            base.jonathan_sample_id,
            base.pk_manta_id,
            base.date_of_biopsy,
            base.effective_first_sighting,
            base.total_years_sighted,
            base.ever_seen_as_pup,
            base.known_age_from_pup,
            base.first_year_confirmed_immature,
            base.first_year_confirmed_mature,
            base.min_years_known_mature,
            base.estimated_age_at_last_sighting_years,
            base.janice_min_age_at_biopsy_yrs,
            base.age_rank_v2,
            base.janice_age_rank,
            base.age_at_last_sighting_years,
            base.age_years_at_biopsy,
            base.first_year,
            base.last_year,
            base.maturity_bonus_b,
            base.relative_age_score_v2,
            base.original_relative_age_score,
            base.original_relative_age_rank,
            base.age_rank_justification_v2,
            base.mprf_first_sighting_date,
            base.mprf_first_sighting_size,
            base.mprf_last_age_class,
            base.mprf_total_years_seen,
            base.mprf_size_dw,
            base.janice_age_rank_raw,
                CASE
                    WHEN base.mprf_last_age_class ~~* 'pup%'::text AND base.effective_first_sighting IS NOT NULL AND base.date_of_biopsy IS NOT NULL THEN GREATEST(EXTRACT(year FROM base.date_of_biopsy)::integer - EXTRACT(year FROM base.effective_first_sighting)::integer, 0)::numeric
                    ELSE base.age_years_at_biopsy
                END AS age_years_at_biopsy_v3,
            base.mprf_last_age_class ~~* 'pup%'::text AND base.effective_first_sighting IS NOT NULL AND base.date_of_biopsy IS NOT NULL AS known_age_from_pup_v3,
                CASE
                    WHEN base.last_age_class ~~* 'adult%'::text OR base.mprf_last_age_class ~~* 'adult%'::text THEN 4.0
                    WHEN base.last_age_class ~~* 'juvenile%'::text OR base.mprf_last_age_class ~~* 'juvenile%'::text THEN 1.0
                    ELSE base.maturity_bonus_b::numeric
                END AS maturity_bonus_b_v3,
            COALESCE(
                CASE
                    WHEN base.mprf_last_age_class ~~* 'pup%'::text AND base.effective_first_sighting IS NOT NULL AND base.date_of_biopsy IS NOT NULL THEN GREATEST(EXTRACT(year FROM base.date_of_biopsy)::integer - EXTRACT(year FROM base.effective_first_sighting)::integer, 0)::numeric
                    ELSE base.age_at_last_sighting_years::numeric
                END, 0::numeric) + 0.5 * COALESCE(base.total_years_sighted, 0)::numeric + COALESCE(
                CASE
                    WHEN base.last_age_class ~~* 'adult%'::text OR base.mprf_last_age_class ~~* 'adult%'::text THEN 4.0
                    WHEN base.last_age_class ~~* 'juvenile%'::text OR base.mprf_last_age_class ~~* 'juvenile%'::text THEN 1.0
                    ELSE base.maturity_bonus_b::numeric
                END, 0::numeric) AS relative_age_score_v3
           FROM base
        ), ranked AS (
         SELECT s.pk_catalog_id,
            s.pk_mprf_catalog_id,
            s.hamer_name,
            s.mprf_name,
            s.gender,
            s.last_age_class,
            s.last_size_m,
            s.pk_biopsy_id,
            s.mprf_biopsy_id,
            s.jonathan_sample_id,
            s.pk_manta_id,
            s.date_of_biopsy,
            s.effective_first_sighting,
            s.total_years_sighted,
            s.ever_seen_as_pup,
            s.known_age_from_pup,
            s.first_year_confirmed_immature,
            s.first_year_confirmed_mature,
            s.min_years_known_mature,
            s.estimated_age_at_last_sighting_years,
            s.janice_min_age_at_biopsy_yrs,
            s.age_rank_v2,
            s.janice_age_rank,
            s.age_at_last_sighting_years,
            s.age_years_at_biopsy,
            s.first_year,
            s.last_year,
            s.maturity_bonus_b,
            s.relative_age_score_v2,
            s.original_relative_age_score,
            s.original_relative_age_rank,
            s.age_rank_justification_v2,
            s.mprf_first_sighting_date,
            s.mprf_first_sighting_size,
            s.mprf_last_age_class,
            s.mprf_total_years_seen,
            s.mprf_size_dw,
            s.janice_age_rank_raw,
            s.age_years_at_biopsy_v3,
            s.known_age_from_pup_v3,
            s.maturity_bonus_b_v3,
            s.relative_age_score_v3,
            rank() OVER (ORDER BY s.relative_age_score_v3 DESC) AS age_rank_v3,
            count(*) OVER () AS total_animals_v3
           FROM scored s
        )
 SELECT ranked.pk_catalog_id,
    ranked.pk_mprf_catalog_id,
    ranked.hamer_name,
    ranked.mprf_name,
    ranked.gender,
    ranked.last_age_class,
    ranked.last_size_m,
    ranked.pk_biopsy_id,
    ranked.mprf_biopsy_id,
    ranked.jonathan_sample_id,
    ranked.pk_manta_id,
    ranked.date_of_biopsy,
    ranked.effective_first_sighting,
    ranked.total_years_sighted,
    ranked.ever_seen_as_pup,
    ranked.known_age_from_pup,
    ranked.first_year_confirmed_immature,
    ranked.first_year_confirmed_mature,
    ranked.min_years_known_mature,
    ranked.estimated_age_at_last_sighting_years,
    ranked.janice_min_age_at_biopsy_yrs,
    ranked.age_rank_v2,
    ranked.janice_age_rank,
    ranked.age_at_last_sighting_years,
    ranked.age_years_at_biopsy,
    ranked.first_year,
    ranked.last_year,
    ranked.maturity_bonus_b,
    ranked.relative_age_score_v2,
    ranked.original_relative_age_score,
    ranked.original_relative_age_rank,
    ranked.age_rank_justification_v2,
    ranked.mprf_first_sighting_date,
    ranked.mprf_first_sighting_size,
    ranked.mprf_last_age_class,
    ranked.mprf_total_years_seen,
    ranked.mprf_size_dw,
    ranked.janice_age_rank_raw,
    ranked.age_years_at_biopsy_v3,
    ranked.known_age_from_pup_v3,
    ranked.maturity_bonus_b_v3,
    ranked.relative_age_score_v3,
    ranked.age_rank_v3,
    TRIM(BOTH FROM (COALESCE(ranked.age_rank_justification_v2, ''::text) || ' '::text) || COALESCE(
        CASE
            WHEN ranked.known_age_from_pup_v3 THEN ('First sighting recorded as pup/newborn, using Janice''s first-sighting date as a near birth-year age anchor; explicit age at biopsy ≈ '::text || COALESCE(round(ranked.age_years_at_biopsy_v3, 1)::text, '?'::text)) || ' years.'::text
            WHEN ranked.last_age_class ~~* 'adult%'::text OR ranked.mprf_last_age_class ~~* 'adult%'::text THEN 'First sighting recorded as adult; ranked older than pup/juvenile mantas first seen later in time.'::text
            ELSE NULL::text
        END, ''::text)) AS age_rank_justification_v3
   FROM ranked;
REVOKE ALL ON public.kona_biopsy_age_rank_view_v3 FROM PUBLIC,anon,authenticated; GRANT ALL ON public.kona_biopsy_age_rank_view_v3 TO service_role;
CREATE VIEW public.kona_biopsy_all_samples_v2 AS  WITH combined AS (
         SELECT COALESCE(e.mprf_sample_number, j.mprf_sample_number2) AS sample_no,
            e.mprf_sample_number AS eli_sample_no,
            e.mprf_biopsy_date::date AS eli_sample_date,
            e.mprf_manta_name AS eli_manta_name,
            e.pk_mprf_catalog_id AS eli_manta_pacific_number,
            e.mprf_gender AS eli_sex,
            j.jon_psn_sequence_number AS psn_id,
            j.mprf_sample_number2 AS jon_sample_no,
            j.jon_biopsy_date::date AS jon_sample_date,
            j.jon_manta_name,
            j.pk_mprf_catalog_id AS jon_mprf_id,
            j.jon_gender AS jon_sex
           FROM stg_eli_keller_biopsies e
             FULL JOIN stg_jonathan_whiteny_biopsies j ON e.mprf_sample_number = j.mprf_sample_number2
        ), annotated AS (
         SELECT c1.sample_no,
            c1.eli_sample_no,
            c1.eli_sample_date,
            c1.eli_manta_name,
            c1.eli_manta_pacific_number,
            c1.eli_sex,
            c1.psn_id,
            c1.jon_sample_no,
            c1.jon_sample_date,
            c1.jon_manta_name,
            c1.jon_mprf_id,
            c1.jon_sex,
            v.pk_catalog_id AS model_pk_catalog_id,
            v.pk_mprf_catalog_id AS model_pk_mprf_catalog_id,
            v.hamer_name AS model_hamer_name,
            v.mprf_name,
            v.pk_biopsy_id,
            v.mprf_biopsy_id,
            v.jonathan_sample_id,
            v.pk_manta_id,
            v.date_of_biopsy,
            v.effective_first_sighting,
            v.total_years_sighted,
            v.min_years_known_mature,
            v.age_at_last_sighting_years,
            v.age_rank_v2,
            v.janice_age_rank,
            v.age_rank_justification_v2 AS model_age_rank_justification_v2
           FROM combined c1
             LEFT JOIN kona_biopsy_age_rank_view_v2_full v ON v.sample_no = c1.sample_no
        ), with_numeric_mprf AS (
         SELECT a.sample_no,
            a.eli_sample_no,
            a.eli_sample_date,
            a.eli_manta_name,
            a.eli_manta_pacific_number,
            a.eli_sex,
            a.psn_id,
            a.jon_sample_no,
            a.jon_sample_date,
            a.jon_manta_name,
            a.jon_mprf_id,
            a.jon_sex,
            a.model_pk_catalog_id,
            a.model_pk_mprf_catalog_id,
            a.model_hamer_name,
            a.mprf_name,
            a.pk_biopsy_id,
            a.mprf_biopsy_id,
            a.jonathan_sample_id,
            a.pk_manta_id,
            a.date_of_biopsy,
            a.effective_first_sighting,
            a.total_years_sighted,
            a.min_years_known_mature,
            a.age_at_last_sighting_years,
            a.age_rank_v2,
            a.janice_age_rank,
            a.model_age_rank_justification_v2,
            COALESCE(a.eli_manta_pacific_number,
                CASE
                    WHEN a.jon_mprf_id ~ '^[0-9]+$'::text THEN a.jon_mprf_id::bigint
                    ELSE NULL::bigint
                END) AS mprf_id_numeric
           FROM annotated a
        )
 SELECT
        CASE
            WHEN wn.eli_sample_no IS NOT NULL AND wn.jon_sample_no IS NOT NULL THEN 'eli+jonathan'::text
            WHEN wn.eli_sample_no IS NOT NULL THEN 'eli_only'::text
            WHEN wn.jon_sample_no IS NOT NULL THEN 'jonathan_only'::text
            ELSE 'unknown'::text
        END AS source,
    wn.sample_no,
    wn.psn_id,
    wn.eli_sample_no,
    wn.eli_sample_date,
    wn.eli_manta_name,
    wn.eli_manta_pacific_number,
    wn.eli_sex,
    wn.jon_sample_no,
    wn.jon_sample_date,
    wn.jon_manta_name,
    wn.jon_mprf_id,
    wn.jon_sex,
        CASE
            WHEN wn.mprf_id_numeric IS NOT NULL AND mcm.pk_catalog_id IS NOT NULL THEN mcm.pk_catalog_id
            ELSE wn.model_pk_catalog_id
        END AS pk_catalog_id,
        CASE
            WHEN wn.mprf_id_numeric IS NOT NULL AND mcm.pk_mprf_catalog_id IS NOT NULL THEN mcm.pk_mprf_catalog_id
            ELSE wn.model_pk_mprf_catalog_id
        END AS pk_mprf_catalog_id,
        CASE
            WHEN wn.mprf_id_numeric IS NOT NULL AND c.name IS NOT NULL THEN c.name
            ELSE COALESCE(wn.model_hamer_name, wn.eli_manta_name, wn.jon_manta_name)
        END AS hamer_name,
    wn.mprf_name,
    wn.pk_biopsy_id,
    wn.mprf_biopsy_id,
    wn.jonathan_sample_id,
    wn.pk_manta_id,
    wn.date_of_biopsy,
    wn.effective_first_sighting,
    wn.total_years_sighted,
    wn.min_years_known_mature,
    wn.age_at_last_sighting_years,
    wn.age_rank_v2,
    wn.janice_age_rank,
    wn.model_age_rank_justification_v2 AS age_rank_justification_v2,
    v3.age_rank_v3,
    v3.age_rank_justification_v3,
    v3.age_years_at_biopsy_v3,
    kc.include_in_age_rank,
    wn.age_rank_v2 IS NOT NULL AS in_age_rank_view
   FROM with_numeric_mprf wn
     LEFT JOIN mprf_catalog_map mcm ON mcm.pk_mprf_catalog_id = wn.mprf_id_numeric
     LEFT JOIN catalog c ON c.pk_catalog_id = mcm.pk_catalog_id
     LEFT JOIN kona_biopsy_age_rank_view_v3 v3 ON v3.pk_catalog_id =
        CASE
            WHEN wn.mprf_id_numeric IS NOT NULL AND mcm.pk_catalog_id IS NOT NULL THEN mcm.pk_catalog_id
            ELSE wn.model_pk_catalog_id
        END
     LEFT JOIN kona_biopsy_rank_comparison kc ON kc.pk_catalog_id =
        CASE
            WHEN wn.mprf_id_numeric IS NOT NULL AND mcm.pk_catalog_id IS NOT NULL THEN mcm.pk_catalog_id
            ELSE wn.model_pk_catalog_id
        END
  ORDER BY wn.sample_no, wn.psn_id;
REVOKE ALL ON public.kona_biopsy_all_samples_v2 FROM PUBLIC,anon,authenticated; GRANT ALL ON public.kona_biopsy_all_samples_v2 TO service_role;
CREATE VIEW public.kona_biopsy_all_samples_v3_export AS  SELECT kona_biopsy_all_samples_v2.source,
    kona_biopsy_all_samples_v2.sample_no,
    kona_biopsy_all_samples_v2.psn_id,
    kona_biopsy_all_samples_v2.eli_sample_no,
    kona_biopsy_all_samples_v2.eli_sample_date,
    kona_biopsy_all_samples_v2.eli_manta_name,
    kona_biopsy_all_samples_v2.eli_manta_pacific_number,
    kona_biopsy_all_samples_v2.eli_sex,
    kona_biopsy_all_samples_v2.jon_sample_no,
    kona_biopsy_all_samples_v2.jon_sample_date,
    kona_biopsy_all_samples_v2.jon_manta_name,
    kona_biopsy_all_samples_v2.jon_mprf_id,
    kona_biopsy_all_samples_v2.jon_sex,
    kona_biopsy_all_samples_v2.pk_catalog_id,
    kona_biopsy_all_samples_v2.pk_mprf_catalog_id,
    kona_biopsy_all_samples_v2.hamer_name,
    kona_biopsy_all_samples_v2.mprf_name,
    kona_biopsy_all_samples_v2.pk_biopsy_id,
    kona_biopsy_all_samples_v2.mprf_biopsy_id,
    kona_biopsy_all_samples_v2.jonathan_sample_id,
    kona_biopsy_all_samples_v2.pk_manta_id,
    kona_biopsy_all_samples_v2.date_of_biopsy,
    kona_biopsy_all_samples_v2.effective_first_sighting,
    kona_biopsy_all_samples_v2.total_years_sighted,
    kona_biopsy_all_samples_v2.min_years_known_mature,
    kona_biopsy_all_samples_v2.age_at_last_sighting_years,
    kona_biopsy_all_samples_v2.age_rank_v2,
    kona_biopsy_all_samples_v2.age_rank_justification_v2,
    kona_biopsy_all_samples_v2.janice_age_rank,
    kona_biopsy_all_samples_v2.age_rank_v3,
    kona_biopsy_all_samples_v2.age_rank_justification_v3,
    kona_biopsy_all_samples_v2.age_years_at_biopsy_v3,
    kona_biopsy_all_samples_v2.include_in_age_rank,
    kona_biopsy_all_samples_v2.in_age_rank_view,
        CASE
            WHEN kona_biopsy_all_samples_v2.age_rank_v3 IS NOT NULL THEN kona_biopsy_all_samples_v2.age_rank_justification_v3
            WHEN kona_biopsy_all_samples_v2.include_in_age_rank IS FALSE THEN ('Sequenced sample (psn_id='::text || COALESCE(kona_biopsy_all_samples_v2.psn_id, '?'::text)) || '), manually excluded from age ranking (include_in_age_rank = false).'::text
            WHEN kona_biopsy_all_samples_v2.pk_catalog_id IS NULL THEN ('Sequenced sample (psn_id='::text || COALESCE(kona_biopsy_all_samples_v2.psn_id, '?'::text)) || '), but no linked HAMER catalog entry (pk_catalog_id is NULL); excluded from age ranking model.'::text
            WHEN kona_biopsy_all_samples_v2.pk_mprf_catalog_id IS NULL THEN ('Sequenced sample (psn_id='::text || COALESCE(kona_biopsy_all_samples_v2.psn_id, '?'::text)) || '), but no linked MPRF catalog ID (pk_mprf_catalog_id is NULL); excluded from age ranking model.'::text
            ELSE ('Sequenced sample (psn_id='::text || COALESCE(kona_biopsy_all_samples_v2.psn_id, '?'::text)) || '), but catalog lacks sufficient age/maturity data for v3; excluded from age ranking model.'::text
        END AS age_rank_justification_v3_final
   FROM kona_biopsy_all_samples_v2
  WHERE kona_biopsy_all_samples_v2.psn_id IS NOT NULL;
REVOKE ALL ON public.kona_biopsy_all_samples_v3_export FROM PUBLIC,anon,authenticated; GRANT ALL ON public.kona_biopsy_all_samples_v3_export TO service_role;
CREATE OR REPLACE FUNCTION private.admin_biopsy_age_ranking()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
REVOKE ALL ON FUNCTION private.admin_biopsy_age_ranking() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.admin_biopsy_browse()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
REVOKE ALL ON FUNCTION private.admin_biopsy_browse() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_biopsy_age_ranking()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or public.is_admin_user() is not true then
    raise exception using errcode = '42501', message = 'Active administrator access required';
  end if;
  return private.admin_biopsy_age_ranking();
end;
$function$
;
REVOKE ALL ON FUNCTION public.admin_biopsy_age_ranking() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_biopsy_age_ranking() TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_biopsy_browse()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or public.is_admin_user() is not true then
    raise exception using errcode = '42501', message = 'Active administrator access required';
  end if;
  return private.admin_biopsy_browse();
end;
$function$
;
REVOKE ALL ON FUNCTION public.admin_biopsy_browse() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_biopsy_browse() TO authenticated;
CREATE TABLE test.assertions(label text);
CREATE TABLE test.probes(phase text,object_name text,role_name text,operation text,code text);
CREATE FUNCTION test.ok(b boolean,l text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF b IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',l; END IF; INSERT INTO test.assertions VALUES(l); END $$;
CREATE FUNCTION test.snapshot() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE contents jsonb:='{}'; t record; h text; n bigint;
BEGIN
 FOR t IN SELECT c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' ORDER BY c.relname LOOP
 EXECUTE format($q$SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY md5(to_jsonb(x)::text)),'')) FROM public.%I x$q$,t.relname) INTO n,h;
 contents:=contents||jsonb_build_object(t.relname,jsonb_build_array(n,h)); END LOOP;
 RETURN jsonb_build_object('contents',contents,
 'tables',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relowner,c.relrowsecurity,c.relforcerowsecurity,(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0),(SELECT jsonb_agg(pg_get_expr(d.adbin,d.adrelid) ORDER BY d.adnum) FROM pg_attrdef d WHERE d.adrelid=c.oid)) ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'),
 'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.connamespace='public'::regnamespace),
 'triggers',(SELECT jsonb_agg(pg_get_triggerdef(tr.oid) ORDER BY tr.oid) FROM pg_trigger tr WHERE tr.tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public'),
 'views',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relowner,c.reloptions,c.relacl,pg_get_viewdef(c.oid,true)) ORDER BY c.relname) FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='v'),
 'routines',(SELECT jsonb_agg(jsonb_build_array(p.oid,p.proacl,pg_get_functiondef(p.oid)) ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace IN ('public'::regnamespace,'private'::regnamespace,'auth'::regnamespace)));
END $$;
CREATE TABLE test.initial AS SELECT test.snapshot() state;
CREATE FUNCTION test.probe(phase text,obj text,r text,op text,statement text,allowed boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE code text; b jsonb;
BEGIN
 b:=test.snapshot();
 BEGIN PERFORM set_config('role',r,true); EXECUTE statement; RAISE EXCEPTION USING ERRCODE='Z0001';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN code:='00000'; WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE; END;
 INSERT INTO test.probes VALUES(phase,obj,r,op,code);
 PERFORM test.ok(code=CASE WHEN allowed THEN '00000' ELSE '42501' END,phase||' effective '||obj||' '||r||' '||op);
 PERFORM test.ok(test.snapshot()=b,phase||' probe rollback '||obj||' '||r||' '||op);
END $$;
CREATE FUNCTION test.phase(phase text,contained boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t text;r text;p text;col text;allowed boolean;stmt text;v record;f text;result jsonb;
BEGIN
 FOREACH t IN ARRAY ARRAY['kona_biopsy_consolidated','_bak_all_session','mantas_import_stage'] LOOP
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','postgres'] LOOP
 allowed:=r IN ('service_role','postgres') OR (r='authenticated' AND NOT contained);
 FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
 PERFORM test.ok(has_table_privilege(r,('public.'||t)::regclass,p)=allowed,phase||' ACL '||t||' '||r||' '||p); END LOOP;
 col:=CASE t WHEN 'kona_biopsy_consolidated' THEN 'sample_no' WHEN '_bak_all_session' THEN 'backup_name' ELSE 'pk_manta_id' END;
 FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
 stmt:=CASE p WHEN 'SELECT' THEN format('SELECT * FROM public.%I',t) WHEN 'INSERT' THEN format('INSERT INTO public.%I (%I) VALUES (%L)',t,col,'SYNTHETIC NEW') WHEN 'UPDATE' THEN format('UPDATE public.%I SET %I=%L',t,col,'SYNTHETIC EDIT') ELSE format('DELETE FROM public.%I',t) END;
 PERFORM test.probe(phase,t,r,p,stmt,allowed); END LOOP; END LOOP; END LOOP;
 FOR v IN SELECT c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='v' LOOP
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','postgres'] LOOP
 PERFORM test.probe(phase,v.relname,r,'SELECT',format('SELECT * FROM public.%I',v.relname),r IN ('service_role','postgres')); END LOOP; END LOOP;
 PERFORM set_config('test.uid','00000000-0000-0000-0000-000000000001',true);
 FOREACH f IN ARRAY ARRAY['admin_biopsy_browse','admin_biopsy_age_ranking'] LOOP
 PERFORM set_config('test.admin','true',true);
 PERFORM test.probe(phase,f,'authenticated','admin RPC',format('SELECT public.%I()',f),true);
 EXECUTE format('SELECT public.%I()',f) INTO result;
 PERFORM test.ok(jsonb_array_length(result)>0,phase||' populated RPC '||f);
 IF phase='baseline' THEN INSERT INTO test.rpc_baseline VALUES(f,result); ELSE PERFORM test.ok(result=(SELECT value FROM test.rpc_baseline WHERE name=f),phase||' exact RPC result '||f); END IF;
 PERFORM set_config('test.admin','false',true);
 PERFORM test.probe(phase,f,'authenticated','nonadmin RPC',format('SELECT public.%I()',f),false);
 PERFORM test.probe(phase,f,'anon','anon RPC',format('SELECT public.%I()',f),false);
 END LOOP;
 PERFORM test.ok(test.snapshot()=(SELECT state FROM test.initial),phase||' complete metadata and content equivalence');
END $$;
CREATE TABLE test.rpc_baseline(name text,value jsonb);
SELECT test.phase('baseline',false);

\ir ../migrations/20261109214726_contain_postview1_base_table_access.sql
SELECT test.phase('forward',true);
\ir ../rollback/20261109214726_contain_postview1_base_table_access_rollback.sql
SELECT test.phase('rollback',false);
\ir ../migrations/20261109214726_contain_postview1_base_table_access.sql
SELECT test.phase('reapply',true);
SELECT count(*) assertions_passed FROM test.assertions;
SELECT phase,count(*) probes,count(*) FILTER(WHERE code='00000') succeeded FROM test.probes GROUP BY phase ORDER BY phase;
