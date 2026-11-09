REVOKE ALL PRIVILEGES ON TABLE public.import_logs
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.mprf_manta_map
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.mprf_sighting_map
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.photos_filenames_cleaned_integer_ids
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.stg_jonathan_whiteny_biopsies
FROM anon, authenticated;
