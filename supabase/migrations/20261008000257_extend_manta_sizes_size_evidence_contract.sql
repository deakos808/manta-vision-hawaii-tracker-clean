-- DRAFT ONLY: not applied. manta_sizes remains the ONE operational Size_ID table.
-- One pk_manta_size_id = one independent sizing event belonging to fk_manta_id.
-- A photo may support zero, one, or multiple sizing events. Photo roles are independent.
-- All existing columns, constraints, triggers, row_sig values and historical rows stay intact.
-- New columns are nullable with no defaults: legacy records acquire no inferred meaning.
--
-- FORWARD CONTRACT (new records only; no reinterpretation of old size_m values):
-- measurement_method describes the method; measurement_type describes the primary basis.
-- Current paired_laser: measurement_type = 'length', size_m = dlCm / 100,
-- standardized_dw_m = dwCm / 100, with dwCm = dlCm * 2.3.
-- Accepted direct DW: measurement_type = 'width', size_m = directDwCm / 100;
-- standardized_dw_m may equal that accepted direct DW. Never fill it automatically
-- for visual_estimate or ambiguous evidence. 'vertical' keeps its legacy meaning.
-- A combined DL + direct-DW event stays ONE Size_ID: DL is primary in the current
-- workflow; additional direct DW belongs in measurement_evidence, not a second row.
-- Existing measured_on is the evidence date, inserted_at the insertion timestamp,
-- quality_note the human annotation, and row_sig the existing unique import/event key.
-- Future writers must supply a stable event key; this draft does not change row_sig.
--
-- PROPOSED measurement_evidence v1 (documented writer contract, not a full JSON validator):
-- {
--   "version": "size-evidence-v1",
--   "scaleCm": 60,
--   "scalePx": 100,
--   "discPx": 200,
--   "dlCm": 120,
--   "dwCm": 276,
--   "points": [{"x":0.1,"y":0.1},{"x":0.2,"y":0.1},
--              {"x":0.5,"y":0.2},{"x":0.5,"y":0.4}],
--   "conversion": {"version":"dl-to-dw-2.3-v1","formula":"DW = DL * 2.3"},
--   "image": {"storageBucket":"manta-images",
--             "path":"submissions/<owner>/<draft>/<photo>/prepared-<edit-uuid>.jpg",
--             "originalPath":"submissions/<owner>/<draft>/<photo>/original.jpg",
--             "widthPx":1000,"heightPx":1000},
--   "toolVersion": "<measurement-tool-version>"
-- }
-- Values above are illustrative, not defaults. scaleCm is the actual entered spacing;
-- never infer historical spacing. All physical evidence uses explicit cm units;
-- typed size_m and standardized_dw_m use meters. scalePx/discPx use image pixels.
-- points are normalized to the exact image dimensions: first two = scale, last two = DL.
-- image.path identifies the immutable prepared image on which the points were placed;
-- originalPath identifies its untouched source. Later crop edits must not silently
-- retarget saved endpoints to a different image. source_photo_id is the logical Photo_ID.
-- dwCm is DERIVED width, never a direct wingtip measurement.
-- Optional directDwCm, directDwPx and directDwPoints retain additional directly
-- measured width within this same event; do not repurpose the four DL/scale points.
-- Optional setup object may hold camera, lens, systemId and calibrationId when known.
-- Optional distortionCorrection object may hold applied status, model/version,
-- parameters and raw/corrected evidence. Absence means unknown, not uncorrected.
-- Optional quality object may hold includeInMean and exclusionReason. Missing approval
-- or quality provenance must not be interpreted automatically as scientific eligibility.
-- Future writers validate complete paired-laser evidence; this additive draft only
-- constrains the outer JSON shape and does not introduce a writer or persistence RPC.
--
-- FUTURE LEGACY RECONCILIATION (no backfill now): an optional legacy object can retain
-- legacy_size_id, legacy_fk_size_id, exact_frame (STRING), original_shot_type,
-- source_sha256, source filename, raw/corrected measurements, correction/conversion
-- provenance and quality annotations. Keep original Sizes2.csv outside operational
-- tables and Git. Do not copy 123 raw columns, guess photo links, or repair Frames here.
-- Existing calibration_params/src_file/photo_code remain untouched; no duplication
-- into measurement_evidence is performed by this migration.
--
-- FUTURE SUMMARY CONTRACT (documentation only): mantas.size_dw_m is an encounter
-- summary, not a Size_ID. Ultimately average qualifying standardized_dw_m values,
-- excluding visual, ambiguous, scientifically excluded, duplicate or superseded
-- evidence. Count each qualifying Size_ID once, even with DL and direct DW together.
-- N is derived; no stored N, mean recalculation, or catalog-summary change is added.
--
-- DEPRECATION CANDIDATES ONLY: read-only audit found photo_measurements = 0 rows and
-- photos.active_measure_id = 0 populated on 2026-10-07. Do not drop either yet and
-- do not start writing the new operational workflow into photo_measurements.

BEGIN;

ALTER TABLE public.manta_sizes
  ADD COLUMN source_photo_id integer,
  ADD COLUMN measurement_method text,
  ADD COLUMN standardized_dw_m numeric,
  ADD COLUMN measurement_evidence jsonb,
  ADD CONSTRAINT manta_sizes_source_photo_id_fkey
    FOREIGN KEY (source_photo_id) REFERENCES public.photos (pk_photo_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT manta_sizes_measurement_method_check
    CHECK (measurement_method IN ('paired_laser', 'visual_estimate', 'legacy_unknown')),
  ADD CONSTRAINT manta_sizes_standardized_dw_m_check
    CHECK (standardized_dw_m > 0 AND standardized_dw_m < 'Infinity'::numeric),
  ADD CONSTRAINT manta_sizes_measurement_evidence_object_check
    CHECK (jsonb_typeof(measurement_evidence) = 'object');

-- Nonunique FK index: no one-photo/one-size assumption.
CREATE INDEX manta_sizes_source_photo_id_idx ON public.manta_sizes (source_photo_id);

COMMIT;
