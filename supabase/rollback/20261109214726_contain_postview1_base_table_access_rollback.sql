-- EMERGENCY ONLY: restores unnecessary authenticated browser exposure.
-- Anon remains denied; service_role is unchanged.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.kona_biopsy_consolidated TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public._bak_all_session TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.mantas_import_stage TO authenticated;
