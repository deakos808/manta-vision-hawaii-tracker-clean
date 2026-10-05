\set ON_ERROR_STOP on
-- Draft assertions for a disposable database after the approval migration.
-- Do not run against production. No commit of a scientific sighting is attempted.
begin;
insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
select ('61000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'authenticated','authenticated','approval-' || n || '@example.invalid','{}','{}'
from generate_series(1,3) n;
update public.profiles set role='user',is_active=true where id='61000000-0000-4000-8000-000000000001';
update public.profiles set role='admin',is_active=false where id='61000000-0000-4000-8000-000000000002';
update public.profiles set role='admin',is_active=true where id='61000000-0000-4000-8000-000000000003';
insert into public.sighting_submissions (id,email,payload,status) values
('62000000-0000-4000-8000-000000000001','rejected@example.invalid','{}','rejected'),
('62000000-0000-4000-8000-000000000002','invalid-commit@example.invalid','{}','committed');

do $$
declare fn text;
begin
  foreach fn in array array['public.commit_sighting_submission(uuid)','public.commit_sighting_submission_with_biopsies(uuid)'] loop
    assert not has_function_privilege('anon',fn,'EXECUTE');
    assert not has_function_privilege('service_role',fn,'EXECUTE');
    assert has_function_privilege('authenticated',fn,'EXECUTE');
  end loop;
end $$;
set local role anon;
do $$
declare fn text;
begin
  foreach fn in array array['commit_sighting_submission','commit_sighting_submission_with_biopsies'] loop
    begin
      execute format('select public.%I($1)',fn) using '62000000-0000-4000-8000-000000000099'::uuid;
      raise exception 'Anonymous commit unexpectedly permitted';
    exception when insufficient_privilege then null; end;
  end loop;
end $$;
reset role;

set local role authenticated;
do $$
declare actor text; fn text;
begin
  foreach actor in array array['61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002'] loop
    perform set_config('request.jwt.claim.sub',actor,true);
    foreach fn in array array['commit_sighting_submission','commit_sighting_submission_with_biopsies'] loop
      begin
        execute format('select public.%I($1)',fn) using '62000000-0000-4000-8000-000000000099'::uuid;
        raise exception 'User or inactive admin bypassed authorization';
      exception when insufficient_privilege then null; end;
    end loop;
  end loop;
end $$;
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000003',true);
do $$
declare fn text; target uuid;
begin
  foreach fn in array array['commit_sighting_submission','commit_sighting_submission_with_biopsies'] loop
    begin
      execute format('select public.%I($1)',fn) using '62000000-0000-4000-8000-000000000099'::uuid;
      raise exception 'Expected nonexistent submission';
    exception when raise_exception then
      assert sqlerrm='Submission not found', 'Active admin must reach the commit path';
    end;
    foreach target in array array['62000000-0000-4000-8000-000000000001'::uuid,'62000000-0000-4000-8000-000000000002'::uuid] loop
      begin
        execute format('select public.%I($1)',fn) using target;
        raise exception 'Rejected/inconsistent committed submission was accepted';
      exception when raise_exception then
        assert sqlerrm='Only a pending, uncommitted submission can be committed';
      end;
    end loop;
  end loop;
end $$;
reset role;
rollback;
