-- Restore the exact six authenticated privileges removed by Batch 0A.
-- WARNING: this deliberately restores the known owner-view write bypass.
-- SELECT and all other role grants are unchanged in both directions.
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.catalog_no_mprf TO authenticated;
