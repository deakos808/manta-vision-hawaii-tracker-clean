-- EMERGENCY REVERSAL ONLY: restores unnecessary authenticated client exposure.
-- Prior anon ACL was empty and remains empty. Restore only captured authenticated grants.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.biopsies_backup_20251122 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.biopsies_backup_20251124 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.biopsies_backup_20251125 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.biopsies_backup_20260323__mprf_dedupe_complete TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.biopsies_backup_before_delete_70_20251127 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.biopsies_backup_hamer_fk_sighting_20251127 TO authenticated;
