import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

type View = "ventral" | "dorsal";
const IMAGE_BUCKET = "manta-images";

type Photo = {
  pk_photo_id: number;
  fk_catalog_id: number | null;
  thumbnail_url: string | null;
  storage_path: string | null;
  photo_view: string | null;
  is_best_catalog_ventral_photo: boolean | null;
  is_best_catalog_dorsal_photo: boolean | null;
  is_best_manta_ventral_photo: boolean | null;
  is_best_manta_dorsal_photo: boolean | null;
};

function resolvePublicUrl(p: Pick<Photo, "thumbnail_url" | "storage_path">) {
  if (p.thumbnail_url && /^https?:\/\//i.test(p.thumbnail_url)) return p.thumbnail_url!;
  if (p.thumbnail_url && p.thumbnail_url.length) {
    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(p.thumbnail_url);
    if (data?.publicUrl) return data.publicUrl;
  }
  if (p.storage_path && p.storage_path.length) {
    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(p.storage_path);
    if (data?.publicUrl) return data.publicUrl;
  }
  return "/manta-logo.svg";
}

export default function CatalogBestPhotoModal({
  open,
  onOpenChange,
  pk_catalog_id,
  view = "ventral",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pk_catalog_id: number | null;
  view?: View;
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [candidates, setCandidates] = useState<Photo[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const current = useMemo(() => {
    if (!candidates.length) return null;
    const flag = view === "ventral" ? "is_best_catalog_ventral_photo" : "is_best_catalog_dorsal_photo";
    const direct = candidates.find((p) => (p as any)[flag]);
    if (direct) return direct;
    if (selectedId) return candidates.find((p) => p.pk_photo_id === selectedId) ?? candidates[0];
    return candidates[0];
  }, [candidates, selectedId, view]);

  useEffect(() => {
    if (!open || !pk_catalog_id) return;
    setLoading(true);
    setCandidates([]);
    setSelectedId(null);

    (async () => {
      const bestMantaFlag = view === "ventral" ? "is_best_manta_ventral_photo" : "is_best_manta_dorsal_photo";
      const catFlag = view === "ventral" ? "is_best_catalog_ventral_photo" : "is_best_catalog_dorsal_photo";
      const cols =
        "pk_photo_id,fk_catalog_id,thumbnail_url,storage_path,photo_view,is_best_catalog_ventral_photo,is_best_catalog_dorsal_photo,is_best_manta_ventral_photo,is_best_manta_dorsal_photo";

      // Prefer “best manta” candidates; fall back to all photos
      let { data: rows } = await supabase
        .from("photos")
        .select(cols)
        .eq("fk_catalog_id", pk_catalog_id)
        .eq("photo_view", view)
        .eq(bestMantaFlag, true)
        .order("uploaded_at", { ascending: false })
        .order("pk_photo_id", { ascending: false });

      let list: Photo[] = (rows as any) ?? [];

      if (!list.length) {
        const r2 = await supabase
          .from("photos")
          .select(cols)
          .eq("fk_catalog_id", pk_catalog_id)
          .eq("photo_view", view)
          .order("uploaded_at", { ascending: false })
          .order("pk_photo_id", { ascending: false });
        list = (r2.data as any) ?? [];
      }

      // Pointer (ventral only)
      let pointer: number | null = null;
      if (view === "ventral") {
        const { data: cRow } = await supabase
          .from("catalog")
          .select("best_cat_mask_ventral_id_int")
          .eq("pk_catalog_id", pk_catalog_id)
          .single();
        pointer = (cRow?.best_cat_mask_ventral_id_int as number | null) ?? null;
      }

      setCandidates(list);

      const pre =
        (pointer && list.some((p) => p.pk_photo_id === pointer) ? pointer : null) ??
        list.find((p) => !!(p as any)[catFlag])?.pk_photo_id ??
        list[0]?.pk_photo_id ??
        null;
      setSelectedId(pre);
    })().finally(() => setLoading(false));
  }, [open, pk_catalog_id, view]);

  const save = async () => {
    if (!pk_catalog_id || !selectedId) return;
    setSaving(true);
    try {
      const catFlag = view === "ventral" ? "is_best_catalog_ventral_photo" : "is_best_catalog_dorsal_photo";

      // 1) Clear existing best
      const { error: e1 } = await supabase
        .from("photos")
        .update({ [catFlag]: null } as any)
        .eq("fk_catalog_id", pk_catalog_id)
        .eq("photo_view", view);
      if (e1) throw e1;

      // 2) Mark new best
      const { error: e2 } = await supabase.from("photos").update({ [catFlag]: true } as any).eq("pk_photo_id", selectedId);
      if (e2) throw e2;

      // 3) Keep the catalog pointer + URL in sync (ventral path drives cards)
      if (view === "ventral") {
        const chosen = candidates.find((p) => p.pk_photo_id === selectedId);
        const url = chosen ? resolvePublicUrl(chosen) : null;

        const { error: e3 } = await supabase
          .from("catalog")
          .update({ best_cat_mask_ventral_id_int: selectedId, ...(url ? { best_catalog_photo_url: url } : {}) })
          .eq("pk_catalog_id", pk_catalog_id);
        if (e3) throw e3;
      }

      toast({ title: "Best photo updated" });
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error("[CatalogBestPhotoModal] save error:", err);
      toast({ variant: "destructive", title: "Save failed", description: String(err?.message || err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            Select Best Ventral Photo · Catalog {pk_catalog_id ?? ""}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading photos…
          </div>
        ) : !candidates.length ? (
          <div className="p-6 text-sm text-muted-foreground">
            No ventral photos found for this catalog. Set manta best photos first.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Current */}
              <div>
                <div className="text-sm font-medium mb-2">Current</div>
                <div className="border rounded bg-white p-3">
                  <div className="w-full h-64 bg-white flex items-center justify-center">
                    <img
                      src={resolvePublicUrl(current || candidates[0])}
                      alt="Current best"
                      className="max-h-60 object-contain"
                      onError={(e) => ((e.currentTarget as HTMLImageElement).src = "/manta-logo.svg")}
                    />
                  </div>
                </div>
              </div>

              {/* Choose new */}
              <div>
                <div className="text-sm font-medium mb-2">Choose New</div>
                <RadioGroup
                  value={selectedId?.toString() ?? ""}
                  onValueChange={(v) => setSelectedId(Number(v))}
                  className="grid grid-cols-2 gap-3"
                >
                  {candidates.map((p) => (
                    <label key={p.pk_photo_id} className="rounded border bg-white p-2 cursor-pointer">
                      <img
                        src={resolvePublicUrl(p)}
                        alt={`Photo ${p.pk_photo_id}`}
                        className="w-full h-28 object-cover rounded"
                        onError={(e) => ((e.currentTarget as HTMLImageElement).src = "/manta-logo.svg")}
                      />
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <RadioGroupItem value={String(p.pk_photo_id)} id={`p-${p.pk_photo_id}`} />
                        <Label htmlFor={`p-${p.pk_photo_id}`}>ID {p.pk_photo_id}</Label>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!selectedId || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Set Best
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
