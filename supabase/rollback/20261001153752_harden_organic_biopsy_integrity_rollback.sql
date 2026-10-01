-- Fail-closed rollback: security and parent-integrity guards are deliberately
-- retained. Reversing them would reopen direct correlation writes or allow
-- contradictory biopsy parent references.

\set ON_ERROR_STOP on
begin;

do $fingerprint$
begin
  if to_regprocedure('private.prevent_submission_manta_id_change()') is null
     or to_regprocedure('private.validate_biopsy_parent_consistency()') is null
     or to_regprocedure('public.commit_sighting_submission(uuid)') is null then
    raise exception 'organic biopsy hardening rollback fingerprint mismatch';
  end if;
end
$fingerprint$;

revoke all on function public.commit_sighting_submission(uuid)
  from public, anon, service_role;
grant execute on function public.commit_sighting_submission(uuid) to authenticated;
revoke insert (submission_manta_id), update (submission_manta_id) on public.mantas
  from public, anon, authenticated;

do $postcondition$
begin
  if has_function_privilege('anon', 'public.commit_sighting_submission(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.commit_sighting_submission(uuid)', 'EXECUTE')
     or has_column_privilege(
       'authenticated', 'public.mantas', 'submission_manta_id', 'UPDATE'
     ) then
    raise exception 'fail-closed organic biopsy hardening rollback failed';
  end if;
end
$postcondition$;

notify pgrst, 'reload schema';
commit;
