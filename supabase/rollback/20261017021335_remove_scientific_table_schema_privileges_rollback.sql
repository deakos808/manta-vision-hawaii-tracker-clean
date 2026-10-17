-- Emergency reversal: restores the prior unnecessary privileges.
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.biopsies TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.manta_sizes TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.photo_measurements TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.calibration_sessions TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.calibration_photos TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.calibration_measurements TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.manta_embeddings TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.photo_embeddings TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.sighting_embeddings TO authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.manta_match_results TO authenticated;
