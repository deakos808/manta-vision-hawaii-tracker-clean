import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mantaId: number | null;
  sightingId?: number | undefined;
};

type PhotoBasic = {
  pk_photo_id: number;
  photo_view?: string | null;
  thumbnail_url?: string | null;
  is_best_manta_ventral_photo?: boolean | null;
  is_best_catalog_ventral_photo?: boolean | null;
  is_best_manta_dorsal_photo?: boolean | null;
  is_best_catalog_dorsal_photo?: boolean | null;
};

export default function MantaPhotosModal({ open, onOpenChange, mantaId, sightingId }: Props) {
  const [rows, setRows] = useState<PhotoBasic[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !mantaId) return;

    let active = true;
    (async () => {
      setLoading(true);

      // 1) All photos for manta (optional sighting scope), include thumbnails
      let qView = supabase
        .from("photos_with_photo_view")
        .select("pk_photo_id, photo_view, fk_manta_id, fk_sighting_id, thumbnail_url")
        .eq("fk_manta_id", mantaId);
      if (sightingId) qView = qView.eq("fk_sighting_id", sightingId);

      const { data: viewRows, error: viewErr } = await qView;
      if (!active) return;

      if (viewErr) {
        console.error("photos_with_photo_view error:", viewErr);
        setRows([]);
        setLoading(false);
        return;
      }

      const ids = (viewRows ?? []).map((r: any) => r.pk_photo_id);
      if (ids.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      // 2) Best flags from base table
      const { data: flagRows, error: flagErr } = await supabase
        .from("photos")
        .select(
          "pk_photo_id, is_best_manta_ventral_photo, is_best_catalog_ventral_photo, is_best_manta_dorsal_photo, is_best_catalog_dorsal_photo"
        )
        .in("pk_photo_id", ids);

      if (flagErr) console.error("photos flags error:", flagErr);

      const flagsById = new Map<number, any>();
      for (const r of flagRows ?? []) flagsById.set(r.pk_photo_id, r);

      const merged: PhotoBasic[] =
        (viewRows ?? [])
          .map((r: any) => {
            const f = flagsById.get(r.pk_photo_id) ?? {};
            return {
              pk_photo_id: r.pk_photo_id,
              photo_view: r.photo_view,
              thumbnail_url: r.thumbnail_url ?? null,
              is_best_manta_ventral_photo: f.is_best_manta_ventral_photo ?? null,
              is_best_catalog_ventral_photo: f.is_best_catalog_ventral_photo ?? null,
              is_best_manta_dorsal_photo: f.is_best_manta_dorsal_photo ?? null,
              is_best_catalog_dorsal_photo: f.is_best_catalog_dorsal_photo ?? null,
            };
          })
          .sort((a, b) => a.pk_photo_id - b.pk_photo_id) ?? [];

      setRows(merged);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [open, mantaId, sightingId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Photos for manta #{mantaId ?? "—"}</DialogTitle>
        </DialogHeader>

        <div className="rounded-md border">
          <ScrollArea className="h-80">
            {loading ? (
              <div className="p-3 text-sm text-muted-foreground">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">No photos found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="text-left">
                    <th className="px-3 py-2 w-[72px]">Thumb</th>
                    <th className="px-3 py-2 w-[120px]">Photo ID</th>
                    <th className="px-3 py-2 w-[120px]">View</th>
                    <th className="px-3 py-2">Best Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const flags: string[] = [];
                    if (r.is_best_manta_ventral_photo) flags.push("best manta ventral");
                    if (r.is_best_catalog_ventral_photo) flags.push("best catalog ventral");
                    if (r.is_best_manta_dorsal_photo) flags.push("best manta dorsal");
                    if (r.is_best_catalog_dorsal_photo) flags.push("best catalog dorsal");

                    return (
                      <tr key={r.pk_photo_id} className="border-t">
                        <td className="px-3 py-2">
                          <div className="h-12 w-12 overflow-hidden rounded border bg-muted">
                            {/* eslint-disable-next-line jsx-a11y/alt-text */}
                            <img
                              src={r.thumbnail_url || "/manta-logo.svg"}
                              className="h-full w-full object-cover"
                              onError={(e) =>
                                ((e.target as HTMLImageElement).src = "/manta-logo.svg")
                              }
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono">{r.pk_photo_id}</td>
                        <td className="px-3 py-2">{r.photo_view ?? "—"}</td>
                        <td className="px-3 py-2">
                          {flags.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {flags.map((f, i) => (
                                <Badge key={i} variant="secondary">
                                  {f}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </ScrollArea>
        </div>

        <div className="mt-3 flex justify-end">
          <a
            href="#"
            className="text-primary text-sm hover:underline underline-offset-2"
            onClick={(e) => {
              e.preventDefault();
              onOpenChange(false);
            }}
          >
            Close
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
