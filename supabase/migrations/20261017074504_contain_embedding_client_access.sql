-- Batch 3B-1: remove ordinary-client access to server-owned embedding stores.
-- Preserve service_role, owners, definitions, RLS and all data.
REVOKE ALL PRIVILEGES ON TABLE public.manta_embeddings FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.photo_embeddings FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.vw_manta_embeddings_uuid FROM anon, authenticated;
