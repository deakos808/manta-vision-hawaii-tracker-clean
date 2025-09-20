import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import AllMantasInSightingModal from "@/pages/browse_data/components/AllMantasInSightingModal";
import SightingNotesModal from "./SightingNotesModal";



type Sighting = {
  pk_sighting_id: number;
  sighting_date: string | null; // render as-is to avoid tz drift
  start_time: string | null;
  end_time: string | null;
  island: string | null;
  sitelocation: string | null;
  photographer: string | null;
  organization: string | null;
  notes?: string | null;
  total_mantas: number | null;
};

export default function CatalogSightingsModal(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pk_catalog_id: number | null;
}) {
  const { open, onOpenChange, pk_catalog_id } = props;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Sighting[]>([]);

  // nested: all mantas for a sighting
  const [mantasOpen, setMantasOpen] = useState(false);
  const [mantasSightingId, setMantasSightingId] = useState<number | null>(null);

  // nested: notes viewer
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesText, setNotesText] = useState<string>("");
  const [notesSightingId, setNotesSightingId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!open || !pk_catalog_id) return;
      setLoading(true);
      setErr(null);

      try {
        // 1) sighting ids from mantas for this catalog
        const { data: mantaRows, error: e1 } = await supabase
          .from("mantas")
          .select("fk_sighting_id")
          .eq("fk_catalog_id", pk_catalog_id);
        if (e1) throw e1;

        const ids = Array.from(
          new Set((mantaRows ?? []).map((r: any) => Number(r.fk_sighting_id)).filter(Boolean))
        );
        if (ids.length === 0) {
          if (active) setRows([]);
          return;
        }

        // 2) sightings metadata (+ notes)
        const { data: sightRows, error: e2 } = await supabase
          .from("sightings")
          .select(
            [
              "pk_sighting_id",
              "sighting_date",
              "start_time",
              "end_time",
              "island",
              "sitelocation",
              "photographer",
              "organization",
              "notes",
              "total_mantas",
            ].join(",")
          )
          .in("pk_sighting_id", ids)
          .order("sighting_date", { ascending: false });
        if (e2) throw e2;

        if (!active) return;
        setRows((sightRows ?? []) as Sighting[]);
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
  }, [open, pk_catalog_id]);

  const title = useMemo(() => {
    const count = rows.length;
    return pk_catalog_id
      ? `Sightings for Catalog ${pk_catalog_id} (${count} found)`
      : `Sightings (${count} found)`;
  }, [pk_catalog_id, rows.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Dates are rendered exactly as stored. Close to return to the same position in the list.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : err ? (
          <div className="text-sm text-red-600">Error: {err}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No sightings linked to this catalog yet.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((s) => (
              <div key={s.pk_sighting_id} className="rounded-lg border bg-white p-3">
                <div className="grid gap-2 text-sm md:grid-cols-3">
                  <div>
                    <div>
                      <span className="text-muted-foreground">Date:</span>{" "}
                      <span className="font-medium">{s.sighting_date ?? "unknown"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Time:</span>{" "}
                      {(s.start_time || "—") + " – " + (s.end_time || "—")}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Island:</span> {s.island || "—"}
                    </div>
                  </div>

                  <div>
                    <div>
                      <span className="text-muted-foreground">Location:</span>{" "}
                      {s.sitelocation || "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Photographer:</span>{" "}
                      {s.photographer || "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Organization:</span>{" "}
                      {s.organization || "—"}
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    {s.notes && s.notes.trim() ? (
                      <button
                        className="text-blue-700 underline text-sm"
                        onClick={() => {
                          setNotesSightingId(s.pk_sighting_id);
                          setNotesText(s.notes ?? "");
                          setNotesOpen(true);
                        }}
                        title="Open notes"
                      >
                        Notes
                      </button>
                    ) : (
                      <span className="text-sm text-muted-foreground">Notes: —</span>
                    )}

                    <Button
                      className="ml-auto bg-blue-600 text-white hover:bg-blue-700"
                      onClick={() => {
                        setMantasSightingId(s.pk_sighting_id);
                        setMantasOpen(true);
                      }}
                    >
                      View All Mantas
                      {typeof s.total_mantas === "number" ? ` (${s.total_mantas})` : ""}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* nested modals */}
        <AllMantasInSightingModal
          open={mantasOpen}
          onOpenChange={setMantasOpen}
          sightingId={mantasSightingId}
          priorityCatalogId={pk_catalog_id ?? undefined}
        />

        <SightingNotesModal
          open={notesOpen}
          onOpenChange={setNotesOpen}
          sightingId={notesSightingId}
          notes={notesText}
        />
      </DialogContent>
    </Dialog>
  );
}
