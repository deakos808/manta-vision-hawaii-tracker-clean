-- === catalog table ===
create table public.catalog (
  pk_catalog_id integer primary key,
  catalog_uuid uuid unique not null default gen_random_uuid (),
  name text,
  species text,
  date_first_sighted date,
  date_last_sighted date,
  days_between_first_last integer,
  notes text,
  best_photo_id text,
  best_dorsal_photo_id text,
  best_cat_ventral_id integer,
  best_cat_dorsal_id integer,
  best_cat_mask_ventral_id integer,
  best_cat_mask_ventral_id_int integer,
  best_photo_url text,
  best_catalog_photo_url text
);

-- === mantas table ===
create table public.mantas (
  pk_manta_id integer primary key,
  manta_uuid uuid unique not null default gen_random_uuid (),
  fk_catalog_id integer,
  fk_sighting_id integer,
  best_ventral_photo_id text,
  ref_biometrics_id text,
  best_manta_ventral_photo_url text,
  best_ventral_photo_id_int integer,
  best_manta_ventral_photo_url2 text,
  gender text,
  age_class text,
  size_m numeric,
  estimated_size_m numeric,
  jon_size_m numeric,
  species text,
  total_biopsies integer,
  total_tags integer,
  ref_biopsy_id text,
  ref_ptt_id text,
  injury_type text,
  injury_notes text,
  photographer text,
  mp_number text,
  updated_at timestamp with time zone default now(),
  best_manta_dorsal_photo_url text,
  new_best_manta_ventral_photo_id integer,
  new_best_manta_dorsal_photo_id integer,
  best_manta_photo_url text,
  fk_catalog_uuid uuid,
  fk_sighting_uuid uuid
);

-- === photos table ===
create table public.photos (
  pk_photo_id integer primary key,
  fk_manta_id integer,
  file_name2 text not null,
  is_best_catalog_ventral_photo boolean default false,
  is_best_manta_ventral_photo boolean default false,
  uploaded_at timestamp with time zone default now(),
  notes text,
  photo_uuid uuid unique not null default gen_random_uuid (),
  fk_sighting_id integer,
  storage_path text,
  thumbnail_url text,
  photo_view text default 'ventral',
  population text,
  is_best_catalog_dorsal_photo boolean default false,
  is_best_manta_dorsal_photo boolean default false,
  view_label text,
  fk_catalog_id integer,
  fk_catalog_uuid_legacy uuid,
  fk_catalog_uuid uuid,
  fk_manta_uuid uuid
);

-- === manta_match_results table ===
create table public.manta_match_results (
  id uuid primary key default gen_random_uuid (),
  manta_id uuid,
  fk_catalog_id uuid,
  pk_manta_id integer,
  pk_catalog_id integer,
  true_match_rank integer,
  match_score double precision,
  flag_for_review boolean default false,
  inserted_at timestamp with time zone default now()
);

-- === manta_match_results_view ===
create or replace view public.manta_match_results_view as
select
  id,
  pk_manta_id,
  pk_catalog_id,
  true_match_rank,
  match_score,
  flag_for_review,
  inserted_at
from public.manta_match_results;


