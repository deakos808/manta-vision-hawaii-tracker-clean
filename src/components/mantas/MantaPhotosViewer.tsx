import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useIsAdmin } from "@/lib/isAdmin";

type View = "ventral" | "dorsal" | "other";

type PhotoRow = {
  pk_photo_id: number | null;
  fk_manta_id: number | null;
  storage_path: string | null;
  photo_view: View | null; // use this column from your schema
  is_best_manta_ventral_photo: boolean | null;
  is_best_manta_dorsal_photo: boolean | null;
};

type MantaRow = {
  pk_manta_id: number | null;
  no_ventral_photos?: boolean | null;
  no_photos_expected?: boolean | null;
};

type Props = { open: boolean; onOpenChange: (v: boolean) => void; mantaId: number | null; 
  onCount?: (mantaId: number, count: number) => void;
  onRowsChanged?: (rows: PhotoRow[]) => void;
};

export default function MantaPhotosViewer({ open, onOpenChange, mantaId, onCount, onRowsChanged }: Props) {
  const isAdmin = useIsAdmin();
  const [rows, setRows] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<null | View>(null);
  const [savingViewId, setSavingViewId] = useState<number | null>(null);
  const [noVentralPhotos, setNoVentralPhotos] = useState(false);
  const [savingNoVentralPhotos, setSavingNoVentralPhotos] = useState(false);
  const [noVentralPhotosAvailable, setNoVentralPhotosAvailable] = useState(true);
  const [noPhotosExpected, setNoPhotosExpected] = useState(false);
  const [savingNoPhotosExpected, setSavingNoPhotosExpected] = useState(false);
  const [noPhotosExpectedAvailable, setNoPhotosExpectedAvailable] = useState(true);
  const canEdit = !!isAdmin;

  useEffect(() => {
    if (!open || !mantaId) return;
    let stop = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("photos")
        .select("pk_photo_id, fk_manta_id, storage_path, photo_view, is_best_manta_ventral_photo, is_best_manta_dorsal_photo")
        .eq("fk_manta_id", mantaId)
        .order("photo_view", { ascending: true })
        .order("pk_photo_id", { ascending: true });

      const { data: mantaData, error: mantaError } = await supabase
        .from("mantas")
        .select("pk_manta_id, no_ventral_photos, no_photos_expected")
        .eq("pk_manta_id", mantaId)
        .maybeSingle();

      if (!stop) {
        if (error) {
          console.warn("[MantaPhotosViewer] fetch error:", error.message);
          setRows([]);
        } else {
          const nextRows = (data as PhotoRow[]) || [];
          setRows(nextRows);
          onRowsChanged?.(nextRows);
        }
        if (mantaError) {
          console.warn("[MantaPhotosViewer] manta flags fetch unavailable:", mantaError.message);
          setNoVentralPhotos(false);
          setNoVentralPhotosAvailable(false);
          setNoPhotosExpected(false);
          setNoPhotosExpectedAvailable(false);
        } else {
          const mantaRow = mantaData as MantaRow | null;
          setNoVentralPhotos(!!mantaRow?.no_ventral_photos);
          setNoVentralPhotosAvailable(true);
          setNoPhotosExpected(!!mantaRow?.no_photos_expected);
          setNoPhotosExpectedAvailable(true);
        }
        setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [open, mantaId, onRowsChanged]);

  const groups = useMemo(() => {
    const g: Record<View, PhotoRow[]> = { ventral: [], dorsal: [], other: [] };
    for (const r of rows) {
      const rawView = String(r.photo_view || "other").toLowerCase();
      const v = rawView === "ventral" || rawView === "dorsal" ? rawView : "other";
      g[v].push(r);
    }
    return g;
  }, [rows]);

  if (!open) return null;

  const urlFor = (r: PhotoRow) => {
    if (!r.storage_path) return "";
    const { data } = supabase.storage.from("manta-images").getPublicUrl(r.storage_path);
    return data?.publicUrl || "";
  };

  async function setBest(view: View, target: PhotoRow) {
    if (!canEdit || !mantaId || !target.pk_photo_id) return;
    setSaving(view);
    try {
      await supabase
        .from("photos")
        .update(view === "ventral" ? { is_best_manta_ventral_photo: false } : { is_best_manta_dorsal_photo: false })
        .eq("fk_manta_id", mantaId);

      await supabase
        .from("photos")
        .update(view === "ventral" ? { is_best_manta_ventral_photo: true } : { is_best_manta_dorsal_photo: true })
        .eq("pk_photo_id", target.pk_photo_id);

      if (view === "ventral" && noVentralPhotosAvailable && noVentralPhotos) {
        const { error } = await supabase
          .from("mantas")
          .update({ no_ventral_photos: false })
          .eq("pk_manta_id", mantaId);
        if (!error) setNoVentralPhotos(false);
      }

      const nextRows = rows.map(p => {
          const isTarget = p.pk_photo_id === target.pk_photo_id;
          return view === "ventral"
            ? { ...p, is_best_manta_ventral_photo: isTarget }
            : { ...p, is_best_manta_dorsal_photo: isTarget };
        });
      setRows(nextRows);
      onRowsChanged?.(nextRows);
    } finally {
      setSaving(null);
    }
  }

  async function updatePhotoView(target: PhotoRow, nextView: View) {
    if (!canEdit || !target.pk_photo_id || target.photo_view === nextView) return;
    const previousView = target.photo_view;
    setSavingViewId(target.pk_photo_id);
    const nextRows = rows.map((row) =>
      row.pk_photo_id === target.pk_photo_id ? { ...row, photo_view: nextView } : row,
    );
    setRows(nextRows);
    onRowsChanged?.(nextRows);

    const { error } = await supabase
      .from("photos")
      .update({ photo_view: nextView })
      .eq("pk_photo_id", target.pk_photo_id);

    if (error) {
      const rolledBackRows = rows.map((row) =>
        row.pk_photo_id === target.pk_photo_id ? { ...row, photo_view: previousView } : row,
      );
      setRows(rolledBackRows);
      onRowsChanged?.(rolledBackRows);
      console.error("[MantaPhotosViewer] update photo_view failed", error);
      alert("Failed to update photo view.");
    } else if (nextView === "ventral" && noVentralPhotosAvailable && noVentralPhotos && mantaId) {
      const { error: mantaError } = await supabase
        .from("mantas")
        .update({ no_ventral_photos: false })
        .eq("pk_manta_id", mantaId);
      if (!mantaError) setNoVentralPhotos(false);
    }
    setSavingViewId(null);
  }

  async function updateNoVentralPhotos(nextValue: boolean) {
    if (!canEdit || !mantaId || !noVentralPhotosAvailable) return;
    setSavingNoVentralPhotos(true);
    const previousValue = noVentralPhotos;
    setNoVentralPhotos(nextValue);

    const { error } = await supabase
      .from("mantas")
      .update({ no_ventral_photos: nextValue })
      .eq("pk_manta_id", mantaId);

    if (error) {
      setNoVentralPhotos(previousValue);
      console.error("[MantaPhotosViewer] update no_ventral_photos failed", error);
      alert("Failed to update no ventral photos flag.");
    }
    setSavingNoVentralPhotos(false);
  }

  async function updateNoPhotosExpected(nextValue: boolean) {
    if (!canEdit || !mantaId || !noPhotosExpectedAvailable) return;
    if (nextValue && rows.length > 0) {
      alert("This manta already has linked photos. Clear or move those photo links before marking no photos expected.");
      return;
    }

    setSavingNoPhotosExpected(true);
    const previousValue = noPhotosExpected;
    setNoPhotosExpected(nextValue);

    const { error } = await supabase
      .from("mantas")
      .update({ no_photos_expected: nextValue })
      .eq("pk_manta_id", mantaId);

    if (error) {
      setNoPhotosExpected(previousValue);
      console.error("[MantaPhotosViewer] update no_photos_expected failed", error);
      alert("Failed to update no photos expected flag.");
    }
    setSavingNoPhotosExpected(false);
  }

  const ViewToggle: React.FC<{ row: PhotoRow }> = ({ row }) => {
    const currentView = (row.photo_view || "other") as View;
    return (
      <div className="mt-2">
        <div className="mb-1 text-[11px] text-slate-600">View</div>
        <div className="grid grid-cols-3 rounded border bg-slate-50 p-0.5">
          {(["ventral", "dorsal", "other"] as View[]).map((viewOption) => {
            const selected = currentView === viewOption;
            return (
              <button
                key={viewOption}
                type="button"
                className={[
                  "rounded px-1.5 py-1 text-[11px] capitalize transition",
                  selected ? "bg-white font-medium text-slate-950 shadow-sm" : "text-slate-600 hover:bg-white/70",
                ].join(" ")}
                disabled={savingViewId === row.pk_photo_id}
                aria-pressed={selected}
                onClick={() => updatePhotoView(row, viewOption)}
              >
                {viewOption}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const Section: React.FC<{ label: string; list: PhotoRow[]; view: View }> = ({ label, list, view }) => (
    <div className="mb-6">
      <div className="text-sm font-medium mb-2">{label} ({list.length})</div>
      {list.length === 0 ? (
        <div className="text-xs text-muted-foreground">— none —</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {list.map((r) => {
            const url = urlFor(r);
            const bestV = !!r.is_best_manta_ventral_photo;
            const bestD = !!r.is_best_manta_dorsal_photo;
            const isBest = view === "ventral" ? bestV : view === "dorsal" ? bestD : false;
            return (
              <div key={String(r.pk_photo_id ?? "")} className="border rounded p-2 bg-white">
                {url ? (
                  <img src={url} alt={`photo ${String(r.pk_photo_id ?? "")}`} className="w-full h-28 object-cover rounded mb-2" />
                ) : (
                  <div className="w-full h-28 bg-gray-100 rounded mb-2 flex items-center justify-center text-xs text-gray-500">no image</div>
                )}
                <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>id: {String(r.pk_photo_id ?? "")}</span>
                  {isBest && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-300">Best</span>}
                </div>
                {canEdit && <ViewToggle row={r} />}
                {canEdit && (view === "ventral" || view === "dorsal") && (
                  <button
                    className="mt-2 w-full border rounded px-2 py-1 text-xs"
                    disabled={saving === view}
                    onClick={() => setBest(view, r)}
                  >
                    {saving === view ? "Updating…" : view === "ventral" ? "Set Best Ventral" : "Set Best Dorsal"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4" onClick={() => onOpenChange(false)}>
      <div className="bg-white rounded-lg border w-full max-w-5xl max-h-[calc(100vh-2rem)] relative flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3">
          <h3 className="text-lg font-medium">Photos for Manta {mantaId ?? "—"}</h3>
          <button type="button" onClick={() => onOpenChange(false)} className="px-2 py-1 border rounded">Close</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-3 rounded border bg-slate-50 px-3 py-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={noPhotosExpected}
                disabled={!canEdit || savingNoPhotosExpected || !noPhotosExpectedAvailable || (!noPhotosExpected && rows.length > 0)}
                onChange={(event) => updateNoPhotosExpected(event.target.checked)}
              />
              <span>
                <span className="font-medium">No photos expected</span>
                <span className="block text-xs text-slate-600">
                  Use this only when this manta encounter is expected to have no linked photos. QC will accept missing photo links when this is checked.
                </span>
                {rows.length > 0 && (
                  <span className="block text-xs text-amber-700">
                    This manta has {rows.length} linked photo{rows.length === 1 ? "" : "s"}, so this should normally be unchecked.
                  </span>
                )}
                {!noPhotosExpectedAvailable && (
                  <span className="block text-xs text-amber-700">
                    This checkbox is disabled because the live database does not have the mantas.no_photos_expected column yet. Run the no-photos migration, then reload.
                  </span>
                )}
              </span>
            </label>
          </div>
          <div className="mb-4 rounded border bg-slate-50 px-3 py-2">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={noVentralPhotos}
                disabled={!canEdit || savingNoVentralPhotos || !noVentralPhotosAvailable}
                onChange={(event) => updateNoVentralPhotos(event.target.checked)}
              />
              <span>
                <span className="font-medium">No ventral photos available</span>
                <span className="block text-xs text-slate-600">
                  Use this when this manta encounter only has dorsal/other photos. QC will accept the dorsal/other fallback only if no ventral photos exist.
                </span>
                {!noVentralPhotosAvailable && (
                  <span className="block text-xs text-amber-700">
                    This checkbox is disabled because the live database does not have the mantas.no_ventral_photos column yet. In Supabase SQL Editor, run: alter table public.mantas add column if not exists no_ventral_photos boolean not null default false;
                  </span>
                )}
              </span>
            </label>
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading photos…</div>
          ) : (
            <>
              <Section label="Ventral" list={groups.ventral} view="ventral" />
              <Section label="Dorsal" list={groups.dorsal} view="dorsal" />
              <Section label="Other" list={groups.other} view="other" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
