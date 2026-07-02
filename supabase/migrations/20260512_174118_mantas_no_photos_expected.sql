alter table public.mantas
  add column if not exists no_photos_expected boolean not null default false;

comment on column public.mantas.no_photos_expected is
  'True when this manta encounter is expected to have no linked photos, such as an import-only MPRF sighting/manta row. QC accepts missing photo/catalog-photo linkage for these rows but warns if photos are later linked.';
