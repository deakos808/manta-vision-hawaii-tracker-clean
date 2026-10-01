\set ON_ERROR_STOP on

do $$
declare
  function_source text;
  object_name text;
begin
  foreach object_name in array array[
    'fn_imports_commit_biopsies',
    'fn_imports_commit_drone_photos'
  ] loop
    assert to_regprocedure(format('public.%I(uuid)', object_name)) is not null;
    assert to_regprocedure(format('private.%I_impl(uuid)', object_name)) is null;
    assert has_function_privilege('anon', format('public.%I(uuid)', object_name), 'EXECUTE');
    assert has_function_privilege('authenticated', format('public.%I(uuid)', object_name), 'EXECUTE');
    assert has_function_privilege('service_role', format('public.%I(uuid)', object_name), 'EXECUTE');
    assert exists (
      select 1 from pg_proc
      where oid = to_regprocedure(format('public.%I(uuid)', object_name))
        and prosecdef is true
        and proconfig = array['search_path=public']
    );
    select pg_get_functiondef(to_regprocedure(format('public.%I(uuid)', object_name)))
      into function_source;
    assert function_source !~* 'auth[.]uid';
    assert function_source !~* 'public[.]profiles';
  end loop;

  foreach object_name in array array[
    'v_stg_biopsies_norm',
    'v_stg_drone_photos_norm',
    'v_stg_invalid_biopsies',
    'v_stg_invalid_drone_photos'
  ] loop
    assert has_table_privilege('anon', format('public.%I', object_name), 'SELECT');
    assert has_table_privilege('authenticated', format('public.%I', object_name), 'SELECT');
    assert not exists (
      select 1 from pg_class
      where oid = to_regclass(format('public.%I', object_name))
        and coalesce(reloptions, '{}'::text[]) @> array['security_invoker=true']
    );
  end loop;

  foreach object_name in array array['stg_biopsies', 'stg_drone_photos'] loop
    assert has_table_privilege('anon', format('public.%I', object_name), 'SELECT');
    assert has_table_privilege('anon', format('public.%I', object_name), 'INSERT');
    assert exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = object_name
        and policyname = object_name || '_admin_ins'
        and coalesce(with_check, '') ~* 'is_admin'
        and coalesce(with_check, '') !~* 'is_admin_user'
    );
    assert exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = object_name
        and policyname = object_name || '_admin_sel'
        and coalesce(qual, '') ~* 'is_admin'
        and coalesce(qual, '') !~* 'is_admin_user'
    );
  end loop;
end
$$;
