REVOKE ALL PRIVILEGES ON TABLE public.biopsy_relatedness_review
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.kona_age_at_biopsy_legacy
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.kona_biopsy_age_rank
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.stg_biopsies_main
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.stg_biopsies_mprf_raw
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.stg_corey_kona_catalog
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.stg_corey_kona_catalog_raw
FROM anon, authenticated;
