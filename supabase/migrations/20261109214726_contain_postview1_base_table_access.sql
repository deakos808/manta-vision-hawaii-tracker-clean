REVOKE ALL PRIVILEGES ON TABLE public.kona_biopsy_consolidated
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public._bak_all_session
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.mantas_import_stage
FROM anon, authenticated;
