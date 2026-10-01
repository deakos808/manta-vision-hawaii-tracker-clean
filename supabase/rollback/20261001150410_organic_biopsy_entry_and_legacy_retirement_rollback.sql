-- Fail-closed rollback: disable organic biopsy submission and commit while
-- preserving every row and never restoring the legacy CSV importer.

\set ON_ERROR_STOP on
begin;

do $fingerprint$
begin
  if to_regprocedure('public.commit_sighting_submission_with_biopsies(uuid)') is null
     or to_regprocedure('private.validate_sighting_submission_biopsies()') is null
     or to_regprocedure('private.validate_committed_biopsy_mapping()') is null
     or to_regprocedure('public.fn_imports_commit_biopsies(uuid)') is not null
     or to_regprocedure('private.fn_imports_commit_biopsies_impl(uuid)') is not null
     or not exists (
       select 1 from pg_trigger
       where tgrelid = 'public.sighting_submissions'::regclass
         and tgname = 'trg_validate_sighting_submission_biopsies'
         and not tgisinternal
     ) then
    raise exception 'organic biopsy rollback fingerprint mismatch';
  end if;
end
$fingerprint$;

revoke all on function public.commit_sighting_submission_with_biopsies(uuid)
  from public, anon, authenticated, service_role;
drop function public.commit_sighting_submission_with_biopsies(uuid);

create or replace function private.validate_sighting_submission_biopsies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from jsonb_array_elements(coalesce(new.payload->'mantas', '[]'::jsonb)) item
    where item ? 'biopsy' and item->'biopsy' <> 'null'::jsonb
  ) or (
    tg_op = 'UPDATE' and exists (
      select 1
      from jsonb_array_elements(coalesce(old.payload->'mantas', '[]'::jsonb)) item
      where item ? 'biopsy' and item->'biopsy' <> 'null'::jsonb
    )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Biopsy submission is disabled pending reviewed remediation';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_sighting_submission_biopsies()
  from public, anon, authenticated, service_role;

revoke all on table public.stg_biopsies
  from public, anon, authenticated, service_role;
revoke all on sequence public.stg_biopsies_id_seq
  from public, anon, authenticated, service_role;
revoke all on table public.v_stg_biopsies_norm
  from public, anon, authenticated, service_role;
revoke all on table public.v_stg_invalid_biopsies
  from public, anon, authenticated, service_role;

-- Never reopen direct biopsy writes during rollback.
revoke insert, update, delete on table public.biopsies from public, anon, authenticated;
revoke usage, update on sequence public.biopsies_pk_biopsy_id_seq
  from public, anon, authenticated;

do $postcondition$
declare
  role_name text;
begin
  if to_regprocedure('public.commit_sighting_submission_with_biopsies(uuid)') is not null
     or to_regprocedure('public.fn_imports_commit_biopsies(uuid)') is not null
     or to_regprocedure('private.fn_imports_commit_biopsies_impl(uuid)') is not null then
    raise exception 'fail-closed biopsy rollback left an executable entry point';
  end if;
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(role_name, 'public.stg_biopsies', 'SELECT')
       or has_table_privilege(role_name, 'public.stg_biopsies', 'INSERT')
       or has_sequence_privilege(role_name, 'public.stg_biopsies_id_seq', 'USAGE')
       or has_table_privilege(role_name, 'public.v_stg_biopsies_norm', 'SELECT')
       or has_table_privilege(role_name, 'public.v_stg_invalid_biopsies', 'SELECT') then
      raise exception 'fail-closed biopsy staging access remains for %', role_name;
    end if;
  end loop;
  foreach role_name in array array['anon', 'authenticated'] loop
    if has_table_privilege(role_name, 'public.biopsies', 'INSERT')
       or has_table_privilege(role_name, 'public.biopsies', 'UPDATE')
       or has_table_privilege(role_name, 'public.biopsies', 'DELETE') then
      raise exception 'fail-closed direct biopsy write access remains for %', role_name;
    end if;
  end loop;
  if to_regprocedure('private.validate_committed_biopsy_mapping()') is null
     or not exists (
       select 1 from pg_trigger
       where tgrelid = 'public.sighting_submissions'::regclass
         and tgname = 'trg_validate_committed_biopsy_mapping'
         and tgdeferrable and tginitdeferred and not tgisinternal
     ) then
    raise exception 'fail-closed committed biopsy integrity guard is missing';
  end if;
end
$postcondition$;

notify pgrst, 'reload schema';
commit;
