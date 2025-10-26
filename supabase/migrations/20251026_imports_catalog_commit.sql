create or replace view public.v_db_columns as
select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.ordinal_position,
  c.data_type,
  c.is_nullable,
  c.udt_name
from information_schema.columns c
where c.table_schema not in ('pg_catalog','information_schema');

create or replace view public.stg_v_catalog_missing_required as
select *
from public.stg_catalog
where pk_catalog_id is null or name is null;

create or replace view public.stg_merge_preview_catalog as
select
  (select count(*) from public.stg_catalog) as total_staged,
  (select count(*) from public.stg_catalog s left join public.catalog c on c.pk_catalog_id = s.pk_catalog_id where c.pk_catalog_id is null) as will_insert,
  (select count(*) from public.stg_catalog s join public.catalog c on c.pk_catalog_id = s.pk_catalog_id) as will_update,
  (select count(*) from public.stg_catalog s join public.catalog c on c.pk_catalog_id = s.pk_catalog_id
     where (c.species is distinct from s.species) or (c.name is distinct from s.name)
  ) as will_update_changed_only;

create or replace view public.stg_summary as
select
  (select count(*) from public.stg_catalog)                          as catalog_rows,
  (select count(*) from public.stg_v_catalog_dupe_pk)                as catalog_dupe_pk,
  (select count(*) from public.stg_v_catalog_type_warnings)          as catalog_type_warnings,
  (select count(*) from public.stg_v_catalog_missing_required)       as catalog_missing_required,
  (select count(*) from public.stg_mantas)                           as mantas_rows,
  (select count(*) from public.stg_v_mantas_dupe_pk)                 as mantas_dupe_pk,
  (select count(*) from public.stg_v_mantas_missing_fk_catalog)      as mantas_missing_fk_catalog,
  (select count(*) from public.stg_v_mantas_missing_fk_sighting)     as mantas_missing_fk_sighting,
  (select count(*) from public.stg_photos)                           as photos_rows,
  (select count(*) from public.stg_v_photos_missing_fk_manta)        as photos_missing_fk_manta;

create or replace function public.fn_imports_commit_catalog(p_src_file text default null, p_file_sha256 text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ins int := 0;
  v_upd int := 0;
  v_log_id bigint;
begin
  insert into public.import_logs(src_file, file_sha256, rows_mantas, rows_photos, status, started_at)
  values (p_src_file, p_file_sha256, 0, 0, 'committing_catalog', now())
  returning id into v_log_id;

  with up as (
    insert into public.catalog (pk_catalog_id, species, name)
    select pk_catalog_id, species, name
    from public.stg_catalog
    where pk_catalog_id is not null
    on conflict (pk_catalog_id) do update
    set species = excluded.species,
        name    = excluded.name
    returning (xmax = 0) as inserted
  )
  select
    count(*) filter (where inserted),
    count(*) filter (where not inserted)
  into v_ins, v_upd
  from up;

  update public.import_logs
    set message = 'catalog',
        inserted_mantas = 0,
        updated_mantas = 0,
        inserted_photos = 0,
        updated_photos = 0,
        finished_at = now(),
        status = 'committed_catalog'
  where id = v_log_id;

  return json_build_object(
    'inserted_catalog', v_ins,
    'updated_catalog', v_upd,
    'log_id', v_log_id
  );
exception when others then
  update public.import_logs
  set status = 'failed_catalog',
      message = sqlerrm,
      finished_at = now()
  where id = v_log_id;
  raise;
end;
$$;
