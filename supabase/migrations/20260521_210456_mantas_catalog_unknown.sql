alter table public.mantas
  add column if not exists catalog_unknown boolean not null default false;

comment on column public.mantas.catalog_unknown is
  'True when QC/admin review confirms this manta encounter cannot be confidently linked to a catalog identity yet. QC accepts missing fk_catalog_id for these reviewed unknowns without changing photo expectations.';

notify pgrst, 'reload schema';
