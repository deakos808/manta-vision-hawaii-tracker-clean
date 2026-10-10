-- Restore inspected pre-change routine ACLs and the exact two prior invoker definitions.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_data_integrity_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'mantas_missing_catalog', (select count(*) from mantas where fk_catalog_id is null),
    'mantas_missing_sighting', (select count(*) from mantas where fk_sighting_id is null),
    'photos_missing_manta', (select count(*) from photos where fk_manta_id is null),
    'catalogs_missing_sightings', (
      select count(*) from catalog c
      where not exists (
        select 1 from mantas m
        where m.fk_catalog_id = c.pk_catalog_id
      )
    ),
    'average_sightings_per_catalog', (
      select avg(count) from (
        select count(distinct fk_sighting_id) as count
        from mantas
        where fk_sighting_id is not null
        group by fk_catalog_id
      ) sub
    ),
    'average_mantas_per_sighting', (
      select avg(count) from (
        select count(*) as count
        from mantas
        where fk_sighting_id is not null
        group by fk_sighting_id
      ) sub
    ),
    'average_photos_per_manta', (
      select avg(count) from (
        select count(*) as count
        from photos
        where fk_manta_id is not null
        group by fk_manta_id
      ) sub
    )
  )
  into result;

  return result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.fix_missing_catalog_photo(input_catalog_id integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  chosen int;
begin
  -- prefer flagged best ventral
  select pk_photo_id into chosen
  from photos
  where fk_catalog_id = input_catalog_id
    and photo_view = 'ventral'
    and is_best_catalog_ventral_photo is true
  order by pk_photo_id asc
  limit 1;

  -- else fall back to most recent ventral
  if chosen is null then
    select pk_photo_id into chosen
    from photos
    where fk_catalog_id = input_catalog_id
      and photo_view = 'ventral'
    order by uploaded_at desc nulls last, pk_photo_id desc
    limit 1;
  end if;

  if chosen is not null then
    update catalog
       set best_cat_ventral_id = chosen,
           best_cat_mask_ventral_id_int = chosen
     where pk_catalog_id = input_catalog_id;
    -- triggers should set best_catalog_photo_url
  end if;
end;
$function$
;
REVOKE EXECUTE ON FUNCTION public."admin_set_profile_access"(target_user_id uuid, requested_role text, requested_is_active boolean, change_reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."admin_set_profile_access"(target_user_id uuid, requested_role text, requested_is_active boolean, change_reason text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."approve_temp_sighting"(temp_sighting_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."approve_temp_sighting"(temp_sighting_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."approve_temp_sighting"(temp_sighting_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public."approve_temp_sighting"(temp_sighting_id uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."batch_update_photos_from_filenames"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."batch_update_photos_from_filenames"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."batch_update_photos_from_filenames"() TO anon;
GRANT EXECUTE ON FUNCTION public."batch_update_photos_from_filenames"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."calculate_embedding_similarity_uuid"(input_embedding vector) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."calculate_embedding_similarity_uuid"(input_embedding vector) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."calculate_embedding_similarity_uuid"(input_embedding vector) TO anon;
GRANT EXECUTE ON FUNCTION public."calculate_embedding_similarity_uuid"(input_embedding vector) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."commit_sighting_submission"(sub_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."commit_sighting_submission"(sub_id uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."commit_sighting_submission_with_biopsies"(sub_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."commit_sighting_submission_with_biopsies"(sub_id uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."count_valid_catalog_embeddings"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."count_valid_catalog_embeddings"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."count_valid_catalog_embeddings"() TO anon;
GRANT EXECUTE ON FUNCTION public."count_valid_catalog_embeddings"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."count_valid_manta_embeddings"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."count_valid_manta_embeddings"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."count_valid_manta_embeddings"() TO anon;
GRANT EXECUTE ON FUNCTION public."count_valid_manta_embeddings"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."delete_sighting"(p_sighting_id integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."delete_sighting"(p_sighting_id integer) TO anon;
GRANT EXECUTE ON FUNCTION public."delete_sighting"(p_sighting_id integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."execute_sql"(sql text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public."fix_missing_catalog_photo"(input_catalog_id integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fix_missing_catalog_photo"(input_catalog_id integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fix_missing_catalog_photo"(input_catalog_id integer) TO anon;
GRANT EXECUTE ON FUNCTION public."fix_missing_catalog_photo"(input_catalog_id integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_extract_manta_id"(t text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_extract_manta_id"(t text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_extract_manta_id"(t text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_extract_manta_id"(t text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_clear_staging"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_clear_staging"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_clear_staging"() TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_clear_staging"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_clear_staging_mantas"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_clear_staging_mantas"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_clear_staging_mantas"() TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_clear_staging_mantas"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_clear_staging_photos"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_clear_staging_photos"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_clear_staging_photos"() TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_clear_staging_photos"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_clear_staging_sightings"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_clear_staging_sightings"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_clear_staging_sightings"() TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_clear_staging_sightings"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_catalog_cols"(p_columns text[], p_src_file text, p_file_sha256 text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_catalog_cols"(p_columns text[], p_src_file text, p_file_sha256 text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_catalog_cols"(p_columns text[], p_src_file text, p_file_sha256 text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_catalog_cols"(p_columns text[], p_src_file text, p_file_sha256 text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_catalog_cols_updates_only"(p_columns text[], p_src_file text, p_file_sha256 text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_catalog_cols_updates_only"(p_columns text[], p_src_file text, p_file_sha256 text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_catalog_cols_updates_only"(p_columns text[], p_src_file text, p_file_sha256 text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_catalog_cols_updates_only"(p_columns text[], p_src_file text, p_file_sha256 text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_drone_photos"(p_batch uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_drone_photos"(p_batch uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_drone_surveys"(p_batch uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_drone_surveys"(p_batch uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_drone_surveys"(p_batch uuid) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_drone_surveys"(p_batch uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_manta_sizes"(p_src_file text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_manta_sizes"(p_src_file text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_manta_sizes"(p_src_file text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_manta_sizes"(p_src_file text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_mantas_by_pair_disambiguate"(p_src_file text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_by_pair_disambiguate"(p_src_file text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_by_pair_disambiguate"(p_src_file text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_by_pair_disambiguate"(p_src_file text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_mantas_by_pair_updates_only"(p_src_file text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_by_pair_updates_only"(p_src_file text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_by_pair_updates_only"(p_src_file text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_by_pair_updates_only"(p_src_file text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_mantas_updates_only"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_updates_only"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_updates_only"() TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_updates_only"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_mantas_updates_only"(p_src_file text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_updates_only"(p_src_file text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_updates_only"(p_src_file text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_updates_only"(p_src_file text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_mantas_updates_only_safe_fk"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_updates_only_safe_fk"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_updates_only_safe_fk"() TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_updates_only_safe_fk"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_mantas_upsert"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_upsert"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_upsert"() TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_upsert"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_mantas_upsert_safe_fk"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_upsert_safe_fk"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_upsert_safe_fk"() TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mantas_upsert_safe_fk"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_mprf_catalog"(p_batch uuid, p_merge_gender boolean, p_merge_age boolean, p_merge_species boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mprf_catalog"(p_batch uuid, p_merge_gender boolean, p_merge_age boolean, p_merge_species boolean) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mprf_catalog"(p_batch uuid, p_merge_gender boolean, p_merge_age boolean, p_merge_species boolean) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mprf_catalog"(p_batch uuid, p_merge_gender boolean, p_merge_age boolean, p_merge_species boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_mprf_mantas"(p_batch uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mprf_mantas"(p_batch uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mprf_mantas"(p_batch uuid) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mprf_mantas"(p_batch uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_mprf_sightings"(p_batch uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mprf_sightings"(p_batch uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mprf_sightings"(p_batch uuid) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_mprf_sightings"(p_batch uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_photos"(p_src_file text, p_allow_insert boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos"(p_src_file text, p_allow_insert boolean) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos"(p_src_file text, p_allow_insert boolean) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos"(p_src_file text, p_allow_insert boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_photos_updates_only"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos_updates_only"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos_updates_only"() TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos_updates_only"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_photos_updates_only"(p_src_file text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos_updates_only"(p_src_file text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos_updates_only"(p_src_file text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos_updates_only"(p_src_file text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_photos_updates_only_safe_fk"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos_updates_only_safe_fk"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos_updates_only_safe_fk"() TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos_updates_only_safe_fk"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_photos_upsert"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos_upsert"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos_upsert"() TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos_upsert"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_photos_upsert_safe_fk"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos_upsert_safe_fk"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos_upsert_safe_fk"() TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_photos_upsert_safe_fk"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_sightings_cols"(p_columns text[], p_src_file text, p_file_sha256 text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_sightings_cols"(p_columns text[], p_src_file text, p_file_sha256 text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_sightings_cols"(p_columns text[], p_src_file text, p_file_sha256 text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_sightings_cols"(p_columns text[], p_src_file text, p_file_sha256 text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_sightings_cols_updates_only"(p_columns text[], p_src_file text, p_file_sha256 text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_sightings_cols_updates_only"(p_columns text[], p_src_file text, p_file_sha256 text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_sightings_cols_updates_only"(p_columns text[], p_src_file text, p_file_sha256 text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_sightings_cols_updates_only"(p_columns text[], p_src_file text, p_file_sha256 text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_commit_sightings_updates_only"(p_src_file text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_sightings_updates_only"(p_src_file text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_sightings_updates_only"(p_src_file text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_commit_sightings_updates_only"(p_src_file text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_groundtruth_catalog"(p_checks text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_groundtruth_catalog"(p_checks text[]) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_groundtruth_catalog"(p_checks text[]) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_groundtruth_catalog"(p_checks text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_imports_groundtruth_catalog_view"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_imports_groundtruth_catalog_view"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_imports_groundtruth_catalog_view"() TO anon;
GRANT EXECUTE ON FUNCTION public."fn_imports_groundtruth_catalog_view"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_is_image_filename"(p text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_is_image_filename"(p text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_is_image_filename"(p text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_is_image_filename"(p text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_measurement_type_norm"(t text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_measurement_type_norm"(t text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_measurement_type_norm"(t text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_measurement_type_norm"(t text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_nullif_blank"(t text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_nullif_blank"(t text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_nullif_blank"(t text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_nullif_blank"(t text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_parse_catalog_date"(t text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_parse_catalog_date"(t text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_parse_catalog_date"(t text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_parse_catalog_date"(t text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_parse_date"(t text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_parse_date"(t text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_parse_date"(t text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_parse_date"(t text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_parse_date_loose"(t text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_parse_date_loose"(t text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_parse_date_loose"(t text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_parse_date_loose"(t text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_photo_clean_filename"(p text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_photo_clean_filename"(p text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_photo_clean_filename"(p text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_photo_clean_filename"(p text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_photo_view_norm"(p text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_photo_view_norm"(p text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_photo_view_norm"(p text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_photo_view_norm"(p text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_to_int"(i integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_to_int"(i integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_to_int"(i integer) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_to_int"(i integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_to_int"(t text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_to_int"(t text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_to_int"(t text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_to_int"(t text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_to_numeric"(n numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_to_numeric"(n numeric) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_to_numeric"(n numeric) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_to_numeric"(n numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."fn_to_numeric"(t text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."fn_to_numeric"(t text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."fn_to_numeric"(t text) TO anon;
GRANT EXECUTE ON FUNCTION public."fn_to_numeric"(t text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."get_admin_data_overview"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."get_admin_data_overview"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_admin_data_overview"() TO anon;
GRANT EXECUTE ON FUNCTION public."get_admin_data_overview"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."get_catalog_embedding_stats"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."get_catalog_embedding_stats"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_catalog_embedding_stats"() TO anon;
GRANT EXECUTE ON FUNCTION public."get_catalog_embedding_stats"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."get_data_integrity_stats"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."get_data_integrity_stats"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_data_integrity_stats"() TO anon;
GRANT EXECUTE ON FUNCTION public."get_data_integrity_stats"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."get_data_overview"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."get_data_overview"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_data_overview"() TO anon;
GRANT EXECUTE ON FUNCTION public."get_data_overview"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."get_drone_photo_points"(survey_ids uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."get_drone_photo_points"(survey_ids uuid[]) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_drone_photo_points"(survey_ids uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public."get_drone_photo_points"(survey_ids uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."get_drone_photo_points_text"(survey_ids text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."get_drone_photo_points_text"(survey_ids text[]) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_drone_photo_points_text"(survey_ids text[]) TO anon;
GRANT EXECUTE ON FUNCTION public."get_drone_photo_points_text"(survey_ids text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."get_photo_storage_path"(photo_id integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."get_photo_storage_path"(photo_id integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_photo_storage_path"(photo_id integer) TO anon;
GRANT EXECUTE ON FUNCTION public."get_photo_storage_path"(photo_id integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."get_photo_storage_path"(photo_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."get_photo_storage_path"(photo_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_photo_storage_path"(photo_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public."get_photo_storage_path"(photo_id uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."get_relationship_averages_split"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."get_relationship_averages_split"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_relationship_averages_split"() TO anon;
GRANT EXECUTE ON FUNCTION public."get_relationship_averages_split"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."get_table_columns"(table_name_input text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."get_table_columns"(table_name_input text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."get_table_columns"(table_name_input text) TO anon;
GRANT EXECUTE ON FUNCTION public."get_table_columns"(table_name_input text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."handle_new_user"() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public."is_admin"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."is_admin"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."is_admin"() TO anon;
GRANT EXECUTE ON FUNCTION public."is_admin"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."is_admin_user"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."is_admin_user"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."match_catalog_embeddings"(query_embedding real[], match_count integer, match_threshold real) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."match_catalog_embeddings"(query_embedding real[], match_count integer, match_threshold real) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."match_catalog_embeddings"(query_embedding real[], match_count integer, match_threshold real) TO anon;
GRANT EXECUTE ON FUNCTION public."match_catalog_embeddings"(query_embedding real[], match_count integer, match_threshold real) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."match_catalog_embeddings"(query_embedding vector, match_threshold double precision, match_count integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."match_catalog_embeddings"(query_embedding vector, match_threshold double precision, match_count integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."match_catalog_embeddings"(query_embedding vector, match_threshold double precision, match_count integer) TO anon;
GRANT EXECUTE ON FUNCTION public."match_catalog_embeddings"(query_embedding vector, match_threshold double precision, match_count integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."match_catalog_embeddings_resolved"(query_embedding real[], match_count integer, match_threshold real) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."match_catalog_embeddings_resolved"(query_embedding real[], match_count integer, match_threshold real) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."match_catalog_embeddings_resolved"(query_embedding real[], match_count integer, match_threshold real) TO anon;
GRANT EXECUTE ON FUNCTION public."match_catalog_embeddings_resolved"(query_embedding real[], match_count integer, match_threshold real) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."match_catalog_embeddings_v2"(query_embedding real[], match_count integer, match_threshold real) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."match_catalog_embeddings_v2"(query_embedding real[], match_count integer, match_threshold real) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."match_catalog_embeddings_v2"(query_embedding real[], match_count integer, match_threshold real) TO anon;
GRANT EXECUTE ON FUNCTION public."match_catalog_embeddings_v2"(query_embedding real[], match_count integer, match_threshold real) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."match_catalog_embeddings_v2_against_v2"(query_embedding real[], match_count integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."match_catalog_embeddings_v2_against_v2"(query_embedding real[], match_count integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."match_catalog_embeddings_v2_against_v2"(query_embedding real[], match_count integer) TO anon;
GRANT EXECUTE ON FUNCTION public."match_catalog_embeddings_v2_against_v2"(query_embedding real[], match_count integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."match_exemplars_aggregate_v2"(query_embedding real[], exemplar_k integer, catalog_k integer, exclude_pk_photo_id integer, probes integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."match_exemplars_aggregate_v2"(query_embedding real[], exemplar_k integer, catalog_k integer, exclude_pk_photo_id integer, probes integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."match_exemplars_aggregate_v2"(query_embedding real[], exemplar_k integer, catalog_k integer, exclude_pk_photo_id integer, probes integer) TO anon;
GRANT EXECUTE ON FUNCTION public."match_exemplars_aggregate_v2"(query_embedding real[], exemplar_k integer, catalog_k integer, exclude_pk_photo_id integer, probes integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."match_manta"(_query_embedding vector, _match_threshold real, _match_count integer, _side text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."match_manta"(_query_embedding vector, _match_threshold real, _match_count integer, _side text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."match_manta"(_query_embedding vector, _match_threshold real, _match_count integer, _side text) TO anon;
GRANT EXECUTE ON FUNCTION public."match_manta"(_query_embedding vector, _match_threshold real, _match_count integer, _side text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."match_manta_to_catalog"(match_limit integer, match_offset integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."match_manta_to_catalog"(match_limit integer, match_offset integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."match_manta_to_catalog"(match_limit integer, match_offset integer) TO anon;
GRANT EXECUTE ON FUNCTION public."match_manta_to_catalog"(match_limit integer, match_offset integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."match_manta_uuid"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."match_manta_uuid"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."match_manta_uuid"() TO anon;
GRANT EXECUTE ON FUNCTION public."match_manta_uuid"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."match_mantas_by_vector"(query_embedding vector, match_threshold double precision, match_count integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."match_mantas_by_vector"(query_embedding vector, match_threshold double precision, match_count integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."match_mantas_by_vector"(query_embedding vector, match_threshold double precision, match_count integer) TO anon;
GRANT EXECUTE ON FUNCTION public."match_mantas_by_vector"(query_embedding vector, match_threshold double precision, match_count integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."match_masked_catalog_v2"(query_embedding real[], catalog_k integer, probes integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."match_masked_catalog_v2"(query_embedding real[], catalog_k integer, probes integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."match_masked_catalog_v2"(query_embedding real[], catalog_k integer, probes integer) TO anon;
GRANT EXECUTE ON FUNCTION public."match_masked_catalog_v2"(query_embedding real[], catalog_k integer, probes integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."match_softmask_catalog_v2"(query_embedding real[], catalog_k integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."match_softmask_catalog_v2"(query_embedding real[], catalog_k integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."match_softmask_catalog_v2"(query_embedding real[], catalog_k integer) TO anon;
GRANT EXECUTE ON FUNCTION public."match_softmask_catalog_v2"(query_embedding real[], catalog_k integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."match_softmask_catalog_v2_probes"(query_embedding real[], catalog_k integer, probes integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."match_softmask_catalog_v2_probes"(query_embedding real[], catalog_k integer, probes integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."match_softmask_catalog_v2_probes"(query_embedding real[], catalog_k integer, probes integer) TO anon;
GRANT EXECUTE ON FUNCTION public."match_softmask_catalog_v2_probes"(query_embedding real[], catalog_k integer, probes integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."match_temp_photo"(query_photo_id uuid, result_limit integer, result_offset integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."match_temp_photo"(query_photo_id uuid, result_limit integer, result_offset integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."match_temp_photo"(query_photo_id uuid, result_limit integer, result_offset integer) TO anon;
GRANT EXECUTE ON FUNCTION public."match_temp_photo"(query_photo_id uuid, result_limit integer, result_offset integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."merge_catalogs_preview"(p_primary integer, p_secondary integer, p_delete_secondary_if_detached boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."merge_catalogs_preview"(p_primary integer, p_secondary integer, p_delete_secondary_if_detached boolean) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."merge_catalogs_preview"(p_primary integer, p_secondary integer, p_delete_secondary_if_detached boolean) TO anon;
GRANT EXECUTE ON FUNCTION public."merge_catalogs_preview"(p_primary integer, p_secondary integer, p_delete_secondary_if_detached boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."merge_catalogs_tx"(p_primary integer, p_secondary integer, p_delete_secondary_if_detached boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."merge_catalogs_tx"(p_primary integer, p_secondary integer, p_delete_secondary_if_detached boolean) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."merge_catalogs_tx"(p_primary integer, p_secondary integer, p_delete_secondary_if_detached boolean) TO anon;
GRANT EXECUTE ON FUNCTION public."merge_catalogs_tx"(p_primary integer, p_secondary integer, p_delete_secondary_if_detached boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."nullif_blank"(p_text text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."nullif_blank"(p_text text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."nullif_blank"(p_text text) TO anon;
GRANT EXECUTE ON FUNCTION public."nullif_blank"(p_text text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."pg_get_columns"(table_name_input text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."pg_get_columns"(table_name_input text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."pg_get_columns"(table_name_input text) TO anon;
GRANT EXECUTE ON FUNCTION public."pg_get_columns"(table_name_input text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."photo_match_summary_uuid"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."photo_match_summary_uuid"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."photo_match_summary_uuid"() TO anon;
GRANT EXECUTE ON FUNCTION public."photo_match_summary_uuid"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."rank_true_catalog_match"(json) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."rank_true_catalog_match"(json) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."rank_true_catalog_match"(json) TO anon;
GRANT EXECUTE ON FUNCTION public."rank_true_catalog_match"(json) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."refresh_catalog_with_photo_view"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."refresh_catalog_with_photo_view"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."refresh_catalog_with_photo_view"() TO anon;
GRANT EXECUTE ON FUNCTION public."refresh_catalog_with_photo_view"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."reset_false_committed_submission"(sub_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."reset_false_committed_submission"(sub_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."reset_false_committed_submission"(sub_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public."reset_false_committed_submission"(sub_id uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."set_manta_size_catalog_id"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."set_manta_size_catalog_id"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."set_manta_size_catalog_id"() TO anon;
GRANT EXECUTE ON FUNCTION public."set_manta_size_catalog_id"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."set_updated_at"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."set_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."set_updated_at"() TO anon;
GRANT EXECUTE ON FUNCTION public."set_updated_at"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."sync_best_catalog_ventral_flag"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."sync_best_catalog_ventral_flag"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."sync_best_catalog_ventral_flag"() TO anon;
GRANT EXECUTE ON FUNCTION public."sync_best_catalog_ventral_flag"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."sync_catalog_last_fields"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."sync_catalog_last_fields"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."sync_catalog_last_fields"() TO anon;
GRANT EXECUTE ON FUNCTION public."sync_catalog_last_fields"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."sync_catalog_uuid_names"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."sync_catalog_uuid_names"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."sync_catalog_uuid_names"() TO anon;
GRANT EXECUTE ON FUNCTION public."sync_catalog_uuid_names"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."sync_manta_size_catalog_id_from_manta"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."sync_manta_size_catalog_id_from_manta"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."sync_manta_size_catalog_id_from_manta"() TO anon;
GRANT EXECUTE ON FUNCTION public."sync_manta_size_catalog_id_from_manta"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."sync_manta_uuid_names"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."sync_manta_uuid_names"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."sync_manta_uuid_names"() TO anon;
GRANT EXECUTE ON FUNCTION public."sync_manta_uuid_names"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."sync_photos_fk_uuid_and_int"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."sync_photos_fk_uuid_and_int"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."sync_photos_fk_uuid_and_int"() TO anon;
GRANT EXECUTE ON FUNCTION public."sync_photos_fk_uuid_and_int"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."sync_sighting_location_columns"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."sync_sighting_location_columns"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."sync_sighting_location_columns"() TO anon;
GRANT EXECUTE ON FUNCTION public."sync_sighting_location_columns"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."sync_sighting_total_mantas"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."sync_sighting_total_mantas"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."sync_sighting_total_mantas"() TO anon;
GRANT EXECUTE ON FUNCTION public."sync_sighting_total_mantas"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."sync_sighting_uuid_names"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."sync_sighting_uuid_names"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."sync_sighting_uuid_names"() TO anon;
GRANT EXECUTE ON FUNCTION public."sync_sighting_uuid_names"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."trg_biopsies_touch_updated_at"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."trg_biopsies_touch_updated_at"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."trg_biopsies_touch_updated_at"() TO anon;
GRANT EXECUTE ON FUNCTION public."trg_biopsies_touch_updated_at"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."trg_catalog_total_biopsies"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."trg_catalog_total_biopsies"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."trg_catalog_total_biopsies"() TO anon;
GRANT EXECUTE ON FUNCTION public."trg_catalog_total_biopsies"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."try_cast_date"(p_text text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."try_cast_date"(p_text text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."try_cast_date"(p_text text) TO anon;
GRANT EXECUTE ON FUNCTION public."try_cast_date"(p_text text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."try_cast_double"(p_text text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."try_cast_double"(p_text text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."try_cast_double"(p_text text) TO anon;
GRANT EXECUTE ON FUNCTION public."try_cast_double"(p_text text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."try_cast_int"(p_text text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."try_cast_int"(p_text text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."try_cast_int"(p_text text) TO anon;
GRANT EXECUTE ON FUNCTION public."try_cast_int"(p_text text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."try_cast_timestamptz"(p_text text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."try_cast_timestamptz"(p_text text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."try_cast_timestamptz"(p_text text) TO anon;
GRANT EXECUTE ON FUNCTION public."try_cast_timestamptz"(p_text text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."try_cast_uuid"(p_text text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."try_cast_uuid"(p_text text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."try_cast_uuid"(p_text text) TO anon;
GRANT EXECUTE ON FUNCTION public."try_cast_uuid"(p_text text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public."update_best_catalog_photo_flag"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."update_best_catalog_photo_flag"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."update_best_catalog_photo_flag"() TO anon;
GRANT EXECUTE ON FUNCTION public."update_best_catalog_photo_flag"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."update_best_catalog_photo_url"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."update_best_catalog_photo_url"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."update_best_catalog_photo_url"() TO anon;
GRANT EXECUTE ON FUNCTION public."update_best_catalog_photo_url"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."update_catalog_best_photo_url"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."update_catalog_best_photo_url"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."update_catalog_best_photo_url"() TO anon;
GRANT EXECUTE ON FUNCTION public."update_catalog_best_photo_url"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."update_manta_best_photo_url"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."update_manta_best_photo_url"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."update_manta_best_photo_url"() TO anon;
GRANT EXECUTE ON FUNCTION public."update_manta_best_photo_url"() TO authenticated;
REVOKE EXECUTE ON FUNCTION public."update_updated_at_column"() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public."update_updated_at_column"() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public."update_updated_at_column"() TO anon;
GRANT EXECUTE ON FUNCTION public."update_updated_at_column"() TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
COMMIT;
