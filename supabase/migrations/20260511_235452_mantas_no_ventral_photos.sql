alter table public.mantas
  add column if not exists no_ventral_photos boolean not null default false;

comment on column public.mantas.no_ventral_photos is
  'Admin-reviewed QC exception for manta encounter photo sets where no ventral photo is available; dorsal/other fallback best-photo flags should be reviewed against this field.';
