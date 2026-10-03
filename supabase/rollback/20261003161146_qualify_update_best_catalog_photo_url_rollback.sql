-- Fail-closed rollback for the catalog best-photo qualification correction.
-- The insecure unqualified trigger body is never restored. Data is untouched.

begin;

do $fingerprint$
declare
  function_source text;
begin
  select pg_get_functiondef(p.oid)
    into function_source
  from pg_proc p
  where p.oid = 'public.update_best_catalog_photo_url()'::regprocedure
    and pg_get_userbyid(p.proowner) = 'postgres'
    and coalesce(p.proacl::text, '') =
      '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
    and not p.prosecdef
    and p.provolatile = 'v'
    and p.proparallel = 'u'
    and not p.proisstrict
    and coalesce(p.proconfig, '{}'::text[]) = array['search_path=""'];

  if function_source is null
     or function_source !~ E'update public[.]catalog\\n set best_catalog_photo_url = p[.]thumbnail_url\\n from public[.]photos p'
     or (select count(*) from pg_trigger
         where tgfoid = 'public.update_best_catalog_photo_url()'::regprocedure
           and not tgisinternal) <> 1 then
    raise exception 'best catalog photo rollback fingerprint mismatch';
  end if;

  if to_regprocedure('public.commit_sighting_submission(uuid)') is null
     or to_regprocedure('public.commit_sighting_submission_with_biopsies(uuid)') is null then
    raise exception 'sighting commit rollback prerequisite mismatch';
  end if;
end
$fingerprint$;

revoke all on function public.commit_sighting_submission(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.commit_sighting_submission_with_biopsies(uuid)
  from public, anon, authenticated, service_role;

do $postcondition$
begin
  if has_function_privilege('anon', 'public.commit_sighting_submission(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.commit_sighting_submission(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.commit_sighting_submission(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.commit_sighting_submission_with_biopsies(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.commit_sighting_submission_with_biopsies(uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.commit_sighting_submission_with_biopsies(uuid)', 'EXECUTE') then
    raise exception 'sighting commit rollback did not fail closed';
  end if;

  if to_regprocedure('public.update_best_catalog_photo_url()') is null
     or to_regclass('public.catalog') is null
     or to_regclass('public.photos') is null then
    raise exception 'best catalog photo rollback altered required objects';
  end if;
end
$postcondition$;

commit;
