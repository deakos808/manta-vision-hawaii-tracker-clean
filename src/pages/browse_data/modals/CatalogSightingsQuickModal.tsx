import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

function fmtDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
}

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

    let alive = true;

    setLoading(true);
    setRows([]);

    (async () => {
      try {
        const { data: mantaRows, error: mantaErr } = await supabase
          .from("mantas")
          .select("fk_sighting_id")
          .eq("fk_catalog_id", pk_catalog_id);

        if (mantaErr) throw mantaErr;

        const sightIds = Array.from(
          new Set(
            (mantaRows ?? [])
              .map((r: any) => Number(r.fk_sighting_id))
              .filter((n: number) => Number.isFinite(n) && n > 0)
          )
        );

        if (!alive) return;

        if (sightIds.length === 0) {
          setRows([]);
          setLoading(false);
          return;
        }

        const { data: sightRows, error: sightErr } = await supabase
          .from("sightings")
          .select("pk_sighting_id,sighting_date,island,sitelocation,location,photographer")
          .in("pk_sighting_id", sightIds)
          .order("sighting_date", { ascending: false });

        if (sightErr) throw sightErr;

        const { data: allMantas, error: countErr } = await supabase
          .from("mantas")
          .select("fk_sighting_id,pk_manta_id")
          .in("fk_sighting_id", sightIds);

        if (countErr) throw countErr;

        if (!alive) return;

        const countMap = new Map<number, number>();
        for (const row of allMantas ?? []) {
          const sid = Number((row as any).fk_sighting_id ?? 0);
          if (!sid) continue;
          countMap.set(sid, (countMap.get(sid) || 0) + 1);
        }

        const items: SightItem[] = (sightRows ?? []).map((r: any) => ({
          pk_sighting_id: Number(r.pk_sighting_id),
          sighting_date: r.sighting_date ?? null,
          island: r.island ?? null,
          location: r.sitelocation ?? r.location ?? null,
          photographer: r.photographer ?? null,
          mantas_count: countMap.get(Number(r.pk_sighting_id)) ?? 0,
        }));

        setRows(items);
      } catch (e) {
        console.error("[CatalogSightingsQuickModal] load error:", e);
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, pk_catalog_id]);

  const title = useMemo(
    () => `Sightings for Catalog ${pk_catalog_id}`,
    [pk_catalog_id]
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
          <div className="text-sm text-muted-foreground p-2">No sightings found.</div>
        ) : (
          <div className="rounded border overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b">
                <tr className="text-left">
                  <th className="px-3 py-2">Sighting ID</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Photographer</th>
                  <th className="px-3 py-2">Total Mantas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.pk_sighting_id} className="border-b last:border-0">
                    <td className="px-3 py-2">{r.pk_sighting_id}</td>
                    <td className="px-3 py-2">{fmtDate(r.sighting_date)}</td>
                    <td className="px-3 py-2">
                      {r.location || "—"}{r.island ? `, ${r.island}` : ""}
                    </td>
                    <td className="px-3 py-2">{r.photographer || "—"}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-blue-600 underline hover:text-blue-700"
                        onClick={() => onOpenMantas(r.pk_sighting_id)}
                      >
                        {r.mantas_count}
                      </button>
                    </td>
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
