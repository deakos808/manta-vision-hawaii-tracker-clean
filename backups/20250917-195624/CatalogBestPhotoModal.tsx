// File: src/pages/browse_data/modals/CatalogBestPhotoModal.tsx
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type View = "ventral" | "dorsal";

type Photo = {
  pk_photo_id: number;
  fk_catalog_id: number | null;
  photo_view: string | null;
  thumbnail_url: string | null;
  storage_path: string | null;
  uploaded_at?: string | null;
  is_best_manta_ventral_photo: boolean | null;
  is_best_manta_dorsal_photo: boolean | null;
  is_best_catalog_ventral_photo: boolean | null;
  is_best_catalog_dorsal_photo: boolean | null;
};

// ✅ Clean function — uses thumbnail_url directly
function resolveImageUrl(p: Pick<Photo, "thumbnail_url" | "storage_path">): string {
  if (p.thumbnail_url && p.thumbnail_url.length > 0) {
    return p.thumbnail_url;
  }
  return "/manta-logo.svg";
}

async function fetchCurrentBestPk(catalogId: number, view: View): Promise<number | null> {
  if (view === "ventral") {
    const { data: catRows, error: catErr } = await supabase
      .from("catalog")
      .select("best_cat_mask_ventral_id_int")
      .eq("pk_catalog_id", catalogId)
      .limit(1);
    if (!catErr && catRows?.length && catRows[0].best_cat_mask_ventral_id_int != null) {
      return Number(catRows[0].best_cat_mask_ventral_id_int);
    }
    const { data: photRows } = await supabase
      .from("photos")
      .select("pk_photo_id")
      .eq("fk_catalog_id", catalogId)
      .eq("photo_view", "ventral")
      .eq("is_best_catalog_ventral_photo", true)
      .limit(1);
    return photRows?.[0]?.pk_photo_id ?? null;
  } else {
    const { data: photRows } = await supabase
      .from("photos")
      .select("pk_photo_id")
      .eq("fk_catalog_id", catalogId)
      .eq("photo_view", "dorsal")
      .eq("is_best_catalog_dorsal_photo", true)
      .limit(1);
    return photRows?.[0]?.pk_photo_id ?? null;
  }
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pk_catalog_id: number | null;
  view?: View;
  onSaved?: (newThumb?: string | null) => void;       // callback after DB updates
};

export default function CatalogBestPhotoModal({
  open,
  onOpenChange,
  pk_catalog_id,
  view = "ventral",
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);

  const flagKey: keyof Photo =
    view === "ventral" ? "is_best_catalog_ventral_photo" : "is_best_catalog_dorsal_photo";
  const mantaFlagKey: keyof Photo =
    view === "ventral" ? "is_best_manta_ventral_photo" : "is_best_manta_dorsal_photo";

  // Load candidate photos
  useEffect(() => {
    if (!open || !pk_catalog_id) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("photos")
          .select(
            "pk_photo_id,fk_catalog_id,photo_view,thumbnail_url,storage_path,uploaded_at," +
              "is_best_manta_ventral_photo,is_best_manta_dorsal_photo," +
              "is_best_catalog_ventral_photo,is_best_catalog_dorsal_photo"
          )
          .eq("fk_catalog_id", pk_catalog_id)
          .eq("photo_view", view)
          .order("uploaded_at", { ascending: false })
          .order("pk_photo_id", { ascending: false });

        if (error) throw error;
        const all = (data as Photo[]) ?? [];

        const mantaBest = all.filter((p) => Boolean(p[mantaFlagKey]));
        const pool = mantaBest.length > 0 ? mantaBest : all;

        const currentBestPk = await fetchCurrentBestPk(pk_catalog_id, view);
        const hasCurrent = currentBestPk != null && pool.some((p) => p.pk_photo_id === currentBestPk);
        setPhotos(pool);
        setSelectedPhotoId(hasCurrent ? currentBestPk : null);
      } catch (e) {
        console.error("[CatalogBestPhotoModal] load error:", e);
        setPhotos([]);
        setSelectedPhotoId(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, pk_catalog_id, view, mantaFlagKey]);

  const nothingToShow = useMemo(() => open && !loading && photos.length === 0, [open, loading, photos]);

  // Save best
  async function onSave() {
    if (!pk_catalog_id || !selectedPhotoId) return;
    setSaving(true);
    try {
      const clear = await supabase
        .from("photos")
        .update({ [flagKey]: null } as any)
        .eq("fk_catalog_id", pk_catalog_id)
        .eq("photo_view", view);
      if (clear.error) throw clear.error;

      const set = await supabase
        .from("photos")
        .update({ [flagKey]: true } as any)
        .eq("pk_photo_id", selectedPhotoId);
      if (set.error) throw set.error;

      // also update the catalog pointer so views pick up the new best immediately
      if (view === "ventral") {
        const upd = await supabase
          .from("catalog")
          .update({ best_cat_ventral_id: selectedPhotoId })
          .eq("pk_catalog_id", pk_catalog_id);
        if (upd.error) throw upd.error;
      }

      // close and pass the new thumbnail back to the caller for instant UI update
      const newThumb = (photos.find((p) => p.pk_photo_id === selectedPhotoId)?.thumbnail_url) ?? null;
      onOpenChange(false);
      onSaved?.(newThumb);
