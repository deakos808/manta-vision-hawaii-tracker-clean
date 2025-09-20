import React from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  e: any;
  viewMode: "ventral" | "dorsal";
  className?: string;
};

function toPublic(u?: string | null): string | null {
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  let key = String(u).replace(/^\/+/, "").replace(/^browse\//i, "");
  const m1 = key.match(/^storage\/v1\/object\/public\/([^/]+)\/(.*)$/i);
  if (m1) return supabase.storage.from(m1[1]).getPublicUrl(m1[2]).data.publicUrl;
  const m2 = key.match(/^([^/]+)\/(.*)$/);
  if (m2 && (m2[1] === "manta-images" || m2[1] === "temp-images")) {
    return supabase.storage.from(m2[1]).getPublicUrl(m2[2]).data.publicUrl;
  }
  return supabase.storage.from("manta-images").getPublicUrl(key).data.publicUrl;
}

export default function CatalogCardImage({ e, viewMode, className }: Props) {
  const raw: string | null =
    e?.best_catalog_photo_url ??
    (viewMode === "dorsal" ? e?.best_catalog_dorsal_path : e?.best_catalog_ventral_path) ??
    e?.best_photo_url ??
    e?.thumbnail_url ??
    null;

  const url = toPublic(raw) ?? "/manta-logo.svg";
  const src = url + (url.includes("?") ? "&" : "?") + "cb=" + Date.now();

  return (
    <img
      src={src}
      key={src}
      alt={e?.name ?? "catalog"}
      className={className ?? "w-28 h-28 object-cover rounded border"}
      loading="eager"
      referrerPolicy="no-referrer-when-downgrade"
      onError={(ev) => {
        // eslint-disable-next-line no-console
        console.error("[Catalog img error]", e?.pk_catalog_id, ev.currentTarget.src);
        ev.currentTarget.src = "/manta-logo.svg";
      }}
    />
  );
}
