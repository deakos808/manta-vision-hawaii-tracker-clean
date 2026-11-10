REVOKE ALL PRIVILEGES ON TABLE public.qc_conflicting_survey_ids
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.qc_duplicate_survey_ids
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.v_sightings_import_stage_typed
FROM anon, authenticated;
