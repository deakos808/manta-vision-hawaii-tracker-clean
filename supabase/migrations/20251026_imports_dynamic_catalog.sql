create table if not exists public.import_logs (
  id bigserial primary key,
  src_file text,
  file_sha256 text,
  rows_mantas int default 0,
  rows_photos int default 0,
  inserted_mantas int default 0,
  updated_mantas int default 0,
  inserted_photos int default 0,
  updated_photos int default 0,
  status text default 'dry-run',
  message text,
  started_at timestamptz default now(),
  finished_at timestamptz
);

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

create or replace function public.fn_imports_commit_catalog_cols(
  p_columns text[],
  p_src_file text default null,
  p_file_sha256 text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cols text[];
  v_missing_base text[];
  v_missing_stg text[];
  v_log_id bigint;
  v_select_list text;
  v_set_list text;
  v_ins int := 0;
  v_upd int := 0;
  v_sql text;
begin
  -- normalize, distinct, and drop pk from update list
  v_cols := array(
    select distinct lower(trim(c))
    from unnest(coalesce(p_columns, '{}')) as c
    where c is not null and trim(c) <> '' and lower(trim(c)) <> 'pk_catalog_id'
  );

  if array_length(v_cols, 1) is null then
    return json_build_object('inserted_catalog', 0, 'updated_catalog', 0, 'log_id', null, 'message', 'no columns selected');
  end if;

  -- validate existence in catalog
  select array_agg(c) from (
    select c::text
    from unnest(v_cols) c
    join information_schema.columns bc
      on bc.table_schema = 'public'
     and bc.table_name   = 'catalog'
     and lower(bc.column_name) = c
  ) s into v_cols;

  if coalesce(array_length(v_cols,1),0) = 0 then
    raise exception 'No valid columns exist in catalog';
  end if;

  -- ensure stg_catalog has same columns
  select array_agg(c) from (
    select c::text
    from unnest(v_cols) c
    join information_schema.columns sc
      on sc.table_schema = 'public'
     and sc.table_name   = 'stg_catalog'
     and lower(sc.column_name) = c
  ) s into v_missing_stg;

  if coalesce(array_length(v_missing_stg,1),0) <> coalesce(array_length(v_cols,1),0) then
    v_missing_stg := array(
      select c from unnest(v_cols) c
      except
      select c from unnest(coalesce(v_missing_stg, '{}'))
    );
    raise exception 'Missing columns in stg_catalog: %', v_missing_stg;
  end if;

  insert into public.import_logs(src_file, file_sha256, status, started_at)
  values (p_src_file, p_file_sha256, 'committing_catalog_dynamic', now())
  returning id into v_log_id;

  v_select_list := array_to_string(array(select format('%I', c) from unnest(v_cols) c), ', ');
  v_set_list    := array_to_string(array(select format('%I = excluded.%I', c, c) from unnest(v_cols) c), ', ');

  v_sql := format($f$
    with up as (
      insert into public.catalog (pk_catalog_id, %s)
      select pk_catalog_id, %s
      from public.stg_catalog
      where pk_catalog_id is not null
      on conflict (pk_catalog_id) do update
      set %s
      returning (xmax = 0) as inserted
    )
    select
      count(*) filter (where inserted) as ins,
      count(*) filter (where not inserted) as upd
    from up
  $f$, v_select_list, v_select_list, v_set_list);

  execute v_sql into v_ins, v_upd;

  update public.import_logs
    set message = 'catalog_dynamic',
        finished_at = now(),
        status = 'committed_catalog_dynamic'
  where id = v_log_id;

  return json_build_object(
    'inserted_catalog', v_ins,
    'updated_catalog', v_upd,
    'log_id', v_log_id,
    'updated_columns', v_cols
  );
exception when others then
  update public.import_logs
  set status = 'failed_catalog_dynamic',
      message = sqlerrm,
      finished_at = now()
  where id = v_log_id;
  raise;
end;
$$;
