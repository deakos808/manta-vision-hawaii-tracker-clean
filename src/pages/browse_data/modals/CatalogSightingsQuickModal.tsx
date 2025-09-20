import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

type SightItem = {
  pk_sighting_id: number;
  sighting_date: string | null;
  island: string | null;
  location: string | null;
  photographer: string | null;
  mantas_count: number;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pk_catalog_id: number;
  onOpenMantas: (sightingId: number) => void;
};

export default function CatalogSightingsQuickModal({
  open,
  onOpenChange,
  pk_catalog_id,
  onOpenMantas,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SightItem[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        // 1) Which sightings include THIS catalog?
        const { data: catPhotos, error: catErr } = await supabase
          .from("photos")
          .select("fk_sighting_id")
          .eq("fk_catalog_id", pk_catalog_id);
        if (catErr) throw catErr;

        const sightIds = Array.from(
          new Set(
            (catPhotos ?? [])
              .map((r) => r.fk_sighting_id)
              .filter((v: number | null) => typeof v === "number")
          )
        ) as number[];

        if (sightIds.length === 0) {
          setRows([]);
          return;
        }

        // 2) Load the basic sighting metadata (try both 'sitelocation' and 'location')
        const { data: sightRows, error: sErr } = await supabase
          .from("sightings")
          .select("pk_sighting_id, sighting_date, island, sitelocation, location, photographer")
          .in("pk_sighting_id", sightIds)
          .order("sighting_date", { ascending: false });
        if (sErr) throw sErr;

        // 3) Precompute manta counts for these sightings (all mantas, not only this catalog)
        const { data: allPhotos, error: pErr } = await supabase
          .from("photos")
          .select("fk_sighting_id,fk_manta_id")
          .in("fk_sighting_id", sightIds);
        if (pErr) throw pErr;

        const counts = new Map<number, number>();
        const seen = new Map<number, Set<number>>();
        (allPhotos ?? []).forEach((r: any) => {
          const sid = r.fk_sighting_id as number | null;
          const mid = r.fk_manta_id as number | null;
          if (typeof sid !== "number" || typeof mid !== "number") return;
          if (!seen.has(sid)) seen.set(sid, new Set<number>());
          const s = seen.get(sid)!;
          s.add(mid);
          counts.set(sid, s.size);
        });

        const items: SightItem[] = (sightRows ?? []).map((r: any) => ({
          pk_sighting_id: r.pk_sighting_id,
          sighting_date: r.sighting_date ?? null,
          island: r.island ?? null,
          location: (r.sitelocation ?? r.location ?? null),
          photographer: r.photographer ?? null,
          mantas_count: counts.get(r.pk_sighting_id) ?? 0,
        }));

        setRows(items);
      } catch (e) {
        console.error("[CatalogSightingsQuickModal] load error:", e);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, pk_catalog_id]);

  const title = useMemo(
    () => `Sightings for Catalog ${pk_catalog_id}`,
    [pk_catalog_id]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-muted-foreground p-2">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground p-2">No sightings found.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.pk_sighting_id} className="rounded border p-3">
                <div className="text-sm"><span className="font-medium">ID:</span> {r.pk_sighting_id}</div>
                <div className="text-sm"><span className="font-medium">Date:</span> {r.sighting_date ? new Date(r.sighting_date).toLocaleDateString() : "—"}</div>
                <div className="text-sm"><span className="font-medium">Location:</span> {r.location || "—"}{r.island ? `, ${r.island}` : ""}</div>
                <div className="text-sm"><span className="font-medium">Photographer:</span> {r.photographer || "—"}</div>
                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenMantas(r.pk_sighting_id)}
                  >
                    View Mantas ({r.mantas_count})
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
