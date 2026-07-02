alter table public.catalog
  add column if not exists best_catalog_photo_exception_reason text;

comment on column public.catalog.best_catalog_photo_exception_reason is
  'Optional QC exception reason for catalog best-photo assignments, for example no_ventral_available when a dorsal photo is intentionally used as the catalog anchor.';
