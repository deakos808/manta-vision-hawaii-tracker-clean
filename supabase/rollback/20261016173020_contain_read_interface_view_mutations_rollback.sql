-- EMERGENCY REVERSAL ONLY: restores unnecessary authenticated mutation privileges.
-- Exact prior grants captured during Batch 0B preparation; SELECT is unchanged.
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.manta_match_results_view TO authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.mantas_missing_sighting TO authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.v_sizes_manta_rows_v1 TO authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.stg_v_catalog_type_warnings TO authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.v_temp_drone_sightings_summary TO authenticated;
