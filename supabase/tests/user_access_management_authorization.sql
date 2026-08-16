\set ON_ERROR_STOP on
begin;

do $$
begin
  assert (select array_agg(policyname order by policyname) from pg_policies where schemaname = 'public' and tablename = 'profiles') = array['profiles_select_own']::name[];
  assert has_table_privilege('authenticated', 'public.profiles', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.profiles', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  assert not has_table_privilege('anon', 'public.profiles', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');
  assert has_function_privilege('authenticated', 'public.is_admin_user()', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.is_admin_user()', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE');
  assert not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('role', 'is_active') and is_nullable <> 'NO'
  );
end
$$;

delete from public.user_access_audit;

-- Fabricated identities only.
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'synthetic-admin-one@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'synthetic-admin-two@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'synthetic-regular@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'synthetic-inactive-admin@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'synthetic-inactive-user@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'synthetic-missing-profile@example.invalid', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'synthetic-pending@example.invalid', null, '{}'::jsonb, '{}'::jsonb, now(), now());

do $$
begin
  assert (select count(*) from public.profiles) = 7, 'trigger must create one profile per Auth user';
  assert not exists (select 1 from public.profiles where role <> 'user' or is_active is not true), 'invitation/profile default must be active user';
end
$$;

update public.profiles set role = 'admin' where id in (
  '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000004'
);
update public.profiles set is_active = false where id in (
  '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005'
);
delete from public.profiles where id = '10000000-0000-4000-8000-000000000006';

-- Direct browser DML is unavailable even to an active administrator.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$
begin
  begin
    update public.profiles set role = 'user' where id = '10000000-0000-4000-8000-000000000003';
    raise exception 'expected direct profile update rejection';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.profiles) = 1, 'browser admin must see only its own profile';
end
$$;
reset role;

-- Regular, inactive-admin, and missing-profile callers are rejected.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
do $$ begin
  begin perform public.admin_set_profile_access('10000000-0000-4000-8000-000000000005', 'user', true, 'synthetic regular attempt'); raise exception 'expected rejection';
  exception when others then assert sqlerrm like '%Active administrator access is required%'; end;
end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
do $$ begin
  begin perform public.admin_set_profile_access('10000000-0000-4000-8000-000000000005', 'user', true, 'synthetic inactive attempt'); raise exception 'expected rejection';
  exception when others then assert sqlerrm like '%Active administrator access is required%'; end;
end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000006', true);
do $$ begin
  begin perform public.admin_set_profile_access('10000000-0000-4000-8000-000000000005', 'user', true, 'synthetic missing attempt'); raise exception 'expected rejection';
  exception when others then assert sqlerrm like '%no application profile%'; end;
end $$;
reset role;

-- Self-demotion, self-suspension, invalid role, and missing reason are rejected atomically.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$ begin
  begin perform public.admin_set_profile_access('10000000-0000-4000-8000-000000000001', 'user', true, 'synthetic self demotion'); raise exception 'expected rejection';
  exception when others then assert sqlerrm like '%cannot demote or suspend themselves%'; end;
  begin perform public.admin_set_profile_access('10000000-0000-4000-8000-000000000001', 'admin', false, 'synthetic self suspension'); raise exception 'expected rejection';
  exception when others then assert sqlerrm like '%cannot demote or suspend themselves%'; end;
  begin perform public.admin_set_profile_access('10000000-0000-4000-8000-000000000003', 'owner', true, 'synthetic invalid role'); raise exception 'expected rejection';
  exception when others then assert sqlerrm like '%Invalid application role%'; end;
  begin perform public.admin_set_profile_access('10000000-0000-4000-8000-000000000003', 'user', false, ''); raise exception 'expected rejection';
  exception when others then assert sqlerrm like '%valid change reason%'; end;
end $$;
reset role;

-- There are exactly two active admins; removing either is blocked.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$ begin
  begin perform public.admin_set_profile_access('10000000-0000-4000-8000-000000000002', 'user', true, 'synthetic floor test'); raise exception 'expected rejection';
  exception when others then assert sqlerrm like '%At least two active administrators must remain%'; end;
end $$;

-- Promote a third administrator, then demote another; suspend/reactivate a regular user.
select public.admin_set_profile_access('10000000-0000-4000-8000-000000000003', 'admin', true, 'synthetic promotion');
select public.admin_set_profile_access('10000000-0000-4000-8000-000000000002', 'user', true, 'synthetic demotion after promotion');
select public.admin_set_profile_access('10000000-0000-4000-8000-000000000005', 'user', true, 'synthetic reactivation');
select public.admin_set_profile_access('10000000-0000-4000-8000-000000000005', 'user', false, 'synthetic suspension');
reset role;

do $$
begin
  assert (select role from public.profiles where id = '10000000-0000-4000-8000-000000000003') = 'admin';
  assert (select role from public.profiles where id = '10000000-0000-4000-8000-000000000002') = 'user';
  assert (select is_active from public.profiles where id = '10000000-0000-4000-8000-000000000005') is false;
  assert (select count(*) from public.user_access_audit where outcome = 'success') = 4;
end
$$;

-- Force audit insertion failure; the preceding profile update must roll back.
alter table public.user_access_audit add constraint synthetic_reject_role_audit check (event_type <> 'role_change') not valid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$ begin
  begin perform public.admin_set_profile_access('10000000-0000-4000-8000-000000000002', 'admin', true, 'synthetic transactional failure'); raise exception 'expected rejection';
  exception when check_violation then null; end;
end $$;
reset role;
do $$ begin
  assert (select role from public.profiles where id = '10000000-0000-4000-8000-000000000002') = 'user', 'profile mutation must roll back with audit failure';
  assert (select count(*) from public.user_access_audit where outcome = 'success') = 4, 'failed transaction must not add audit row';
end $$;
alter table public.user_access_audit drop constraint synthetic_reject_role_audit;

rollback;
