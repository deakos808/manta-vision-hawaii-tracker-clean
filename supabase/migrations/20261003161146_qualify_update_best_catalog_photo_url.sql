-- Qualify the two application relations used by the catalog best-photo trigger.
-- No calculation, condition, ordering, trigger, ownership, ACL, or data changes.

begin;

do $fingerprint$
declare
  actual_fingerprint text;
  dependency_fingerprint jsonb;
begin
  if to_regprocedure('public.update_best_catalog_photo_url()') is null
     or to_regclass('public.catalog') is null
     or to_regclass('public.photos') is null then
    raise exception 'best catalog photo trigger prerequisite fingerprint mismatch';
  end if;

  with f as (
    select p.oid, pg_get_functiondef(p.oid) as definition,
           pg_get_userbyid(p.proowner) as owner_name,
           coalesce(p.proacl::text, '') as acl,
           p.prosecdef::text as secdef, p.provolatile::text as volatility,
           p.proparallel::text as parallel_mode, p.proisstrict::text as strict,
           coalesce(p.proconfig::text, '') as config
    from pg_proc p
    where p.oid = 'public.update_best_catalog_photo_url()'::regprocedure
  ), triggers as (
    select coalesce(
      string_agg(pg_get_triggerdef(t.oid, true), E'\n'
        order by n.nspname, c.relname, t.tgname),
      ''
    ) as definitions
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where t.tgfoid = (select oid from f) and not t.tgisinternal
  )
  select md5(concat_ws(
           E'\n', regexp_replace(f.definition, E'\\s+', ' ', 'g'),
           f.owner_name, f.acl, f.secdef,
           f.volatility, f.parallel_mode, f.strict, f.config,
           triggers.definitions
         ))
    into actual_fingerprint
  from f cross join triggers;

  if actual_fingerprint <> '066c100b5af9c07bd37754d8801459bf' then
    raise exception 'best catalog photo trigger exact fingerprint mismatch (%)',
      actual_fingerprint;
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'refclass', d.refclassid::regclass::text,
             'refname', case
               when d.refclassid = 'pg_language'::regclass
                 then (select lanname from pg_language where oid = d.refobjid)
               when d.refclassid = 'pg_namespace'::regclass
                 then (select nspname from pg_namespace where oid = d.refobjid)
             end,
             'deptype', d.deptype::text
           ) order by d.refclassid::regclass::text, d.refobjid, d.deptype
         )
    into dependency_fingerprint
  from pg_depend d
  where d.classid = 'pg_proc'::regclass
    and d.objid = 'public.update_best_catalog_photo_url()'::regprocedure;

  if dependency_fingerprint <> jsonb_build_array(
       jsonb_build_object('refclass', 'pg_language', 'refname', 'plpgsql', 'deptype', 'n'),
       jsonb_build_object('refclass', 'pg_namespace', 'refname', 'public', 'deptype', 'n')
     ) then
    raise exception 'best catalog photo trigger dependency fingerprint mismatch';
  end if;
end
$fingerprint$;

create or replace function public.update_best_catalog_photo_url()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
 update public.catalog
 set best_catalog_photo_url = p.thumbnail_url
 from public.photos p
 where public.catalog.best_cat_mask_ventral_id_int = p.pk_photo_id
 and public.catalog.pk_catalog_id = new.pk_catalog_id;

 return new;
end;
$function$;

do $postcondition$
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
     or function_source ~ E'\\n update catalog\\n'
     or function_source ~ E'\\n from photos p\\n'
     or (select count(*) from pg_trigger
         where tgfoid = 'public.update_best_catalog_photo_url()'::regprocedure
           and not tgisinternal) <> 1
     or not exists (
       select 1
       from pg_trigger t
       where t.tgfoid = 'public.update_best_catalog_photo_url()'::regprocedure
         and not t.tgisinternal
         and pg_get_triggerdef(t.oid, true) =
           'CREATE TRIGGER trg_best_catalog_photo_url AFTER INSERT OR UPDATE OF best_cat_mask_ventral_id_int ON catalog FOR EACH ROW EXECUTE FUNCTION update_best_catalog_photo_url()'
     )
     or (select count(*) from pg_depend d
         where d.classid = 'pg_proc'::regclass
           and d.objid = 'public.update_best_catalog_photo_url()'::regprocedure) <> 2
     or not exists (
       select 1 from pg_depend d join pg_language l on l.oid = d.refobjid
       where d.classid = 'pg_proc'::regclass
         and d.objid = 'public.update_best_catalog_photo_url()'::regprocedure
         and d.refclassid = 'pg_language'::regclass
         and l.lanname = 'plpgsql' and d.deptype = 'n'
     )
     or not exists (
       select 1 from pg_depend d join pg_namespace n on n.oid = d.refobjid
       where d.classid = 'pg_proc'::regclass
         and d.objid = 'public.update_best_catalog_photo_url()'::regprocedure
         and d.refclassid = 'pg_namespace'::regclass
         and n.nspname = 'public' and d.deptype = 'n'
     ) then
    raise exception 'best catalog photo trigger postcondition mismatch';
  end if;
end
$postcondition$;

commit;
