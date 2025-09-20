alter table public.catalog
  add column if not exists best_catalog_ventral_thumb_url text;

update public.catalog c
set best_catalog_ventral_thumb_url = p.thumbnail_url
from public.photos p
where p.fk_catalog_id = c.pk_catalog_id
  and p.photo_view = 'ventral'
  and coalesce(p.is_best_catalog_ventral_photo, false) is true;

create or replace function public.update_best_catalog_ventral_thumb_url()
returns trigger
language plpgsql
as $$
begin
  update public.catalog c
  set best_catalog_ventral_thumb_url = p.thumbnail_url
  from public.photos p
  where c.pk_catalog_id = new.pk_catalog_id
    and p.fk_catalog_id = new.pk_catalog_id
    and p.photo_view = 'ventral'
    and coalesce(p.is_best_catalog_ventral_photo, false) is true;
  return new;
end;
$$;

drop trigger if exists trg_best_catalog_ventral_thumb on public.catalog;

create trigger trg_best_catalog_ventral_thumb
after insert or update of best_cat_mask_ventral_id_int on public.catalog
for each row
execute function public.update_best_catalog_ventral_thumb_url();
