-- Forward-only safety correction. The sequence must never be moved backward.
-- If a release rollback requires fail-closed behavior, disable both sighting
-- commit entry points without changing any record or restoring the collision.

begin;

lock table public.biopsies in share row exclusive mode;

do $fingerprint$
declare
  sequence_last bigint;
  sequence_called boolean;
  sequence_increment bigint;
  table_max bigint;
begin
  select max(b.pk_biopsy_id) into table_max from public.biopsies b;
  select s.seqincrement into strict sequence_increment
  from pg_sequence s
  where s.seqrelid = 'public.biopsies_pk_biopsy_id_seq'::regclass;
  select q.last_value, q.is_called
    into strict sequence_last, sequence_called
  from public.biopsies_pk_biopsy_id_seq q;

  if to_regprocedure('public.commit_sighting_submission(uuid)') is null
     or to_regprocedure(
       'public.commit_sighting_submission_with_biopsies(uuid)'
     ) is null
     or sequence_increment <> 1
     or (case when sequence_called then sequence_last + sequence_increment
              else sequence_last end) <= table_max then
    raise exception 'biopsy sequence rollback fingerprint mismatch';
  end if;
end
$fingerprint$;

revoke all on function public.commit_sighting_submission(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.commit_sighting_submission_with_biopsies(uuid)
  from public, anon, authenticated, service_role;

do $postcondition$
begin
  if has_function_privilege(
       'anon', 'public.commit_sighting_submission(uuid)', 'EXECUTE'
     )
     or has_function_privilege(
       'authenticated', 'public.commit_sighting_submission(uuid)', 'EXECUTE'
     )
     or has_function_privilege(
       'service_role', 'public.commit_sighting_submission(uuid)', 'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.commit_sighting_submission_with_biopsies(uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.commit_sighting_submission_with_biopsies(uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.commit_sighting_submission_with_biopsies(uuid)',
       'EXECUTE'
     ) then
    raise exception 'biopsy sequence rollback did not fail closed';
  end if;
end
$postcondition$;

commit;
