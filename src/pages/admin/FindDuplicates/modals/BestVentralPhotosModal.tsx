import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { getBestCatalogVentralPhoto, getBestMantaVentralPhotosForCatalog, setBestCatalogVentralPhoto } from "../data/catalog.service";
import type { PhotoRow } from "../data/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pk_catalog_id: number | null;
  onSaved?: () => void;
};

function publicUrl(path: string | null) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const base = import.meta.env.VITE_SUPABASE_URL;
  const BUCKET = "manta-images"; // change if needed
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return `${base}/storage/v1/object/public/${BUCKET}/${normalized}`;
}

export default function BestVentralPhotosModal({ open, onOpenChange, pk_catalog_id, onSaved }: Props) {
  const [current, setCurrent] = useState<PhotoRow | null>(null);
  const [candidates, setCandidates] = useState<PhotoRow[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const changed = useMemo(
    () => (current?.pk_photo_id ?? null) !== (selected ?? null),
    [current?.pk_photo_id, selected]
  );

  useEffect(() => {
    if (!open || !pk_catalog_id) return;
    (async () => {
      const [best, opts] = await Promise.all([
        getBestCatalogVentralPhoto(pk_catalog_id),
        getBestMantaVentralPhotosForCatalog(pk_catalog_id),
      ]);
      setCurrent(best);
      setSelected(best?.pk_photo_id ?? null);
      setCandidates(opts);
    })().catch(() => {
      setCurrent(null);
      setCandidates([]);
    });
  }, [open, pk_catalog_id]);

  async function handleSave() {
    if (!pk_catalog_id) return;
    setSaving(true);
    try {
      await setBestCatalogVentralPhoto(pk_catalog_id, selected); // server impl can be added next
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && changed) {
          if (confirm("Save changes to best ventral photo?")) {
            handleSave().catch(() => void 0);
            return;
          }
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review Best Catalog Ventral Photo {pk_catalog_id ? `(#${pk_catalog_id})` : ""}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border p-2">
            <div className="mb-2 text-xs text-muted-foreground">Current</div>
            <div className="h-64 overflow-hidden rounded bg-muted">
              {current?.storage_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={publicUrl(current.storage_path)} className="h-full w-full object-contain" alt="Current best" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">None</div>
              )}
            </div>
          </div>

          <div className="rounded-md border p-2">
            <div className="mb-2 text-xs text-muted-foreground">Choose New</div>
            <ScrollArea className="h-64">
              <div className="grid grid-cols-2 gap-2 pr-2">
                {candidates.map((p) => (
                  <button
                    key={p.pk_photo_id}
                    className={`relative aspect-square overflow-hidden rounded border ${selected === p.pk_photo_id ? "ring-2 ring-primary" : ""}`}
                    onClick={() => setSelected(p.pk_photo_id)}
                    title={`Photo #${p.pk_photo_id}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={publicUrl(p.storage_path)} className="h-full w-full object-cover" alt={`Photo ${p.pk_photo_id}`} />
                    {selected === p.pk_photo_id && (
                      <span className="absolute bottom-1 right-1 rounded bg-background/80 px-2 text-xs">Selected</span>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Close
          </Button>
          <Button onClick={handleSave} disabled={!changed || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
