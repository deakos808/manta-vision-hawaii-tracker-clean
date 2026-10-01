-- Manual rollback to the documented import authorization baseline.
-- This restores broad legacy grants and JWT-claim staging policies; use only
-- during a reviewed rollback after the release impact has been accepted.

do $fingerprint$
declare
  function_source text;
  object_name text;
begin
  foreach object_name in array array[
    'fn_imports_commit_biopsies',
    'fn_imports_commit_drone_photos'
  ] loop
    if to_regprocedure(format('public.%I(uuid)', object_name)) is null
       or to_regprocedure(format('private.%I_impl(uuid)', object_name)) is null then
      raise exception 'contained import function rollback fingerprint mismatch: %', object_name;
    end if;

    select pg_get_functiondef(to_regprocedure(format('public.%I(uuid)', object_name)))
      into function_source;
    if function_source !~* 'auth[.]uid'
       or function_source !~* 'public[.]profiles'
       or function_source !~* 'role[^;]+admin'
       or function_source !~* 'is_active[^;]+true'
       or function_source !~* ('private[.]' || object_name || '_impl') then
      raise exception 'contained import wrapper rollback fingerprint mismatch: %', object_name;
    end if;

    if has_function_privilege('anon', format('public.%I(uuid)', object_name), 'EXECUTE')
       or not has_function_privilege('authenticated', format('public.%I(uuid)', object_name), 'EXECUTE')
       or not has_function_privilege('service_role', format('public.%I(uuid)', object_name), 'EXECUTE') then
      raise exception 'contained import grant rollback fingerprint mismatch: %', object_name;
    end if;
  end loop;

  foreach object_name in array array[
    'v_stg_biopsies_norm',
    'v_stg_drone_photos_norm',
    'v_stg_invalid_biopsies',
    'v_stg_invalid_drone_photos'
  ] loop
    if not exists (
      select 1 from pg_class
      where oid = to_regclass(format('public.%I', object_name))
        and coalesce(reloptions, '{}'::text[]) @> array['security_invoker=true']
    ) or has_table_privilege('anon', format('public.%I', object_name), 'SELECT')
      or not has_table_privilege('authenticated', format('public.%I', object_name), 'SELECT') then
      raise exception 'contained import view rollback fingerprint mismatch: %', object_name;
    end if;
  end loop;
end
$fingerprint$;

drop function public.fn_imports_commit_biopsies(uuid);
alter function private.fn_imports_commit_biopsies_impl(uuid)
  set schema public;
alter function public.fn_imports_commit_biopsies_impl(uuid)
  rename to fn_imports_commit_biopsies;
alter function public.fn_imports_commit_biopsies(uuid)
  set search_path = public;
grant execute on function public.fn_imports_commit_biopsies(uuid)
  to public, anon, authenticated, service_role;

drop function public.fn_imports_commit_drone_photos(uuid);
alter function private.fn_imports_commit_drone_photos_impl(uuid)
  set schema public;
alter function public.fn_imports_commit_drone_photos_impl(uuid)
  rename to fn_imports_commit_drone_photos;
alter function public.fn_imports_commit_drone_photos(uuid)
  set search_path = public;
grant execute on function public.fn_imports_commit_drone_photos(uuid)
  to public, anon, authenticated, service_role;

drop policy stg_biopsies_admin_ins on public.stg_biopsies;
drop policy stg_biopsies_admin_sel on public.stg_biopsies;
create policy stg_biopsies_admin_ins on public.stg_biopsies
for insert to authenticated with check (public.is_admin());
create policy stg_biopsies_admin_sel on public.stg_biopsies
for select to authenticated using (public.is_admin());

drop policy stg_drone_photos_admin_ins on public.stg_drone_photos;
drop policy stg_drone_photos_admin_sel on public.stg_drone_photos;
create policy stg_drone_photos_admin_ins on public.stg_drone_photos
for insert to authenticated with check (public.is_admin());
create policy stg_drone_photos_admin_sel on public.stg_drone_photos
for select to authenticated using (public.is_admin());

grant all privileges on table public.stg_biopsies to anon, authenticated, service_role;
grant all privileges on sequence public.stg_biopsies_id_seq to anon, authenticated, service_role;
grant all privileges on table public.stg_drone_photos to anon, authenticated, service_role;
grant all privileges on sequence public.stg_drone_photos_id_seq to anon, authenticated, service_role;

alter view public.v_stg_biopsies_norm reset (security_invoker);
alter view public.v_stg_drone_photos_norm reset (security_invoker);
alter view public.v_stg_invalid_biopsies reset (security_invoker);
alter view public.v_stg_invalid_drone_photos reset (security_invoker);

grant all privileges on table public.v_stg_biopsies_norm to anon, authenticated, service_role;
grant all privileges on table public.v_stg_drone_photos_norm to anon, authenticated, service_role;
grant all privileges on table public.v_stg_invalid_biopsies to anon, authenticated, service_role;
grant all privileges on table public.v_stg_invalid_drone_photos to anon, authenticated, service_role;

notify pgrst, 'reload schema';
