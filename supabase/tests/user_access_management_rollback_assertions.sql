\set ON_ERROR_STOP on
do $$
begin
  assert to_regprocedure('public.admin_set_profile_access(uuid,text,boolean,text)') is null;
  assert to_regclass('public.user_access_audit') is null;
  assert (select array_agg(policyname order by policyname) from pg_policies where schemaname = 'public' and tablename = 'profiles') = array[
    'profiles_admin_delete_all', 'profiles_admin_insert_all', 'profiles_admin_select_all',
    'profiles_admin_update_all', 'profiles_select_own'
  ]::name[];
  assert exists (
    select 1 from pg_proc where oid = to_regprocedure('public.is_admin_user()')
      and prosecdef is true and proconfig = array['search_path=public']
  );
  assert exists (
    select 1 from pg_proc where oid = to_regprocedure('public.handle_new_user()')
      and prosecdef is true and proconfig is null
  );
  assert not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('role', 'is_active') and is_nullable = 'NO'
  );
end
$$;
