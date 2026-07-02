create or replace function public.sync_sighting_location_columns()
returns trigger
language plpgsql
as $$
declare
  v_location_changed boolean := false;
  v_sitelocation_changed boolean := false;
  v_location text := nullif(btrim(new.location), '');
  v_sitelocation text := nullif(btrim(new.sitelocation), '');
begin
  if tg_op = 'UPDATE' then
    v_location_changed := new.location is distinct from old.location;
    v_sitelocation_changed := new.sitelocation is distinct from old.sitelocation;
  end if;

  if tg_op = 'INSERT' or (v_location_changed and not v_sitelocation_changed) then
    if v_location is not null and v_sitelocation is null then
      new.sitelocation := new.location;
    end if;
  end if;

  if tg_op = 'INSERT' or (v_sitelocation_changed and not v_location_changed) then
    if v_sitelocation is not null and v_location is null then
      new.location := new.sitelocation;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sightings_sync_location_columns on public.sightings;

create trigger sightings_sync_location_columns
before insert or update of location, sitelocation
on public.sightings
for each row
execute function public.sync_sighting_location_columns();

comment on function public.sync_sighting_location_columns() is
  'Keeps sightings.location and sightings.sitelocation synchronized when only one location text column is supplied or changed.';

notify pgrst, 'reload schema';
