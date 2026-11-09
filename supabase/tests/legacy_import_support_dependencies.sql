-- DISPOSABLE ONLY. Exact captured routine/view bodies, not live DDL.
-- Supporting relations use captured column types; unrelated upstream views are typed empty fixture tables.
-- This is dependency-boundary coverage, not a full historical import correctness test.
SET check_function_bodies=off;
SELECT setval('import_logs_id_seq',100);
CREATE TABLE public.catalog ("pk_catalog_id" integer, "catalog_uuid" uuid, "name" text, "species" text, "date_first_sighted" date, "date_last_sighted" date, "days_between_first_last" integer, "notes" text, "best_photo_id" text, "best_dorsal_photo_id" text, "best_cat_ventral_id" integer, "best_cat_dorsal_id" integer, "best_cat_mask_ventral_id" integer, "best_cat_mask_ventral_id_int" integer, "best_photo_url" text, "best_catalog_photo_url" text, "pk_catalog_uuid" uuid, "merged_into_pk_catalog_id" integer, "best_catalog_ventral_thumb_url" text, "last_age_class" text, "list_unique_locations" text, "list_unique_regions" text, "years_between_first_last" numeric, "days_since_last_sighting" integer, "list_years_sighted" integer[], "count_unique_years_sighted" integer, "total_sightings" integer, "total_biopsies" integer, "total_tags" integer, "last_size_m" numeric, "last_gender" text, "is_mprf" boolean, "is_mprf_added" boolean, "total_sighting_days" integer, "biopsy_role" text, "biopsy_role_reason" text, "age_at_first_kona_biopsy_years" numeric, "age_at_first_kona_biopsy_confidence" text, "parent_probability" numeric, "parent_child_probability_reason" text, "relative_age_score" numeric, "relative_age_rank_kona" integer, "relative_age_percentile_kona" numeric, "MPRF_first_sighted_date" date, "MPRF_total_years_seen" integer, "MPRF_age_class_at_first_sighting" text, "mprf_date_first_sighted" date, "deceased" text, "mprf_blackmorph" text, "mprf_pupinitially" text, "mprf_current_maturity" text, "mprf_size_estimate" numeric, "mprf_maturity_comment" text, "is_retired" boolean);
CREATE TABLE public.kona_biopsy_age_rank_view_v2_full ("pk_catalog_id" integer, "pk_mprf_catalog_id" integer, "hamer_name" text, "mprf_name" text, "gender" text, "last_age_class" text, "last_size_m" numeric, "pk_biopsy_id" bigint, "mprf_biopsy_id" text, "jonathan_sample_id" text, "pk_manta_id" integer, "date_of_biopsy" date, "effective_first_sighting" date, "total_years_sighted" integer, "ever_seen_as_pup" boolean, "known_age_from_pup" boolean, "first_year_confirmed_immature" integer, "first_year_confirmed_mature" integer, "min_years_known_mature" integer, "estimated_age_at_last_sighting_years" integer, "janice_min_age_at_biopsy_yrs" numeric, "age_rank_v2" bigint, "janice_age_rank" numeric, "age_at_last_sighting_years" integer, "age_years_at_biopsy" numeric, "first_year" integer, "last_year" integer, "maturity_bonus_b" integer, "relative_age_score_v2" integer, "original_relative_age_score" numeric, "original_relative_age_rank" bigint, "age_rank_justification_v2" text, "sample_no" text, "psn_id" text, "include_in_age_rank" boolean, "mprf_id" integer, "comparison_sex" text);
CREATE TABLE public.kona_biopsy_age_rank_view_v3 ("pk_catalog_id" integer, "pk_mprf_catalog_id" integer, "hamer_name" text, "mprf_name" text, "gender" text, "last_age_class" text, "last_size_m" numeric, "pk_biopsy_id" bigint, "mprf_biopsy_id" text, "jonathan_sample_id" text, "pk_manta_id" integer, "date_of_biopsy" date, "effective_first_sighting" date, "total_years_sighted" integer, "ever_seen_as_pup" boolean, "known_age_from_pup" boolean, "first_year_confirmed_immature" integer, "first_year_confirmed_mature" integer, "min_years_known_mature" integer, "estimated_age_at_last_sighting_years" integer, "janice_min_age_at_biopsy_yrs" numeric, "age_rank_v2" bigint, "janice_age_rank" numeric, "age_at_last_sighting_years" integer, "age_years_at_biopsy" numeric, "first_year" integer, "last_year" integer, "maturity_bonus_b" integer, "relative_age_score_v2" integer, "original_relative_age_score" numeric, "original_relative_age_rank" bigint, "age_rank_justification_v2" text, "mprf_first_sighting_date" date, "mprf_first_sighting_size" text, "mprf_last_age_class" text, "mprf_total_years_seen" numeric, "mprf_size_dw" numeric, "janice_age_rank_raw" numeric, "age_years_at_biopsy_v3" numeric, "known_age_from_pup_v3" boolean, "maturity_bonus_b_v3" numeric, "relative_age_score_v3" numeric, "age_rank_v3" bigint, "age_rank_justification_v3" text);
CREATE TABLE public.kona_biopsy_rank_comparison ("sample_no" text, "psn_id" text, "has_whitney" boolean, "has_eli" boolean, "include_in_age_rank" boolean, "mprf_id" integer, "mprf_manta_name" text, "pk_catalog_id" integer, "hamer_name" text, "biopsy_date" date, "sex" text, "size_at_biopsy_m" numeric, "age_class_at_biopsy" text, "ek_sighting_location" text, "ek_sample_location" text, "ek_next_time_resighted" text, "ek_last_sighted_as_of" text, "snapshot_age_years_for_ranking" numeric, "snapshot_relative_age_score" numeric, "snapshot_relative_age_rank" integer, "snapshot_relative_age_percentile" numeric, "snapshot_age_rank_reason" text, "hamer_first_sighting_date" date, "mprf_first_sighting_date" date, "hamer_first_size_m" numeric, "hamer_first_size_date" date, "hamer_last_size_m" numeric, "hamer_last_size_date" date, "mprf_age_class_at_first_sighting" text, "hamer_total_years_seen" integer, "mprf_total_years_seen" integer, "model_years_seen" integer, "model_total_biopsies" integer, "model_total_sightings" integer, "model_age_years_for_ranking" numeric, "model_relative_age_score" numeric, "model_relative_age_rank" bigint, "model_relative_age_percentile" numeric, "model_age_rank_reason" text, "janice_age_ranking" numeric, "janice_min_age_at_biopsy_yrs" numeric, "janice_years_seen" numeric, "janice_last_dw" numeric, "janice_age_class" text);
CREATE TABLE public.manta_sizes ("pk_manta_size_id" bigint, "fk_manta_id" integer, "measurement_type" text, "size_m" numeric, "measured_on" date, "photo_code" text, "quality_note" text, "calibration_params" text, "src_file" text, "row_sig" text, "inserted_at" timestamp with time zone, "fk_catalog_id" integer, "source_photo_id" integer, "measurement_method" text, "standardized_dw_m" numeric, "measurement_evidence" jsonb);
ALTER TABLE public.mantas ADD COLUMN "manta_uuid" uuid;
ALTER TABLE public.mantas ADD COLUMN "fk_catalog_id" integer;
ALTER TABLE public.mantas ADD COLUMN "fk_sighting_id" integer;
ALTER TABLE public.mantas ADD COLUMN "best_ventral_photo_id" text;
ALTER TABLE public.mantas ADD COLUMN "ref_biometrics_id" text;
ALTER TABLE public.mantas ADD COLUMN "best_manta_ventral_photo_url" text;
ALTER TABLE public.mantas ADD COLUMN "best_ventral_photo_id_int" integer;
ALTER TABLE public.mantas ADD COLUMN "best_manta_ventral_photo_url2" text;
ALTER TABLE public.mantas ADD COLUMN "gender" text;
ALTER TABLE public.mantas ADD COLUMN "age_class" text;
ALTER TABLE public.mantas ADD COLUMN "size_m_legacy" numeric;
ALTER TABLE public.mantas ADD COLUMN "estimated_size_m" numeric;
ALTER TABLE public.mantas ADD COLUMN "jon_sizze_m" numeric;
ALTER TABLE public.mantas ADD COLUMN "species" text;
ALTER TABLE public.mantas ADD COLUMN "total_biopsies" integer;
ALTER TABLE public.mantas ADD COLUMN "total_tags" integer;
ALTER TABLE public.mantas ADD COLUMN "ref_biopsy_id" text;
ALTER TABLE public.mantas ADD COLUMN "ref_ptt_id" text;
ALTER TABLE public.mantas ADD COLUMN "injury_type" text;
ALTER TABLE public.mantas ADD COLUMN "injury_notes" text;
ALTER TABLE public.mantas ADD COLUMN "photographer" text;
ALTER TABLE public.mantas ADD COLUMN "mp_number" text;
ALTER TABLE public.mantas ADD COLUMN "updated_at" timestamp with time zone;
ALTER TABLE public.mantas ADD COLUMN "jon_size_m" numeric;
ALTER TABLE public.mantas ADD COLUMN "best_manta_dorsal_photo_url" text;
ALTER TABLE public.mantas ADD COLUMN "new_best_manta_ventral_photo_id" integer;
ALTER TABLE public.mantas ADD COLUMN "new_best_manta_dorsal_photo_id" integer;
ALTER TABLE public.mantas ADD COLUMN "best_manta_photo_url" text;
ALTER TABLE public.mantas ADD COLUMN "fk_catalog_uuid" uuid;
ALTER TABLE public.mantas ADD COLUMN "fk_sighting_uuid" uuid;
ALTER TABLE public.mantas ADD COLUMN "pk_manta_uuid" uuid;
ALTER TABLE public.mantas ADD COLUMN "size_scale_px" numeric;
ALTER TABLE public.mantas ADD COLUMN "size_disc_len_px" numeric;
ALTER TABLE public.mantas ADD COLUMN "size_scale_actual_cm" numeric;
ALTER TABLE public.mantas ADD COLUMN "size_disc_len_m" numeric;
ALTER TABLE public.mantas ADD COLUMN "size_disc_width_m" numeric;
ALTER TABLE public.mantas ADD COLUMN "size_dw_m" numeric;
ALTER TABLE public.mantas ADD COLUMN "size_m" numeric GENERATED ALWAYS AS (size_dw_m) STORED;
ALTER TABLE public.mantas ADD COLUMN "is_mprf" boolean;
ALTER TABLE public.mantas ADD COLUMN "name" text;
ALTER TABLE public.mantas ADD COLUMN "mprf_external_manta_id" integer;
ALTER TABLE public.mantas ADD COLUMN "mprf_date" date;
ALTER TABLE public.mantas ADD COLUMN "pk_mprf_catalog_id" integer;
ALTER TABLE public.mantas ADD COLUMN "mprf_comments" text;
ALTER TABLE public.mantas ADD COLUMN "mprf_status" text;
ALTER TABLE public.mantas ADD COLUMN "sighting_date" date;
ALTER TABLE public.mantas ADD COLUMN "no_ventral_photos" boolean;
ALTER TABLE public.mantas ADD COLUMN "catalog_unknown" boolean;
ALTER TABLE public.mantas ADD COLUMN "submission_manta_id" text;
CREATE TABLE public.mprf_catalog_map ("pk_mprf_catalog_id" integer, "pk_catalog_id" integer, "created_at" timestamp with time zone, "maturity_code" text, "mprf_species" text, "mprf_last_gender" text, "mprf_first_sighting_date" text);
CREATE TABLE public.photos ("pk_photo_id" integer, "fk_manta_id" integer, "file_name2" text, "is_best_catalog_ventral_photo" boolean, "is_best_manta_ventral_photo" boolean, "uploaded_at" timestamp with time zone, "notes" text, "pk_photo_uuid" uuid, "fk_sighting_id" integer, "storage_path" text, "thumbnail_url" text, "photo_view" text, "population" text, "is_best_catalog_dorsal_photo" boolean, "is_best_manta_dorsal_photo" boolean, "view_label" text, "fk_catalog_id" integer, "fk_catalog_uuid_legacy" uuid, "fk_catalog_uuid" uuid, "fk_manta_uuid" uuid, "storage_bucket" text, "embedding" text, "fk_sighting_uuid" uuid, "active_measure_id" bigint, "is_mprf" boolean, "original_storage_path" text, "edit_transform" jsonb, "is_photogrammetry" boolean, "is_injury" boolean, "injury_modifiers" text[]);
CREATE TABLE public.sighting_catalog ("fk_sighting_id" integer, "fk_catalog_id" integer, "is_mprf" boolean, "created_at" timestamp with time zone);
ALTER TABLE public.sightings ADD COLUMN "sighting_date" date;
ALTER TABLE public.sightings ADD COLUMN "month_name" text;
ALTER TABLE public.sightings ADD COLUMN "year" integer;
ALTER TABLE public.sightings ADD COLUMN "survey_no" integer;
ALTER TABLE public.sightings ADD COLUMN "sighting_no" integer;
ALTER TABLE public.sightings ADD COLUMN "island" text;
ALTER TABLE public.sightings ADD COLUMN "region" text;
ALTER TABLE public.sightings ADD COLUMN "sitelocation" text;
ALTER TABLE public.sightings ADD COLUMN "latitude" numeric;
ALTER TABLE public.sightings ADD COLUMN "longitude" numeric;
ALTER TABLE public.sightings ADD COLUMN "start_time" text;
ALTER TABLE public.sightings ADD COLUMN "end_time" text;
ALTER TABLE public.sightings ADD COLUMN "organization" text;
ALTER TABLE public.sightings ADD COLUMN "photographer" text;
ALTER TABLE public.sightings ADD COLUMN "total_mantas" integer;
ALTER TABLE public.sightings ADD COLUMN "skunks" text;
ALTER TABLE public.sightings ADD COLUMN "behavior" text;
ALTER TABLE public.sightings ADD COLUMN "injuries_observed" text;
ALTER TABLE public.sightings ADD COLUMN "tidal_state" text;
ALTER TABLE public.sightings ADD COLUMN "day_night" text;
ALTER TABLE public.sightings ADD COLUMN "notes" text;
ALTER TABLE public.sightings ADD COLUMN "standardize_survey" text;
ALTER TABLE public.sightings ADD COLUMN "total_manta_ids" integer;
ALTER TABLE public.sightings ADD COLUMN "list_manta_ids" text;
ALTER TABLE public.sightings ADD COLUMN "total_mantas_sized" integer;
ALTER TABLE public.sightings ADD COLUMN "total_mantas_biopsied" integer;
ALTER TABLE public.sightings ADD COLUMN "total_survey_time" text;
ALTER TABLE public.sightings ADD COLUMN "population" text;
ALTER TABLE public.sightings ADD COLUMN "sighting_uuid" uuid;
ALTER TABLE public.sightings ADD COLUMN "pk_sighting_uuid" uuid;
ALTER TABLE public.sightings ADD COLUMN "sighting_year" integer GENERATED ALWAYS AS ((EXTRACT(year FROM sighting_date))::integer) STORED;
ALTER TABLE public.sightings ADD COLUMN "mprf_external_id" text;
ALTER TABLE public.sightings ADD COLUMN "location" text;
ALTER TABLE public.sightings ADD COLUMN "is_mprf" boolean;
ALTER TABLE public.sightings ADD COLUMN "created_at" timestamp with time zone;
ALTER TABLE public.sightings ADD COLUMN "updated_at" timestamp with time zone;
ALTER TABLE public.sightings ADD COLUMN "pk_mprf_sighting_id" text;
ALTER TABLE public.sightings ADD COLUMN "pk_mprf_catalog_id_list" integer[];
ALTER TABLE public.sightings ADD COLUMN "plankton" integer;
ALTER TABLE public.sightings ADD COLUMN "water_temp" numeric;
ALTER TABLE public.sightings ADD COLUMN "number_of_boats" integer;
ALTER TABLE public.sightings ADD COLUMN "number_of_divers" integer;
ALTER TABLE public.sightings ADD COLUMN "number_of_snorkelers" integer;
ALTER TABLE public.sightings ADD COLUMN "list_manta_ids_2" text;
ALTER TABLE public.sightings ADD COLUMN "list_catalog_ids" text;
ALTER TABLE public.sightings ADD COLUMN "location_unknown" boolean;
CREATE TABLE public.stg_catalog ("pk_catalog_id" integer, "name" text, "species" text, "date_first_sighted" text, "date_last_sighted" text, "days_between_first_last" text, "days_between_first_last_sighting" text, "days_since_last_sighting" text, "days_since_last_sighitng" text, "notes" text, "src_file" text, "loaded_at" timestamp with time zone, "last_age_class" text, "list_unique_locations" text, "list_unique_regions" text, "total_sightings" text, "last_sex" text, "last_size" text, "c_last_size" text, "list_years_sighted" text, "total_biopsies" text, "total_tags" text);
CREATE TABLE public.stg_eli_keller_biopsies ("mprf_sample_number" text, "mprf_biopsy_date" text, "mprf_manta_name" text, "pk_mprf_catalog_id" bigint, "mprf_gender" text, "mprf_location" text, "mprf_area_sampled" text, "mprf_photos" text, "mprf_manta_identifier" text, "mprf_biopsier" text, "mprf_post_biopsy_resight" text, "mprf_last_resight_date" text);
CREATE TABLE public.stg_import_errors ("id" bigint, "occurred_at" timestamp with time zone, "import_batch_id" uuid, "target_table" text, "source_file" text, "row_no" integer, "reason_code" text, "reason_detail" text, "raw" jsonb);
CREATE TABLE public.stg_mantas ("pk_manta_id" integer, "fk_catalog_id" integer, "fk_sighting_id" integer, "fk_sighting_uuid" uuid, "gender" text, "age_class" text, "size_m" text, "estimated_size_m" text, "size_disc_len_m" text, "size_disc_width_m" text, "total_biopsies" text, "total_tags" text, "photographer" text, "species" text, "injury_type" text, "injury_notes" text, "mp_number" text, "src_file" text, "loaded_at" timestamp with time zone, "notes" text);
CREATE TABLE public.stg_photos ("pk_photo_id" integer, "fk_manta_id" integer, "fk_catalog_id" integer, "fk_sighting_id" integer, "fk_manta_uuid" uuid, "fk_catalog_uuid" uuid, "fk_sighting_uuid" uuid, "file_name2" text, "storage_path" text, "thumbnail_url" text, "photo_view" text, "view_label" text, "population" text, "is_best_catalog_ventral_photo" text, "is_best_catalog_dorsal_photo" text, "is_best_manta_ventral_photo" text, "is_best_manta_dorsal_photo" text, "notes" text, "src_file" text, "loaded_at" timestamp with time zone);
CREATE TABLE public.stg_sightings ("pk_sighting_id" integer, "sighting_date" text, "month_name" text, "year" text, "survey_no" text, "sighting_no" text, "island" text, "region" text, "sitelocation" text, "latitude" text, "longitude" text, "start_time" text, "end_time" text, "organization" text, "photographer" text, "total_mantas" text, "skunks" text, "behavior" text, "injuries_observed" text, "tidal_state" text, "day_night" text, "notes" text, "standardize_survey" text, "total_manta_ids" text, "list_manta_ids" text, "total_mantas_sized" text, "total_mantas_biopsied" text, "total_survey_time" text, "population" text, "src_file" text, "loaded_at" timestamp with time zone);
CREATE TABLE public.stg_v_sizes2_bad_rows ("fk_manta_id" integer, "measurement_type" text, "size_m" numeric, "measured_on" date, "photo_code" text, "quality_note" text, "calibration_params" text, "src_file" text);
CREATE TABLE public.stg_v_sizes2_extract ("fk_manta_id" integer, "measurement_type" text, "size_m" numeric, "measured_on" date, "photo_code" text, "quality_note" text, "calibration_params" text, "src_file" text);
CREATE TABLE public.v_stg_mprf_mantas_norm ("id" bigint, "import_batch_id" uuid, "source_file" text, "row_no" integer, "raw" jsonb, "pk_mprf_manta_id" integer, "pk_mprf_catalog_id" integer, "name" text, "is_valid" boolean, "dup_rank" bigint);
CREATE TABLE public.v_stg_mprf_sightings_norm ("id" bigint, "mprf_sighting_id" text, "sighting_date_parsed" date, "location_norm" text, "island_norm" text, "region_norm" text, "mprf_catalog_ids" integer[]);
ALTER TABLE catalog ADD UNIQUE(pk_catalog_id);
ALTER TABLE manta_sizes ADD UNIQUE(row_sig);
ALTER TABLE mantas ADD UNIQUE(mprf_external_manta_id);
ALTER TABLE sightings ADD UNIQUE(mprf_external_id);
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
UPDATE stg_jonathan_whiteny_biopsies SET jon_biopsy_date='2020-01-01';
UPDATE content_before SET fingerprint=(SELECT md5(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text)) FROM stg_jonathan_whiteny_biopsies t) WHERE name='stg_jonathan_whiteny_biopsies';
CREATE OR REPLACE FUNCTION public.fn_is_image_filename(p text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p is null then null
    when lower(p) ~ '\\.(jpg|jpeg|png|gif|tif|tiff)$' then true
    else false
  end
$function$
;
REVOKE ALL ON FUNCTION public.fn_is_image_filename(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_image_filename(text) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_nullif_blank(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when t is null or btrim(t) = '' then null else t end
$function$
;
REVOKE ALL ON FUNCTION public.fn_nullif_blank(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nullif_blank(text) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_parse_date_loose(t text)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when t is null or length(btrim(t))=0 then null
    when t ~ '^\d{4}-\d{2}-\d{2}$' then t::date                 -- YYYY-MM-DD
    when t ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(t,'MM/DD/YYYY')
    when t ~ '^\d{1,2}/\d{1,2}/\d{2}$'  then to_date(t,'MM/DD/YY')
    else null
  end
$function$
;
REVOKE ALL ON FUNCTION public.fn_parse_date_loose(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_parse_date_loose(text) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_photo_clean_filename(p text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  t text;
  m text[];
begin
  if p is null or btrim(p) = '' then
    return null;
  end if;

  -- collapse vertical-tabs/newlines to spaces
  t := regexp_replace(p, E'[\\x0b\\r\\n]+', ' ', 'g');

  -- try after "remote:"
  m := regexp_match(t, '(?i)remote:([^/\\s]+\\.(?:jpg|jpeg|png|gif|tif|tiff))');
  if m is not null then
    return m[1];
  end if;

  -- otherwise first image-like token
  m := regexp_match(t, '(?i)([^/\\s]+\\.(?:jpg|jpeg|png|gif|tif|tiff))');
  if m is not null then
    return m[1];
  end if;

  return null;
end
$function$
;
REVOKE ALL ON FUNCTION public.fn_photo_clean_filename(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_photo_clean_filename(text) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_photo_view_norm(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p is null or btrim(p) = '' then null
    when lower(btrim(p)) in ('ventral','v','vent') then 'ventral'
    when lower(btrim(p)) in ('dorsal','d','dors') then 'dorsal'
    when lower(btrim(p)) in ('other','o') then 'other'
    else null
  end
$function$
;
REVOKE ALL ON FUNCTION public.fn_photo_view_norm(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_photo_view_norm(text) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_to_int(i integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select $1
$function$
;
REVOKE ALL ON FUNCTION public.fn_to_int(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_to_int(integer) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_to_int(t text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select nullif(regexp_replace(t, '[^0-9\-]', '', 'g'), '')::int
$function$
;
REVOKE ALL ON FUNCTION public.fn_to_int(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_to_int(text) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_to_numeric(n numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select $1
$function$
;
REVOKE ALL ON FUNCTION public.fn_to_numeric(numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_to_numeric(numeric) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_to_numeric(t text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select nullif(regexp_replace(t, '[^0-9\.\-]', '', 'g'), '')::numeric
$function$
;
REVOKE ALL ON FUNCTION public.fn_to_numeric(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_to_numeric(text) TO service_role;
CREATE OR REPLACE FUNCTION public.try_cast_date(p_text text)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_in text := nullif(btrim(p_text), '');
  v_date_only text;
  v_yy text;
  v_mm text;
  v_dd text;
  v_match text[];
  v_year text;
begin
  if v_in is null then
    return null;
  end if;

  -- If it already casts as DATE (e.g., '2021-06-16')
  begin
    return v_in::date;
  exception when others then
    -- continue
  end;

  -- Strip any time portion like '6/16/21 14:15'
  v_date_only := regexp_replace(v_in, '\s+.*$', '');

  -- Try ISO again after strip (just in case)
  begin
    return v_date_only::date;
  exception when others then
    -- continue
  end;

  -- Try M/D/YY or M/D/YYYY
  v_match := regexp_match(v_date_only, '^(\d{1,2})/(\d{1,2})/(\d{2,4})$');
  if v_match is not null then
    v_mm := v_match[1];
    v_dd := v_match[2];
    v_yy := v_match[3];

    if length(v_yy) = 2 then
      -- assume 2000s for 2-digit years in this dataset
      v_year := '20' || v_yy;
    else
      v_year := v_yy;
    end if;

    return to_date(lpad(v_mm,2,'0') || '/' || lpad(v_dd,2,'0') || '/' || v_year, 'MM/DD/YYYY');
  end if;

  -- Last resort: explicit format attempts
  begin
    return to_date(v_date_only, 'MM/DD/YY');
  exception when others then
    -- continue
  end;
  begin
    return to_date(v_date_only, 'MM/DD/YYYY');
  exception when others then
    -- continue
  end;

  return null;
end
$function$
;
REVOKE ALL ON FUNCTION public.try_cast_date(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.try_cast_date(text) TO service_role;
CREATE OR REPLACE FUNCTION public.batch_update_photos_from_filenames()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  r record;
begin
  for r in
    select *
    from public.photos_filenames_cleaned_integer_ids
    where filename2 is not null
  loop
    update public.photos
    set
      fk_manta_id = r.pk_manta_id,
      fk_sighting_id = r.pk_sighting_id,
      file_name2 = r.filename2
    where pk_photo_id = r.pk_photo_id::text;
  end loop;
end;
$function$
;
REVOKE ALL ON FUNCTION public.batch_update_photos_from_filenames() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.batch_update_photos_from_filenames() TO service_role;
CREATE OR REPLACE FUNCTION public.fn_imports_commit_catalog_cols(p_columns text[], p_src_file text DEFAULT NULL::text, p_file_sha256 text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cols text[];
  v_log_id bigint;
  v_select_list text;
  v_set_list text;
  v_ins int := 0;
  v_upd int := 0;
  v_sql text;
begin
  v_cols := array(
    select distinct lower(trim(c))
    from unnest(coalesce(p_columns, '{}')) as c
    where c is not null and trim(c) <> '' and lower(trim(c)) <> 'pk_catalog_id'
  );

  if array_length(v_cols, 1) is null then
    return json_build_object('inserted_catalog', 0, 'updated_catalog', 0, 'log_id', null, 'message', 'no columns selected');
  end if;

  perform 1
  from information_schema.columns bc
  where bc.table_schema = 'public' and bc.table_name = 'catalog' and lower(bc.column_name) = any(v_cols);
  if not found then
    raise exception 'None of the selected columns exist in catalog';
  end if;

  perform 1
  from information_schema.columns sc
  where sc.table_schema = 'public' and sc.table_name = 'stg_catalog' and lower(sc.column_name) = any(v_cols);
  if not found then
    raise exception 'Selected columns must exist in stg_catalog too';
  end if;

  insert into public.import_logs(src_file, file_sha256, status, started_at)
  values (p_src_file, p_file_sha256, 'committing_catalog_dynamic', now())
  returning id into v_log_id;

  v_select_list := array_to_string(array(select format('%I', c) from unnest(v_cols) c), ', ');
  v_set_list    := array_to_string(array(select format('%I = excluded.%I', c, c) from unnest(v_cols) c), ', ');

  v_sql := format($f$
    with up as (
      insert into public.catalog (pk_catalog_id, %s)
      select pk_catalog_id, %s
      from public.stg_catalog
      where pk_catalog_id is not null
      on conflict (pk_catalog_id) do update
      set %s
      returning (xmax = 0) as inserted
    )
    select
      count(*) filter (where inserted) as ins,
      count(*) filter (where not inserted) as upd
    from up
  $f$, v_select_list, v_select_list, v_set_list);

  execute v_sql into v_ins, v_upd;

  update public.import_logs
    set message = 'catalog_dynamic',
        finished_at = now(),
        status = 'committed_catalog_dynamic'
  where id = v_log_id;

  return json_build_object(
    'inserted_catalog', v_ins,
    'updated_catalog', v_upd,
    'log_id', v_log_id,
    'updated_columns', v_cols
  );
exception when others then
  update public.import_logs
  set status = 'failed_catalog_dynamic',
      message = sqlerrm,
      finished_at = now()
  where id = v_log_id;
  raise;
end;
$function$
;
REVOKE ALL ON FUNCTION public.fn_imports_commit_catalog_cols(text[],text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_imports_commit_catalog_cols(text[],text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_imports_commit_catalog_cols_updates_only(p_columns text[], p_src_file text DEFAULT NULL::text, p_file_sha256 text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cols text[];
  v_log_id bigint;
  v_set_list text;
  v_upd int := 0;
begin
  v_cols := array(
    select distinct lower(trim(c))
    from unnest(coalesce(p_columns, '{}')) as c
    where c is not null and trim(c) <> '' and lower(trim(c)) <> 'pk_catalog_id'
  );

  if array_length(v_cols, 1) is null then
    return json_build_object('updated_catalog', 0, 'log_id', null, 'message', 'no columns selected');
  end if;

  -- ensure columns exist on both sides
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='catalog' and lower(column_name)=any(v_cols);
  if not found then raise exception 'Selected columns missing in catalog'; end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='stg_catalog' and lower(column_name)=any(v_cols);
  if not found then raise exception 'Selected columns missing in stg_catalog'; end if;

  insert into public.import_logs(src_file, file_sha256, status, started_at)
  values (p_src_file, p_file_sha256, 'committing_catalog_updates_only', now())
  returning id into v_log_id;

  -- build "SET col = s.col" list
  v_set_list := array_to_string(
    array(select format('%I = s.%I', c, c) from unnest(v_cols) c), ', '
  );

  -- UPDATE existing rows only (join on pk_catalog_id)
  execute format($sql$
    with matched as (
      select c.pk_catalog_id %s
      from public.catalog c
      join public.stg_catalog s using (pk_catalog_id)
    )
    update public.catalog c
    set %s
    from public.stg_catalog s
    where c.pk_catalog_id = s.pk_catalog_id
  $sql$,
    '',
    v_set_list
  );

  GET DIAGNOSTICS v_upd = ROW_COUNT;

  update public.import_logs
  set message = 'catalog_updates_only',
      finished_at = now(),
      status = 'committed_catalog_updates_only'
  where id = v_log_id;

  return json_build_object('updated_catalog', v_upd, 'log_id', v_log_id, 'updated_columns', v_cols);
exception when others then
  update public.import_logs
  set status = 'failed_catalog_updates_only', message = sqlerrm, finished_at = now()
  where id = v_log_id;
  raise;
end;
$function$
;
REVOKE ALL ON FUNCTION public.fn_imports_commit_catalog_cols_updates_only(text[],text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_imports_commit_catalog_cols_updates_only(text[],text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_imports_commit_manta_sizes(p_src_file text DEFAULT NULL::text)
 RETURNS TABLE(rows_staged integer, rows_inserted integer, rows_skipped integer, rows_bad integer, rows_missing_fk integer)
 LANGUAGE plpgsql
AS $function$
declare
  v_staged int := 0;
  v_ins    int := 0;
  v_bad    int := 0;
  v_mfk    int := 0;
begin
  -- Working set: valid parsed rows only
  create temp table tmp_sizes2 as
  select
    e.fk_manta_id,
    e.measurement_type,
    e.size_m,
    e.measured_on,
    e.photo_code,
    e.quality_note,
    e.calibration_params,
    e.src_file,
    md5( coalesce(e.fk_manta_id::text,'')
       || '|' || coalesce(e.measurement_type,'')
       || '|' || coalesce(e.size_m::text,'')
       || '|' || coalesce(e.measured_on::text,'')
       || '|' || coalesce(e.photo_code,'')
       || '|' || coalesce(e.src_file,'') )        as row_sig
  from public.stg_v_sizes2_extract e
  where (p_src_file is null or e.src_file = p_src_file)
    and e.fk_manta_id is not null
    and e.size_m is not null
    and e.size_m > 0;

  get diagnostics v_staged = row_count;

  -- Count bad rows (for reporting)
  select count(*) into v_bad
  from public.stg_v_sizes2_bad_rows b
  where (p_src_file is null or b.src_file = p_src_file);

  -- Insert only when the manta exists; skip if FK missing
  with src as (
    select t.*
    from tmp_sizes2 t
    join public.mantas m on m.pk_manta_id = t.fk_manta_id
  ),
  ins as (
    insert into public.manta_sizes(
      fk_manta_id, measurement_type, size_m, measured_on,
      photo_code, quality_note, calibration_params, src_file, row_sig
    )
    select
      s.fk_manta_id, s.measurement_type, s.size_m, s.measured_on,
      s.photo_code, s.quality_note, s.calibration_params, s.src_file, s.row_sig
    from src s
    on conflict (row_sig) do nothing
    returning 1
  )
  select count(*) into v_ins from ins;

  -- Missing FK count (looked valid but manta not found)
  select count(*) into v_mfk
  from tmp_sizes2 t
  left join public.mantas m on m.pk_manta_id = t.fk_manta_id
  where m.pk_manta_id is null;

  -- Ensure import_logs columns exist (non-breaking)
  create table if not exists public.import_logs (id bigserial primary key);
  alter table public.import_logs
    add column if not exists target_table  text,
    add column if not exists src_file      text,
    add column if not exists started_at    timestamptz default now(),
    add column if not exists finished_at   timestamptz default now(),
    add column if not exists rows_staged   int,
    add column if not exists rows_inserted int,
    add column if not exists rows_updated  int,
    add column if not exists rows_skipped  int,
    add column if not exists details       jsonb;

  insert into public.import_logs(target_table, src_file, rows_staged, rows_inserted, rows_updated, rows_skipped, details)
  values ('manta_sizes', p_src_file, v_staged, v_ins, 0, greatest(v_staged - v_ins,0),
          jsonb_build_object('commit','fn_imports_commit_manta_sizes','bad_rows',v_bad,'missing_fk',v_mfk));

  return query select v_staged, v_ins, greatest(v_staged - v_ins,0), v_bad, v_mfk;
end
$function$
;
REVOKE ALL ON FUNCTION public.fn_imports_commit_manta_sizes(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_imports_commit_manta_sizes(text) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_imports_commit_mantas_by_pair_disambiguate(p_src_file text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_upd int := 0;
  v_log bigint;
begin
  insert into public.import_logs (src_file, status, started_at)
  values (p_src_file, 'committing_mantas_by_pair_disambiguate', now())
  returning id into v_log;

  with
  amb as (  -- base pairs that are ambiguous
    select fk_catalog_id, fk_sighting_id
    from public.mantas
    where fk_catalog_id is not null and fk_sighting_id is not null
    group by 1,2
    having count(*) > 1
  ),
  s as (     -- staged rows (use ints as ints; trim only text fields)
    select
      pk_manta_id                              as s_pk_manta_id,
      fk_catalog_id                            as s_fk_catalog_id,
      fk_sighting_id                           as s_fk_sighting_id,
      nullif(trim(gender), '')                 as s_gender,
      nullif(trim(age_class), '')              as s_age_class,
      nullif(trim(photographer), '')           as s_photographer,
      nullif(trim(size_m), '')::numeric        as s_size_m,
      nullif(trim(estimated_size_m), '')::numeric as s_estimated_size_m,
      nullif(coalesce(total_biopsies::text,''), '')::int as s_total_biopsies,
      nullif(coalesce(total_tags::text,''), '' )::int    as s_total_tags
    from public.stg_mantas
    where (p_src_file is null or src_file = p_src_file)
      and fk_catalog_id  is not null
      and fk_sighting_id is not null
  ),
  cand as ( -- candidate base rows matched to staged pair, with a score
    select
      b.pk_manta_id,
      b.fk_catalog_id,
      b.fk_sighting_id,
      s.s_gender, s.s_age_class, s.s_photographer,
      s.s_size_m, s.s_estimated_size_m, s.s_total_biopsies, s.s_total_tags,
      s.s_pk_manta_id,
      (coalesce((s.s_pk_manta_id = b.pk_manta_id)::int,0) * 10) +
      (case when s.s_gender       is not null and lower(s.s_gender)       = lower(b.gender)       then 1 else 0 end) +
      (case when s.s_age_class    is not null and lower(s.s_age_class)    = lower(b.age_class)    then 1 else 0 end) +
      (case when s.s_photographer is not null and lower(s.s_photographer) = lower(b.photographer) then 1 else 0 end)
      as score
    from public.mantas b
    join amb a
      on a.fk_catalog_id = b.fk_catalog_id
     and a.fk_sighting_id = b.fk_sighting_id
    join s
      on b.fk_catalog_id  = s.s_fk_catalog_id
     and b.fk_sighting_id = s.s_fk_sighting_id
  ),
  best as ( -- pick one base row per ambiguous pair
    select *
    from (
      select
        cand.*,
        row_number() over (
          partition by fk_catalog_id, fk_sighting_id
          order by score desc, pk_manta_id asc
        ) as rn
      from cand
    ) x
    where x.rn = 1
  ),
  u as (
    update public.mantas base
       set
         -- NEVER overwrite existing non-NULL fk_catalog_id
         fk_catalog_id     = coalesce(base.fk_catalog_id,  best.fk_catalog_id),
         fk_sighting_id    = coalesce(best.fk_sighting_id, base.fk_sighting_id),

         -- text fields
         gender            = coalesce(best.s_gender,        base.gender),
         age_class         = coalesce(best.s_age_class,     base.age_class),
         photographer      = coalesce(best.s_photographer,  base.photographer),

         -- numeric fields
         size_m            = coalesce(best.s_size_m,             base.size_m),
         estimated_size_m  = coalesce(best.s_estimated_size_m,   base.estimated_size_m),
         total_biopsies    = coalesce(best.s_total_biopsies,     base.total_biopsies),
         total_tags        = coalesce(best.s_total_tags,         base.total_tags),

         updated_at        = now()
    from best
    where base.pk_manta_id = best.pk_manta_id
    returning 1
  )
  select count(*) into v_upd from u;

  update public.import_logs
     set status      = 'committed_mantas_by_pair_disambiguate',
         message     = 'mantas ambiguous pairs updates-only',
         finished_at = now()
   where id = v_log;

  return json_build_object(
    'updated_mantas', v_upd,
    'log_id',         v_log,
    'protected_fk_catalog_id', true
  );
end;
$function$
;
REVOKE ALL ON FUNCTION public.fn_imports_commit_mantas_by_pair_disambiguate(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_imports_commit_mantas_by_pair_disambiguate(text) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_imports_commit_mantas_by_pair_updates_only(p_src_file text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_upd    int := 0;
  v_log_id bigint;
begin
  insert into public.import_logs(src_file, status, started_at)
  values (p_src_file, 'committing_mantas_by_pair_updates_only', now())
  returning id into v_log_id;

  with target as (
    select
      b.pk_manta_id,

      -- staged values, aliased and cast as needed
      (s.fk_catalog_id)::int              as s_fk_catalog_id,
      (s.fk_sighting_id)::int             as s_fk_sighting_id,
      nullif(btrim(s.gender), '')         as s_gender,
      nullif(btrim(s.age_class), '')      as s_age_class,
      nullif(btrim(s.size_m), '')::numeric           as s_size_m,
      nullif(btrim(s.estimated_size_m), '')::numeric as s_estimated_size_m,
      nullif(btrim(s.total_biopsies), '')::int       as s_total_biopsies,
      nullif(btrim(s.total_tags), '')::int           as s_total_tags,
      nullif(btrim(s.photographer), '')              as s_photographer

    from public.stg_mantas s
    join public.mantas b
      on b.fk_catalog_id  = (s.fk_catalog_id)::int
     and b.fk_sighting_id = (s.fk_sighting_id)::int

    -- only pairs that are UNIQUE in base (avoid ambiguous updates)
    join (
      select fk_catalog_id, fk_sighting_id
      from public.mantas
      where fk_catalog_id is not null and fk_sighting_id is not null
      group by 1,2
      having count(*) = 1
    ) u
      on u.fk_catalog_id = b.fk_catalog_id
     and u.fk_sighting_id = b.fk_sighting_id

    where (p_src_file is null or s.src_file = p_src_file)
  ),

  u as (
    update public.mantas base
       set
         -- NEVER overwrite an existing non-null fk_catalog_id
         fk_catalog_id     = coalesce(base.fk_catalog_id,  target.s_fk_catalog_id),
         -- prefer staged sighting when present; otherwise keep base
         fk_sighting_id    = coalesce(target.s_fk_sighting_id, base.fk_sighting_id),

         -- free-text
         gender            = coalesce(target.s_gender,    base.gender),
         age_class         = coalesce(target.s_age_class, base.age_class),
         photographer      = coalesce(target.s_photographer, base.photographer),

         -- numeric
         size_m            = coalesce(target.s_size_m,           base.size_m),
         estimated_size_m  = coalesce(target.s_estimated_size_m, base.estimated_size_m),
         total_biopsies    = coalesce(target.s_total_biopsies,   base.total_biopsies),
         total_tags        = coalesce(target.s_total_tags,       base.total_tags),

         updated_at        = now()
    from target
    where base.pk_manta_id = target.pk_manta_id
    returning 1
  )

  select count(*) into v_upd from u;

  update public.import_logs
     set status      = 'committed_mantas_by_pair_updates_only',
         message     = 'mantas composite updates-only',
         finished_at = now()
   where id = v_log_id;

  return json_build_object(
    'updated_mantas', v_upd,
    'log_id',         v_log_id,
    'protected_fk_catalog_id', true
  );
end$function$
;
REVOKE ALL ON FUNCTION public.fn_imports_commit_mantas_by_pair_updates_only(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_imports_commit_mantas_by_pair_updates_only(text) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_imports_commit_mantas_updates_only()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_upd int := 0;
begin
  update public.mantas m
  set
    fk_catalog_id        = coalesce(s.fk_catalog_id, m.fk_catalog_id),
    fk_sighting_id       = coalesce(s.fk_sighting_id, m.fk_sighting_id),
    gender               = nullif(btrim(s.gender), ''),
    age_class            = nullif(btrim(s.age_class), ''),
    size_m               = case when s.size_m ~ '^-?\d+(\.\d+)?$' then s.size_m::numeric else m.size_m end,
    estimated_size_m     = case when s.estimated_size_m ~ '^-?\d+(\.\d+)?$' then s.estimated_size_m::numeric else m.estimated_size_m end,
    size_disc_len_m      = case when s.size_disc_len_m ~ '^-?\d+(\.\d+)?$' then s.size_disc_len_m::numeric else m.size_disc_len_m end,
    size_disc_width_m    = case when s.size_disc_width_m ~ '^-?\d+(\.\d+)?$' then s.size_disc_width_m::numeric else m.size_disc_width_m end,
    total_biopsies       = case when s.total_biopsies ~ '^\d+$' then s.total_biopsies::int else m.total_biopsies end,
    total_tags           = case when s.total_tags    ~ '^\d+$' then s.total_tags::int else m.total_tags end,
    photographer         = coalesce(nullif(btrim(s.photographer),''), m.photographer),
    species              = coalesce(nullif(btrim(s.species),''), m.species),
    injury_type          = coalesce(nullif(btrim(s.injury_type),''), m.injury_type),
    injury_notes         = coalesce(nullif(btrim(s.injury_notes),''), m.injury_notes),
    mp_number            = coalesce(nullif(btrim(s.mp_number),''), m.mp_number)
  from public.stg_mantas s
  where s.pk_manta_id = m.pk_manta_id;

  GET DIAGNOSTICS v_upd = ROW_COUNT;
  return json_build_object('updated_mantas', v_upd);
end $function$
;
REVOKE ALL ON FUNCTION public.fn_imports_commit_mantas_updates_only() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_imports_commit_mantas_updates_only() TO service_role;
CREATE OR REPLACE FUNCTION public.fn_imports_commit_mantas_updates_only(p_src_file text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_log_id bigint;
  v_upd int := 0;
begin
  insert into public.import_logs(src_file, status, started_at)
  values (p_src_file, 'committing_mantas_updates_only', now())
  returning id into v_log_id;

  with u as (
    update public.mantas base
    set
      -- FK protection: NEVER overwrite an existing non-null fk_catalog_id
      fk_catalog_id     = coalesce(base.fk_catalog_id, fn_to_int(stg.fk_catalog_id::text)),
      -- prefer staged sighting FK when present
      fk_sighting_id    = coalesce(fn_to_int(stg.fk_sighting_id::text), base.fk_sighting_id),
      -- free text
      gender            = coalesce(fn_nullif_blank(stg.gender),    base.gender),
      age_class         = coalesce(fn_nullif_blank(stg.age_class), base.age_class),
      photographer      = coalesce(fn_nullif_blank(stg.photographer), base.photographer),
      -- numeric
      size_m            = coalesce(fn_to_numeric(stg.size_m::text),           base.size_m),
      estimated_size_m  = coalesce(fn_to_numeric(stg.estimated_size_m::text), base.estimated_size_m),
      total_biopsies    = coalesce(fn_to_int(stg.total_biopsies::text),       base.total_biopsies),
      total_tags        = coalesce(fn_to_int(stg.total_tags::text),           base.total_tags),
      updated_at        = now()
    from public.stg_mantas stg
    where base.pk_manta_id = fn_to_int(stg.pk_manta_id::text)
      and (p_src_file is null or stg.src_file = p_src_file)
      and (
            stg.fk_catalog_id    is not null or stg.fk_sighting_id is not null
         or stg.gender           is not null or stg.age_class      is not null
         or stg.size_m           is not null or stg.estimated_size_m is not null
         or stg.total_biopsies   is not null or stg.total_tags     is not null
         or stg.photographer     is not null
      )
    returning 1
  )
  select count(*) into v_upd from u;

  update public.import_logs
  set status     = 'committed_mantas_updates_only',
      message    = 'mantas updates-only',
      finished_at = now()
  where id = v_log_id;

  return json_build_object(
    'updated_mantas', v_upd,
    'log_id', v_log_id,
    'protected_fk_catalog_id', true
  );
exception when others then
  update public.import_logs
  set status = 'failed_mantas_updates_only',
      message = sqlerrm,
      finished_at = now()
  where id = v_log_id;
  raise;
end;
$function$
;
REVOKE ALL ON FUNCTION public.fn_imports_commit_mantas_updates_only(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_imports_commit_mantas_updates_only(text) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_imports_commit_mprf_mantas(p_batch uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_invalid   int := 0;
  v_upserts   int := 0;
  v_namefills int := 0;
begin
  -- Log invalid
  insert into stg_import_errors(import_batch_id,target_table,source_file,row_no,reason_code,reason_detail,raw)
  select import_batch_id,'mprf_mantas',source_file,row_no,'invalid_row','missing pk_mprf_manta_id or pk_mprf_catalog_id',raw
  from v_stg_mprf_mantas_norm
  where import_batch_id=p_batch and not is_valid;
  get diagnostics v_invalid = row_count;

  -- Valid, deduped by manta id
  with d as (
    select * from v_stg_mprf_mantas_norm
    where import_batch_id=p_batch and is_valid and dup_rank=1
  ),
  resolved as (
    select d.pk_mprf_manta_id,
           d.name,
           map.pk_catalog_id
    from d
    join mprf_catalog_map map on map.pk_mprf_catalog_id = d.pk_mprf_catalog_id
  ),
  up as (
    insert into mantas (mprf_external_manta_id, fk_catalog_id, name, is_mprf)
    select r.pk_mprf_manta_id, r.pk_catalog_id, null, true
    from resolved r
    on conflict (mprf_external_manta_id) do update
       set fk_catalog_id = coalesce(excluded.fk_catalog_id, mantas.fk_catalog_id),
           -- fill name only if currently null
           name         = coalesce(mantas.name, excluded.name),
           is_mprf      = true
    returning pk_manta_id, mprf_external_manta_id
  )
  select count(*) into v_upserts from up;

  -- Map external -> local id
  insert into mprf_manta_map(pk_mprf_manta_id, pk_manta_id)
  select mprf_external_manta_id, pk_manta_id
  from mantas
  where mprf_external_manta_id is not null
  on conflict (pk_mprf_manta_id) do update
    set pk_manta_id = excluded.pk_manta_id;

  -- Optional: fill names from staging where mantas.name is NULL
  with d as (
    select * from v_stg_mprf_mantas_norm
    where import_batch_id=p_batch and is_valid and dup_rank=1
  ),
  name_src as (
    select d.pk_mprf_manta_id, d.name
    from d
    where d.name is not null
  )
  update mantas m
     set name = n.name
    from name_src n
   where m.mprf_external_manta_id = n.pk_mprf_manta_id
     and m.is_mprf is true
     and m.name is null;
  GET DIAGNOSTICS v_namefills = ROW_COUNT;

  return jsonb_build_object(
    'target','mprf_mantas',
    'batch',p_batch,
    'invalid',v_invalid,
    'upserted',v_upserts,
    'names_filled',v_namefills
  );
end $function$
;
REVOKE ALL ON FUNCTION public.fn_imports_commit_mprf_mantas(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_imports_commit_mprf_mantas(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_imports_commit_mprf_sightings(p_batch uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_invalid int := 0;
  v_upserted int := 0;
  v_links int := 0;
begin
  -- 1) log invalid
  insert into stg_import_errors(import_batch_id,target_table,source_file,row_no,reason_code,reason_detail,raw)
  select import_batch_id,'mprf_sightings',source_file,row_no,'invalid_row','missing pk_mprf_sighting_id',raw
  from v_stg_mprf_sightings_norm
  where import_batch_id = p_batch and not is_valid;
  get diagnostics v_invalid = row_count;

  -- 2) upsert sightings ON CONFLICT (mprf_external_id)
  with d as (
    select * from v_stg_mprf_sightings_norm
    where import_batch_id = p_batch and is_valid and dup_rank=1
  ),
  up as (
    insert into sightings (mprf_external_id, sighting_date, location, island, region, population, is_mprf)
    select
      d.pk_mprf_sighting_id,
      try_cast_date(d.sighting_date),
      d.location,
      coalesce(d.island, 'Big Island'),
      coalesce(d.region, 'Kona'),
      'Big Island',
      true
    from d
    on conflict (mprf_external_id) do update
      set sighting_date = coalesce(try_cast_date(excluded.sighting_date::text), sightings.sighting_date),
          location      = coalesce(excluded.location,      sightings.location),
          island        = coalesce(excluded.island,        sightings.island),
          region        = coalesce(excluded.region,        sightings.region),
          population    = coalesce(excluded.population,    sightings.population),
          is_mprf       = true
    returning pk_sighting_id, mprf_external_id
  )
  select count(*) into v_upserted from up;

  -- 3) ensure external→internal mapping
  insert into mprf_sighting_map (pk_mprf_sighting_id, pk_sighting_id)
  select s.mprf_external_id, s.pk_sighting_id
  from sightings s
  where s.mprf_external_id is not null
  on conflict (pk_mprf_sighting_id) do update
    set pk_sighting_id = excluded.pk_sighting_id;

  -- 4) expand junction via MPRF list -> local catalog
  with d as (
    select * from v_stg_mprf_sightings_norm
    where import_batch_id = p_batch and is_valid and dup_rank=1
  ),
  explode as (
    select
      d.pk_mprf_sighting_id,
      trim(regexp_replace(x, '\s+', '', 'g')) as id_txt
    from d, regexp_split_to_table(coalesce(d.catalog_list,''), '[,;]') as x
    where nullif(btrim(x),'') is not null
  ),
  mapped as (
    select
      e.pk_mprf_sighting_id,
      (e.id_txt)::int as pk_mprf_catalog_id
    from explode e
    where e.id_txt ~ '^\d+$'
  ),
  join_map as (
    select
      m.pk_mprf_sighting_id,
      map.pk_catalog_id
    from mapped m
    join mprf_catalog_map map on map.pk_mprf_catalog_id = m.pk_mprf_catalog_id
  ),
  sids as (
    select sm.pk_mprf_sighting_id, sm.pk_sighting_id
    from mprf_sighting_map sm
    where sm.pk_mprf_sighting_id in (select pk_mprf_sighting_id from mapped)
  ),
  ins_links as (
    insert into sighting_catalog (fk_sighting_id, fk_catalog_id, is_mprf)
    select s.pk_sighting_id, j.pk_catalog_id, true
    from sids s
    join join_map j on j.pk_mprf_sighting_id = s.pk_mprf_sighting_id
    on conflict do nothing
    returning 1
  )
  select count(*) into v_links from ins_links;

  return jsonb_build_object(
    'target','mprf_sightings',
    'batch',p_batch,
    'invalid',v_invalid,
    'upserted_sightings',v_upserted,
    'links_created',v_links
  );
end $function$
;
REVOKE ALL ON FUNCTION public.fn_imports_commit_mprf_sightings(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_imports_commit_mprf_sightings(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_imports_commit_photos(p_src_file text DEFAULT NULL::text, p_allow_insert boolean DEFAULT false)
 RETURNS TABLE(rows_staged integer, rows_updated integer, rows_inserted integer, rows_skipped integer)
 LANGUAGE plpgsql
AS $function$
declare
  v_staged int := 0;
  v_upd    int := 0;
  v_ins    int := 0;
  v_skip   int := 0;
begin
  -- Normalize a working subset from staging
  create temp table tmp_photos_commit as
  select
    public.fn_to_int(s.pk_photo_id)       as pk_photo_id,
    public.fn_to_int(s.fk_manta_id)       as fk_manta_id,
    public.fn_photo_clean_filename(s.file_name2) as file_name2_norm,
    public.fn_photo_view_norm(s.photo_view)      as photo_view_norm
  from public.stg_photos s
  where (p_src_file is null or s.src_file = p_src_file)
    and public.fn_is_image_filename(public.fn_photo_clean_filename(s.file_name2)) is true;

  get diagnostics v_staged = row_count;

  -- Updates by primary key (FK protection; do not touch "best" flags)
  with u as (
    update public.photos p
    set
      -- update filename only if normalized value is new and not used by another row
      file_name2 = case
        when tmp.file_name2_norm is not null
         and p.file_name2 is distinct from tmp.file_name2_norm
         and not exists (
           select 1 from public.photos p2
           where p2.file_name2 = tmp.file_name2_norm
             and p2.pk_photo_id <> p.pk_photo_id
         )
        then tmp.file_name2_norm
        else p.file_name2
      end,
      -- only set view if we have a clean value
      photo_view = coalesce(tmp.photo_view_norm, p.photo_view),
      -- FK protection: never overwrite a non-NULL existing FK
      fk_manta_id = case
        when tmp.fk_manta_id is not null and p.fk_manta_id is null then tmp.fk_manta_id
        else p.fk_manta_id
      end
    from tmp_photos_commit tmp
    where p.pk_photo_id = tmp.pk_photo_id
    returning p.pk_photo_id
  )
  select count(*) into v_upd from u;

  -- Optional inserts (off by default)
  if p_allow_insert then
    insert into public.photos (fk_manta_id, file_name2, photo_view)
    select
      tmp.fk_manta_id,
      tmp.file_name2_norm,
      tmp.photo_view_norm
    from tmp_photos_commit tmp
    left join public.photos p on p.pk_photo_id = tmp.pk_photo_id
    where (tmp.pk_photo_id is null or p.pk_photo_id is null)
      and tmp.file_name2_norm is not null
      and not exists (select 1 from public.photos p2 where p2.file_name2 = tmp.file_name2_norm);

    get diagnostics v_ins = row_count;
  end if;

  v_skip := coalesce(v_staged,0) - coalesce(v_upd,0) - coalesce(v_ins,0);

  -- Minimal import log
  create table if not exists public.import_logs (
    id bigserial primary key,
    target_table text not null,
    src_file text,
    started_at timestamptz default now(),
    finished_at timestamptz default now(),
    rows_staged int,
    rows_inserted int,
    rows_updated int,
    rows_skipped int,
    details jsonb
  );

  insert into public.import_logs(
    target_table, src_file, rows_staged, rows_inserted, rows_updated, rows_skipped, details
  )
  values (
    'photos', p_src_file, v_staged, v_ins, v_upd, v_skip,
    jsonb_build_object('commit','fn_imports_commit_photos','allow_insert',p_allow_insert)
  );

  return query select coalesce(v_staged,0), coalesce(v_upd,0), coalesce(v_ins,0), coalesce(v_skip,0);
end
$function$
;
REVOKE ALL ON FUNCTION public.fn_imports_commit_photos(text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_imports_commit_photos(text,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_imports_commit_photos_updates_only()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_upd int := 0;
begin
  update public.photos t
  set
    fk_manta_id   = coalesce(p.fk_manta_id, t.fk_manta_id),
    fk_catalog_id = coalesce(p.fk_catalog_id, t.fk_catalog_id),
    fk_sighting_id= coalesce(p.fk_sighting_id, t.fk_sighting_id),
    file_name2    = coalesce(nullif(btrim(p.file_name2),''), t.file_name2),
    storage_path  = coalesce(nullif(btrim(p.storage_path),''), t.storage_path),
    thumbnail_url = coalesce(nullif(btrim(p.thumbnail_url),''), t.thumbnail_url),
    photo_view    = coalesce(nullif(lower(btrim(p.photo_view)),''), t.photo_view),
    view_label    = coalesce(nullif(btrim(p.view_label),''), t.view_label),
    population    = coalesce(nullif(btrim(p.population),''), t.population),
    notes         = coalesce(nullif(btrim(p.notes),''), t.notes)
  from public.stg_photos p
  where p.pk_photo_id = t.pk_photo_id;

  GET DIAGNOSTICS v_upd = ROW_COUNT;
  return json_build_object('updated_photos', v_upd);
end $function$
;
REVOKE ALL ON FUNCTION public.fn_imports_commit_photos_updates_only() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_imports_commit_photos_updates_only() TO service_role;
CREATE OR REPLACE FUNCTION public.fn_imports_commit_photos_updates_only(p_src_file text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_upd int := 0;
  v_log_id bigint;
begin
  insert into public.import_logs(src_file, status, started_at)
  values (p_src_file, 'committing_photos_updates_only', now())
  returning id into v_log_id;

  update public.photos base
  set
    -- Protect existing foreign keys
    fk_catalog_id = coalesce(base.fk_catalog_id, stg.fk_catalog_id),
    fk_manta_id   = coalesce(base.fk_manta_id,   stg.fk_manta_id),
    fk_sighting_id= coalesce(stg.fk_sighting_id, base.fk_sighting_id),

    file_name2    = coalesce(stg.file_name2,    base.file_name2),
    storage_path  = coalesce(stg.storage_path,  base.storage_path),
    thumbnail_url = coalesce(stg.thumbnail_url, base.thumbnail_url),
    photo_view    = coalesce(stg.photo_view,    base.photo_view),
    population    = coalesce(stg.population,    base.population),
    notes         = coalesce(stg.notes,         base.notes),

    -- Only flip “best” flags if present in CSV (coalesce to existing when NULL)
    is_best_catalog_ventral_photo = coalesce(stg.is_best_catalog_ventral_photo, base.is_best_catalog_ventral_photo),
    is_best_catalog_dorsal_photo  = coalesce(stg.is_best_catalog_dorsal_photo , base.is_best_catalog_dorsal_photo),
    is_best_manta_ventral_photo   = coalesce(stg.is_best_manta_ventral_photo  , base.is_best_manta_ventral_photo),
    is_best_manta_dorsal_photo    = coalesce(stg.is_best_manta_dorsal_photo   , base.is_best_manta_dorsal_photo),

    uploaded_at = now()
  from public.stg_photos stg
  where base.pk_photo_id = stg.pk_photo_id;

  GET DIAGNOSTICS v_upd = ROW_COUNT;

  update public.import_logs
  set finished_at = now(),
      status = 'committed_photos_updates_only',
      message = concat('updated_photos=', v_upd)
  where id = v_log_id;

  return json_build_object('updated_photos', v_upd, 'log_id', v_log_id,
                           'protected_fk_catalog_id', true,
                           'protected_fk_manta_id',   true);
end;
$function$
;
REVOKE ALL ON FUNCTION public.fn_imports_commit_photos_updates_only(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_imports_commit_photos_updates_only(text) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_imports_commit_sightings_updates_only(p_src_file text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_upd int := 0;
  v_log_id bigint;
begin
  -- minimal audit row (reuse your import_logs)
  insert into public.import_logs(src_file, status, started_at)
  values (p_src_file, 'committing_sightings_updates_only', now())
  returning id into v_log_id;

  with staged as (
    select
      s.pk_sighting_id,
      public.fn_parse_date_loose(s.sighting_date)::date as sdate, -- staged date parsed (NULL if blank/bad)
      nullif(btrim(s.island), '')        as island,
      nullif(btrim(s.region), '')        as region,
      nullif(btrim(s.sitelocation), '')  as sitelocation,
      nullif(btrim(s.photographer), '')  as photographer,
      nullif(btrim(s.notes), '')         as notes
    from public.stg_sightings s
    where s.pk_sighting_id is not null
      and (p_src_file is null or s.src_file = p_src_file)
  ), upd as (
    update public.sightings t
    set
      sighting_date = coalesce(staged.sdate, t.sighting_date),
      island        = coalesce(staged.island, t.island),
      region        = coalesce(staged.region, t.region),
      sitelocation  = coalesce(staged.sitelocation, t.sitelocation),
      photographer  = coalesce(staged.photographer, t.photographer),
      notes         = coalesce(staged.notes, t.notes)
    from staged
    where t.pk_sighting_id = staged.pk_sighting_id
      and (
        (staged.sdate        is not null and staged.sdate        is distinct from t.sighting_date) or
        (staged.island       is not null and staged.island       is distinct from t.island)        or
        (staged.region       is not null and staged.region       is distinct from t.region)        or
        (staged.sitelocation is not null and staged.sitelocation is distinct from t.sitelocation)  or
        (staged.photographer is not null and staged.photographer is distinct from t.photographer)  or
        (staged.notes        is not null and staged.notes        is distinct from t.notes)
      )
    returning 1
  )
  select count(*) into v_upd from upd;

  update public.import_logs
  set finished_at = now(),
      status      = 'committed_sightings_updates_only',
      message     = 'sightings updates-only'
  where id = v_log_id;

  return json_build_object('updated_sightings', v_upd, 'log_id', v_log_id);
end;
$function$
;
REVOKE ALL ON FUNCTION public.fn_imports_commit_sightings_updates_only(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_imports_commit_sightings_updates_only(text) TO service_role;
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
GRANT SELECT ON public.kona_biopsy_all_samples_v2 TO service_role;
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
GRANT SELECT ON public.kona_biopsy_all_samples_v3_export TO service_role;
SET check_function_bodies=on;
CREATE TEMP TABLE interface_calls(signature text,call text);
INSERT INTO interface_calls VALUES ('batch_update_photos_from_filenames()','SELECT * FROM public.batch_update_photos_from_filenames()');
INSERT INTO interface_calls VALUES ('fn_imports_commit_catalog_cols(text[],text,text)','SELECT * FROM public.fn_imports_commit_catalog_cols(ARRAY[''name'']::text[],''SYNTHETIC BATCH4A4''::text,''SYNTHETIC BATCH4A4''::text)');
INSERT INTO interface_calls VALUES ('fn_imports_commit_catalog_cols_updates_only(text[],text,text)','SELECT * FROM public.fn_imports_commit_catalog_cols_updates_only(ARRAY[''name'']::text[],''SYNTHETIC BATCH4A4''::text,''SYNTHETIC BATCH4A4''::text)');
INSERT INTO interface_calls VALUES ('fn_imports_commit_manta_sizes(text)','SELECT * FROM public.fn_imports_commit_manta_sizes(''SYNTHETIC BATCH4A4''::text)');
INSERT INTO interface_calls VALUES ('fn_imports_commit_mantas_by_pair_disambiguate(text)','SELECT * FROM public.fn_imports_commit_mantas_by_pair_disambiguate(''SYNTHETIC BATCH4A4''::text)');
INSERT INTO interface_calls VALUES ('fn_imports_commit_mantas_by_pair_updates_only(text)','SELECT * FROM public.fn_imports_commit_mantas_by_pair_updates_only(''SYNTHETIC BATCH4A4''::text)');
INSERT INTO interface_calls VALUES ('fn_imports_commit_mantas_updates_only()','SELECT * FROM public.fn_imports_commit_mantas_updates_only()');
INSERT INTO interface_calls VALUES ('fn_imports_commit_mantas_updates_only(text)','SELECT * FROM public.fn_imports_commit_mantas_updates_only(''SYNTHETIC BATCH4A4''::text)');
INSERT INTO interface_calls VALUES ('fn_imports_commit_mprf_mantas(uuid)','SELECT * FROM public.fn_imports_commit_mprf_mantas(''00000000-0000-0000-0000-000000000099''::uuid)');
INSERT INTO interface_calls VALUES ('fn_imports_commit_mprf_sightings(uuid)','SELECT * FROM public.fn_imports_commit_mprf_sightings(''00000000-0000-0000-0000-000000000099''::uuid)');
INSERT INTO interface_calls VALUES ('fn_imports_commit_photos(text,boolean)','SELECT * FROM public.fn_imports_commit_photos(''SYNTHETIC BATCH4A4''::text,false)');
INSERT INTO interface_calls VALUES ('fn_imports_commit_photos_updates_only()','SELECT * FROM public.fn_imports_commit_photos_updates_only()');
INSERT INTO interface_calls VALUES ('fn_imports_commit_photos_updates_only(text)','SELECT * FROM public.fn_imports_commit_photos_updates_only(''SYNTHETIC BATCH4A4''::text)');
INSERT INTO interface_calls VALUES ('fn_imports_commit_sightings_updates_only(text)','SELECT * FROM public.fn_imports_commit_sightings_updates_only(''SYNTHETIC BATCH4A4''::text)');
CREATE TABLE interface_results(phase text, signature text, state text, message text,
 error_context text, error_schema text, error_table text, error_column text,
 returned_value jsonb, before_targets jsonb, after_targets jsonb);
-- Only volatile audit timestamps are omitted from differential content hashes.
-- Raw hashes are retained separately as evidence; returned log IDs are deterministic.
CREATE FUNCTION target_snapshot() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE n text; one jsonb; result jsonb:='{}';
BEGIN
 FOREACH n IN ARRAY ARRAY['stg_jonathan_whiteny_biopsies','import_logs','mprf_manta_map','mprf_sighting_map','photos_filenames_cleaned_integer_ids'] LOOP
  EXECUTE format($q$SELECT jsonb_build_object('rows',count(*),'raw',md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')),'normalized',md5(coalesce(string_agg((to_jsonb(t)-'started_at'-'finished_at'-'created_at')::text,'' ORDER BY (to_jsonb(t)-'started_at'-'finished_at'-'created_at')::text),''))) FROM public.%I t$q$,n) INTO one;
  result:=result||jsonb_build_object(n,one);
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION comparable_snapshot(s jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_object_agg(key,value-'raw') FROM jsonb_each(s)
$$;
CREATE TEMP TABLE interface_definitions AS SELECT p.oid,pg_get_functiondef(p.oid) definition,p.proacl FROM pg_proc p JOIN interface_calls i ON p.oid=('public.'||i.signature)::regprocedure;
CREATE TEMP TABLE view_definitions AS SELECT oid,pg_get_viewdef(oid) definition,relacl FROM pg_class WHERE relname IN ('kona_biopsy_all_samples_v2','kona_biopsy_all_samples_v3_export');
-- Capture runtime outcome inside a rolled-back subtransaction, including any temporary tables.
CREATE FUNCTION check_interfaces(phase_name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; role_name text; outcome text; msg text; v text; log_count bigint; returned jsonb; before_data jsonb; after_data jsonb; ctx text; err_schema text; err_table text; err_column text;
BEGIN
 FOR r IN SELECT * FROM interface_calls LOOP
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   PERFORM assert_ok(has_function_privilege(role_name,('public.'||r.signature)::regprocedure,'EXECUTE')=(role_name='service_role'), phase_name||' '||r.signature||' '||role_name||' EXECUTE');
   outcome:='00000'; msg:='success'; returned:=NULL; ctx:=''; err_schema:=''; err_table:=''; err_column:='';
   before_data:=target_snapshot(); after_data:=before_data;
   -- Sequence increments do not roll back. Reset the isolated fixture to identical input each call.
   PERFORM setval('import_logs_id_seq',100);
   BEGIN
    IF role_name='service_role' THEN
     SELECT count(*) INTO log_count FROM import_logs;
     IF r.signature='fn_imports_commit_mprf_mantas(uuid)' THEN UPDATE mantas SET mprf_external_manta_id=1001 WHERE pk_manta_id=1; END IF;
    END IF;
    EXECUTE 'SET LOCAL ROLE '||quote_ident(role_name);
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(result)), ''[]''::jsonb) FROM ('||r.call||') result' INTO returned;
    after_data:=target_snapshot();
    IF role_name='service_role' AND r.signature IN ('fn_imports_commit_catalog_cols(text[],text,text)','fn_imports_commit_catalog_cols_updates_only(text[],text,text)','fn_imports_commit_sightings_updates_only(text)') THEN
     PERFORM assert_ok((SELECT count(*) FROM import_logs)=log_count+1,phase_name||' '||r.signature||' successful log insert');
    END IF;
    IF role_name='service_role' AND r.signature='fn_imports_commit_mprf_mantas(uuid)' THEN
     PERFORM assert_ok(EXISTS(SELECT 1 FROM mprf_manta_map WHERE pk_mprf_manta_id=1001 AND pk_manta_id=1),phase_name||' MPRF manta mapping persisted in rolled-back probe');
    END IF;
    RAISE EXCEPTION USING ERRCODE='Z0001',MESSAGE='rollback successful synthetic call';
   EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
    WHEN OTHERS THEN
     outcome:=SQLSTATE; msg:=regexp_replace(SQLERRM,'[[:space:]]+',' ','g');
     GET STACKED DIAGNOSTICS ctx=PG_EXCEPTION_CONTEXT, err_schema=SCHEMA_NAME, err_table=TABLE_NAME, err_column=COLUMN_NAME;
     -- Preserve the failing SQL/routine context, excluding only the test harness caller.
     ctx:=btrim(regexp_replace(split_part(ctx,'PL/pgSQL function check_interfaces',1),'[[:space:]]+',' ','g')); IF ctx='' THEN ctx:='call resolution'; END IF; returned:=NULL; after_data:=target_snapshot();
   END;
   RESET ROLE;
   IF role_name <> 'service_role' THEN
    PERFORM assert_ok((outcome='42501' OR (right(r.signature,2)='()' AND r.signature LIKE 'fn_imports_commit_%_updates_only()' AND outcome='42725')),phase_name||' '||r.signature||' actual denied '||role_name);
   ELSE
    INSERT INTO interface_results VALUES(phase_name,r.signature,outcome,msg,ctx,err_schema,err_table,err_column,returned,before_data,after_data);
    IF phase_name<>'baseline' THEN
     PERFORM assert_ok(EXISTS(SELECT 1 FROM interface_results b WHERE b.phase='baseline' AND b.signature=r.signature AND b.state=outcome AND b.message=msg AND b.error_context=ctx AND b.error_schema=err_schema AND b.error_table=err_table AND b.error_column=err_column AND b.returned_value IS NOT DISTINCT FROM returned AND comparable_snapshot(b.before_targets)=comparable_snapshot(before_data) AND comparable_snapshot(b.after_targets)=comparable_snapshot(after_data)),phase_name||' '||r.signature||' trusted outcome unchanged');
    END IF;
   END IF;
  END LOOP;
 END LOOP;
 FOREACH v IN ARRAY ARRAY['kona_biopsy_all_samples_v2','kona_biopsy_all_samples_v3_export'] LOOP
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   outcome:='00000';
   BEGIN
    EXECUTE 'SET LOCAL ROLE '||quote_ident(role_name);
    EXECUTE 'SELECT * FROM public.'||quote_ident(v);
   EXCEPTION WHEN OTHERS THEN outcome:=SQLSTATE;
   END;
   RESET ROLE;
   PERFORM assert_ok(outcome=CASE WHEN role_name='service_role' THEN '00000' ELSE '42501' END,phase_name||' actual view access '||v||' '||role_name);
  END LOOP;
 END LOOP;
 -- FK probes run in subtransactions and never survive.
 FOREACH v IN ARRAY ARRAY['mprf_manta_map','mprf_sighting_map'] LOOP
  outcome:='00000';
  BEGIN
   IF v='mprf_manta_map' THEN INSERT INTO mprf_manta_map(pk_mprf_manta_id,pk_manta_id) VALUES(99999,99999);
   ELSE INSERT INTO mprf_sighting_map(pk_mprf_sighting_id,pk_sighting_id) VALUES('99999',99999); END IF;
   RAISE EXCEPTION USING ERRCODE='Z0001';
  EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL; WHEN OTHERS THEN outcome:=SQLSTATE; END;
  PERFORM assert_ok(outcome='23503',phase_name||' '||v||' rejects orphan FK');
 END LOOP;
 FOREACH v IN ARRAY ARRAY['mantas','sightings'] LOOP
  outcome:='00000';
  BEGIN
   IF v='mantas' THEN DELETE FROM mantas WHERE pk_manta_id=1;
   ELSE DELETE FROM sightings WHERE pk_sighting_id=1; END IF;
   RAISE EXCEPTION USING ERRCODE='Z0001';
  EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL; WHEN OTHERS THEN outcome:=SQLSTATE; END;
  PERFORM assert_ok(outcome='23503',phase_name||' '||v||' parent delete restricted');
  outcome:='00000';
  BEGIN
   IF v='mantas' THEN
    UPDATE mantas SET pk_manta_id=10001 WHERE pk_manta_id=1;
    IF NOT EXISTS(SELECT 1 FROM mprf_manta_map WHERE pk_manta_id=10001) THEN RAISE EXCEPTION 'cascade missing'; END IF;
   ELSE
    UPDATE sightings SET pk_sighting_id=10001 WHERE pk_sighting_id=1;
    IF NOT EXISTS(SELECT 1 FROM mprf_sighting_map WHERE pk_sighting_id=10001) THEN RAISE EXCEPTION 'cascade missing'; END IF;
   END IF;
   RAISE EXCEPTION USING ERRCODE='Z0001';
  EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL; WHEN OTHERS THEN outcome:=SQLSTATE; END;
  PERFORM assert_ok(outcome='00000',phase_name||' '||v||' parent update cascades');
 END LOOP;
 outcome:='00000';
 BEGIN
  UPDATE photos_filenames_cleaned_integer_ids SET filename2=NULL;
  SET LOCAL ROLE service_role;
  PERFORM batch_update_photos_from_filenames();
  RAISE EXCEPTION USING ERRCODE='Z0001';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL; WHEN OTHERS THEN outcome:=SQLSTATE; END;
 RESET ROLE;
 PERFORM assert_ok(outcome='00000',phase_name||' filename routine reads base when no filename requires update');
 PERFORM assert_ok(NOT EXISTS(SELECT 1 FROM interface_definitions b JOIN pg_proc p USING(oid) WHERE b.definition IS DISTINCT FROM pg_get_functiondef(p.oid) OR b.proacl IS DISTINCT FROM p.proacl),phase_name||' exact routine definitions and ACLs');
 PERFORM assert_ok(NOT EXISTS(SELECT 1 FROM view_definitions b JOIN pg_class c USING(oid) WHERE b.definition IS DISTINCT FROM pg_get_viewdef(c.oid) OR b.relacl IS DISTINCT FROM c.relacl),phase_name||' exact view definitions and ACLs');
END $$;
SELECT check_interfaces('baseline');
-- Detailed differential results are exported after all four phases.
-- Known baseline failures are deliberately reported; they are NOT successful trusted-use tests.
SELECT assert_ok(count(*) FILTER (WHERE state='00000')=4,'baseline four trusted calls complete; ten legacy paths remain blocked') FROM interface_results WHERE phase='baseline';
