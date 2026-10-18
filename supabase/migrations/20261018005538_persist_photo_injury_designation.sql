-- Local Option B draft. No backfill, defaults, ACL, policy, or formula changes.
-- The active biopsy wrapper delegates photo persistence to this guarded function.
BEGIN;
ALTER TABLE public.photos
  ADD COLUMN is_injury boolean NULL,
  ADD COLUMN injury_modifiers text[] NULL,
  ADD CONSTRAINT photo_injury_modifiers_allowed CHECK (
    injury_modifiers IS NULL OR (injury_modifiers <@ ARRAY['predation', 'entanglement']::text[]
      AND array_position(injury_modifiers, NULL) IS NULL)),
  ADD CONSTRAINT photo_injury_modifiers_consistent CHECK (
    is_injury IS DISTINCT FROM false OR coalesce(cardinality(injury_modifiers), 0) = 0);
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
  proposed_species text;
  catalog_species text;
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
    proposed_species := nullif(manta->>'species', '');
    if proposed_species is not null and proposed_species not in ('mobula alfredi', 'mobula birostris') then
      raise exception 'Proposed catalog species must be mobula alfredi, mobula birostris, or empty';
    end if;

    if coalesce((manta->>'noMatch')::boolean, false) = true then
      insert into public.catalog (name, species)
      values (
        coalesce(
          nullif(manta->>'name', ''),
          'Pending Name'
        ),
        proposed_species
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
      -- Catalog identity is authoritative; compare legacy spellings without rewriting.
      select case lower(btrim(species))
        when 'alfredi' then 'mobula alfredi'
        when 'birostris' then 'mobula birostris'
        else nullif(lower(btrim(species)), '')
      end into catalog_species
      from public.catalog where pk_catalog_id = resolved_catalog_id
      for share;
      if proposed_species is not null and catalog_species is not null
         and proposed_species <> catalog_species then
        raise exception 'Species mismatch: proposed species differs from matched catalog species. Correct the proposal or catalog match before approval.';
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
      case when manta ? 'estimatedSize' then null else nullif(manta->>'size', '')::numeric end
    )
    returning pk_manta_id into new_manta_id;

    -- Preserve explicitly revisited legacy values without guessing their metric/source.
    if manta ? 'estimatedSize' and nullif(manta->>'size', '') is not null then
      insert into public.manta_sizes (fk_manta_id, measurement_method, size_m, measured_on, row_sig, measurement_evidence)
      values (new_manta_id, 'legacy_unknown', (manta->>'size')::numeric,
        encounter_date,
        sub_id::text || ':' || new_manta_id::text || ':legacy_unknown:v1',
        jsonb_build_object('version', 1, 'source', 'legacy_unspecified', 'units', 'm'));
    end if;
    -- Explicit estimates are independent observations, never standardized measured DW.
    -- Legacy payload.size remains source-unspecified; no historical inference/backfill.
    if nullif(manta->>'estimatedSize', '') is not null then
      if not ((manta->>'estimatedSize')::numeric > 0
              and (manta->>'estimatedSize')::numeric < 'Infinity'::numeric) then
        raise exception 'Estimated disc width must be finite and positive';
      end if;
      insert into public.manta_sizes (
        fk_manta_id, measurement_method, measurement_type, size_m,
        measured_on, row_sig, measurement_evidence
      ) values (
        new_manta_id, 'visual_estimate', 'width', (manta->>'estimatedSize')::numeric,
        encounter_date,
        sub_id::text || ':' || new_manta_id::text || ':visual_estimate:v1',
        jsonb_build_object('version', 1, 'source', 'contributor_visual_estimate', 'units', 'm')
      );
    end if;
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

      -- NULL/absent denotes historical/unspecified; never infer from measurement/view.
      if photo ? 'isPhotogrammetry' and photo->'isPhotogrammetry' <> 'null'::jsonb
         and jsonb_typeof(photo->'isPhotogrammetry') <> 'boolean' then
        raise exception 'Photogrammetry designation must be boolean or null';
      end if;
      if photo ? 'isInjury' and photo->'isInjury' <> 'null'::jsonb
         and jsonb_typeof(photo->'isInjury') <> 'boolean' then
        raise exception 'Injury designation must be boolean or null';
      end if;
      if photo ? 'injuryModifiers' and photo->'injuryModifiers' <> 'null'::jsonb then
        if jsonb_typeof(photo->'injuryModifiers') <> 'array' then
          raise exception 'Injury modifiers must be an array or null';
        end if;
        if exists (select 1 from jsonb_array_elements(photo->'injuryModifiers') item(value)
          where jsonb_typeof(value) IS DISTINCT FROM 'string'
            or value #>> '{}' not in ('predation', 'entanglement')) then
          raise exception 'Unsupported injury modifier';
        end if;
        if photo->'isInjury' = 'false'::jsonb and jsonb_array_length(photo->'injuryModifiers') > 0 then
          raise exception 'Injury modifiers require Injury to not be false';
        end if;
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
          file_name2, photo_view, is_best_manta_ventral_photo, is_best_manta_dorsal_photo, is_photogrammetry, is_injury, injury_modifiers
        ) values (
          (photo->>'id')::uuid, new_manta_id, new_sighting_id, resolved_catalog_id,
          photo->>'path', photo->>'storageBucket', photo->>'originalPath', transform,
          resolved_file_name, coalesce(nullif(photo->>'view', ''), 'ventral'),
          coalesce((photo->>'isBestVentral')::boolean, false),
          coalesce((photo->>'isBestDorsal')::boolean, false),
          (photo->>'isPhotogrammetry')::boolean,
          (photo->>'isInjury')::boolean,
          CASE WHEN jsonb_typeof(photo->'injuryModifiers') = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(photo->'injuryModifiers')) ELSE NULL END
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
        is_best_manta_dorsal_photo,
        is_photogrammetry,
        is_injury,
        injury_modifiers
      )
      values (
        new_manta_id,
        new_sighting_id,
        resolved_catalog_id,
        resolved_storage_path,
        resolved_file_name,
        coalesce(nullif(photo->>'view', ''), 'ventral'),
        coalesce((photo->>'isBestVentral')::boolean, false),
        coalesce((photo->>'isBestDorsal')::boolean, false),
          (photo->>'isPhotogrammetry')::boolean,
          (photo->>'isInjury')::boolean,
          CASE WHEN jsonb_typeof(photo->'injuryModifiers') = 'array'
            THEN ARRAY(SELECT jsonb_array_elements_text(photo->'injuryModifiers')) ELSE NULL END
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
        if measurement->>'source' = 'external' then
          if measurement->>'metric' is null or measurement->>'metric' not in ('dw', 'dl')
             or measurement->>'units' is distinct from 'm'
             or jsonb_typeof(measurement->'valueMeters') is distinct from 'number' then
            raise exception 'External measurement requires DW or DL and a numeric value in meters';
          end if;
          numeric_value := (measurement->>'valueMeters')::numeric;
          if not (numeric_value > 0 and numeric_value < 'Infinity'::numeric) then
            raise exception 'External measurement must be finite and positive';
          end if;
          if measurement ?| array['points', 'scaleCm', 'scalePx', 'discPx', 'dlCm', 'dwCm'] then
            raise exception 'External measurement must not contain in-app laser geometry';
          end if;
          insert into public.manta_sizes (
            fk_manta_id, source_photo_id, measurement_method, measurement_type,
            size_m, standardized_dw_m, measured_on, row_sig, measurement_evidence
          ) values (
            new_manta_id, new_photo_id, null,
            case measurement->>'metric' when 'dw' then 'width' else 'length' end,
            numeric_value,
            case when measurement->>'metric' = 'dw' then numeric_value else null end,
            encounter_date,
            'submission:' || sub_id::text || ':photo:' || measured_photo_uuid::text || ':external:v1',
            jsonb_strip_nulls(jsonb_build_object(
              'version', 1, 'source', 'external', 'units', 'm',
              'photoUuid', measured_photo_uuid::text,
              'storageBucket', photo->'storageBucket', 'storagePath', photo->'path',
              'originalStoragePath', photo->'originalPath'
            ))
          ) returning pk_manta_size_id into new_size_id;
        else
          if measurement ? 'source' and measurement->>'source' is distinct from 'in_app' then
            raise exception 'Unrecognized measurement source';
          end if;
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
        end if; -- external / existing in-app branch
        -- Only DW-bearing evidence contributes to manta Size. DL alone retains manual Size.
        if measurement->>'source' is distinct from 'external' or measurement->>'metric' = 'dw' then
          new_size_ids := array_append(new_size_ids, new_size_id);
        end if;
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
-- Validate the same authorized fields on pending saves; authorization/revision guards are unchanged.
create or replace function private.save_pending_sighting_submission(
  sub_id uuid, expected_revision integer, changes jsonb, action text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  admin boolean;
  current_row public.sighting_submissions%rowtype;
  merged jsonb;
  manta jsonb;
  old_photo jsonb;
  new_photo jsonb;
begin
  select p.role = 'admin' into admin from public.profiles p
    where p.id = caller and p.is_active is true and p.role in ('user', 'admin');
  if caller is null or admin is null then
    raise exception using errcode = '42501', message = 'Active contributor access required';
  end if;
  if action is null or action not in ('save', 'commit', 'reject') then
    raise exception 'Invalid pending submission action';
  end if;
  if action <> 'save' and not admin then
    raise exception using errcode = '42501', message = 'Active administrator access required';
  end if;
  select * into current_row from public.sighting_submissions s
    where s.id = sub_id and (s.submitted_by = caller or admin) for update;
  if not found then
    raise exception using errcode = '42501', message = 'Submission unavailable';
  end if;
  if current_row.status <> 'pending' or current_row.committed_pk_sighting_id is not null
     or current_row.committed_at is not null or current_row.rejected_at is not null then
    raise exception using errcode = '40001', message = 'Submission is no longer pending';
  end if;
  if expected_revision is null or current_row.edit_revision <> expected_revision then
    raise exception using errcode = 'PT409', message = 'Submission changed since it was opened';
  end if;
  if action = 'reject' then
    update public.sighting_submissions set status = 'rejected', rejected_at = now(), edit_revision = expected_revision + 1 where id = sub_id;
  else
    if jsonb_typeof(changes) is distinct from 'object' or exists (
      select 1 from jsonb_object_keys(changes) k where k <> all(array[
        'date','startTime','stopTime','photographer','email','phone','location_unknown',
        'island','locationId','locationName','latitude','longitude','mantas','methods','standardize_survey','notes'
      ])
    ) then raise exception 'Invalid editable submission fields'; end if;
    -- Preserve other existing payload metadata. Editable arrays are intentional replacements.
    merged := coalesce(current_row.payload, '{}'::jsonb) || changes;
    if jsonb_typeof(merged->'mantas') is distinct from 'array' then raise exception 'Mantas must be an array'; end if;
    for manta in select value from jsonb_array_elements(merged->'mantas') loop
      if jsonb_typeof(manta) is distinct from 'object' or jsonb_typeof(manta->'photos') is distinct from 'array' then
        raise exception 'Invalid manta photos';
      end if;
    end loop;
    for new_photo in
      select p.value from jsonb_array_elements(merged->'mantas') m,
        lateral jsonb_array_elements(m->'photos') p
    loop
      if new_photo ? 'isInjury' and new_photo->'isInjury' <> 'null'::jsonb
         and jsonb_typeof(new_photo->'isInjury') <> 'boolean' then
        raise exception 'Injury designation must be boolean or null';
      end if;
      if new_photo ? 'injuryModifiers' and new_photo->'injuryModifiers' <> 'null'::jsonb then
        if jsonb_typeof(new_photo->'injuryModifiers') <> 'array' then
          raise exception 'Injury modifiers must be an array or null';
        end if;
        if exists (select 1 from jsonb_array_elements(new_photo->'injuryModifiers') item(value)
          where jsonb_typeof(value) IS DISTINCT FROM 'string'
            or value #>> '{}' not in ('predation', 'entanglement')) then
          raise exception 'Unsupported injury modifier';
        end if;
        if new_photo->'isInjury' = 'false'::jsonb and jsonb_array_length(new_photo->'injuryModifiers') > 0 then
          raise exception 'Injury modifiers require Injury to not be false';
        end if;
      end if;
    end loop;
    -- A retained logical photo may get a new derivative, never a different source.
    for old_photo in
      select p.value from jsonb_array_elements(coalesce(current_row.payload->'mantas','[]'::jsonb)) m,
        lateral jsonb_array_elements(coalesce(m.value->'photos','[]'::jsonb)) p
      where nullif(p.value->>'originalPath','') is not null
    loop
      for new_photo in
        select p.value from jsonb_array_elements(merged->'mantas') m,
          lateral jsonb_array_elements(m.value->'photos') p where p.value->>'id' = old_photo->>'id'
      loop
        if new_photo->>'originalPath' is distinct from old_photo->>'originalPath'
           or new_photo->>'storageBucket' is distinct from old_photo->>'storageBucket' then
          raise exception 'Original photo source cannot be changed';
        end if;
      end loop;
    end loop;
    update public.sighting_submissions set edit_revision = expected_revision + 1, payload = merged,
      email = coalesce(merged->>'email', current_row.email),
      sighting_date = case when merged ? 'date' then nullif(merged->>'date','')::date else current_row.sighting_date end,
      manta_count = jsonb_array_length(merged->'mantas'),
      photo_count = (select coalesce(sum(jsonb_array_length(m->'photos')),0) from jsonb_array_elements(merged->'mantas') m)
    where id = sub_id;
    if action = 'commit' then
      -- Save and existing approval RPC share this transaction and row lock.
      -- A failed approval rolls back the save as well; no overwrite window.
      if exists (select 1 from jsonb_array_elements(merged->'mantas') m where m->'biopsy'->>'collected' = 'true') then
        perform public.commit_sighting_submission_with_biopsies(sub_id);
      else
        perform public.commit_sighting_submission(sub_id);
      end if;
    end if;
  end if;
  select * into current_row from public.sighting_submissions where id = sub_id;
  return jsonb_build_object('revision',current_row.edit_revision,'status',current_row.status);
end;
$$;
COMMIT;
