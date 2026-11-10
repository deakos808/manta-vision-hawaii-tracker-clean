-- EMERGENCY ONLY: restores unnecessary authenticated browser exposure.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.sightings_import_stage TO authenticated;
