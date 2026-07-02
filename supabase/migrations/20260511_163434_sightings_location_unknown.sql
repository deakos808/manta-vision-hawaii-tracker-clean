alter table public.sightings
  add column if not exists location_unknown boolean not null default false;

comment on column public.sightings.location_unknown is
  'Marks sightings whose location was reviewed and is truly unknown, so QC does not keep flagging them as missing location.';
