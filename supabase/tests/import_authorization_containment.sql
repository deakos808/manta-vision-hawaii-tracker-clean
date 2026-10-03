\set ON_ERROR_STOP on
begin;

do $$
declare
  object_name text;
begin
  foreach object_name in array array[
    'fn_imports_commit_biopsies',
    'fn_imports_commit_drone_photos'
  ] loop
    assert not has_function_privilege('anon', format('public.%I(uuid)', object_name), 'EXECUTE');
    assert has_function_privilege('authenticated', format('public.%I(uuid)', object_name), 'EXECUTE');
    assert has_function_privilege('service_role', format('public.%I(uuid)', object_name), 'EXECUTE');
    assert exists (
      select 1 from pg_proc
      where oid = to_regprocedure(format('public.%I(uuid)', object_name))
        and prosecdef is true
        and proconfig is not null
        and array_to_string(proconfig, ',') ~ '^search_path='
    );
    assert exists (
      select 1 from pg_proc
      where oid = to_regprocedure(format('private.%I_impl(uuid)', object_name))
        and prosecdef is true
        and proconfig is not null
        and array_to_string(proconfig, ',') ~ '^search_path='
    );
    assert not has_function_privilege(
      'anon', format('private.%I_impl(uuid)', object_name), 'EXECUTE'
    );
    assert not has_function_privilege(
      'authenticated', format('private.%I_impl(uuid)', object_name), 'EXECUTE'
    );
    assert not has_function_privilege(
      'service_role', format('private.%I_impl(uuid)', object_name), 'EXECUTE'
    );
  end loop;

  foreach object_name in array array[
    'v_stg_biopsies_norm',
    'v_stg_drone_photos_norm',
    'v_stg_invalid_biopsies',
    'v_stg_invalid_drone_photos'
  ] loop
    assert not has_table_privilege('anon', format('public.%I', object_name), 'SELECT');
    assert has_table_privilege('authenticated', format('public.%I', object_name), 'SELECT');
    assert exists (
      select 1 from pg_class
      where oid = to_regclass(format('public.%I', object_name))
        and coalesce(reloptions, '{}'::text[]) @> array['security_invoker=true']
    );
  end loop;

  assert not has_table_privilege('anon', 'public.stg_biopsies', 'SELECT');
  assert not has_table_privilege('anon', 'public.stg_biopsies', 'INSERT');
  assert not has_table_privilege('anon', 'public.stg_drone_photos', 'SELECT');
  assert not has_table_privilege('anon', 'public.stg_drone_photos', 'INSERT');
  assert has_table_privilege('authenticated', 'public.stg_biopsies', 'SELECT,INSERT');
  assert has_table_privilege('authenticated', 'public.stg_drone_photos', 'SELECT,INSERT');
end
$$;

-- Fabricated identities only.
insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'import-admin@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'import-user@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'import-inactive@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'import-missing-profile@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles
set role = 'admin', is_active = true
where id = '20000000-0000-4000-8000-000000000001';
update public.profiles
set role = 'user', is_active = true
where id = '20000000-0000-4000-8000-000000000002';
update public.profiles
set role = 'user', is_active = false
where id = '20000000-0000-4000-8000-000000000003';
delete from public.profiles
where id = '20000000-0000-4000-8000-000000000004';

-- Seed rows as the active administrator so subsequent view tests exercise RLS.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{}', true);
insert into public.stg_biopsies (import_batch_id, source_file, row_no, raw)
values ('22000000-0000-4000-8000-000000000001', 'synthetic-biopsies.csv', 2, '{}'::jsonb);
insert into public.stg_drone_photos (import_batch_id, source_file, row_no, raw)
values ('22000000-0000-4000-8000-000000000002', 'synthetic-drone-photos.csv', 2, '{}'::jsonb);
reset role;

-- Anonymous callers cannot execute either RPC or read normalized staging data.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    perform public.fn_imports_commit_biopsies('21000000-0000-4000-8000-000000000001');
    raise exception 'expected anonymous biopsy RPC rejection';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.fn_imports_commit_drone_photos('21000000-0000-4000-8000-000000000002');
    raise exception 'expected anonymous drone-photo RPC rejection';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.v_stg_biopsies_norm limit 1;
    raise exception 'expected anonymous biopsy view rejection';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.v_stg_drone_photos_norm limit 1;
    raise exception 'expected anonymous drone-photo view rejection';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- Active users cannot promote themselves with hostile JWT metadata or call either RPC.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","app_metadata":{"role":"admin","is_admin":true}}',
  true
);
do $$
begin
  begin
    perform public.fn_imports_commit_biopsies('21000000-0000-4000-8000-000000000003');
    raise exception 'expected active-user biopsy RPC rejection';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.fn_imports_commit_drone_photos('21000000-0000-4000-8000-000000000004');
    raise exception 'expected active-user drone-photo RPC rejection';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.stg_biopsies (import_batch_id, source_file, row_no, raw)
    values ('22000000-0000-4000-8000-000000000003', 'hostile-user.csv', 2, '{}'::jsonb);
    raise exception 'expected active-user biopsy staging rejection';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.stg_drone_photos (import_batch_id, source_file, row_no, raw)
    values ('22000000-0000-4000-8000-000000000004', 'hostile-user.csv', 2, '{}'::jsonb);
    raise exception 'expected active-user drone-photo staging rejection';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.v_stg_biopsies_norm
          where import_batch_id = '22000000-0000-4000-8000-000000000001') = 0;
  assert (select count(*) from public.v_stg_drone_photos_norm
          where import_batch_id = '22000000-0000-4000-8000-000000000002') = 0;
end
$$;
reset role;

-- Inactive users and authenticated identities without profiles are rejected.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{}', true);
do $$
begin
  begin
    perform public.fn_imports_commit_biopsies('21000000-0000-4000-8000-000000000005');
    raise exception 'expected inactive-user rejection';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.fn_imports_commit_drone_photos('21000000-0000-4000-8000-000000000005');
    raise exception 'expected inactive-user rejection';
  exception when insufficient_privilege then null;
  end;
end
$$;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000004', true);
do $$
begin
  begin
    perform public.fn_imports_commit_drone_photos('21000000-0000-4000-8000-000000000006');
    raise exception 'expected missing-profile rejection';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.fn_imports_commit_biopsies('21000000-0000-4000-8000-000000000006');
    raise exception 'expected missing-profile rejection';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- A service-role or direct SQL caller without an active-admin identity is also rejected.
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
do $$
begin
  begin
    perform public.fn_imports_commit_biopsies('21000000-0000-4000-8000-000000000007');
    raise exception 'expected identity-less privileged-role rejection';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.fn_imports_commit_drone_photos('21000000-0000-4000-8000-000000000008');
    raise exception 'expected identity-less privileged-role rejection';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- Active administrators retain staging inserts, normalized reads, and both RPC contracts.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{}', true);
do $$
declare
  biopsy_result jsonb;
  drone_result jsonb;
begin
  assert (select count(*) from public.v_stg_biopsies_norm where import_batch_id = '22000000-0000-4000-8000-000000000001') = 1;
  assert (select count(*) from public.v_stg_drone_photos_norm where import_batch_id = '22000000-0000-4000-8000-000000000002') = 1;

  begin
    perform private.fn_imports_commit_biopsies_impl('23000000-0000-4000-8000-000000000001');
    raise exception 'expected direct private biopsy implementation rejection';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.fn_imports_commit_drone_photos_impl('23000000-0000-4000-8000-000000000002');
    raise exception 'expected direct private drone-photo implementation rejection';
  exception when insufficient_privilege then null;
  end;

  biopsy_result := public.fn_imports_commit_biopsies('23000000-0000-4000-8000-000000000001');
  drone_result := public.fn_imports_commit_drone_photos('23000000-0000-4000-8000-000000000002');
  assert biopsy_result->>'batch' = '23000000-0000-4000-8000-000000000001';
  assert biopsy_result->>'target' = 'biopsies';
  assert biopsy_result->>'errors_table' = 'stg_import_errors';
  assert biopsy_result->>'invalid_view' = 'v_stg_invalid_biopsies';
  assert (biopsy_result->>'inserted')::integer = 0;
  assert (biopsy_result->>'updated')::integer = 0;
  assert (biopsy_result->>'invalid')::integer = 0;
  assert (biopsy_result->>'skipped')::integer = 0;

  assert drone_result->>'batch' = '23000000-0000-4000-8000-000000000002';
  assert drone_result->>'target' = 'drone_photos';
  assert drone_result->>'errors_table' = 'stg_import_errors';
  assert drone_result->>'invalid_view' = 'v_stg_invalid_drone_photos';
  assert (drone_result->>'inserted')::integer = 0;
  assert (drone_result->>'updated')::integer = 0;
  assert (drone_result->>'invalid')::integer = 0;
  assert (drone_result->>'skipped')::integer = 0;
end
$$;
reset role;

-- The containment migration must not alter numeric parsing behavior.
do $$
begin
  assert public.try_cast_double(null) is null;
  assert public.try_cast_double('   ') is null;
  assert public.try_cast_double('not-a-number') is null;
  assert public.try_cast_double('-20.875') = (-20.875)::double precision;
end
$$;

rollback;
