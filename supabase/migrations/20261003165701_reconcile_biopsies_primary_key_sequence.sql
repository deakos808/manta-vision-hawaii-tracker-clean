-- Reconcile only the sequence owned by public.biopsies.pk_biopsy_id.
-- No table row, identifier, grant, default, or ownership change is permitted.

begin;

lock table public.biopsies in share row exclusive mode;

do $migration$
declare
  sequence_row record;
  owned_table_schema text;
  owned_table_name text;
  owned_column_name text;
  dependency_type "char";
  column_default text;
  current_last_value bigint;
  current_is_called boolean;
  table_max bigint;
  intended_next bigint;
begin
  if to_regclass('public.biopsies') is null
     or to_regclass('public.biopsies_pk_biopsy_id_seq') is null then
    raise exception 'biopsy primary-key sequence prerequisite mismatch';
  end if;

  select
    format_type(s.seqtypid, null) as data_type,
    s.seqincrement as increment_by,
    s.seqmin as min_value,
    s.seqmax as max_value,
    s.seqstart as start_value,
    s.seqcache as cache_size,
    s.seqcycle as is_cycled,
    pg_get_userbyid(c.relowner) as owner_name,
    coalesce(c.relacl::text, '') as acl
  into strict sequence_row
  from pg_class c
  join pg_sequence s on s.seqrelid = c.oid
  where c.oid = 'public.biopsies_pk_biopsy_id_seq'::regclass
    and c.relkind = 'S';

  select n.nspname, t.relname, a.attname, d.deptype
  into strict owned_table_schema, owned_table_name, owned_column_name,
              dependency_type
  from pg_depend d
  join pg_class t on t.oid = d.refobjid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_attribute a
    on a.attrelid = t.oid
   and a.attnum = d.refobjsubid
   and not a.attisdropped
  where d.classid = 'pg_class'::regclass
    and d.objid = 'public.biopsies_pk_biopsy_id_seq'::regclass
    and d.refclassid = 'pg_class'::regclass
    and d.deptype in ('a', 'i');

  select pg_get_expr(ad.adbin, ad.adrelid)
  into strict column_default
  from pg_attrdef ad
  join pg_attribute a
    on a.attrelid = ad.adrelid
   and a.attnum = ad.adnum
  where ad.adrelid = 'public.biopsies'::regclass
    and a.attname = 'pk_biopsy_id';

  select q.last_value, q.is_called
  into strict current_last_value, current_is_called
  from public.biopsies_pk_biopsy_id_seq q;

  select max(b.pk_biopsy_id)
  into table_max
  from public.biopsies b;

  if sequence_row.data_type <> 'bigint'
     or sequence_row.increment_by <> 1
     or sequence_row.min_value <> 1
     or sequence_row.max_value <> 9223372036854775807
     or sequence_row.start_value <> 1
     or sequence_row.cache_size <> 1
     or sequence_row.is_cycled
     or sequence_row.owner_name <> 'postgres'
     or sequence_row.acl <>
       '{postgres=rwU/postgres,anon=r/postgres,authenticated=r/postgres,service_role=rwU/postgres}'
     or owned_table_schema <> 'public'
     or owned_table_name <> 'biopsies'
     or owned_column_name <> 'pk_biopsy_id'
     or dependency_type <> 'a'
     or column_default <>
       'nextval(''biopsies_pk_biopsy_id_seq''::regclass)'
     or current_last_value <> 1
     or not current_is_called
     or table_max <> 1062 then
    raise exception 'biopsy primary-key sequence exact fingerprint mismatch';
  end if;

  intended_next := table_max + 1;
  if intended_next <= current_last_value then
    raise exception 'biopsy primary-key sequence refuses non-upward restart';
  end if;

  execute format(
    'alter sequence public.biopsies_pk_biopsy_id_seq restart with %s',
    intended_next
  );

  select q.last_value, q.is_called
  into strict current_last_value, current_is_called
  from public.biopsies_pk_biopsy_id_seq q;

  if current_last_value <> intended_next
     or current_is_called
     or exists (
       select 1
       from public.biopsies b
       where b.pk_biopsy_id = intended_next
     )
     or (select max(b.pk_biopsy_id) from public.biopsies b) <> table_max then
    raise exception 'biopsy primary-key sequence postcondition mismatch';
  end if;
end
$migration$;

commit;
