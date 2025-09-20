import * as React from "react";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  getCatalogIndividualsForSighting,
  getSightingsForCatalog,
  getBestMantaVentralPhotoIdsForCatalogs,
  getPublicUrlsForPhotoIds,
} from "../data/catalog.service";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pk_catalog_id: number | null;
};

// Format a date safely without timezone shift.
// If it's a pure YYYY-MM-DD, render that exact date.
// Otherwise, render the timestamp pinned to UTC so local TZ doesn't shift it back a day.
function fmtUsDate(raw: any): string {
  if (!raw) return "—";
  const s = String(raw);

  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const y = m[1], mm = Number(m[2]), dd = Number(m[3]);
    return `${mm}/${dd}/${y}`;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { timeZone: "UTC" });
}

export default function SightingsListModal({ open, onOpenChange, pk_catalog_id }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // sub-dialog: all mantas in a sighting
  const [showAllFor, setShowAllFor] = useState<number | null>(null);
  const [individuals, setIndividuals] = useState<any[]>([]);
  const [loadingIndividuals, setLoadingIndividuals] = useState(false);

  // sub-dialog: notes
  const [notesFor, setNotesFor] = useState<{ id: number; text: string } | null>(null);

  // Load sightings for this catalog id
  useEffect(() => {
    if (!open || !pk_catalog_id) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const list = await getSightingsForCatalog(pk_catalog_id);
        if (!cancel) setRows(list);
      } catch {
        if (!cancel) setRows([]);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [open, pk_catalog_id]);

  // Open the "all mantas in this sighting" list (with best-manta thumbs)
  async function openAllMantas(sightingId: number) {
    setShowAllFor(sightingId);
    setLoadingIndividuals(true);
    try {
      const list = await getCatalogIndividualsForSighting(sightingId);

      // batch best-manta photo ids by catalog
      const catIds = Array.from(new Set((list ?? []).map((r: any) => r.fk_catalog_id).filter(Boolean)));
      const bestMap = await getBestMantaVentralPhotoIdsForCatalogs(catIds);

      // get public urls for those best photo ids
      const bestIds = Object.values(bestMap).filter(Boolean) as number[];
      const urlMap = await getPublicUrlsForPhotoIds(bestIds);

      const enriched = (list ?? []).map((r: any) => {
        const bestId = bestMap[r.fk_catalog_id] ?? null;
        return {
          pk_manta_id: r.pk_manta_id,
          fk_catalog_id: r.fk_catalog_id,
          name: r?.catalog?.name ?? "—",
          best_url: bestId ? urlMap[bestId] ?? null : null,
        };
      });

      setIndividuals(enriched);
    } finally {
      setLoadingIndividuals(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Sightings for #{pk_catalog_id ?? "—"}</DialogTitle>
          </DialogHeader>

          <div className="rounded-md border">
            <ScrollArea className="h-80">
              {loading ? (
                <div className="p-3 text-sm text-muted-foreground">Loading…</div>
              ) : rows.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">No sightings found.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Date</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="w-[140px] text-right">Total mantas</TableHead>
                      <TableHead className="w-[120px] text-right">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const s = r.sightings;
                      const sightingId = (r.fk_sighting_id ?? s?.pk_sighting_id) as number;
                      const rawDate = s?.sighting_date ?? s?.date ?? s?.observed_at ?? s?.created_at;
                      const date = fmtUsDate(rawDate);
                      const loc =
                        s?.sitelocation ??
                        s?.location ??
                        s?.site ??
                        s?.place ??
                        s?.island_location ??
                        s?.island ??
                        "—";
                      const total = typeof s?.total_mantas === "number" ? s.total_mantas : 0;
                      const notesText = (s?.notes as string | null) ?? null;
                      const hasNotes = !!notesText && notesText.trim().length > 0;

                      return (
                        <TableRow key={`${sightingId}-${r.fk_catalog_id}`}>
                          <TableCell>{date}</TableCell>
                          <TableCell className="truncate">{loc}</TableCell>
                          <TableCell className="text-right">
                            <a
                              href="#"
                              className="text-primary hover:underline underline-offset-2"
                              onClick={(e) => {
                                e.preventDefault();
                                if (sightingId) openAllMantas(sightingId);
                              }}
                              title="View all mantas in this sighting"
                            >
                              {total}
                            </a>
                          </TableCell>
                          <TableCell className="text-right">
                            {hasNotes ? (
                              <a
                                href="#"
                                className="text-primary hover:underline underline-offset-2"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setNotesFor({ id: sightingId, text: notesText! });
                                }}
                                title="View notes"
                              >
                                Notes
                              </a>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </div>

          <div className="mt-3 flex justify-end">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onOpenChange(false);
              }}
              className="text-primary hover:underline underline-offset-2 text-sm"
            >
              Close
            </a>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sub-dialog: All mantas in a sighting */}
      <Dialog open={!!showAllFor} onOpenChange={() => setShowAllFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mantas in sighting #{showAllFor ?? ""}</DialogTitle>
          </DialogHeader>
          <div className="rounded-md border p-3">
            {loadingIndividuals ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : individuals.length === 0 ? (
              <div className="text-sm text-muted-foreground">No mantas listed.</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {individuals.map((r, i) => (
                  <li key={i} className="flex items-center gap-3">
                    {r.best_url ? (
                      <a href={r.best_url} target="_blank" rel="noreferrer" title="Open image in new tab">
                        <img
                          src={r.best_url}
                          alt={`best manta ventral for catalog #${r.fk_catalog_id}`}
                          className="h-10 w-10 rounded object-cover border"
                        />
                      </a>
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted border flex items-center justify-center text-xs text-muted-foreground">—</div>
                    )}
                    <div className="truncate">
                      <div className="font-medium truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground">Catalog ID: #{r.fk_catalog_id}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setShowAllFor(null);
              }}
              className="text-primary hover:underline underline-offset-2 text-sm"
            >
              Close
            </a>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sub-dialog: Notes (scrollable) */}
      <Dialog open={!!notesFor} onOpenChange={() => setNotesFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Notes for sighting #{notesFor?.id ?? ""}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-64 rounded border p-3 text-sm">
            {notesFor?.text?.trim() ? notesFor.text : "—"}
          </ScrollArea>
          <div className="flex justify-end">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setNotesFor(null);
              }}
              className="text-primary hover:underline underline-offset-2 text-sm"
            >
              Close
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
