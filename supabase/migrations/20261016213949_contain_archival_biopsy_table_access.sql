-- Batch 1: six reviewed internal biopsy snapshots. Preserve owner/service access.
REVOKE ALL PRIVILEGES ON TABLE public.biopsies_backup_20251122 FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.biopsies_backup_20251124 FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.biopsies_backup_20251125 FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.biopsies_backup_20260323__mprf_dedupe_complete FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.biopsies_backup_before_delete_70_20251127 FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.biopsies_backup_hamer_fk_sighting_20251127 FROM anon, authenticated;
