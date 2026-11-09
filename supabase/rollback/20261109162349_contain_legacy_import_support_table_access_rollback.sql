-- EMERGENCY ONLY: restores unnecessary authenticated browser exposure.
-- Anon remains denied; service_role is unchanged.

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.import_logs TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.mprf_manta_map TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.mprf_sighting_map TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.photos_filenames_cleaned_integer_ids TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.stg_jonathan_whiteny_biopsies TO authenticated;
