-- DRAFT ONLY: not applied. Reverses only the new size-evidence contract.
-- WARNING: if used after new evidence is stored, dropping these columns loses that
-- new contract data. Preserve it separately before a future authorized rollback.
-- Existing manta_sizes columns, rows, legacy provenance and row_sig remain intact.
BEGIN;
DROP INDEX public.manta_sizes_source_photo_id_idx;
ALTER TABLE public.manta_sizes
  DROP CONSTRAINT manta_sizes_measurement_evidence_object_check,
  DROP CONSTRAINT manta_sizes_standardized_dw_m_check,
  DROP CONSTRAINT manta_sizes_measurement_method_check,
  DROP CONSTRAINT manta_sizes_source_photo_id_fkey,
  DROP COLUMN measurement_evidence,
  DROP COLUMN standardized_dw_m,
  DROP COLUMN measurement_method,
  DROP COLUMN source_photo_id;
COMMIT;
