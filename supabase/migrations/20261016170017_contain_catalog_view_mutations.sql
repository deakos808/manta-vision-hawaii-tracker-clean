-- Batch 0A: catalog_no_mprf is not a runtime mutation interface.
-- Preserve authenticated SELECT, owner/service_role grants, view definition and catalog RLS.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.catalog_no_mprf FROM authenticated;
