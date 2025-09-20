import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

type MantaItem = {
  pk_catalog_id: number;
  pk_manta_id: number | null;
  name: string | null;
  gender: string | null;
  age_class: string | null;
  thumbnail_url: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pk_sighting_id: number;
};

export default function SightingMantasQuickModal({
  open,
  onOpenChange,
  pk_sighting_id,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MantaItem[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        // 1) Catalogs (and first manta id) present in this sighting
        const { data: ph, error: pErr } = await supabase
          .from("photos")
          .select("fk_manta_id,fk_catalog_id")
          .eq("fk_sighting_id", pk_sighting_id);
        if (pErr) throw pErr;

        const byCatalog = new Map<number, number | null>(); // catalog -> any manta_id from this sighting
        (ph ?? []).forEach((r: any) => {
          const cid = r.fk_catalog_id as number | null;
          if (typeof cid !== "number") return;
          if (!byCatalog.has(cid)) byCatalog.set(cid, (r.fk_manta_id as number | null) ?? null);
        });
        const catalogIds = Array.from(byCatalog.keys());
        if (catalogIds.length === 0) {
          setRows([]);
          return;
        }

        // 2) Catalog metadata + best photo pointer
        const { data: cats, error: cErr } = await supabase
          .from("catalog")
          .select("pk_catalog_id,name,gender,age_class,best_cat_mask_ventral_id_int")
          .in("pk_catalog_id", catalogIds);
        if (cErr) throw cErr;

        // 3) Resolve best-photo thumbnails in one shot
        const bestIds = (cats ?? [])
          .map((c: any) => c.best_cat_mask_ventral_id_int)
          .filter((v: any) => typeof v === "number");
        const { data: bestPhotos, error: bErr } = await supabase
          .from("photos")
          .select("pk_photo_id,thumbnail_url")
          .in("pk_photo_id", bestIds);
        if (bErr) throw bErr;

        const thumbByPhotoId = new Map<number, string | null>();
        (bestPhotos ?? []).forEach((p: any) => thumbByPhotoId.set(p.pk_photo_id, p.thumbnail_url ?? null));

        const items: MantaItem[] = (cats ?? []).map((c: any) => ({
          pk_catalog_id: c.pk_catalog_id,
          pk_manta_id: byCatalog.get(c.pk_catalog_id) ?? null,
          name: c.name ?? null,
          gender: c.gender ?? null,
          age_class: c.age_class ?? null,
          thumbnail_url: thumbByPhotoId.get(c.best_cat_mask_ventral_id_int) ?? null,
        }));

        setRows(items);
      } catch (e) {
        console.error("[SightingMantasQuickModal] load error:", e);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, pk_sighting_id]);

  const title = useMemo(
    () => `Mantas in Sighting ${pk_sighting_id}`,
    [pk_sighting_id]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-muted-foreground p-2">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground p-2">No mantas found for this sighting.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-2">
            {rows.map((r) => (
              <div key={r.pk_catalog_id} className="rounded border p-2">
                <img
                  src={r.thumbnail_url ?? "/manta-logo.svg"}
                  alt={`Catalog ${r.pk_catalog_id}`}
                  className="w-full aspect-square object-cover rounded border"
                  onError={(e) => ((e.currentTarget as HTMLImageElement).src = "/manta-logo.svg")}
                />
                <div className="mt-2 text-xs">
                  <div><span className="font-medium">Catalog:</span> {r.pk_catalog_id}</div>
                  <div><span className="font-medium">Manta:</span> {r.pk_manta_id ?? "—"}</div>
                  <div><span className="font-medium">Name:</span> {r.name ?? "—"}</div>
                  <div><span className="font-medium">Gender:</span> {r.gender ?? "—"}</div>
                  <div><span className="font-medium">Age:</span> {r.age_class ?? "—"}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
