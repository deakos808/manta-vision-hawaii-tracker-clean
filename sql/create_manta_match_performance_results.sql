-- Optional storage table for Admin > Matching Performance.
-- Local evaluation scripts can export CSV with matching columns, then admins can
-- import rows here for dashboard review.

create table if not exists public.manta_match_performance_results (
  id bigserial primary key,
  run_id text not null,
  evaluation_type text not null,
  query_photo_id bigint,
  query_catalog_id bigint,
  expected_catalog_id bigint,
  expected_photo_id bigint,
  true_rank integer,
  true_score double precision,
  top_catalog_id bigint,
  top_photo_id bigint,
  top_score double precision,
  score_gap double precision,
  query_region_count integer,
  top_match_region_count integer,
  body_mask_confidence double precision,
  pigment_iou double precision,
  median_reprojection_error double precision,
  debug_overlay_path text,
  diagnostic_flags text,
  reviewer_reason text,
  created_at timestamptz not null default now()
);

create index if not exists manta_match_performance_results_run_idx
  on public.manta_match_performance_results (run_id, evaluation_type);

create index if not exists manta_match_performance_results_rank_idx
  on public.manta_match_performance_results (true_rank);
