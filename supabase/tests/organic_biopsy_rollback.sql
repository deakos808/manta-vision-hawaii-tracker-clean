\set ON_ERROR_STOP on
begin;

-- The fail-closed rollback was applied before this file.
do $$
declare role_name text;
begin
  assert to_regprocedure('public.commit_sighting_submission_with_biopsies(uuid)') is null;
  assert to_regprocedure('public.fn_imports_commit_biopsies(uuid)') is null;
  assert to_regprocedure('private.fn_imports_commit_biopsies_impl(uuid)') is null;
  assert to_regprocedure('private.validate_committed_biopsy_mapping()') is not null;
  assert to_regprocedure('private.prevent_submission_manta_id_change()') is not null;
  assert to_regprocedure('private.validate_biopsy_parent_consistency()') is not null;
  assert exists (select 1 from public.sightings where pk_sighting_id = -1);
  assert exists (select 1 from public.mantas where pk_manta_id = -1 and fk_sighting_id = -1);
  assert exists (select 1 from public.photos where pk_photo_id = -1 and fk_manta_id = -1);
  assert exists (select 1 from public.biopsies where pk_biopsy_id = -1 and raw_sample_id = 'SYNTHETIC-EXISTING');
  assert exists (select 1 from public.stg_biopsies where import_batch_id = '10000000-0000-4000-8000-000000000099');
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    assert not has_table_privilege(role_name, 'public.stg_biopsies', 'SELECT');
    assert not has_table_privilege(role_name, 'public.stg_biopsies', 'INSERT');
    assert not has_sequence_privilege(role_name, 'public.stg_biopsies_id_seq', 'USAGE');
  end loop;
  foreach role_name in array array['anon', 'authenticated'] loop
    assert not has_table_privilege(role_name, 'public.biopsies', 'INSERT');
    assert not has_table_privilege(role_name, 'public.biopsies', 'UPDATE');
    assert not has_table_privilege(role_name, 'public.biopsies', 'DELETE');
  end loop;
  assert not has_column_privilege('authenticated', 'public.mantas', 'submission_manta_id', 'UPDATE');
end $$;

-- Any biopsy payload is rejected even for an active administrator.
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
do $$ begin
  begin
    insert into public.sighting_submissions (id, email, payload) values (
      '32000000-0000-4000-8000-000000000001', 'rollback@example.invalid',
      '{"mantas":[{"id":"rollback-manta","biopsy":{"collected":true,"sampleDate":"2026-10-01","collector":"A","method":"B","tissueType":"C"}}]}'::jsonb
    );
    raise exception 'expected fail-closed rollback rejection';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
