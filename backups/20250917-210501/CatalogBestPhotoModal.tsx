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

function resolveImageUrl(p: Pick<Photo, "thumbnail_url" | "storage_path">): string {
  if (p.thumbnail_url && p.thumbnail_url.length > 0) return p.thumbnail_url;
  return "/manta-logo.svg";
}

async function fetchCurrentBestPk(catalogId: number, view: View): Promise<number | null> {
  if (viewLocal === "ventral") {
    const { data: catRows, error: catErr } = await supabase
      .from("catalog")
      .select("best_cat_ventral_id")
      .eq("pk_catalog_id", catalogId)
      .limit(1);
    if (!catErr && catRows?.length && catRows[0].best_cat_ventral_id != null) {
      return Number(catRows[0].best_cat_ventral_id);
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
  view?: View;                          // defaults to 'ventral'
  onSaved?: (newThumb?: string | null) => void; // return updated thumb for instant UI swap
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
  const [initialBestId, setInitialBestId] = useState<number | null>(null);

  const flagKey: keyof Photo =
    view === "ventral" ? "is_best_catalog_ventral_photo" : "is_best_catalog_dorsal_photo";
  const mantaFlagKey: keyof Photo =
    view === "ventral" ? "is_best_manta_ventral_photo" : "is_best_manta_dorsal_photo";

  // Load candidate photos + preselect current best
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
          .eq("photo_view", viewLocal)
          .order("uploaded_at", { ascending: false })
          .order("pk_photo_id", { ascending: false });

        if (error) throw error;
        const all = (data as Photo[]) ?? [];

        const mantaBest = all.filter((p) => Boolean((p as any)[mantaFlagKey]));
        let pool = mantaBest.length > 0 ? mantaBest : all;

        const currentBestPk = await fetchCurrentBestPk(pk_catalog_id, viewLocal);
        if (currentBestPk && !pool.some((p) => p.pk_photo_id === currentBestPk)) {
          const extra = all.find((p) => p.pk_photo_id === currentBestPk);
          if (extra) pool = [extra, ...pool];
        }

        setPhotos(pool);
        setSelectedPhotoId(currentBestPk ?? null);
        setInitialBestId(currentBestPk ?? null);
      } catch (e) {
        console.error("[CatalogBestPhotoModal] load error:", e);
        setPhotos([]);
        setSelectedPhotoId(null);
        setInitialBestId(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, pk_catalog_id, viewLocal, mantaFlagKey]);

  const nothingToShow = useMemo(() => open && !loading && photos.length === 0, [open, loading, photos]);

  // Persist: NULL all old best flags for this catalog+view, set TRUE on the chosen photo, update catalog pointer.
  async function onSave() {
    if (!pk_catalog_id || !selectedPhotoId) return;
    setSaving(true);
    try {
      const clear = await supabase
        .from("photos")
        .update({ [flagKey]: null } as any)
        .eq("fk_catalog_id", pk_catalog_id)
        .eq("photo_view", viewLocal);
      if (clear.error) throw clear.error;

      const set = await supabase
        .from("photos")
        .update({ [flagKey]: true } as any)
        .eq("pk_photo_id", selectedPhotoId);
      if (set.error) throw set.error;

      // also point catalog to the new best so views stay consistent
      if (viewLocal === "ventral") {
        const upd = await supabase
          .from("catalog")
          .update({ best_cat_ventral_id: selectedPhotoId })
          .eq("pk_catalog_id", pk_catalog_id);
        if (upd.error) throw upd.error;
      }

      const newThumb =
        photos.find((p) => p.pk_photo_id === selectedPhotoId)?.thumbnail_url ?? null;

      onOpenChange(false);
      onSaved?.(newThumb);
    } catch (e) {
      console.error("[CatalogBestPhotoModal] save error:", e);
      alert(`Failed to set best catalog ${view} photo: ${String((e as any)?.message || e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Select Best {viewLocal === "ventral" ? "Ventral" : "Dorsal"} Photo
            {pk_catalog_id ? ` · Catalog ${pk_catalog_id}` : ""}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading photos…
          </div>
        ) : nothingToShow ? (
          <div className="p-2 text-sm text-muted-foreground">
            No {viewLocal} photos found for this catalog.
          </div>
        ) : (
          <RadioGroup
            value={selectedPhotoId?.toString() ?? ""}
            onValueChange={(val) => setSelectedPhotoId(Number(val))}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2"
          >
            {photos.map((p) => {
              const isCatalogBest =
                view === "ventral" ? !!p.is_best_catalog_ventral_photo : !!p.is_best_catalog_dorsal_photo;
              return (
                <label key={p.pk_photo_id} className="block cursor-pointer">
                  <img
                    src={resolveImageUrl(p)}
                    alt={`Photo ${p.pk_photo_id}`}
                    className="w-full h-40 object-cover rounded border cursor-zoom-in"
                    onError={(e) => ((e.currentTarget as HTMLImageElement).src = "/manta-logo.svg")}
                  />
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <RadioGroupItem value={String(p.pk_photo_id)} id={`ph-${p.pk_photo_id}`} />
                    <Label htmlFor={`ph-${p.pk_photo_id}`}>ID {p.pk_photo_id}</Label>
                    {isCatalogBest && <Badge className="ml-auto">Current Best</Badge>}
                  </div>
                </label>
              );
            })}
          </RadioGroup>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!pk_catalog_id || !selectedPhotoId || saving || loading || selectedPhotoId===initialBestId}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Set Best
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

      if (view === "dorsal") {
        const upd = await supabase
          .from("catalog")
          .update({ best_cat_dorsal_id: selectedPhotoId })
          .eq("pk_catalog_id", pk_catalog_id);
        if (upd.error) throw upd.error;
      }
