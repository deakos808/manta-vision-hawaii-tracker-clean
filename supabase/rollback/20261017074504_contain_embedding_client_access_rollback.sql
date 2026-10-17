-- Emergency reversal only: restores unnecessary direct authenticated access.
-- Exact pre-Batch-3B-1 grants. Anon remains denied; service_role is untouched.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.manta_embeddings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.photo_embeddings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.vw_manta_embeddings_uuid TO authenticated;
