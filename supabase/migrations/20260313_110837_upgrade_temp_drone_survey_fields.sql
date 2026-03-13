alter table public.temp_drone_sightings
  add column if not exists start_time text null,
  add column if not exists end_time text null,
  add column if not exists no_mantas_seen boolean not null default false,
  add column if not exists total_mantas_observed integer null;

create or replace view public.v_temp_drone_sightings_summary as
select
  s.id,
  s.created_at,
  s.pilot,
  s.email,
  s.phone,
  s.date,
  s.time,
  s.start_time,
  s.end_time,
  s.no_mantas_seen,
  s.total_mantas_observed,
  s.island,
  s.location,
  s.latitude,
  s.longitude,
  s.notes,
  s.status,
  s.committed_at,
  (
    select count(*)
    from temp_drone_photos p
    where p.draft_id = s.id
  ) as photo_count
from public.temp_drone_sightings s;
