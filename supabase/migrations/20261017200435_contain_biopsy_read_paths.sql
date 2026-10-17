-- Batch 3E-B: apply ONLY after the RPC-based frontend is verified live.
-- Stale clients may fail closed; do not restore privileges for stale tabs.
begin;
alter table public.biopsies enable row level security;
create policy biopsies_active_catalog_read on public.biopsies
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active is true
      and p.role in ('user', 'admin')
  ));
revoke select on public.biopsies from authenticated;
grant select (pk_biopsy_id, fk_catalog_id, fk_sighting_id, sample_date, sample_time, collector, island, region, location)
  on public.biopsies to authenticated;

-- Deny every audited descendant, including upper owner-security views.
-- Definitions/ownership/service-role grants remain unchanged.
revoke all privileges on public.kona_biopsy_age_rank_view from authenticated;
revoke all privileges on public.kona_biopsy_age_rank_view_v2 from authenticated;
revoke all privileges on public.qc_merge_refs_to_retired_catalog_v from authenticated;
revoke all privileges on public.kona_parentage_priors from authenticated;
revoke all privileges on public.kona_biopsy_rank_comparison from authenticated;
revoke all privileges on public.kona_biopsy_age_rank_diag_v1 from authenticated;
revoke all privileges on public.kona_biopsy_age_rank_view_v2_full from authenticated;
revoke all privileges on public.kona_biopsy_age_rank_view_v3 from authenticated;
revoke all privileges on public.qc_issue_summary_v from authenticated;
revoke all privileges on public.kona_biopsy_all_samples_v2 from authenticated;
revoke all privileges on public.kona_biopsy_all_samples_v3_export from authenticated;

commit;
