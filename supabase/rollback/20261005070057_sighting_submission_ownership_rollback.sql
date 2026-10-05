-- Restores the inspected pre-migration access baseline, including its broad
-- client access. Deliberate rollback only; this reopens the prior RLS exposure.
begin;

drop policy submissions_insert_own_pending on public.sighting_submissions;
drop policy submissions_select_own on public.sighting_submissions;
drop policy submissions_admin_select on public.sighting_submissions;
drop policy submissions_admin_update on public.sighting_submissions;
alter table public.sighting_submissions disable row level security;

revoke all privileges on table public.sighting_submissions from anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on table public.sighting_submissions to anon, authenticated;
-- Prior state had no policies or column ACLs. service_role is unchanged.
drop index public.sighting_submissions_submitted_by_idx;
alter table public.sighting_submissions drop column submitted_by;

commit;
