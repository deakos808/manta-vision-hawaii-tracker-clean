REVOKE ALL PRIVILEGES ON TABLE public.kona_biopsy_audit
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.sightings_location_audit
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.v_mantas_import_stage_typed
FROM anon, authenticated;
