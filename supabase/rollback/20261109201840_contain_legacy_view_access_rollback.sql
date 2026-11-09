-- EMERGENCY ONLY: restores unnecessary browser read/mutation exposure.
-- Anon stays denied; service_role grants are not changed.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.kona_biopsy_audit TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.sightings_location_audit TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.v_mantas_import_stage_typed TO authenticated;
