\set ON_ERROR_STOP on
begin;

-- Forward migration preserved all fabricated existing data.
do $$ begin
  assert exists (select 1 from public.sightings where pk_sighting_id = -1);
  assert exists (select 1 from public.mantas where pk_manta_id = -1 and fk_sighting_id = -1);
  assert exists (select 1 from public.photos where pk_photo_id = -1 and fk_manta_id = -1);
  assert exists (select 1 from public.biopsies where pk_biopsy_id = -1 and raw_sample_id = 'SYNTHETIC-EXISTING');
  assert exists (select 1 from public.stg_biopsies where import_batch_id = '10000000-0000-4000-8000-000000000099');
  assert to_regprocedure('public.fn_imports_commit_biopsies(uuid)') is null;
  assert to_regprocedure('private.fn_imports_commit_biopsies_impl(uuid)') is null;
end $$;

-- Fabricated identities only.
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('30000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'organic-admin@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'organic-user@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'organic-inactive@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'organic-missing@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
update public.profiles set role = 'admin', is_active = true where id = '30000000-0000-4000-8000-000000000001';
update public.profiles set role = 'user', is_active = true where id = '30000000-0000-4000-8000-000000000002';
update public.profiles set role = 'user', is_active = false where id = '30000000-0000-4000-8000-000000000003';
delete from public.profiles where id = '30000000-0000-4000-8000-000000000004';
insert into public.catalog (pk_catalog_id, name) values
  (101, 'Synthetic Catalog A'), (102, 'Synthetic Catalog B');

-- Legacy staging is inaccessible to every API role, including service_role.
do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    assert not has_table_privilege(role_name, 'public.stg_biopsies', 'SELECT');
    assert not has_table_privilege(role_name, 'public.stg_biopsies', 'INSERT');
    assert not has_sequence_privilege(role_name, 'public.stg_biopsies_id_seq', 'USAGE');
    assert not has_table_privilege(role_name, 'public.v_stg_biopsies_norm', 'SELECT');
    assert not has_table_privilege(role_name, 'public.v_stg_invalid_biopsies', 'SELECT');
  end loop;
  assert not has_function_privilege(
    'authenticated', 'private.validate_sighting_submission_biopsies()', 'EXECUTE'
  );
  assert not has_function_privilege(
    'authenticated', 'private.validate_committed_biopsy_mapping()', 'EXECUTE'
  );
end $$;

-- Anonymous and identityless privileged callers are rejected before work.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    insert into public.sighting_submissions (id, email, payload) values (
      '31000000-0000-4000-8000-000000000000', 'anonymous@example.invalid',
      '{"mantas":[{"id":"anonymous-manta","biopsy":{"collected":true,"sampleDate":"2026-10-01","collector":"A","method":"B","tissueType":"C"}}]}'::jsonb
    );
    raise exception 'expected anonymous payload rejection';
  exception when insufficient_privilege then null; end;
  begin
    perform public.commit_sighting_submission_with_biopsies('31000000-0000-4000-8000-000000000001');
    raise exception 'expected anonymous rejection';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Direct table writes are unavailable even to active profiles; the wrapper is
-- the only browser-callable biopsy write boundary.
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
do $$ begin
  begin
    insert into public.biopsies (fk_manta_id, fk_sighting_id, sample_date)
    values (-1, -1, date '2026-10-01');
    raise exception 'expected direct biopsy insert rejection';
  exception when insufficient_privilege then null; end;
  begin
    update public.biopsies set notes = 'forbidden' where pk_biopsy_id = -1;
    raise exception 'expected direct biopsy update rejection';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform public.commit_sighting_submission_with_biopsies('31000000-0000-4000-8000-000000000001');
    raise exception 'expected identityless rejection';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Missing and inactive profiles cannot submit or add biopsy payloads.
insert into public.sighting_submissions (id, email, payload) values (
  '31000000-0000-4000-8000-000000000009', 'pending-no-biopsy@example.invalid',
  '{"mantas":[{"id":"pending-no-biopsy"}]}'::jsonb
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000003', true);
do $$ begin
  begin
    insert into public.sighting_submissions (id, email, payload) values (
      '31000000-0000-4000-8000-000000000003', 'inactive@example.invalid',
      '{"mantas":[{"id":"inactive-manta","biopsy":{"collected":true,"sampleDate":"2026-10-01","collector":"A","method":"B","tissueType":"C"}}]}'::jsonb
    );
    raise exception 'expected inactive rejection';
  exception when insufficient_privilege then null; end;
  begin
    update public.sighting_submissions
    set payload = '{"mantas":[{"id":"inactive-update","biopsy":{"collected":true,"sampleDate":"2026-10-01","collector":"A","method":"B","tissueType":"C"}}]}'::jsonb
    where id = '31000000-0000-4000-8000-000000000009';
    raise exception 'expected inactive update rejection';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000004', true);
do $$ begin
  begin
    insert into public.sighting_submissions (id, email, payload) values (
      '31000000-0000-4000-8000-000000000004', 'missing@example.invalid',
      '{"mantas":[{"id":"missing-manta","biopsy":{"collected":true,"sampleDate":"2026-10-01","collector":"A","method":"B","tissueType":"C"}}]}'::jsonb
    );
    raise exception 'expected missing-profile rejection';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Malformed fields and duplicate correlation IDs fail before persistence.
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
do $$ begin
  begin
    insert into public.sighting_submissions (id, email, payload) values (
      '31000000-0000-4000-8000-000000000005', 'user@example.invalid',
      '{"mantas":[{"id":"malformed","biopsy":{"collected":true,"sampleDate":"bad","collector":"","method":"B","tissueType":"C"}}]}'::jsonb
    );
    raise exception 'expected malformed rejection';
  exception when invalid_parameter_value or invalid_datetime_format then null; end;
  begin
    insert into public.sighting_submissions (id, email, payload) values (
      '31000000-0000-4000-8000-000000000006', 'user@example.invalid',
      '{"mantas":[{"id":"duplicate"},{"id":"duplicate","biopsy":{"collected":true,"sampleDate":"2026-10-01","collector":"A","method":"B","tissueType":"C"}}]}'::jsonb
    );
    raise exception 'expected ambiguous mapping rejection';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.sighting_submissions (id, email, payload) values (
      '31000000-0000-4000-8000-000000000007', 'user@example.invalid',
      '{"mantas":[{"biopsy":{"collected":true,"sampleDate":"2026-10-01","collector":"A","method":"B","tissueType":"C"}}]}'::jsonb
    );
    raise exception 'expected missing correlation rejection';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

-- No-biopsy submissions continue through the unchanged public RPC.
insert into public.sighting_submissions (id, email, sighting_date, payload)
values (
  '31000000-0000-4000-8000-000000000010', 'nobiopsy@example.invalid', date '2026-10-01',
  '{"date":"2026-10-01","island":"Synthetic","locationName":"Test","mantas":[{"id":"no-biopsy","name":"Same","matchedCatalogId":101,"photos":[],"biopsy":null}]}'::jsonb
);
select public.commit_sighting_submission('31000000-0000-4000-8000-000000000010');
do $$ begin
  assert (select status from public.sighting_submissions where id = '31000000-0000-4000-8000-000000000010') = 'committed';
  assert not exists (select 1 from public.biopsies where source = 'organic_sighting' and fk_sighting_id = (select committed_pk_sighting_id from public.sighting_submissions where id = '31000000-0000-4000-8000-000000000010'));
end $$;

-- Active user: one manta and one biopsy.
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
insert into public.sighting_submissions (id, email, sighting_date, payload)
values (
  '31000000-0000-4000-8000-000000000011', 'user@example.invalid', date '2026-10-02',
  '{"date":"2026-10-02","island":"Synthetic","locationName":"User Site","mantas":[{"id":"user-manta","name":"Same","matchedCatalogId":101,"photos":[],"biopsy":{"collected":true,"sampleDate":"2026-10-02","sampleTime":"09:30","collector":"User Collector","method":"remote","tissueType":"skin","sampleId":"USER-SAMPLE","labId":"USER-LAB"}}]}'::jsonb
);

-- The original no-biopsy commit RPC cannot bypass the transactional wrapper.
do $$ begin
  begin
    perform public.commit_sighting_submission('31000000-0000-4000-8000-000000000011');
    set constraints public.trg_validate_committed_biopsy_mapping immediate;
    raise exception 'expected direct commit bypass rejection';
  exception when others then
    if sqlerrm = 'expected direct commit bypass rejection' then raise; end if;
  end;
  assert (select status from public.sighting_submissions where id = '31000000-0000-4000-8000-000000000011') = 'pending';
  assert not exists (select 1 from public.mantas where submission_manta_id = 'user-manta');
end $$;
select public.commit_sighting_submission_with_biopsies('31000000-0000-4000-8000-000000000011');
do $$ begin
  assert exists (
    select 1 from public.biopsies b join public.mantas m on m.pk_manta_id = b.fk_manta_id
    where m.submission_manta_id = 'user-manta'
      and b.fk_sighting_id = m.fk_sighting_id
      and b.raw_sample_id = 'USER-SAMPLE'
  );
end $$;
reset role;

-- Active admin; two indistinguishable mantas are processed with descending IDs.
alter sequence public.mantas_pk_manta_id_seq increment by -1 minvalue 1 maxvalue 1000 restart with 1000;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
insert into public.sighting_submissions (id, email, sighting_date, payload)
values (
  '31000000-0000-4000-8000-000000000012', 'admin@example.invalid', date '2026-10-03',
  '{"date":"2026-10-03","island":"Synthetic","locationName":"Admin Site","mantas":[{"id":"stable-a","name":"Same","matchedCatalogId":102,"photos":[],"biopsy":{"collected":true,"sampleDate":"2026-10-03","collector":"Collector A","method":"remote","tissueType":"skin","sampleId":"SAMPLE-A"}},{"id":"stable-b","name":"Same","matchedCatalogId":102,"photos":[],"biopsy":{"collected":true,"sampleDate":"2026-10-03","collector":"Collector B","method":"remote","tissueType":"skin","sampleId":"SAMPLE-B"}}]}'::jsonb
);
select public.commit_sighting_submission_with_biopsies('31000000-0000-4000-8000-000000000012');
do $$ begin
  assert (select pk_manta_id from public.mantas where submission_manta_id = 'stable-a')
       > (select pk_manta_id from public.mantas where submission_manta_id = 'stable-b');
  assert exists (select 1 from public.biopsies b join public.mantas m on m.pk_manta_id = b.fk_manta_id where m.submission_manta_id = 'stable-a' and b.raw_sample_id = 'SAMPLE-A' and b.collector = 'Collector A');
  assert exists (select 1 from public.biopsies b join public.mantas m on m.pk_manta_id = b.fk_manta_id where m.submission_manta_id = 'stable-b' and b.raw_sample_id = 'SAMPLE-B' and b.collector = 'Collector B');
end $$;
-- Duplicate request is idempotent.
select public.commit_sighting_submission_with_biopsies('31000000-0000-4000-8000-000000000012');
do $$ begin
  assert (select count(*) from public.biopsies where raw_sample_id in ('SAMPLE-A', 'SAMPLE-B')) = 2;
end $$;
reset role;
alter sequence public.mantas_pk_manta_id_seq increment by 1 minvalue 1 no maxvalue restart with 1001;

-- Reversing submitted order does not change stable-ID mapping. One manta may
-- have a biopsy while an otherwise indistinguishable manta has none.
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
insert into public.sighting_submissions (id, email, sighting_date, payload) values
(
  '31000000-0000-4000-8000-000000000016', 'user@example.invalid', date '2026-10-06',
  '{"date":"2026-10-06","mantas":[{"id":"ordered-a","name":"Same","matchedCatalogId":101,"photos":[],"biopsy":{"collected":true,"sampleDate":"2026-10-06","collector":"Order A","method":"remote","tissueType":"skin","sampleId":"ORDER-A-1"}},{"id":"ordered-b","name":"Same","matchedCatalogId":101,"photos":[],"biopsy":null}]}'::jsonb
),
(
  '31000000-0000-4000-8000-000000000017', 'user@example.invalid', date '2026-10-07',
  '{"date":"2026-10-07","mantas":[{"id":"ordered-b","name":"Same","matchedCatalogId":101,"photos":[],"biopsy":null},{"id":"ordered-a","name":"Same","matchedCatalogId":101,"photos":[],"biopsy":{"collected":true,"sampleDate":"2026-10-07","collector":"Order A","method":"remote","tissueType":"skin","sampleId":"ORDER-A-2"}}]}'::jsonb
);
select public.commit_sighting_submission_with_biopsies('31000000-0000-4000-8000-000000000016');
select public.commit_sighting_submission_with_biopsies('31000000-0000-4000-8000-000000000017');
do $$ begin
  assert exists (
    select 1 from public.biopsies b join public.mantas m on m.pk_manta_id = b.fk_manta_id
    where m.submission_manta_id = 'ordered-a' and b.raw_sample_id = 'ORDER-A-1'
  );
  assert exists (
    select 1 from public.biopsies b join public.mantas m on m.pk_manta_id = b.fk_manta_id
    where m.submission_manta_id = 'ordered-a' and b.raw_sample_id = 'ORDER-A-2'
  );
  assert not exists (
    select 1 from public.biopsies b join public.mantas m on m.pk_manta_id = b.fk_manta_id
    where m.submission_manta_id = 'ordered-b' and b.source = 'organic_sighting'
  );
end $$;
reset role;

-- A parent moved to another sighting makes mapping fail and rolls back the commit.
create function public.synthetic_move_biopsy_parent() returns trigger language plpgsql as $$
begin
  if new.id = '31000000-0000-4000-8000-000000000013' then
    update public.mantas set fk_sighting_id = -1 where fk_sighting_id = new.committed_pk_sighting_id;
  end if;
  return new;
end $$;
create trigger synthetic_move_biopsy_parent after update of status on public.sighting_submissions
for each row execute function public.synthetic_move_biopsy_parent();
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
insert into public.sighting_submissions (id, email, sighting_date, payload) values (
  '31000000-0000-4000-8000-000000000013', 'user@example.invalid', date '2026-10-04',
  '{"date":"2026-10-04","mantas":[{"id":"wrong-parent","matchedCatalogId":101,"photos":[],"biopsy":{"collected":true,"sampleDate":"2026-10-04","collector":"A","method":"B","tissueType":"C"}}]}'::jsonb
);
do $$ begin
  begin
    perform public.commit_sighting_submission_with_biopsies('31000000-0000-4000-8000-000000000013');
    raise exception 'expected wrong-parent rejection';
  exception when others then
    if sqlerrm = 'expected wrong-parent rejection' then raise; end if;
  end;
  assert (select status from public.sighting_submissions where id = '31000000-0000-4000-8000-000000000013') = 'pending';
  assert not exists (select 1 from public.mantas where submission_manta_id = 'wrong-parent');
end $$;
reset role;
drop trigger synthetic_move_biopsy_parent on public.sighting_submissions;
drop function public.synthetic_move_biopsy_parent();

-- A missing committed parent also fails and leaves no partial sighting.
create function public.synthetic_remove_biopsy_parent() returns trigger language plpgsql as $$
begin
  if new.id = '31000000-0000-4000-8000-000000000015' then
    delete from public.mantas where fk_sighting_id = new.committed_pk_sighting_id;
  end if;
  return new;
end $$;
create trigger synthetic_remove_biopsy_parent after update of status on public.sighting_submissions
for each row execute function public.synthetic_remove_biopsy_parent();
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000002', true);
insert into public.sighting_submissions (id, email, sighting_date, payload) values (
  '31000000-0000-4000-8000-000000000015', 'user@example.invalid', date '2026-10-04',
  '{"date":"2026-10-04","mantas":[{"id":"missing-parent","matchedCatalogId":101,"photos":[],"biopsy":{"collected":true,"sampleDate":"2026-10-04","collector":"A","method":"B","tissueType":"C"}}]}'::jsonb
);
do $$ begin
  begin
    perform public.commit_sighting_submission_with_biopsies('31000000-0000-4000-8000-000000000015');
    raise exception 'expected missing-parent rejection';
  exception when others then
    if sqlerrm = 'expected missing-parent rejection' then raise; end if;
  end;
  assert (select status from public.sighting_submissions where id = '31000000-0000-4000-8000-000000000015') = 'pending';
  assert not exists (select 1 from public.mantas where submission_manta_id = 'missing-parent');
end $$;
reset role;
drop trigger synthetic_remove_biopsy_parent on public.sighting_submissions;
drop function public.synthetic_remove_biopsy_parent();

-- A simulated biopsy write failure rolls back sighting and manta creation.
create function public.synthetic_reject_biopsy() returns trigger language plpgsql as $$
begin raise exception 'synthetic biopsy write failure'; end $$;
create trigger synthetic_reject_biopsy before insert on public.biopsies
for each row when (new.source = 'organic_sighting') execute function public.synthetic_reject_biopsy();
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
insert into public.sighting_submissions (id, email, sighting_date, payload) values (
  '31000000-0000-4000-8000-000000000014', 'admin@example.invalid', date '2026-10-05',
  '{"date":"2026-10-05","mantas":[{"id":"write-failure","matchedCatalogId":101,"photos":[],"biopsy":{"collected":true,"sampleDate":"2026-10-05","collector":"A","method":"B","tissueType":"C"}}]}'::jsonb
);
do $$ begin
  begin
    perform public.commit_sighting_submission_with_biopsies('31000000-0000-4000-8000-000000000014');
    raise exception 'expected biopsy write failure';
  exception when others then
    if sqlerrm = 'expected biopsy write failure' then raise; end if;
  end;
  assert (select status from public.sighting_submissions where id = '31000000-0000-4000-8000-000000000014') = 'pending';
  assert not exists (select 1 from public.mantas where submission_manta_id = 'write-failure');
end $$;
reset role;
drop trigger synthetic_reject_biopsy on public.biopsies;
drop function public.synthetic_reject_biopsy();

-- Drone-photo import remains available to the active administrator.
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-4000-8000-000000000001', true);
do $$ declare result jsonb; begin
  result := public.fn_imports_commit_drone_photos('31000000-0000-4000-8000-000000000020');
  assert result->>'target' = 'drone_photos';
end $$;
reset role;

-- Every fabricated organic biopsy retains its exact observation parent and no
-- pre-existing hierarchy row was changed.
do $$ begin
  assert not exists (
    select 1 from public.biopsies b
    left join public.mantas m on m.pk_manta_id = b.fk_manta_id
    where b.source = 'organic_sighting'
      and (m.pk_manta_id is null or m.fk_sighting_id is distinct from b.fk_sighting_id)
  );
  assert exists (select 1 from public.catalog where pk_catalog_id = -1 and name = 'Synthetic existing catalog');
  assert exists (select 1 from public.sightings where pk_sighting_id = -1 and sighting_date = date '2020-01-01');
  assert exists (select 1 from public.mantas where pk_manta_id = -1 and fk_sighting_id = -1 and fk_catalog_id = -1);
  assert exists (select 1 from public.photos where pk_photo_id = -1 and fk_manta_id = -1);
end $$;

rollback;
