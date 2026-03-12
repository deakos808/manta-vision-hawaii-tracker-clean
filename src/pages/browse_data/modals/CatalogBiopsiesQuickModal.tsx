import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

type BiopsyRow = {
  pk_biopsy_id: string | number;
  fk_catalog_id: number | null;
  fk_sighting_id: number | null;
  sample_date: string | null;
  sample_time?: string | null;
  collector?: string | null;
  island?: string | null;
  region?: string | null;
  location?: string | null;
  sightings?: {
    sitelocation?: string | null;
    location?: string | null;
    region?: string | null;
    island?: string | null;
    photographer?: string | null;
  } | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pk_catalog_id: number;
};

function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
}

function fmtText(v?: string | null) {
  const s = String(v ?? "").trim();
  return s || "—";
}

export default function CatalogBiopsiesQuickModal({
  open,
  onOpenChange,
  pk_catalog_id,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<BiopsyRow[]>([]);

  useEffect(() => {
    if (!open) return;

    let alive = true;

    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("biopsies")
        .select(
          "pk_biopsy_id,fk_catalog_id,fk_sighting_id,sample_date,sample_time,collector,island,region,location," +
          "sightings:fk_sighting_id ( sitelocation, location, region, island, photographer )"
        )
        .eq("fk_catalog_id", pk_catalog_id)
        .order("sample_date", { ascending: false });

      if (!alive) return;

      if (error) {
        console.error("[CatalogBiopsiesQuickModal] load error:", error);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((data as BiopsyRow[]) ?? []);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [open, pk_catalog_id]);

  const title = useMemo(
    () => `Biopsies for Catalog ${pk_catalog_id}`,
    [pk_catalog_id]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Biopsy records linked to this catalog ID.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-muted-foreground p-2">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground p-2">No biopsy records found.</div>
        ) : (
          <div className="rounded border overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b">
                <tr className="text-left">
                  <th className="px-3 py-2">Biopsy ID</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Collector</th>
                  <th className="px-3 py-2">Sighting ID</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Region</th>
                  <th className="px-3 py-2">Island</th>
                  <th className="px-3 py-2">Photographer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const sight = row.sightings ?? null;
                  const loc = sight?.sitelocation ?? sight?.location ?? row.location ?? null;
                  const reg = sight?.region ?? row.region ?? null;
                  const isl = sight?.island ?? row.island ?? null;
                  const phot = sight?.photographer ?? null;

                  return (
                    <tr key={`${row.pk_biopsy_id}-${idx}`} className="border-b last:border-0">
                      <td className="px-3 py-2">{row.pk_biopsy_id}</td>
                      <td className="px-3 py-2">{fmtDate(row.sample_date)}</td>
                      <td className="px-3 py-2">{fmtText(row.sample_time)}</td>
                      <td className="px-3 py-2">{fmtText(row.collector)}</td>
                      <td className="px-3 py-2">{row.fk_sighting_id ?? "—"}</td>
                      <td className="px-3 py-2">{fmtText(loc)}</td>
                      <td className="px-3 py-2">{fmtText(reg)}</td>
                      <td className="px-3 py-2">{fmtText(isl)}</td>
                      <td className="px-3 py-2">{fmtText(phot)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
