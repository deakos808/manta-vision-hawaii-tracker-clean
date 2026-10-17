-- EMERGENCY ONLY: restores broad authenticated biopsy/table and owner-view exposure.
-- Prefer a forward fix after frontend release. Keeps Stage A RPCs intact.
begin;
revoke select (pk_biopsy_id, fk_catalog_id, fk_sighting_id, sample_date, sample_time, collector, island, region, location) on public.biopsies from authenticated;
grant select on public.biopsies to authenticated;
drop policy biopsies_active_catalog_read on public.biopsies;
alter table public.biopsies disable row level security;
grant select, insert, update, delete, truncate, references, trigger on public.kona_biopsy_age_rank_view to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.kona_biopsy_age_rank_view_v2 to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.qc_merge_refs_to_retired_catalog_v to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.kona_parentage_priors to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.kona_biopsy_rank_comparison to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.kona_biopsy_age_rank_diag_v1 to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.kona_biopsy_age_rank_view_v2_full to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.kona_biopsy_age_rank_view_v3 to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.qc_issue_summary_v to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.kona_biopsy_all_samples_v2 to authenticated;
grant select, insert, update, delete, truncate, references, trigger on public.kona_biopsy_all_samples_v3_export to authenticated;
commit;
