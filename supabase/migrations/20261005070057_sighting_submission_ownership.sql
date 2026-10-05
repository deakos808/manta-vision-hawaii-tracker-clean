-- Draft only. Apply separately after review; no RPC or Storage changes.
-- Baseline: RLS disabled, no policies or column ACLs; anon/authenticated
-- have SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER.
begin;

-- Stop on policy/column-grant drift rather than retain a permissive escape hatch.
do $$
begin
  if exists (
    select 1 from pg_class
    where oid = 'public.sighting_submissions'::regclass
      and (relrowsecurity or relforcerowsecurity)
  ) or exists (
    select 1 from pg_policy
    where polrelid = 'public.sighting_submissions'::regclass
  ) or exists (
    select 1 from pg_attribute
    where attrelid = 'public.sighting_submissions'::regclass
      and attnum > 0 and not attisdropped and attacl is not null
  ) then
    raise exception 'Submission access baseline changed; review migration and rollback';
  end if;
end $$;

-- Add WITHOUT a default first: never assign historical rows to the applying user.
-- NO ACTION on auth-user deletion preserves attribution and scientific rows.
alter table public.sighting_submissions
  add column submitted_by uuid references auth.users(id);
alter table public.sighting_submissions
  alter column submitted_by set default auth.uid();
create index sighting_submissions_submitted_by_idx
  on public.sighting_submissions (submitted_by);

alter table public.sighting_submissions enable row level security;
revoke all privileges on table public.sighting_submissions from anon, authenticated;
grant select, insert, update on table public.sighting_submissions to authenticated;
-- service_role grants and bypass behavior are intentionally unchanged.

create policy submissions_insert_own_pending
on public.sighting_submissions for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'pending'
  and reviewer_email is null
  and reviewed_at is null
  and committed_at is null
  and rejected_at is null
  and reject_reason is null
  and committed_pk_sighting_id is null
  and exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and is_active is true and role in ('user', 'admin')
  )
);

create policy submissions_select_own
on public.sighting_submissions for select to authenticated
using (
  submitted_by = (select auth.uid())
  and exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and is_active is true and role in ('user', 'admin')
  )
);

-- Existing helper checks the current profile, not user-editable JWT metadata.
create policy submissions_admin_select
on public.sighting_submissions for select to authenticated
using ((select public.is_admin_user()));

create policy submissions_admin_update
on public.sighting_submissions for update to authenticated
using ((select public.is_admin_user()))
with check ((select public.is_admin_user()));

-- No client DELETE policy/grant. UPDATE is granted to the shared authenticated
-- database role solely for admins; ordinary users have no matching UPDATE policy.
-- SECURITY DEFINER commit RPC authorization is a separate, still-required task.
commit;
