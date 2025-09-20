import { supabase } from "@/lib/supabase";

export function buildCatalogImageUrl(e: any, viewMode: "ventral" | "dorsal"): string {
  const cacheBust = (u?: string | null): string => {
    if (!u) return "/manta-logo.svg";
    return u + (u.includes("?") ? "&" : "?") + "cb=" + Date.now();
  };

  const idBased =
    e?.best_cat_mask_ventral_id_int != null
      ? `manta-images/photos/${e.best_cat_mask_ventral_id_int}/${e.best_cat_mask_ventral_id_int}.jpg`
      : null;

  const raw: string | null =
    e?.best_catalog_photo_url ??
    idBased ??
    (viewMode === "dorsal" ? e?.best_catalog_dorsal_path : e?.best_catalog_ventral_path) ??
    e?.best_photo_url ??
    e?.thumbnail_url ??
    null;

  const toPublic = (u: string | null): string | null => {
    if (!u) return null;
    if (/^https?:\/\//i.test(u)) return u;

    let key = String(u).replace(/^\/+/, "");
    key = key.replace(/^browse\//i, "");

    const m1 = key.match(/^storage\/v1\/object\/public\/([^/]+)\/(.*)$/i);
    if (m1) {
      return supabase.storage.from(m1[1]).getPublicUrl(m1[2]).data.publicUrl;
    }

    const m2 = key.match(/^([^/]+)\/(.*)$/);
    if (m2 && (m2[1] === "manta-images" || m2[1] === "temp-images")) {
      return supabase.storage.from(m2[1]).getPublicUrl(m2[2]).data.publicUrl;
    }

    return supabase.storage.from("manta-images").getPublicUrl(key).data.publicUrl;
  };

  return cacheBust(toPublic(raw));
}
