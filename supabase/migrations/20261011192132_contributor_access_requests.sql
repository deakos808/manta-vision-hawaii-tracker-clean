begin;

create table public.contributor_access_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null check (length(btrim(full_name)) between 1 and 120 and full_name !~ '[<>]'),
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  organization text check (length(organization) <= 200 and organization !~ '[<>]'),
  regions text[] not null check (cardinality(regions) between 1 and 3 and array_position(regions, null) is null and regions <@ array['Maui Nui', 'Oʻahu', 'Kauaʻi / Niʻihau']::text[]),
  photo_count_range text check (photo_count_range in ('1–5', '6–20', '21–50', '51–100', '100+')),
  earliest_year integer check (earliest_year between 1826 and extract(year from current_date)::integer),
  experience_notes text check (length(experience_notes) <= 2000 and experience_notes !~ '[<>]'),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'invited', 'declined')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  admin_notes text check (length(admin_notes) <= 2000)
);
create index contributor_access_requests_pending_email on public.contributor_access_requests (email, created_at desc) where status = 'pending';
create index contributor_access_requests_created on public.contributor_access_requests (created_at desc);
alter table public.contributor_access_requests enable row level security;
revoke all on public.contributor_access_requests from public, anon, authenticated;
grant select on public.contributor_access_requests to authenticated;
grant update (status, reviewed_at, reviewed_by, admin_notes) on public.contributor_access_requests to authenticated;
grant select, insert on public.contributor_access_requests to service_role;
create policy contributor_requests_admin_select on public.contributor_access_requests for select to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and is_active is true));
create policy contributor_requests_admin_update on public.contributor_access_requests for update to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and is_active is true))
  with check (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and is_active is true));

-- Service-only atomic receipt. No Auth lookup, user creation, invitation, or scientific writes.
-- Serialize by normalized email so simultaneous POSTs cannot create duplicate rows/emails.
create function public.receive_contributor_access_request(request jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare request_id uuid; normalized_email text := lower(btrim(request->>'email'));
begin
  perform pg_advisory_xact_lock(hashtextextended(normalized_email, 0));
  if exists (select 1 from public.contributor_access_requests
    where email = normalized_email and status = 'pending' and created_at >= now() - interval '24 hours') then
    return null;
  end if;
  insert into public.contributor_access_requests (full_name, email, organization, regions, photo_count_range, earliest_year, experience_notes)
  values (request->>'full_name', normalized_email, request->>'organization',
    array(select jsonb_array_elements_text(request->'regions')), request->>'photo_count_range',
    (request->>'earliest_year')::integer, request->>'experience_notes') returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.receive_contributor_access_request(jsonb) from public, anon, authenticated;
grant execute on function public.receive_contributor_access_request(jsonb) to service_role;
commit;
