-- Roll back together with the Phase A frontend. Submission contents remain intact.
begin;
drop function public.pending_submission_edit_protocol();
-- Exact pre-cutover browser execution grants; PUBLIC/anon stay revoked.
grant execute on function public.commit_sighting_submission(uuid) to authenticated;
grant execute on function public.commit_sighting_submission_with_biopsies(uuid) to authenticated;
drop function public.save_pending_sighting_submission(uuid,integer,jsonb,text);
drop function private.save_pending_sighting_submission(uuid,integer,jsonb,text);
drop trigger guard_submission_revision_writes on public.sighting_submissions;
drop function private.guard_submission_revision_writes();
alter table public.sighting_submissions drop column edit_revision;
-- private schema USAGE is pre-existing; do not revoke it from other workflows.
commit;
