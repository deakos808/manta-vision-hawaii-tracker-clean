import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type MantaRow = {
  pk_manta_id: number;
  fk_catalog_id: number;
  fk_sighting_id: number;
  name: string | null;
  gender: string | null;
  age_class: string | null;
  thumbnail_url: string | null;
};

export default function AllMantasInSightingModal(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sightingId: number | null;
}) {
  const { open, onOpenChange, sightingId } = props;

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MantaRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!open || !sightingId) return;

      setLoading(true);
      setError(null);
      setRows([]);

      const { data: mantaRows, error: mantaError } = await supabase
        .from("mantas")
        .select("pk_manta_id,fk_catalog_id,fk_sighting_id")
        .eq("fk_sighting_id", sightingId)
        .order("pk_manta_id", { ascending: true });

      if (!alive) return;

      if (mantaError) {
        setError(mantaError.message);
        setLoading(false);
        return;
      }

      const baseRows = (mantaRows ?? []).map((r: any) => ({
        pk_manta_id: Number(r.pk_manta_id),
        fk_catalog_id: Number(r.fk_catalog_id),
        fk_sighting_id: Number(r.fk_sighting_id),
        name: null,
        gender: null,
        age_class: null,
        thumbnail_url: null,
      })) as MantaRow[];

      if (baseRows.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const catalogIds = Array.from(
        new Set(
          baseRows
            .map((r) => Number(r.fk_catalog_id))
            .filter((n) => Number.isFinite(n) && n > 0)
        )
      );

      const mantaIds = Array.from(
        new Set(
          baseRows
            .map((r) => Number(r.pk_manta_id))
            .filter((n) => Number.isFinite(n) && n > 0)
        )
      );

      const { data: catalogRows, error: catalogError } = await supabase
        .from("catalog_with_photo_view")
        .select("pk_catalog_id,name,gender,age_class")
        .in("pk_catalog_id", catalogIds);

      if (!alive) return;

      if (catalogError) {
        setError(catalogError.message);
        setLoading(false);
        return;
      }

      const catalogMap = new Map<number, { name: string | null; gender: string | null; age_class: string | null }>();
      for (const row of catalogRows ?? []) {
        const id = Number((row as any).pk_catalog_id);
        if (!catalogMap.has(id)) {
          catalogMap.set(id, {
            name: (row as any).name ?? null,
            gender: (row as any).gender ?? null,
            age_class: (row as any).age_class ?? null,
          });
        }
      }

      const { data: bestPhotoRows, error: bestPhotoError } = await supabase
        .from("photos")
        .select("pk_photo_id,fk_manta_id")
        .eq("is_best_manta_ventral_photo", true)
        .in("fk_manta_id", mantaIds);

      if (!alive) return;

      if (bestPhotoError) {
        setError(bestPhotoError.message);
        setLoading(false);
        return;
      }

      const bestPhotoByManta = new Map<number, number>();
      const bestPhotoIds: number[] = [];

      for (const row of bestPhotoRows ?? []) {
        const mantaId = Number((row as any).fk_manta_id);
        const photoId = Number((row as any).pk_photo_id);
        if (!bestPhotoByManta.has(mantaId)) {
          bestPhotoByManta.set(mantaId, photoId);
          bestPhotoIds.push(photoId);
        }
      }

      const thumbnailMap = new Map<number, string | null>();

      if (bestPhotoIds.length > 0) {
        const { data: thumbRows, error: thumbError } = await supabase
          .from("photos_with_photo_view")
          .select("pk_photo_id,thumbnail_url")
          .in("pk_photo_id", bestPhotoIds);

        if (!alive) return;

        if (thumbError) {
          setError(thumbError.message);
          setLoading(false);
          return;
        }

        for (const row of thumbRows ?? []) {
          thumbnailMap.set(
            Number((row as any).pk_photo_id),
            (row as any).thumbnail_url ?? null
          );
        }
      }

      const merged = baseRows.map((row) => {
        const catalog = catalogMap.get(row.fk_catalog_id);
        const bestPhotoId = bestPhotoByManta.get(row.pk_manta_id);

        return {
          ...row,
          name: catalog?.name ?? null,
          gender: catalog?.gender ?? null,
          age_class: catalog?.age_class ?? null,
          thumbnail_url: bestPhotoId ? thumbnailMap.get(bestPhotoId) ?? null : null,
        };
      });

      setRows(merged);
      setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, [open, sightingId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {sightingId ? `Mantas in Sighting ${sightingId}` : "Mantas"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No manta rows found for this sighting.
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b text-left">
                  <th className="px-3 py-2">Thumbnail</th>
                  <th className="px-3 py-2">Manta ID</th>
                  <th className="px-3 py-2">Catalog ID</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Gender</th>
                  <th className="px-3 py-2">Age Class</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.pk_manta_id} className="border-b align-middle">
                    <td className="px-3 py-2">
                      <div className="h-14 w-14 overflow-hidden rounded border bg-gray-50">
                        <img
                          src={row.thumbnail_url || "/manta-logo.svg"}
                          alt={row.name || `Manta ${row.pk_manta_id}`}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = "/manta-logo.svg";
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2">{row.pk_manta_id}</td>
                    <td className="px-3 py-2">{row.fk_catalog_id}</td>
                    <td className="px-3 py-2">{row.name || "—"}</td>
                    <td className="px-3 py-2">{row.gender || "—"}</td>
                    <td className="px-3 py-2">{row.age_class || "—"}</td>
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
