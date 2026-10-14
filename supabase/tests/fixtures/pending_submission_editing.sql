-- Disposable test fixture only; contains stub scientific commit functions. Never apply live.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema private;
grant usage on schema auth, private to authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table auth.users(id uuid primary key);
create table public.profiles(id uuid primary key, role text, is_active boolean);
create function public.is_admin_user() returns boolean language sql security definer as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and is_active) $$;
create table public.sighting_submissions(id uuid primary key default gen_random_uuid(), submitted_at timestamptz not null default now(), email text not null, sighting_date date, manta_count integer not null default 0, photo_count integer not null default 0, payload jsonb, status text not null default 'pending', reviewer_email text, reviewed_at timestamptz, committed_at timestamptz, rejected_at timestamptz, reject_reason text, committed_pk_sighting_id integer);
grant select on public.profiles to authenticated;
-- Existing scientific commit calls are replaced ONLY in this disposable fixture.
create table public.test_commit_calls(kind text);
create function public.commit_sighting_submission(sub_id uuid) returns void language plpgsql as $$ begin
 if (select payload->>'notes' from public.sighting_submissions where id=sub_id) = 'fail approval' then raise exception 'synthetic approval failure'; end if;
 insert into public.test_commit_calls values ('base');
 update public.sighting_submissions set status='committed', committed_at=now(), committed_pk_sighting_id=1 where id=sub_id;
end $$;
create function public.commit_sighting_submission_with_biopsies(sub_id uuid) returns void language plpgsql as $$ begin
 perform public.commit_sighting_submission(sub_id); insert into public.test_commit_calls values ('biopsy');
end $$;

-- Mirror current Production entrypoint ACLs and definer execution.
alter function public.commit_sighting_submission(uuid) security definer;
alter function public.commit_sighting_submission_with_biopsies(uuid) security definer;
revoke all on function public.commit_sighting_submission(uuid) from public, anon, authenticated;
revoke all on function public.commit_sighting_submission_with_biopsies(uuid) from public, anon, authenticated;
grant execute on function public.commit_sighting_submission(uuid) to authenticated;
grant execute on function public.commit_sighting_submission_with_biopsies(uuid) to authenticated;
