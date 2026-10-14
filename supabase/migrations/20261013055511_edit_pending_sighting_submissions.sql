-- Phase A draft: not applied live. No permanent scientific-table or Storage changes.
begin;

-- Existing submitted_at/reviewed_at are not edit timestamps. A single counter
-- advances once per guarded action; old browser writes fail closed at cutover.
-- Internal approval status updates do not advance the same action a second time.
alter table public.sighting_submissions add column edit_revision integer not null default 0;
create function private.guard_submission_revision_writes() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  -- SECURITY INVOKER is essential: direct PostgREST uses authenticated,
  -- while the guarded definer below (and owner maintenance) uses its owner.
  -- This is not a spoofable request header/session variable.
  if current_user in ('authenticated', 'anon') then
    raise exception using errcode = '40001',
      message = 'Client upgrade required. Your changes were not saved. Reload the latest submission before continuing.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_submission_revision_writes() from public, anon, authenticated;
create trigger guard_submission_revision_writes before update on public.sighting_submissions
for each row execute function private.guard_submission_revision_writes();

-- Definer implementation stays outside the exposed schema. Table RLS is NOT
-- broadened: contributors still cannot directly UPDATE status/owner/review data.
create function private.save_pending_sighting_submission(
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
    raise exception using errcode = '40001', message = 'Submission changed since it was opened';
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
revoke all on function private.save_pending_sighting_submission(uuid,integer,jsonb,text) from public, anon, authenticated;
-- Authenticated already has private schema USAGE; no schema grants are changed.
grant execute on function private.save_pending_sighting_submission(uuid,integer,jsonb,text) to authenticated;
create function public.save_pending_sighting_submission(sub_id uuid, expected_revision integer, changes jsonb, action text default 'save')
returns jsonb language sql security invoker set search_path = '' as $$
  select private.save_pending_sighting_submission(sub_id, expected_revision, changes, action);
$$;
revoke all on function public.save_pending_sighting_submission(uuid,integer,jsonb,text) from public, anon, authenticated;
grant execute on function public.save_pending_sighting_submission(uuid,integer,jsonb,text) to authenticated;
-- Cutover closes BOTH legacy approval entrypoints to browser callers.
-- The definer above still delegates as owner; scientific implementations unchanged.
revoke execute on function public.commit_sighting_submission(uuid) from authenticated;
revoke execute on function public.commit_sighting_submission_with_biopsies(uuid) from authenticated;

-- Explicit protocol discovery; no data or privileged operations are exposed.
create function public.pending_submission_edit_protocol() returns integer
language sql stable security invoker set search_path = '' as $$ select 1 $$;
revoke all on function public.pending_submission_edit_protocol() from public, anon, authenticated;
grant execute on function public.pending_submission_edit_protocol() to authenticated;
commit;
