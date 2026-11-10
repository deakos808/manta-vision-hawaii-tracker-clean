-- EMERGENCY ONLY: restores unnecessary authenticated browser exposure.
-- Anon remains denied; service_role is unchanged.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.qc_conflicting_survey_ids TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.qc_duplicate_survey_ids TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.v_sightings_import_stage_typed TO authenticated;
