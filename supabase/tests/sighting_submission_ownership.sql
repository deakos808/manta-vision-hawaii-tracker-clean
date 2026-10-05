\set ON_ERROR_STOP on
-- DRAFT: run ONLY against a disposable test database after the migration.
-- Never run against the live project. Fixtures are synthetic and rolled back.
-- Tests direct table access, NOT the separately deferred SECURITY DEFINER RPCs.
begin;

do $$
declare privilege_name text;
begin
  assert (select relrowsecurity from pg_class where oid = 'public.sighting_submissions'::regclass);
  foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    assert not has_table_privilege('anon', 'public.sighting_submissions', privilege_name);
    assert has_table_privilege('service_role', 'public.sighting_submissions', privilege_name);
  end loop;
  foreach privilege_name in array array['DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    assert not has_table_privilege('authenticated', 'public.sighting_submissions', privilege_name);
  end loop;
end $$;

-- Existing auth trigger creates profiles. Five reserved synthetic identities:
-- A, B, admin, inactive, missing-profile.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select ('51000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'authenticated', 'authenticated', 'ownership-' || n || '@example.invalid', '{}', '{}'
from generate_series(1,5) n;
update public.profiles set role = 'user', is_active = true
where id in ('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002');
update public.profiles set role = 'admin', is_active = true
where id = '51000000-0000-4000-8000-000000000003';
update public.profiles set role = 'user', is_active = false
where id = '51000000-0000-4000-8000-000000000004';
delete from public.profiles where id = '51000000-0000-4000-8000-000000000005';

-- Legacy NULL ownership plus another user's row; no scientific commit is invoked.
insert into public.sighting_submissions (id,email,payload,submitted_by) values
('52000000-0000-4000-8000-000000000002','b@example.invalid','{}','51000000-0000-4000-8000-000000000002'),
('52000000-0000-4000-8000-000000000003','legacy@example.invalid','{}',null),
('52000000-0000-4000-8000-000000000004','inactive@example.invalid','{}','51000000-0000-4000-8000-000000000004');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  begin
    perform id from public.sighting_submissions;
    raise exception 'anon SELECT unexpectedly permitted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.sighting_submissions (email,payload) values ('anon@example.invalid','{}');
    raise exception 'anon INSERT unexpectedly permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
-- Same omission of submitted_by used by the existing single-row frontend INSERT.
insert into public.sighting_submissions (id,email,sighting_date,manta_count,photo_count,payload,status)
values ('52000000-0000-4000-8000-000000000001','a@example.invalid','2026-10-05',0,0,'{}','pending');
do $$
declare affected integer; bad_owner uuid; bad_status text;
begin
  assert (select submitted_by from public.sighting_submissions
    where id='52000000-0000-4000-8000-000000000001') = auth.uid();
  assert not exists (select 1 from public.sighting_submissions
    where id in ('52000000-0000-4000-8000-000000000002','52000000-0000-4000-8000-000000000003'));
  -- RLS-denied UPDATE legitimately returns zero rows, not necessarily an error.
  update public.sighting_submissions set status='rejected', reject_reason='forbidden'
    where id in ('52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000002');
  get diagnostics affected = row_count;
  assert affected = 0, 'ordinary user updated review fields';
  begin
    delete from public.sighting_submissions where id='52000000-0000-4000-8000-000000000001';
    raise exception 'user DELETE unexpectedly permitted';
  exception when insufficient_privilege then null; end;
  foreach bad_owner in array array['51000000-0000-4000-8000-000000000002'::uuid,null::uuid] loop
    begin
      insert into public.sighting_submissions (email,payload,submitted_by)
        values ('spoof@example.invalid','{}',bad_owner);
      raise exception 'spoofed or NULL owner accepted';
    exception when insufficient_privilege then null; end;
  end loop;
  foreach bad_status in array array['committed','rejected'] loop
    begin
      insert into public.sighting_submissions (email,payload,status)
        values ('status@example.invalid','{}',bad_status);
      raise exception 'non-pending INSERT accepted';
    exception when insufficient_privilege then null; end;
  end loop;
  begin
    insert into public.sighting_submissions (email,payload,reviewed_at)
      values ('review@example.invalid','{}',now());
    raise exception 'forged review metadata accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Inactive users cannot see even their own rows. Missing profiles also fail closed.
set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000004', true);
do $$ begin
  assert not exists (select 1 from public.sighting_submissions);
  begin
    insert into public.sighting_submissions (email,payload) values ('inactive@example.invalid','{}');
    raise exception 'inactive INSERT unexpectedly permitted';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000005', true);
do $$ begin
  assert not exists (select 1 from public.sighting_submissions);
  begin
    insert into public.sighting_submissions (email,payload) values ('missing@example.invalid','{}');
    raise exception 'missing-profile INSERT unexpectedly permitted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000003', true);
do $$
declare affected integer;
begin
  assert (select count(*) from public.sighting_submissions where id in (
    '52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000002',
    '52000000-0000-4000-8000-000000000003')) = 3, 'admin cannot see A/B/legacy';
  update public.sighting_submissions
    set payload=jsonb_build_object('notes','synthetic review'), status='rejected',
        reviewer_email='admin@example.invalid', reviewed_at=now(),
        rejected_at=now(), reject_reason='synthetic reason'
    where id in ('52000000-0000-4000-8000-000000000001',
                 '52000000-0000-4000-8000-000000000002',
                 '52000000-0000-4000-8000-000000000003');
  get diagnostics affected = row_count;
  assert affected=3, 'admin review/rejection blocked';
  assert (select submitted_by from public.sighting_submissions
    where id='52000000-0000-4000-8000-000000000003') is null;
  begin
    delete from public.sighting_submissions where id='52000000-0000-4000-8000-000000000003';
    raise exception 'admin client DELETE unexpectedly permitted';
  exception when insufficient_privilege then null; end;
end $$;
-- Active admin can also submit, owned by that admin.
insert into public.sighting_submissions (email,payload) values ('admin@example.invalid','{}');
reset role;

-- Revoking active status removes admin SELECT/UPDATE immediately.
update public.profiles set is_active=false where id='51000000-0000-4000-8000-000000000003';
set local role authenticated;
do $$
declare affected integer;
begin
  assert not exists (select 1 from public.sighting_submissions);
  update public.sighting_submissions set reject_reason='forbidden';
  get diagnostics affected = row_count;
  assert affected=0, 'inactive admin updated rows';
end $$;
reset role;
rollback;
