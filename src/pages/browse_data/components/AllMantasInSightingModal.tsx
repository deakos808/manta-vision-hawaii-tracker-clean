import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import MantaPhotosModal from "@/components/mantas/MantaPhotosModal";

type MantaRow = {
  pk_manta_id: number;
  fk_catalog_id: number;
  name: string | null;
  gender: string | null;
  age_class: string | null;
  best_thumb_url: string | null;
  photo_count?: number; // photos for THIS sighting (all views)
};

const PUBLIC_BASE =
  "https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/manta-images";

export default function AllMantasInSightingModal(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sightingId: number | null;
  /** ensures the manta for this catalog appears first */
  priorityCatalogId?: number;
}) {
  const { open, onOpenChange, sightingId, priorityCatalogId } = props;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<MantaRow[]>([]);

  // nested photos modal (scoped to manta + sighting)
  const [photosOpen, setPhotosOpen] = useState(false);
  const [photosFor, setPhotosFor] =
    useState<{ mantaId: number; sightingId?: number } | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!open || !sightingId) return;
      setLoading(true);
      setErr(null);

      try {
        // 1) Mantas in this sighting (+ catalog name)
        const { data: mrows, error: e1 } = await supabase
          .from("mantas")
          .select(
            [
              "pk_manta_id",
              "fk_catalog_id",
              "catalog:fk_catalog_id ( name )",
            ].join(",")
          )
          .eq("fk_sighting_id", sightingId);
        if (e1) throw e1;

        const mantas: MantaRow[] = (mrows ?? []).map((r: any) => ({
          pk_manta_id: Number(r.pk_manta_id),
          fk_catalog_id: Number(r.fk_catalog_id),
          name: r.catalog?.name ?? null,
          gender: null,
          age_class: null,
          best_thumb_url: null,
          photo_count: 0,
        }));

        // 2) Enrich gender/age from catalog view
        const catIds = Array.from(new Set(mantas.map((m) => m.fk_catalog_id)));
        if (catIds.length) {
          const { data: catExtras } = await supabase
            .from("catalog_with_photo_view")
            .select("pk_catalog_id, gender, age_class")
            .in("pk_catalog_id", catIds);

          const extraMap = new Map<
            number,
            { gender: string | null; age_class: string | null }
          >();
          (catExtras ?? []).forEach((c: any) =>
            extraMap.set(Number(c.pk_catalog_id), {
              gender: c.gender ?? null,
              age_class: c.age_class ?? null,
            })
          );
          mantas.forEach((m) => {
            const ex = extraMap.get(m.fk_catalog_id);
            if (ex) {
              m.gender = ex.gender;
              m.age_class = ex.age_class;
            }
          });
        }

        // 3) Best-manta ventral thumbnails
        const mantaIds = mantas.map((m) => m.pk_manta_id);
        if (mantaIds.length) {
          const { data: bestRows } = await supabase
            .from("photos")
            .select("pk_photo_id,fk_manta_id")
            .eq("is_best_manta_ventral_photo", true)
            .in("fk_manta_id", mantaIds);

          const bestIds = (bestRows ?? [])
            .map((r: any) => Number(r.pk_photo_id))
            .filter(Boolean);

          const bestByManta = new Map<number, number>();
          (bestRows ?? []).forEach((r: any) => {
            if (r.fk_manta_id && r.pk_photo_id) {
              bestByManta.set(
                Number(r.fk_manta_id),
                Number(r.pk_photo_id)
              );
            }
          });

          if (bestIds.length) {
            const thumbs = new Map<number, string | null>();
            for (let i = 0; i < bestIds.length; i += 1000) {
              const chunk = bestIds.slice(i, i + 1000);
              const { data: trs } = await supabase
                .from("photos_with_photo_view")
                .select("pk_photo_id, thumbnail_url, storage_path")
                .in("pk_photo_id", chunk);
              (trs ?? []).forEach((t: any) => {
                const url =
                  t.thumbnail_url ||
                  (t.storage_path ? `${PUBLIC_BASE}/${t.storage_path}` : null);
                thumbs.set(Number(t.pk_photo_id), url);
              });
            }
            mantas.forEach((m) => {
              const pid = bestByManta.get(m.pk_manta_id);
              if (pid && thumbs.has(pid)) {
                m.best_thumb_url = thumbs.get(pid) ?? null;
              }
            });
          }

          // 4) Per-manta photo counts for THIS sighting (all views)
          const { data: pRows } = await supabase
            .from("photos")
            .select("fk_manta_id")
            .eq("fk_sighting_id", sightingId)
            .in("fk_manta_id", mantaIds);

          const countMap = new Map<number, number>();
          (pRows ?? []).forEach((r: any) => {
            const id = Number(r.fk_manta_id);
            countMap.set(id, (countMap.get(id) ?? 0) + 1);
          });
          mantas.forEach((m) => {
            m.photo_count = countMap.get(m.pk_manta_id) ?? 0;
          });
        }

        // 5) Sort: pin current catalog first, then by catalog id
        mantas.sort((a, b) => {
          const aPri =
            priorityCatalogId && a.fk_catalog_id === priorityCatalogId ? -1 : 0;
          const bPri =
            priorityCatalogId && b.fk_catalog_id === priorityCatalogId ? -1 : 0;
          if (aPri !== bPri) return aPri - bPri; // -1 first
          return a.fk_catalog_id - b.fk_catalog_id;
        });

        if (!active) return;
        setRows(mantas);
      } catch (e: any) {
        if (!active) return;
        setErr(e?.message || String(e));
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [open, sightingId, priorityCatalogId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Mantas in Sighting {sightingId ?? "—"}
          </DialogTitle>
          <DialogDescription>
            Best-manta ventral thumbnails shown. Close to return to the catalog list.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : err ? (
          <div className="text-sm text-red-600">Error: {err}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No mantas found for this sighting.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {rows.map((m) => (
              <div key={m.pk_manta_id} className="rounded-lg border bg-white p-3">
                <div className="flex gap-3">
                  <div className="h-20 w-20 overflow-hidden rounded border bg-gray-50">
                    <img
                      src={m.best_thumb_url || "/manta-logo.svg"}
                      alt={m.name ?? `Manta ${m.pk_manta_id}`}
                      className="h-full w-full object-cover"
                      onError={(e) =>
                        ((e.currentTarget as HTMLImageElement).src = "/manta-logo.svg")
                      }
                    />
                  </div>
                  <div className="text-sm">
                    <div className="font-semibold text-sky-700">
                      {m.name ?? "—"}
                    </div>
                    <div>Catalog ID: {m.fk_catalog_id}</div>
                    <div>Sex: {m.gender ?? "—"}</div>
                    <div>Age Class: {m.age_class ?? "—"}</div>

                    <div className="mt-2">
                      <button
                        className="text-xs text-blue-700 underline"
                        onClick={() => {
                          setPhotosFor({
                            mantaId: m.pk_manta_id,
                            sightingId: sightingId ?? undefined,
                          });
                          setPhotosOpen(true);
                        }}
                      >
                        View All Photos
                        {typeof m.photo_count === "number"
                          ? ` (${m.photo_count})`
                          : ""}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Photos popup (scoped to this manta + sighting) */}
        <MantaPhotosModal
          open={photosOpen}
          onOpenChange={setPhotosOpen}
          mantaId={photosFor?.mantaId ?? null}
          sightingId={photosFor?.sightingId}
        />
      </DialogContent>
    </Dialog>
  );
}
