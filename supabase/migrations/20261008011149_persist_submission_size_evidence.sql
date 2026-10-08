-- DRAFT ONLY. Current paired-laser measurements, including older missing endpoints.
BEGIN;
CREATE OR REPLACE FUNCTION public.commit_sighting_submission(sub_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  submission_row public.sighting_submissions%rowtype;
  manta jsonb;
  photo jsonb;

  new_sighting_id integer;
  new_manta_id integer;
  resolved_catalog_id integer;
  resolved_sitelocation text;
  resolved_storage_path text;
  resolved_file_name text;
  transform jsonb;
  field_name text;
  numeric_value numeric;
  -- BEGIN size-evidence declarations
  new_photo_id integer;
  new_size_id bigint;
  new_size_ids bigint[];
  encounter_date date;
  measurement jsonb;
  measurement_point jsonb;
  measured_photo_uuid uuid;
  -- END size-evidence declarations
begin
  if auth.uid() is null or not public.is_admin_user() then
    raise exception using errcode = '42501', message = 'An active administrator is required to commit a sighting';
  end if;
  select *
  into submission_row
  from public.sighting_submissions
  where id = sub_id
  for update;

  if not found then
    raise exception 'Submission not found';
  end if;

  if submission_row.status = 'committed' and submission_row.committed_pk_sighting_id is not null then
    return;
  end if;

  if submission_row.status is distinct from 'pending'
     or submission_row.committed_pk_sighting_id is not null then
    raise exception 'Only a pending, uncommitted submission can be committed';
  end if;

  resolved_sitelocation :=
    nullif(
      trim(
        coalesce(
          submission_row.payload->>'sitelocation',
          submission_row.payload->>'locationName'
        )
      ),
      ''
    );

  -- Legacy absent/null/empty values remain NULL; never infer from times.
  if nullif(submission_row.payload->>'standardize_survey', '') is not null
     and submission_row.payload->>'standardize_survey' not in ('Yes', 'No') then
    raise exception 'standardize_survey must be Yes, No, or empty';
  end if;

  insert into public.sightings (
    sighting_date,
    start_time,
    end_time,
    standardize_survey,
    photographer,
    island,
    sitelocation,
    latitude,
    longitude,
    location_unknown,
    notes
  )
  values (
    coalesce(
      submission_row.sighting_date,
      nullif(submission_row.payload->>'date', '')::date
    ),
    nullif(submission_row.payload->>'startTime', ''),
    nullif(submission_row.payload->>'stopTime', ''),
    nullif(submission_row.payload->>'standardize_survey', ''),
    nullif(submission_row.payload->>'photographer', ''),
    nullif(submission_row.payload->>'island', ''),
    resolved_sitelocation,
    nullif(submission_row.payload->>'latitude', '')::numeric,
    nullif(submission_row.payload->>'longitude', '')::numeric,
    coalesce(nullif(submission_row.payload->>'location_unknown', '')::boolean, false),
    nullif(submission_row.payload->>'notes', '')
  )
  returning pk_sighting_id, sighting_date into new_sighting_id, encounter_date;

  for manta in
    select value
    from jsonb_array_elements(coalesce(submission_row.payload->'mantas', '[]'::jsonb))
  loop
    resolved_catalog_id := null;

    if coalesce((manta->>'noMatch')::boolean, false) = true then
      insert into public.catalog (name)
      values (
        coalesce(
          nullif(manta->>'name', ''),
          'Pending Name'
        )
      )
      returning pk_catalog_id into resolved_catalog_id;
    else
      resolved_catalog_id :=
        coalesce(
          nullif(manta->>'matchedCatalogId', '')::integer,
          nullif(manta->>'potentialCatalogId', '')::integer,
          nullif(manta->>'suggested_catalog_id', '')::integer
        );

      if resolved_catalog_id is null then
        raise exception
          'Cannot commit submission %: manta % has no resolved catalog match and is not marked noMatch',
          sub_id,
          coalesce(manta->>'id', '(no manta id)');
      end if;
    end if;

    insert into public.mantas (
      fk_sighting_id,
      fk_catalog_id,
      submission_manta_id,
      gender,
      age_class,
      size_dw_m
    )
    values (
      new_sighting_id,
      resolved_catalog_id,
      nullif(btrim(manta->>'id'), ''),
      nullif(manta->>'gender', ''),
      nullif(manta->>'ageClass', ''),
      nullif(manta->>'size', '')::numeric
    )
    returning pk_manta_id into new_manta_id;

    new_size_ids := array[]::bigint[]; -- size-evidence: reset per manta

    for photo in
      select value
      from jsonb_array_elements(coalesce(manta->'photos', '[]'::jsonb))
    loop
      resolved_storage_path :=
        nullif(
          coalesce(
            photo->>'path',
            photo->>'url'
          ),
          ''
        );

      resolved_file_name :=
        coalesce(
          nullif(photo->>'name', ''),
          nullif(photo->>'id', ''),
          'uploaded-photo'
        );

      if resolved_storage_path is null then
        raise exception
          'Cannot commit submission %: photo for manta % is missing path/url',
          sub_id,
          coalesce(manta->>'id', '(no manta id)');
      end if;

      -- Presence of ANY new field opts into strict provenance validation.
      -- Partial/null provenance must never silently fall back to legacy behavior.
      if photo ?| array['storageBucket', 'originalPath', 'editTransform'] then
        if jsonb_typeof(photo->'id') is distinct from 'string'
           or (photo->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or jsonb_typeof(photo->'storageBucket') is distinct from 'string'
           or (photo->>'storageBucket') is distinct from 'manta-images' then
          raise exception 'Provenance photo requires a UUID and manta-images bucket';
        end if;

        foreach field_name in array array['path', 'originalPath'] loop
          if jsonb_typeof(photo->field_name) is distinct from 'string'
             or btrim(photo->>field_name) = ''
             or (photo->>field_name) <> btrim(photo->>field_name)
             or (photo->>field_name) ~ '(^/|://|[?#]|(^|/)\.\.(/|$))'
             or strpos(photo->>field_name, chr(92)) > 0 then
            raise exception 'Provenance photo requires bucket-relative prepared and original paths';
          end if;
        end loop;
        if photo->>'path' = photo->>'originalPath' then
          raise exception 'Prepared and original paths must be distinct';
        end if;

        transform := photo->'editTransform';
        if jsonb_typeof(transform) is distinct from 'object'
           or (transform->>'version') is distinct from 'rotate-crop-v1'
           or jsonb_typeof(transform->'crop') is distinct from 'object' then
          raise exception 'Provenance photo requires a rotate-crop-v1 transform';
        end if;
        foreach field_name in array array[
          'rotationDegrees', 'originalWidth', 'originalHeight', 'exifOrientation',
          'rotatedWidth', 'rotatedHeight', 'outputWidth', 'outputHeight'
        ] loop
          if jsonb_typeof(transform->field_name) is distinct from 'number' then
            raise exception 'Missing or nonnumeric transform field: %', field_name;
          end if;
          if field_name <> 'rotationDegrees' then
            numeric_value := (transform->>field_name)::numeric;
            if numeric_value <= 0 or numeric_value <> trunc(numeric_value) then
              raise exception 'Transform dimensions/orientation must be positive integers';
            end if;
          end if;
        end loop;
        if (transform->>'exifOrientation')::numeric > 8 then
          raise exception 'EXIF orientation must be between 1 and 8';
        end if;
        foreach field_name in array array['x', 'y', 'width', 'height'] loop
          if jsonb_typeof(transform->'crop'->field_name) is distinct from 'number' then
            raise exception 'Missing or nonnumeric crop field: %', field_name;
          end if;
          numeric_value := (transform->'crop'->>field_name)::numeric;
          if numeric_value < 0 or numeric_value <> trunc(numeric_value)
             or (field_name in ('width', 'height') and numeric_value = 0) then
            raise exception 'Crop must use nonnegative integer pixels and positive dimensions';
          end if;
        end loop;
        if (transform->'crop'->>'x')::numeric + (transform->'crop'->>'width')::numeric
             > (transform->>'rotatedWidth')::numeric
           or (transform->'crop'->>'y')::numeric + (transform->'crop'->>'height')::numeric
             > (transform->>'rotatedHeight')::numeric then
          raise exception 'Crop exceeds rotated canvas';
        end if;

        -- Existing UNIQUE(pk_photo_uuid) rejects conflicting reuse, including
        -- concurrent inserts. No upsert, replacement, or second photo row.
        insert into public.photos (
          pk_photo_uuid, fk_manta_id, fk_sighting_id, fk_catalog_id,
          storage_path, storage_bucket, original_storage_path, edit_transform,
          file_name2, photo_view, is_best_manta_ventral_photo, is_best_manta_dorsal_photo
        ) values (
          (photo->>'id')::uuid, new_manta_id, new_sighting_id, resolved_catalog_id,
          photo->>'path', photo->>'storageBucket', photo->>'originalPath', transform,
          resolved_file_name, coalesce(nullif(photo->>'view', ''), 'ventral'),
          coalesce((photo->>'isBestVentral')::boolean, false),
          coalesce((photo->>'isBestDorsal')::boolean, false)
        ) returning pk_photo_id into new_photo_id;
      else
        -- Legacy bucket/UUID defaults are unchanged; missing best-dorsal defaults false.
      insert into public.photos (
        fk_manta_id,
        fk_sighting_id,
        fk_catalog_id,
        storage_path,
        file_name2,
        photo_view,
        is_best_manta_ventral_photo,
        is_best_manta_dorsal_photo
      )
      values (
        new_manta_id,
        new_sighting_id,
        resolved_catalog_id,
        resolved_storage_path,
        resolved_file_name,
        coalesce(nullif(photo->>'view', ''), 'ventral'),
        coalesce((photo->>'isBestVentral')::boolean, false),
        coalesce((photo->>'isBestDorsal')::boolean, false)
      ) returning pk_photo_id into new_photo_id;
      end if;
      -- BEGIN size-evidence persistence
      measurement := photo->'measure';
      if measurement is not null and measurement <> 'null'::jsonb then
        if jsonb_typeof(measurement) is distinct from 'object' then
          raise exception 'Photo measurement must be an object';
        end if;
        if jsonb_typeof(photo->'id') is distinct from 'string'
           or (photo->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'Measured photo requires a stable UUID';
        end if;
        measured_photo_uuid := (photo->>'id')::uuid;
        foreach field_name in array array['scaleCm', 'scalePx', 'discPx', 'dlCm', 'dwCm'] loop
          if jsonb_typeof(measurement->field_name) is distinct from 'number' then
            raise exception 'Missing or nonnumeric measurement field: %', field_name;
          end if;
          numeric_value := (measurement->>field_name)::numeric;
          if not (numeric_value > 0 and numeric_value < 'Infinity'::numeric) then
            raise exception 'Measurement field must be finite and positive: %', field_name;
          end if;
        end loop;
        -- Older pending measurements have numeric evidence but no saved endpoints.
        if measurement->'points' is not null and measurement->'points' <> 'null'::jsonb then
          if jsonb_typeof(measurement->'points') is distinct from 'array' then
            raise exception 'Measurement points must be an array';
          end if;
          if jsonb_array_length(measurement->'points') <> 4 then
            raise exception 'Measurement requires exactly four points when present';
          end if;
          for measurement_point in select value from jsonb_array_elements(measurement->'points') loop
            foreach field_name in array array['x', 'y'] loop
              if jsonb_typeof(measurement_point->field_name) is distinct from 'number' then
                raise exception 'Measurement point coordinates must be numeric';
              end if;
              numeric_value := (measurement_point->>field_name)::numeric;
              if not (numeric_value >= 0 and numeric_value <= 1) then
                raise exception 'Measurement point coordinates must be normalized';
              end if;
            end loop;
          end loop;
        end if;

        insert into public.manta_sizes (
          fk_manta_id, source_photo_id, measurement_method, measurement_type,
          size_m, standardized_dw_m, measured_on, row_sig, measurement_evidence
        ) values (
          new_manta_id, new_photo_id, 'paired_laser', 'length',
          (measurement->>'dlCm')::numeric / 100,
          (measurement->>'dwCm')::numeric / 100,
          encounter_date,
          'submission:' || sub_id::text || ':photo:' || measured_photo_uuid::text || ':paired_laser:v1',
          jsonb_strip_nulls(jsonb_build_object(
            'version', 1,
            'scaleCm', measurement->'scaleCm',
            'scalePx', measurement->'scalePx',
            'discPx', measurement->'discPx',
            'points', measurement->'points',
            'conversion', jsonb_build_object('formula', 'DW = DL × 2.3', 'ratio', 2.3),
            'source', jsonb_build_object(
              'photoUuid', measured_photo_uuid::text,
              'storageBucket', photo->'storageBucket',
              'storagePath', photo->'path',
              'originalStoragePath', photo->'originalPath',
              'outputWidth', photo->'editTransform'->'outputWidth',
              'outputHeight', photo->'editTransform'->'outputHeight'
            )
          ))
        ) returning pk_manta_size_id into new_size_id;
        new_size_ids := array_append(new_size_ids, new_size_id);
      end if;
      -- END size-evidence persistence
    end loop;
    -- BEGIN size-evidence encounter mean
    -- Only IDs inserted for this new encounter; no historical/imported evidence.
    if cardinality(new_size_ids) > 0 then
      update public.mantas
      set size_dw_m = (
        select avg(standardized_dw_m) from public.manta_sizes
        where pk_manta_size_id = any(new_size_ids)
      )
      where pk_manta_id = new_manta_id;
    end if;
    -- END size-evidence encounter mean
  end loop;

  update public.sighting_submissions
  set
    status = 'committed',
    committed_at = now(),
    committed_pk_sighting_id = new_sighting_id
  where id = sub_id;
end;
$function$
;
COMMIT;
