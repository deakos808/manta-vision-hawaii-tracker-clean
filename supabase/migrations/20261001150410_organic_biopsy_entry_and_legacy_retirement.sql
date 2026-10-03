-- PROPOSED / UNAPPLIED. Production application requires separate approval.
-- Organic biopsy entry uses a stable per-manta submission correlation ID and
-- retires the executable legacy biopsy CSV workflow without deleting data.

begin;

do $fingerprint$
declare
  actual_columns text[];
  function_source text;
begin
  if to_regnamespace('private') is null
     or to_regprocedure('auth.uid()') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.sighting_submissions') is null
     or to_regclass('public.sightings') is null
     or to_regclass('public.mantas') is null
     or to_regclass('public.catalog') is null
     or to_regclass('public.photos') is null
     or to_regclass('public.biopsies') is null then
    raise exception 'organic biopsy prerequisite fingerprint mismatch';
  end if;

  select array_agg(column_name order by ordinal_position)
    into actual_columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'biopsies';
  if actual_columns is distinct from array[
    'pk_biopsy_id', 'fk_manta_id', 'fk_sighting_id', 'fk_catalog_id',
    'sample_date', 'sample_time', 'collector', 'method', 'island', 'region',
    'location', 'tissue_type', 'lab_id', 'notes', 'source', 'raw_sample_id',
    'created_at', 'updated_at'
  ]::text[] then
    raise exception 'biopsies column fingerprint mismatch';
  end if;

  if (select count(*) from pg_constraint
      where conrelid = 'public.biopsies'::regclass and contype = 'p') <> 1
     or (select count(*) from pg_constraint c
         where c.conrelid = 'public.biopsies'::regclass and c.contype = 'f'
           and c.confrelid = 'public.mantas'::regclass
           and pg_get_constraintdef(c.oid) ~ 'FOREIGN KEY [(]fk_manta_id[)]') <> 1
     or (select count(*) from pg_constraint c
         where c.conrelid = 'public.biopsies'::regclass and c.contype = 'f'
           and c.confrelid = 'public.sightings'::regclass
           and pg_get_constraintdef(c.oid) ~ 'FOREIGN KEY [(]fk_sighting_id[)]') <> 1
     or (select count(*) from pg_constraint c
         where c.conrelid = 'public.biopsies'::regclass and c.contype = 'f'
           and c.confrelid = 'public.catalog'::regclass
           and pg_get_constraintdef(c.oid) ~ 'FOREIGN KEY [(]fk_catalog_id[)]') <> 1 then
    raise exception 'biopsies relationship fingerprint mismatch';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mantas'
      and column_name = 'submission_manta_id'
  ) then
    raise exception 'manta correlation column already exists';
  end if;

  select pg_get_functiondef(to_regprocedure('public.commit_sighting_submission(uuid)'))
    into function_source;
  if function_source is null
     or function_source !~* 'insert[[:space:]]+into[[:space:]]+public[.]sightings'
     or function_source !~* 'jsonb_array_elements[^;]+payload[^;]+mantas'
     or function_source !~* 'insert[[:space:]]+into[[:space:]]+public[.]mantas'
     or function_source !~* 'insert[[:space:]]+into[[:space:]]+public[.]photos'
     or function_source ~* 'submission_manta_id|public[.]biopsies'
     or exists (
       select 1 from pg_proc
       where oid = to_regprocedure('public.commit_sighting_submission(uuid)')
         and prosecdef is true
     ) then
    raise exception 'sighting commit definition fingerprint mismatch';
  end if;

  if to_regprocedure('public.fn_imports_commit_biopsies(uuid)') is null
     or to_regprocedure('private.fn_imports_commit_biopsies_impl(uuid)') is null
     or to_regclass('public.stg_biopsies') is null
     or to_regclass('public.stg_biopsies_id_seq') is null
     or to_regclass('public.v_stg_biopsies_norm') is null
     or to_regclass('public.v_stg_invalid_biopsies') is null then
    raise exception 'legacy biopsy import object fingerprint mismatch';
  end if;

  select pg_get_functiondef(to_regprocedure('public.fn_imports_commit_biopsies(uuid)'))
    into function_source;
  if function_source !~* 'auth[.]uid'
     or function_source !~* 'public[.]profiles'
     or function_source !~* 'role[^;]+admin'
     or function_source !~* 'is_active[^;]+true'
     or function_source !~* 'private[.]fn_imports_commit_biopsies_impl'
     or has_function_privilege('anon', 'public.fn_imports_commit_biopsies(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.fn_imports_commit_biopsies(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.fn_imports_commit_biopsies(uuid)', 'EXECUTE') then
    raise exception 'contained biopsy importer fingerprint mismatch';
  end if;

  if has_function_privilege('anon', 'private.fn_imports_commit_biopsies_impl(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.fn_imports_commit_biopsies_impl(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'private.fn_imports_commit_biopsies_impl(uuid)', 'EXECUTE')
     or not exists (
       select 1 from pg_class
       where oid = 'public.v_stg_biopsies_norm'::regclass
         and coalesce(reloptions, '{}'::text[]) @> array['security_invoker=true']
     )
     or not exists (
       select 1 from pg_class
       where oid = 'public.v_stg_invalid_biopsies'::regclass
         and coalesce(reloptions, '{}'::text[]) @> array['security_invoker=true']
     ) then
    raise exception 'contained biopsy staging fingerprint mismatch';
  end if;

  if to_regprocedure('private.validate_sighting_submission_biopsies()') is not null
     or to_regprocedure('public.commit_sighting_submission_with_biopsies(uuid)') is not null then
    raise exception 'organic biopsy objects already exist';
  end if;
end
$fingerprint$;

alter table public.mantas add column submission_manta_id text;
create unique index mantas_sighting_submission_manta_id_uidx
  on public.mantas (fk_sighting_id, submission_manta_id)
  where submission_manta_id is not null;

create function private.validate_sighting_submission_biopsies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  manta_payload jsonb;
  biopsy_payload jsonb;
  contains_biopsy boolean := false;
begin
  if jsonb_typeof(coalesce(new.payload->'mantas', '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'Mantas must be an array';
  end if;

  select exists (
    select 1 from jsonb_array_elements(coalesce(new.payload->'mantas', '[]'::jsonb)) item
    where item ? 'biopsy' and item->'biopsy' <> 'null'::jsonb
  ) into contains_biopsy;
  if tg_op = 'UPDATE' and not contains_biopsy then
    select exists (
      select 1 from jsonb_array_elements(coalesce(old.payload->'mantas', '[]'::jsonb)) item
      where item ? 'biopsy' and item->'biopsy' <> 'null'::jsonb
    ) into contains_biopsy;
  end if;
  if not contains_biopsy then return new; end if;

  if actor_id is null or not exists (
    select 1 from public.profiles
    where id = actor_id and is_active is true and role in ('user', 'admin')
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active user account is required to enter biopsy data';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(new.payload->'mantas', '[]'::jsonb)) item
    group by nullif(btrim(item->>'id'), '')
    having nullif(btrim(item->>'id'), '') is null or count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'Every manta requires a unique correlation ID';
  end if;

  for manta_payload in
    select value from jsonb_array_elements(coalesce(new.payload->'mantas', '[]'::jsonb))
  loop
    biopsy_payload := manta_payload->'biopsy';
    if biopsy_payload is null or biopsy_payload = 'null'::jsonb then continue; end if;
    if jsonb_typeof(biopsy_payload) <> 'object'
       or coalesce((biopsy_payload->>'collected')::boolean, false) is not true then
      raise exception using errcode = '22023', message = 'Biopsy data must describe a collected sample';
    end if;
    if nullif(btrim(biopsy_payload->>'sampleDate'), '') is null
       or nullif(btrim(biopsy_payload->>'collector'), '') is null
       or nullif(btrim(biopsy_payload->>'method'), '') is null
       or nullif(btrim(biopsy_payload->>'tissueType'), '') is null then
      raise exception using errcode = '22023', message = 'Biopsy date, collector, method, and tissue type are required';
    end if;
    perform (biopsy_payload->>'sampleDate')::date;
    if nullif(btrim(biopsy_payload->>'sampleTime'), '') is not null then
      perform (biopsy_payload->>'sampleTime')::time;
    end if;
    if exists (
      select 1 from jsonb_object_keys(biopsy_payload) key
      where key <> all (array[
        'collected', 'sampleDate', 'sampleTime', 'collector', 'method',
        'tissueType', 'labId', 'sampleId', 'notes'
      ]::text[])
    ) then
      raise exception using errcode = '22023', message = 'Unsupported biopsy field';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.validate_sighting_submission_biopsies()
  from public, anon, authenticated, service_role;

create trigger trg_validate_sighting_submission_biopsies
before insert or update of payload on public.sighting_submissions
for each row execute function private.validate_sighting_submission_biopsies();

create function private.validate_committed_biopsy_mapping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_biopsies integer;
  actual_biopsies integer;
begin
  if new.status <> 'committed' or new.committed_pk_sighting_id is null then
    return new;
  end if;
  select count(*) into expected_biopsies
  from jsonb_array_elements(coalesce(new.payload->'mantas', '[]'::jsonb)) item
  where item ? 'biopsy' and item->'biopsy' <> 'null'::jsonb;
  if expected_biopsies = 0 then return new; end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(new.payload->'mantas', '[]'::jsonb)) item
    where item ? 'biopsy' and item->'biopsy' <> 'null'::jsonb
      and (select count(*)
           from public.mantas m
           join public.biopsies b on b.fk_manta_id = m.pk_manta_id
           where m.fk_sighting_id = new.committed_pk_sighting_id
             and m.submission_manta_id = item->>'id'
             and b.fk_sighting_id = new.committed_pk_sighting_id
             and b.source = 'organic_sighting') <> 1
  ) then
    raise exception 'Committed submission has incomplete or ambiguous biopsy mapping';
  end if;

  select count(*) into actual_biopsies
  from public.biopsies
  where fk_sighting_id = new.committed_pk_sighting_id
    and source = 'organic_sighting';
  if actual_biopsies <> expected_biopsies then
    raise exception 'Committed submission biopsy count mismatch';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_committed_biopsy_mapping()
  from public, anon, authenticated, service_role;

create constraint trigger trg_validate_committed_biopsy_mapping
after update on public.sighting_submissions
deferrable initially deferred
for each row execute function private.validate_committed_biopsy_mapping();

-- Surgically preserve the submitted correlation ID. The installed function is
-- otherwise retained verbatim; an unexpected definition aborts the migration.
do $patch_commit$
declare
  function_source text;
  old_fragment constant text := E'insert into public.mantas (\n      fk_sighting_id,\n      fk_catalog_id\n    )\n    values (\n      new_sighting_id,\n      resolved_catalog_id\n    )';
  new_fragment constant text := E'insert into public.mantas (\n      fk_sighting_id,\n      fk_catalog_id,\n      submission_manta_id\n    )\n    values (\n      new_sighting_id,\n      resolved_catalog_id,\n      nullif(btrim(manta->>''id''), '''')\n    )';
  patched_source text;
begin
  select pg_get_functiondef(to_regprocedure('public.commit_sighting_submission(uuid)'))
    into function_source;
  if function_source is null
     or length(function_source) - length(replace(function_source, old_fragment, ''))
        <> length(old_fragment) then
    raise exception 'sighting commit correlation patch fingerprint mismatch';
  end if;
  patched_source := replace(function_source, old_fragment, new_fragment);
  if patched_source = function_source then
    raise exception 'sighting commit correlation patch was not applied';
  end if;
  execute patched_source;
end
$patch_commit$;

create function public.commit_sighting_submission_with_biopsies(sub_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  submission_row public.sighting_submissions%rowtype;
  manta_payload jsonb;
  biopsy_payload jsonb;
  parent_manta_id integer;
  parent_catalog_id integer;
  new_sighting_id integer;
  expected_biopsies integer;
  existing_biopsies integer;
  biopsy_count integer := 0;
begin
  if actor_id is null or not exists (
    select 1 from public.profiles
    where id = actor_id and is_active is true and role in ('user', 'admin')
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active user account is required to commit biopsy data';
  end if;

  select * into submission_row
  from public.sighting_submissions
  where id = sub_id
  for update;
  if not found then raise exception 'Submission not found'; end if;

  select count(*) into expected_biopsies
  from jsonb_array_elements(coalesce(submission_row.payload->'mantas', '[]'::jsonb)) item
  where item ? 'biopsy' and item->'biopsy' <> 'null'::jsonb;

  if expected_biopsies = 0 then
    perform public.commit_sighting_submission(sub_id);
    return;
  end if;

  if submission_row.status = 'committed'
     and submission_row.committed_pk_sighting_id is not null then
    select count(*) into existing_biopsies
    from public.biopsies b
    join public.mantas m on m.pk_manta_id = b.fk_manta_id
    join lateral jsonb_array_elements(
      coalesce(submission_row.payload->'mantas', '[]'::jsonb)
    ) item on item->>'id' = m.submission_manta_id
    where b.fk_sighting_id = submission_row.committed_pk_sighting_id
      and b.source = 'organic_sighting'
      and item ? 'biopsy' and item->'biopsy' <> 'null'::jsonb;
    if existing_biopsies = expected_biopsies then return; end if;
    raise exception 'Committed submission has incomplete or ambiguous biopsy mapping';
  end if;

  perform public.commit_sighting_submission(sub_id);
  select committed_pk_sighting_id into new_sighting_id
  from public.sighting_submissions where id = sub_id;
  if new_sighting_id is null then
    raise exception 'Sighting commit did not create a parent sighting';
  end if;

  for manta_payload in
    select value from jsonb_array_elements(coalesce(submission_row.payload->'mantas', '[]'::jsonb))
  loop
    biopsy_payload := manta_payload->'biopsy';
    if biopsy_payload is null or biopsy_payload = 'null'::jsonb then continue; end if;

    select m.pk_manta_id, m.fk_catalog_id
      into parent_manta_id, parent_catalog_id
    from public.mantas m
    where m.fk_sighting_id = new_sighting_id
      and m.submission_manta_id = manta_payload->>'id';

    if not found or parent_manta_id is null then
      raise exception 'No committed manta matches biopsy correlation ID';
    end if;
    if (select count(*) from public.mantas m
        where m.fk_sighting_id = new_sighting_id
          and m.submission_manta_id = manta_payload->>'id') <> 1 then
      raise exception 'Ambiguous committed manta biopsy mapping';
    end if;

    insert into public.biopsies (
      fk_manta_id, fk_sighting_id, fk_catalog_id,
      sample_date, sample_time, collector, method,
      island, location, tissue_type, lab_id, notes, source, raw_sample_id
    ) values (
      parent_manta_id, new_sighting_id, parent_catalog_id,
      (biopsy_payload->>'sampleDate')::date,
      nullif(biopsy_payload->>'sampleTime', '')::time,
      nullif(btrim(biopsy_payload->>'collector'), ''),
      nullif(btrim(biopsy_payload->>'method'), ''),
      nullif(btrim(submission_row.payload->>'island'), ''),
      nullif(btrim(coalesce(
        submission_row.payload->>'sitelocation',
        submission_row.payload->>'locationName'
      )), ''),
      nullif(btrim(biopsy_payload->>'tissueType'), ''),
      nullif(btrim(biopsy_payload->>'labId'), ''),
      nullif(btrim(biopsy_payload->>'notes'), ''),
      'organic_sighting',
      nullif(btrim(biopsy_payload->>'sampleId'), '')
    );
    biopsy_count := biopsy_count + 1;
  end loop;

  if biopsy_count <> expected_biopsies then
    raise exception 'Biopsy mapping count mismatch';
  end if;
  update public.sightings
  set total_mantas_biopsied = biopsy_count
  where pk_sighting_id = new_sighting_id;

  -- Force the deferred integrity check before returning success to the caller.
  set constraints public.trg_validate_committed_biopsy_mapping immediate;
  set constraints public.trg_validate_committed_biopsy_mapping deferred;
end;
$$;
revoke all on function public.commit_sighting_submission_with_biopsies(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.commit_sighting_submission_with_biopsies(uuid)
  to authenticated;

-- Biopsy writes are only available through the validated transactional wrapper.
-- Keep existing read behavior and trusted server access unchanged.
revoke insert, update, delete on table public.biopsies from public, anon, authenticated;
revoke usage, update on sequence public.biopsies_pk_biopsy_id_seq
  from public, anon, authenticated;

-- Remove executable importer code. Preserve all staging rows while removing
-- every Data API privilege from the staging table, sequence, and views.
revoke all on function public.fn_imports_commit_biopsies(uuid)
  from public, anon, authenticated, service_role;
drop function public.fn_imports_commit_biopsies(uuid);
revoke all on function private.fn_imports_commit_biopsies_impl(uuid)
  from public, anon, authenticated, service_role;
drop function private.fn_imports_commit_biopsies_impl(uuid);

drop policy if exists stg_biopsies_admin_ins on public.stg_biopsies;
drop policy if exists stg_biopsies_admin_sel on public.stg_biopsies;
revoke all on table public.stg_biopsies
  from public, anon, authenticated, service_role;
revoke all on sequence public.stg_biopsies_id_seq
  from public, anon, authenticated, service_role;
revoke all on table public.v_stg_biopsies_norm
  from public, anon, authenticated, service_role;
revoke all on table public.v_stg_invalid_biopsies
  from public, anon, authenticated, service_role;

do $postcondition$
declare
  role_name text;
  function_source text;
begin
  if to_regprocedure('public.fn_imports_commit_biopsies(uuid)') is not null
     or to_regprocedure('private.fn_imports_commit_biopsies_impl(uuid)') is not null then
    raise exception 'legacy biopsy importer retirement failed';
  end if;
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(role_name, 'public.stg_biopsies', 'SELECT')
       or has_table_privilege(role_name, 'public.stg_biopsies', 'INSERT')
       or has_sequence_privilege(role_name, 'public.stg_biopsies_id_seq', 'USAGE')
       or has_table_privilege(role_name, 'public.v_stg_biopsies_norm', 'SELECT')
       or has_table_privilege(role_name, 'public.v_stg_invalid_biopsies', 'SELECT') then
      raise exception 'legacy biopsy staging remains accessible to %', role_name;
    end if;
  end loop;

  foreach role_name in array array['anon', 'authenticated'] loop
    if has_table_privilege(role_name, 'public.biopsies', 'INSERT')
       or has_table_privilege(role_name, 'public.biopsies', 'UPDATE')
       or has_table_privilege(role_name, 'public.biopsies', 'DELETE')
       or has_sequence_privilege(
         role_name, 'public.biopsies_pk_biopsy_id_seq', 'USAGE'
       ) then
      raise exception 'direct biopsy writes remain accessible to %', role_name;
    end if;
  end loop;

  select pg_get_functiondef(to_regprocedure('public.commit_sighting_submission(uuid)'))
    into function_source;
  if function_source !~* 'submission_manta_id'
     or to_regprocedure('public.commit_sighting_submission_with_biopsies(uuid)') is null
     or to_regprocedure('private.validate_committed_biopsy_mapping()') is null
     or not exists (
       select 1 from pg_trigger
       where tgrelid = 'public.sighting_submissions'::regclass
         and tgname = 'trg_validate_committed_biopsy_mapping'
         and tgdeferrable and tginitdeferred and not tgisinternal
     )
     or has_function_privilege(
       'anon', 'public.commit_sighting_submission_with_biopsies(uuid)', 'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated', 'public.commit_sighting_submission_with_biopsies(uuid)', 'EXECUTE'
     ) then
    raise exception 'organic biopsy commit postcondition failed';
  end if;

  if to_regprocedure('public.fn_imports_commit_drone_photos(uuid)') is null
     or to_regprocedure('private.fn_imports_commit_drone_photos_impl(uuid)') is null
     or not has_function_privilege(
       'authenticated', 'public.fn_imports_commit_drone_photos(uuid)', 'EXECUTE'
     ) then
    raise exception 'drone-photo import contract changed unexpectedly';
  end if;
end
$postcondition$;

notify pgrst, 'reload schema';
commit;
