REVOKE ALL PRIVILEGES ON TABLE public._mprf_repoint_plan
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.manta_csv_stage
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.manta_remap_queue_20260323
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.mantas_bisect_log
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.mantas_extra_photos
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.mantas_extra_quarantine
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.mprf_manta_reconstruction_candidates_20260322
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.stg_mprf_sightings_full
FROM anon, authenticated;
