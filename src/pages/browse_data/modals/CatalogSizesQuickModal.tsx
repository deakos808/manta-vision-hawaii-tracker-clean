import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

type SizeRow = {
  fk_catalog_id: number;
  measured_on: string | null;
  mean_m: number | null;
  min_m: number | null;
  max_m: number | null;
  n: number | null;
  prev_m: number | null;
  delta_m: number | null;
  years_between: number | null;
  growth_cm_per_year: number | null;
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

function fmtNum(v?: number | null, digits = 2) {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "—";
}

export default function CatalogSizesQuickModal({
  open,
  onOpenChange,
  pk_catalog_id,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SizeRow[]>([]);

  useEffect(() => {
    if (!open) return;

    let alive = true;

    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("v_catalog_size_history")
        .select("*")
        .eq("fk_catalog_id", pk_catalog_id)
        .order("measured_on", { ascending: false });

      if (!alive) return;

      if (error) {
        console.error("[CatalogSizesQuickModal] load error:", error);
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((data as SizeRow[]) ?? []);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [open, pk_catalog_id]);

  const title = useMemo(
    () => `Sizes for Catalog ${pk_catalog_id}`,
    [pk_catalog_id]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Size history records linked to this catalog ID.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-muted-foreground p-2">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground p-2">No size records found.</div>
        ) : (
          <div className="rounded border overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white border-b">
                <tr className="text-left">
                  <th className="px-3 py-2">Measured On</th>
                  <th className="px-3 py-2">Mean (m)</th>
                  <th className="px-3 py-2">Min (m)</th>
                  <th className="px-3 py-2">Max (m)</th>
                  <th className="px-3 py-2">N</th>
                  <th className="px-3 py-2">Prev (m)</th>
                  <th className="px-3 py-2">Δ (m)</th>
                  <th className="px-3 py-2">Years</th>
                  <th className="px-3 py-2">Growth (cm/yr)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={`${row.fk_catalog_id}-${row.measured_on ?? idx}`} className="border-b last:border-0">
                    <td className="px-3 py-2">{fmtDate(row.measured_on)}</td>
                    <td className="px-3 py-2">{fmtNum(row.mean_m)}</td>
                    <td className="px-3 py-2">{fmtNum(row.min_m)}</td>
                    <td className="px-3 py-2">{fmtNum(row.max_m)}</td>
                    <td className="px-3 py-2">{row.n ?? "—"}</td>
                    <td className="px-3 py-2">{fmtNum(row.prev_m)}</td>
                    <td className="px-3 py-2">{fmtNum(row.delta_m)}</td>
                    <td className="px-3 py-2">{fmtNum(row.years_between)}</td>
                    <td className="px-3 py-2">{fmtNum(row.growth_cm_per_year)}</td>
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
