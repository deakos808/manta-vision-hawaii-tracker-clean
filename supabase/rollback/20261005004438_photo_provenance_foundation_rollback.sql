-- Paired rollback: restores the exact pre-provenance commit function.
-- Dropping these columns discards their provenance metadata if populated;
-- it does not delete photo rows or any Storage objects. No CASCADE.
begin;

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
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active is true and role in ('user', 'admin')
  ) then
    raise exception using errcode = '42501', message = 'An active user account is required to commit a sighting';
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

  insert into public.sightings (
    sighting_date,
    start_time,
    end_time,
    photographer,
    island,
    sitelocation,
    latitude,
    longitude,
    notes
  )
  values (
    coalesce(
      submission_row.sighting_date,
      nullif(submission_row.payload->>'date', '')::date
    ),
    nullif(submission_row.payload->>'startTime', ''),
    nullif(submission_row.payload->>'stopTime', ''),
    nullif(submission_row.payload->>'photographer', ''),
    nullif(submission_row.payload->>'island', ''),
    resolved_sitelocation,
    nullif(submission_row.payload->>'latitude', '')::numeric,
    nullif(submission_row.payload->>'longitude', '')::numeric,
    nullif(submission_row.payload->>'notes', '')
  )
  returning pk_sighting_id into new_sighting_id;

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
      submission_manta_id
    )
    values (
      new_sighting_id,
      resolved_catalog_id,
      nullif(btrim(manta->>'id'), '')
    )
    returning pk_manta_id into new_manta_id;

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

      insert into public.photos (
        fk_manta_id,
        fk_sighting_id,
        fk_catalog_id,
        storage_path,
        file_name2,
        photo_view,
        is_best_manta_ventral_photo
      )
      values (
        new_manta_id,
        new_sighting_id,
        resolved_catalog_id,
        resolved_storage_path,
        resolved_file_name,
        coalesce(nullif(photo->>'view', ''), 'ventral'),
        coalesce((photo->>'isBestVentral')::boolean, false)
      );
    end loop;
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

alter table public.photos
  drop column original_storage_path,
  drop column edit_transform;

commit;
