-- DISPOSABLE PostgreSQL ONLY. Reuses real Phase C and Phase A implementations.
\i supabase/tests/fixtures/external_photo_measurements.sql
\i supabase/migrations/20261014224714_persist_external_photo_measurements.sql
create role service_role bypassrls;
create schema private;
grant usage on schema public, auth, private to anon, authenticated, service_role;
create or replace function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table profiles(id uuid primary key, role text, is_active boolean);
insert into profiles values
 ('11111111-1111-4111-8111-111111111111','admin',true),
 ('22222222-2222-4222-8222-222222222222','user',true),
 ('33333333-3333-4333-8333-333333333333','admin',false);
alter table sighting_submissions add column submitted_by uuid,
 add column email text, add column manta_count integer, add column photo_count integer,
 add column rejected_at timestamptz;
-- Biopsy delegation is out of scope; fail loudly if a fixture accidentally uses it.
create function commit_sighting_submission_with_biopsies(uuid) returns void language plpgsql as $$
 begin raise exception 'Unexpected biopsy branch in size-only fixture'; end $$;
\i supabase/migrations/20261013055511_edit_pending_sighting_submissions.sql
\i supabase/migrations/20261014074119_return_pending_edit_conflicts_without_retry.sql
alter table manta_sizes add column fk_catalog_id integer;
CREATE OR REPLACE FUNCTION public.set_manta_size_catalog_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.fk_manta_id is null then
    new.fk_catalog_id := null;
  else
    select m.fk_catalog_id
      into new.fk_catalog_id
    from public.mantas m
    where m.pk_manta_id = new.fk_manta_id;
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_manta_size_catalog_id_from_manta()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  update public.manta_sizes
  set fk_catalog_id = new.fk_catalog_id
  where fk_manta_id = new.pk_manta_id
    and fk_catalog_id is distinct from new.fk_catalog_id;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and is_active is true
  );
$function$
;
create trigger trg_set_manta_size_catalog_id before insert or update of fk_manta_id on manta_sizes
 for each row execute function set_manta_size_catalog_id();
create trigger trg_sync_manta_size_catalog_id_from_manta after update of fk_catalog_id on mantas
 for each row when(old.fk_catalog_id is distinct from new.fk_catalog_id)
 execute function sync_manta_size_catalog_id_from_manta();
revoke all on function set_manta_size_catalog_id(), sync_manta_size_catalog_id_from_manta() from public,anon,authenticated;
grant execute on function set_manta_size_catalog_id(), sync_manta_size_catalog_id_from_manta() to service_role;
create table photo_measurements(pk_measure_id bigint primary key, photo_id integer references photos,
 is_size_image boolean, scale_actual_cm numeric, scale_px numeric, disc_len_px numeric,
 disc_len_cm numeric, disc_width_cm numeric, measured_by text, measured_at timestamptz,
 tool_version text, notes text);
alter table photos add column active_measure_id bigint references photo_measurements;
grant select,insert,update,delete on manta_sizes,photo_measurements to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- The helpers create synthetic pending rows as fixture owner, then approve using
-- authenticated + the active Admin JWT through the public revision-guarded API.
create function fixture_approve(sid uuid) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
 set local role authenticated;
 perform public.save_pending_sighting_submission(sid,0,'{}','commit');
 reset role;
end $$;
create or replace function public.test_commit(photos jsonb,manual numeric default 8) returns integer language plpgsql as $$ declare sid uuid:=gen_random_uuid(); result integer; begin
 insert into public.sighting_submissions(id,sighting_date,payload) values(sid,'2026-10-14',jsonb_build_object('mantas',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'matchedCatalogId',733,'size',manual,'photos',photos))));
 perform public.fixture_approve(sid);
 select pk_manta_id into result from public.mantas where fk_sighting_id=(select committed_pk_sighting_id from public.sighting_submissions where id=sid);
 return result;
end $$;
create or replace function public.test_commit_sources(photos jsonb,estimate text,legacy text default null) returns integer language plpgsql as $$ declare sid uuid:=gen_random_uuid(); result integer; begin
 insert into public.sighting_submissions(id,sighting_date,payload) values(sid,'2026-10-14',jsonb_build_object('mantas',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'matchedCatalogId',733,'estimatedSize',estimate,'size',legacy,'photos',photos))));
 perform public.fixture_approve(sid);
 select pk_manta_id into result from public.mantas where fk_sighting_id=(select committed_pk_sighting_id from public.sighting_submissions where id=sid);
 return result;
end $$;

CREATE OR REPLACE FUNCTION public.merge_catalogs_tx(p_primary integer, p_secondary integer, p_delete_secondary_if_detached boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_primary int;
  v_secondary int;
  v_rc int := 0;

  v_best_flags_cleared int := 0;
  v_photos_moved int := 0;
  v_mantas_moved int := 0;
  v_photos_via_mantas_moved int := 0;
  v_embeddings_touched int := 0;

  v_sec_photo_cnt int := 0;
  v_sec_manta_cnt int := 0;
  v_secondary_deleted boolean := false;

  v_first date;
  v_last  date;
  v_total int;
begin
  if p_primary is null or p_secondary is null or p_primary = p_secondary then
    raise exception 'Invalid catalog IDs: primary=%, secondary=%', p_primary, p_secondary;
  end if;

  -- Always merge into the smaller id
  v_primary   := least(p_primary, p_secondary);
  v_secondary := greatest(p_primary, p_secondary);

  -- 1) Pre-clear secondary best flags (only if columns exist)
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='catalog' and column_name='best_cat_ventral_id') then
    update public.catalog set best_cat_ventral_id = null where pk_catalog_id = v_secondary;
    get diagnostics v_rc = ROW_COUNT;
    v_best_flags_cleared := v_best_flags_cleared + v_rc;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='catalog' and column_name='best_cat_dorsal_id') then
    update public.catalog set best_cat_dorsal_id = null where pk_catalog_id = v_secondary;
    get diagnostics v_rc = ROW_COUNT;
    v_best_flags_cleared := v_best_flags_cleared + v_rc;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='photos' and column_name='is_best_catalog_ventral_photo') then
    update public.photos set is_best_catalog_ventral_photo = false where fk_catalog_id = v_secondary;
    get diagnostics v_rc = ROW_COUNT;
    v_best_flags_cleared := v_best_flags_cleared + v_rc;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='photos' and column_name='is_best_catalog_dorsal_photo') then
    update public.photos set is_best_catalog_dorsal_photo = false where fk_catalog_id = v_secondary;
    get diagnostics v_rc = ROW_COUNT;
    v_best_flags_cleared := v_best_flags_cleared + v_rc;
  end if;

  -- 2) Move photos with direct ties
  update public.photos
     set fk_catalog_id = v_primary
   where fk_catalog_id = v_secondary;
  get diagnostics v_rc = ROW_COUNT;
  v_photos_moved := v_rc;

  -- 3) Move mantas
  update public.mantas
     set fk_catalog_id = v_primary
   where fk_catalog_id = v_secondary;
  get diagnostics v_rc = ROW_COUNT;
  v_mantas_moved := v_rc;

  -- 4) Backfill photos via mantas (covers photos missing/incorrect fk_catalog_id)
  update public.photos p
     set fk_catalog_id = v_primary
   where p.fk_manta_id in (
           select pk_manta_id from public.mantas where fk_catalog_id = v_primary
         )
     and (p.fk_catalog_id is distinct from v_primary or p.fk_catalog_id is null);
  get diagnostics v_rc = ROW_COUNT;
  v_photos_via_mantas_moved := v_rc;

  -- 5) Recompute summaries if catalog has those columns
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='catalog' and column_name='first_sighting') then
    select min(s.sighting_date), max(s.sighting_date), count(distinct m.fk_sighting_id)
      into v_first, v_last, v_total
      from public.mantas m
      left join public.sightings s on s.pk_sighting_id = m.fk_sighting_id
     where m.fk_catalog_id = v_primary;

    update public.catalog
       set first_sighting = v_first
     where pk_catalog_id = v_primary;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='catalog' and column_name='last_sighting') then
    update public.catalog
       set last_sighting = v_last
     where pk_catalog_id = v_primary;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='catalog' and column_name='total_sightings') then
    update public.catalog
       set total_sightings = coalesce(v_total, 0)
     where pk_catalog_id = v_primary;
  end if;

  -- 6) Best-effort: handle catalog_embeddings if it exists
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='catalog_embeddings') then
    begin
      update public.catalog_embeddings
         set pk_catalog_id = v_primary
       where pk_catalog_id = v_secondary;
      get diagnostics v_rc = ROW_COUNT;
      v_embeddings_touched := v_rc;
    exception when unique_violation then
      delete from public.catalog_embeddings where pk_catalog_id = v_secondary;
      get diagnostics v_rc = ROW_COUNT;
      v_embeddings_touched := v_embeddings_touched + v_rc;
    end;
  end if;

  -- 7) Optionally delete secondary if fully detached
  select count(*) into v_sec_photo_cnt from public.photos  where fk_catalog_id = v_secondary;
  select count(*) into v_sec_manta_cnt from public.mantas where fk_catalog_id = v_secondary;

  if p_delete_secondary_if_detached and v_sec_photo_cnt = 0 and v_sec_manta_cnt = 0 then
    delete from public.catalog where pk_catalog_id = v_secondary;
    v_secondary_deleted := found;
  end if;

  -- Optional: refresh matview if present
  if exists (select 1 from pg_matviews where schemaname='public' and matviewname='catalog_with_photo_view') then
    begin
      execute 'refresh materialized view concurrently public.catalog_with_photo_view';
    exception when others then
      execute 'refresh materialized view public.catalog_with_photo_view';
    end;
  end if;

  return jsonb_build_object(
    'primary_pk_catalog_id', v_primary,
    'secondary_pk_catalog_id', v_secondary,
    'best_flags_cleared', v_best_flags_cleared,
    'photos_moved', v_photos_moved,
    'mantas_moved', v_mantas_moved,
    'photos_via_mantas_moved', v_photos_via_mantas_moved,
    'embeddings_touched', v_embeddings_touched,
    'secondary_deleted', v_secondary_deleted
  );
end
$function$
;
revoke all on function merge_catalogs_tx(integer,integer,boolean) from public,anon,authenticated;
grant execute on function merge_catalogs_tx(integer,integer,boolean) to service_role;
-- Mirror the effective existing catalog-reassignment column grant and Admin RLS.
grant select on mantas to authenticated;
grant update(fk_catalog_id) on mantas to authenticated;
alter table mantas enable row level security;
create policy mantas_authenticated_select on mantas for select to authenticated using(true);
create policy mantas_admin_all on mantas for all to authenticated using(is_admin_user()) with check(is_admin_user());

-- Snapshot normalizes ACL order, and captures table data, definitions, owners,
-- RLS/policies, triggers, all fixture function definitions and service privileges.
create function fixture_snapshot(include_acl boolean) returns jsonb language sql as $$
 select jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner,
 'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
 'acl',case when include_acl then (select jsonb_agg(to_jsonb(a) order by grantee,privilege_type) from aclexplode(c.relacl) a) end,
 'service',(select jsonb_agg(to_jsonb(a) order by privilege_type) from aclexplode(c.relacl) a where grantee='service_role'::regrole),
 'columns',(select jsonb_agg(to_jsonb(a) order by attnum) from pg_attribute a where attrelid=c.oid and attnum>0),
 'constraints',(select jsonb_agg(pg_get_constraintdef(oid) order by conname) from pg_constraint where conrelid=c.oid),
 'policies',(select jsonb_agg(to_jsonb(p) order by polname) from pg_policy p where polrelid=c.oid),
 'triggers',(select jsonb_agg(pg_get_triggerdef(oid) order by tgname) from pg_trigger where tgrelid=c.oid and not tgisinternal)) order by c.relname)
 from pg_class c where c.oid in ('manta_sizes'::regclass,'photo_measurements'::regclass)),
 'sizes',(select jsonb_agg(to_jsonb(s) order by pk_manta_size_id) from manta_sizes s),
 'photo_measurements',(select jsonb_agg(to_jsonb(p) order by pk_measure_id) from photo_measurements p),
 'functions',(select jsonb_agg(pg_get_functiondef(p.oid) order by p.oid) from pg_proc p where pronamespace in ('public'::regnamespace,'private'::regnamespace) and prokind='f'))
$$;
create table fixture_baseline as select fixture_snapshot(true) exact,fixture_snapshot(false) stable;
\i supabase/migrations/20261017165124_contain_permanent_measurement_access.sql
select assert_true(fixture_snapshot(false)=(select stable from fixture_baseline),'forward changes only target ACLs');

-- Execute actual DML/SELECT permission probes, not just privilege metadata.
create function fixture_denied(q text) returns boolean language plpgsql as $$ begin
 execute q; return false; exception when insufficient_privilege then return true; end $$;
create function fixture_role_probes() returns void language plpgsql as $$ declare t text; p text; begin
 foreach t in array array['manta_sizes','photo_measurements'] loop
  foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
   perform assert_true(not has_table_privilege(current_user,t,p),current_user||' no '||p||' on '||t);
  end loop;
  perform assert_true(fixture_denied('select * from '||t),current_user||' SELECT rejected '||t);
  perform assert_true(fixture_denied('insert into '||t||' default values'),current_user||' INSERT rejected '||t);
  perform assert_true(fixture_denied('update '||t||' set size_m=0'),current_user||' UPDATE rejected '||t) where t='manta_sizes';
  perform assert_true(fixture_denied('update '||t||$q$ set notes='test'$q$),current_user||' UPDATE rejected '||t) where t='photo_measurements';
  perform assert_true(fixture_denied('delete from '||t),current_user||' DELETE rejected '||t);
 end loop;
end $$;
set role anon;
select fixture_role_probes();
reset role;
set role authenticated;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select fixture_role_probes();
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select fixture_role_probes();
set request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
select fixture_role_probes();
reset role;

-- Existing Phase C assertions now ALL approve through the guarded Admin API.
begin;
\i supabase/tests/external_photo_measurements.sql
-- Service role can still reassign the encounter; invoker trigger carries its role.
insert into catalog values(732,'Synthetic reassignment','mobula alfredi');
select test_commit(jsonb_build_array(test_photo('dw',3.14))) as reassign \gset
set local role authenticated;
select assert_true(fixture_denied('update mantas set fk_catalog_id=732 where pk_manta_id='||:reassign),'direct Admin reassignment fails closed at invoker evidence trigger');
select assert_true(not has_function_privilege(current_user,'merge_catalogs_tx(integer,integer,boolean)','execute'),'browser cannot invoke internal merge RPC');
reset role;
set local role service_role;
select merge_catalogs_tx(732,733,false);
select assert_true((select bool_and(fk_catalog_id=732) from manta_sizes where fk_manta_id=:reassign),'service reassignment trigger synchronizes evidence');
insert into photo_measurements(pk_measure_id,notes) values(1,'synthetic');
update photo_measurements set notes='revised' where pk_measure_id=1;
select assert_true((select notes='revised' from photo_measurements where pk_measure_id=1),'service legacy table CRUD retained');
delete from photo_measurements where pk_measure_id=1;
reset role;
rollback;

begin;
insert into sighting_submissions(id,submitted_by,sighting_date,payload) values
 ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','2026-10-14',
 jsonb_build_object('mantas',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'matchedCatalogId',733,'estimatedSize','9','photos',jsonb_build_array(test_photo('dw',3.14))))));
set local role authenticated;
set local request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select assert_true(save_pending_sighting_submission('44444444-4444-4444-8444-444444444444',0,'{"notes":"reopened evidence"}','save')->>'revision'='1','contributor edits pending evidence');
select assert_true(fixture_denied($q$select save_pending_sighting_submission('44444444-4444-4444-8444-444444444444',1,'{}','commit')$q$),'contributor cannot approve');
do $$ begin
 perform save_pending_sighting_submission('44444444-4444-4444-8444-444444444444',0,'{}','save');
 raise exception 'stale revision incorrectly accepted';
 exception when sqlstate 'PT409' then raise notice 'PASS: stale revision remains PT409'; end $$;
set local request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
select assert_true(fixture_denied($q$select save_pending_sighting_submission('44444444-4444-4444-8444-444444444444',1,'{}','commit')$q$),'inactive admin cannot approve');
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select assert_true(save_pending_sighting_submission('44444444-4444-4444-8444-444444444444',1,'{}','commit')->>'status'='committed','active admin approves edited evidence');
reset role;
select assert_true((select edit_revision=2 and payload->>'notes'='reopened evidence' and payload#>>'{mantas,0,estimatedSize}'='9' and payload#>>'{mantas,0,photos,0,measure,valueMeters}'='3.14' from sighting_submissions where id='44444444-4444-4444-8444-444444444444'),'reopen preserves pending evidence and estimate');
rollback;
-- Remove test-only probe routines added after the schema baseline.
drop function fixture_role_probes();
drop function fixture_denied(text);
\i supabase/rollback/20261017165124_contain_permanent_measurement_access_rollback.sql
select assert_true(fixture_snapshot(true)=(select exact from fixture_baseline),'rollback restores exact prior ACL/data/definition/owner/RLS/functions/triggers');
\i supabase/migrations/20261017165124_contain_permanent_measurement_access.sql
select assert_true(fixture_snapshot(false)=(select stable from fixture_baseline),'reapply preserves data/definitions/server privileges');
select assert_true(not has_table_privilege('authenticated','manta_sizes','select,insert,update,delete') and not has_table_privilege('authenticated','photo_measurements','select,insert,update,delete'),'reapply restores containment');
