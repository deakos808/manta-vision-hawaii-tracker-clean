-- Roll back only before collecting real requests; never silently discard applicants.
begin;
do $$ begin
  if exists (select 1 from public.contributor_access_requests) then
    raise exception 'Contributor requests exist; export/preserve them before rollback';
  end if;
end $$;
drop function public.receive_contributor_access_request(jsonb);
drop table public.contributor_access_requests;
commit;
