alter table public.manta_sizes
  add column if not exists fk_catalog_id integer;

update public.manta_sizes ms
set fk_catalog_id = m.fk_catalog_id
from public.mantas m
where ms.fk_manta_id = m.pk_manta_id
  and ms.fk_catalog_id is distinct from m.fk_catalog_id;

create index if not exists idx_manta_sizes_fk_catalog_id
  on public.manta_sizes (fk_catalog_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'manta_sizes_fk_catalog_id_fkey'
      and conrelid = 'public.manta_sizes'::regclass
  ) then
    alter table public.manta_sizes
      add constraint manta_sizes_fk_catalog_id_fkey
      foreign key (fk_catalog_id)
      references public.catalog (pk_catalog_id)
      on update cascade
      on delete set null
      not valid;
  end if;
end $$;

alter table public.manta_sizes
  validate constraint manta_sizes_fk_catalog_id_fkey;

create or replace function public.set_manta_size_catalog_id()
returns trigger
language plpgsql
as $$
begin
  if new.fk_manta_id is null then
    new.fk_catalog_id := null;
  else
    select m.fk_catalog_id
      into new.fk_catalog_id
    from public.mantas m
    where m.pk_manta_id = new.fk_manta_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_manta_size_catalog_id on public.manta_sizes;

create trigger trg_set_manta_size_catalog_id
before insert or update of fk_manta_id on public.manta_sizes
for each row
execute function public.set_manta_size_catalog_id();

create or replace function public.sync_manta_size_catalog_id_from_manta()
returns trigger
language plpgsql
as $$
begin
  update public.manta_sizes
  set fk_catalog_id = new.fk_catalog_id
  where fk_manta_id = new.pk_manta_id
    and fk_catalog_id is distinct from new.fk_catalog_id;

  return new;
end;
$$;

drop trigger if exists trg_sync_manta_size_catalog_id_from_manta on public.mantas;

create trigger trg_sync_manta_size_catalog_id_from_manta
after update of fk_catalog_id on public.mantas
for each row
when (old.fk_catalog_id is distinct from new.fk_catalog_id)
execute function public.sync_manta_size_catalog_id_from_manta();
