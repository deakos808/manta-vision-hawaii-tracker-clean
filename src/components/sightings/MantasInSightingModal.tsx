// src/components/sightings/MantasInSightingModal.tsx
import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sightingId: number | null;
};

type MantaListRow = {
  pk_manta_id: number;
  fk_catalog_id: number;
  name: string | null;
  gender: string | null;
  age_class: string | null;
  best_thumb_url: string | null;
};

export default function MantasInSightingModal({ open, onOpenChange, sightingId }: Props) {
  const [rows, setRows] = useState<MantaListRow[]>([]);
  const [loading, setLoading] = useState(false);

  const title = useMemo(
    () => (sightingId ? `Mantas in sighting #${sightingId}` : "Mantas"),
    [sightingId]
  );

  useEffect(() => {
    if (!open || !sightingId) return;

    let active = true;
    (async () => {
      setLoading(true);

      // 1) Pull mantas for the sighting with catalog name and traits
      const { data: mantaRows, error } = await supabase
        .from("mantas")
        .select("pk_manta_id, fk_catalog_id, gender, age_class, catalog:fk_catalog_id ( name )")
        .eq("fk_sighting_id", sightingId)
        .order("pk_manta_id", { ascending: true });

      if (!active) return;

      if (error) {
        console.error("mantas list error:", error);
        setRows([]);
        setLoading(false);
        return;
      }

      const list: MantaListRow[] =
        (mantaRows ?? []).map((r: any) => ({
          pk_manta_id: r.pk_manta_id,
          fk_catalog_id: r.fk_catalog_id,
          name: r.catalog?.name ?? null,
          gender: r.gender ?? null,
          age_class: r.age_class ?? null,
          best_thumb_url: null,
        })) ?? [];

      if (list.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const mantaIds = list.map((m) => m.pk_manta_id);

      // 2) Best-ventral photo ids per manta
      const { data: bestRows } = await supabase
        .from("photos")
        .select("pk_photo_id,fk_manta_id")
        .eq("is_best_manta_ventral_photo", true)
        .in("fk_manta_id", mantaIds);

      const bestByManta = new Map<number, number>();
      const bestIds: number[] = [];
      for (const r of bestRows ?? []) {
        if (r.fk_manta_id && r.pk_photo_id) {
          bestByManta.set(r.fk_manta_id, r.pk_photo_id);
          bestIds.push(r.pk_photo_id as number);
        }
      }

      // 3) Thumbnails for those best ids
      if (bestIds.length > 0) {
        const { data: thumbRows } = await supabase
          .from("photos_with_photo_view")
          .select("pk_photo_id, thumbnail_url")
          .in("pk_photo_id", bestIds);

        const thumbById = new Map<number, string | null>(
          (thumbRows ?? []).map((t: any) => [t.pk_photo_id as number, (t.thumbnail_url as string) ?? null])
        );

        for (const m of list) {
          const pid = bestByManta.get(m.pk_manta_id);
          if (pid) m.best_thumb_url = thumbById.get(pid) ?? null;
        }
      }

      setRows(list);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [open, sightingId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="rounded-md border">
          <ScrollArea className="h-80">
            {loading ? (
              <div className="p-3 text-sm text-muted-foreground">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">No mantas found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="text-left">
                    <th className="px-3 py-2 w-[72px]">Thumb</th>
                    <th className="px-3 py-2 w-[160px]">Manta ID</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2 w-[120px]">Sex</th>
                    <th className="px-3 py-2 w-[140px]">Age Class</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.pk_manta_id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="h-12 w-12 overflow-hidden rounded border bg-muted">
                          {/* eslint-disable-next-line jsx-a11y/alt-text */}
                          <img
                            src={m.best_thumb_url || "/manta-logo.svg"}
                            className="h-full w-full object-cover"
                            onError={(e) =>
                              ((e.target as HTMLImageElement).src = "/manta-logo.svg")
                            }
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          to={`/browse/mantas?sightingId=${sightingId}#m${m.pk_manta_id}`}
                          className="text-blue-600 hover:underline"
                        >
                          #{m.pk_manta_id}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{m.name ?? "—"}</td>
                      <td className="px-3 py-2">{m.gender ?? "—"}</td>
                      <td className="px-3 py-2">{m.age_class ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ScrollArea>
        </div>

        <div className="mt-3 flex justify-end">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
