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

    let alive = true;

    setLoading(true);
    setRows([]);

    (async () => {
      try {
        const { data: mantaRows, error: mantaErr } = await supabase
          .from("mantas")
          .select("pk_manta_id,fk_catalog_id")
          .eq("fk_sighting_id", pk_sighting_id)
          .order("fk_catalog_id", { ascending: true });

        if (mantaErr) throw mantaErr;

        const base = (mantaRows ?? [])
          .map((r: any) => ({
            pk_catalog_id: Number(r.fk_catalog_id ?? 0),
            pk_manta_id: r.pk_manta_id == null ? null : Number(r.pk_manta_id),
          }))
          .filter((r) => Number.isFinite(r.pk_catalog_id) && r.pk_catalog_id > 0);

        if (!alive) return;

        if (base.length === 0) {
          setRows([]);
          setLoading(false);
          return;
        }

        const catalogIds = Array.from(new Set(base.map((r) => r.pk_catalog_id)));
        const mantaIds = Array.from(
          new Set(
            base
              .map((r) => r.pk_manta_id)
              .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
          )
        );

        const { data: catalogRows, error: catalogErr } = await supabase
          .from("catalog_with_photo_view")
          .select("pk_catalog_id,name,gender,age_class")
          .in("pk_catalog_id", catalogIds);

        if (catalogErr) throw catalogErr;
        if (!alive) return;

        const catalogMap = new Map<
          number,
          { name: string | null; gender: string | null; age_class: string | null }
        >();

        (catalogRows ?? []).forEach((r: any) => {
          const id = Number(r.pk_catalog_id ?? 0);
          if (!id) return;
          catalogMap.set(id, {
            name: r.name ?? null,
            gender: r.gender ?? null,
            age_class: r.age_class ?? null,
          });
        });

        const thumbByManta = new Map<number, string | null>();

        if (mantaIds.length > 0) {
          const { data: bestRows, error: bestErr } = await supabase
            .from("photos")
            .select("pk_photo_id,fk_manta_id")
            .eq("is_best_manta_ventral_photo", true)
            .in("fk_manta_id", mantaIds);

          if (bestErr) throw bestErr;
          if (!alive) return;

          const bestPhotoIdByManta = new Map<number, number>();
          const bestPhotoIds: number[] = [];

          (bestRows ?? []).forEach((r: any) => {
            const mantaId = Number(r.fk_manta_id ?? 0);
            const photoId = Number(r.pk_photo_id ?? 0);
            if (!mantaId || !photoId) return;
            if (!bestPhotoIdByManta.has(mantaId)) {
              bestPhotoIdByManta.set(mantaId, photoId);
              bestPhotoIds.push(photoId);
            }
          });

          if (bestPhotoIds.length > 0) {
            const { data: thumbRows, error: thumbErr } = await supabase
              .from("photos_with_photo_view")
              .select("pk_photo_id,thumbnail_url")
              .in("pk_photo_id", bestPhotoIds);

            if (thumbErr) throw thumbErr;
            if (!alive) return;

            const thumbByPhotoId = new Map<number, string | null>();
            (thumbRows ?? []).forEach((r: any) => {
              const photoId = Number(r.pk_photo_id ?? 0);
              if (!photoId) return;
              thumbByPhotoId.set(photoId, r.thumbnail_url ?? null);
            });

            bestPhotoIdByManta.forEach((photoId, mantaId) => {
              thumbByManta.set(mantaId, thumbByPhotoId.get(photoId) ?? null);
            });
          }
        }

        const merged: MantaItem[] = base.map((r) => {
          const cat = catalogMap.get(r.pk_catalog_id);
          return {
            pk_catalog_id: r.pk_catalog_id,
            pk_manta_id: r.pk_manta_id,
            name: cat?.name ?? null,
            gender: cat?.gender ?? null,
            age_class: cat?.age_class ?? null,
            thumbnail_url:
              r.pk_manta_id != null ? thumbByManta.get(r.pk_manta_id) ?? null : null,
          };
        });

        if (!alive) return;
        setRows(merged);
      } catch (e) {
        console.error("[SightingMantasQuickModal] load error:", e);
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, pk_sighting_id]);

  const title = useMemo(() => `Mantas in Sighting ${pk_sighting_id}`, [pk_sighting_id]);

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
          <div className="rounded border overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b">
                <tr className="text-left">
                  <th className="px-3 py-2 w-28">Photo</th>
                  <th className="px-3 py-2">Catalog</th>
                  <th className="px-3 py-2">Manta</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Gender</th>
                  <th className="px-3 py-2">Age</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.pk_catalog_id}-${r.pk_manta_id ?? "no-manta"}`} className="border-b last:border-0 align-top">
                    <td className="px-3 py-2">
                      <img
                        src={r.thumbnail_url ?? "/manta-logo.svg"}
                        alt={`Catalog ${r.pk_catalog_id}`}
                        className="h-20 w-20 object-cover rounded border bg-white"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/manta-logo.svg";
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">{r.pk_catalog_id}</td>
                    <td className="px-3 py-2">{r.pk_manta_id ?? "—"}</td>
                    <td className="px-3 py-2">{r.name ?? "—"}</td>
                    <td className="px-3 py-2">{r.gender ?? "—"}</td>
                    <td className="px-3 py-2">{r.age_class ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
