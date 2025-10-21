import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type View = "ventral" | "dorsal" | "other";

export type Uploaded = {
  id: string;
  name: string;
  url: string;
  path: string;
  view: View;
  isBestVentral?: boolean;
  isBestDorsal?: boolean;
};

export type MantaDraft = {
  id: string;
  name: string;
  gender?: string | null;
  ageClass?: string | null;
  size?: string | null; // Mean Size (cm) – two decimal places as a string
  photos: Uploaded[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  sightingId: string;
  onSave: (m: MantaDraft) => void;
  existingManta?: MantaDraft | null;
};

function uuid() {
  try {
    // @ts-ignore
    return crypto?.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

function to2(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** ---- Measurement modal (zoom + drag points + scroll + colored lines) ---- */
function MeasureModal({
  url,
  onClose,
  onApply,
}: {
  url: string;
  onClose: () => void;
  onApply: (r: { dlCm: number; dwCm: number }) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [pts, setPts] = useState<{ x: number; y: number }[]>([]); // up to 4
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1); // 1 => 100%
  const [scaleCm, setScaleCm] = useState(60);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const onLoad = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    if (img.complete) onLoad();
    else img.addEventListener("load", onLoad);
    return () => img.removeEventListener("load", onLoad);
  }, [url]);

  function clientToImg(clientX: number, clientY: number) {
    const img = imgRef.current!;
    const rect = img.getBoundingClientRect();
    const x = (clientX - rect.left) * (img.naturalWidth / rect.width);
    const y = (clientY - rect.top) * (img.naturalHeight / rect.height);
    return { x, y };
  }

  function handleClick(e: React.MouseEvent) {
    if (dragIndex !== null) return;
    const p = clientToImg(e.clientX, e.clientY);
    setPts((prev) => (prev.length >= 4 ? prev : [...prev, p]));
  }

  function onDown(i: number) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragIndex(i);
    };
  }
  function onMove(e: React.MouseEvent) {
    if (dragIndex === null) return;
    const p = clientToImg(e.clientX, e.clientY);
    setPts((prev) => {
      const copy = [...prev];
      copy[dragIndex] = p;
      return copy;
    });
  }
  function onUp() {
    setDragIndex(null);
  }

  function reset() {
    setPts([]);
  }

  const scalePx =
    pts.length >= 2 ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) : NaN;
  const discPx =
    pts.length >= 4 ? Math.hypot(pts[3].x - pts[2].x, pts[3].y - pts[2].y) : NaN;

  const dlCm =
    Number.isFinite(scalePx) && scalePx > 0 && Number.isFinite(discPx)
      ? (discPx / scalePx) * scaleCm
      : NaN;
  const dwCm = Number.isFinite(dlCm) ? dlCm * 2.3 : NaN;

  function apply() {
    if (!Number.isFinite(dlCm)) return;
    onApply({ dlCm, dwCm: dlCm * 2.3 });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[300000] bg-black/50 p-4 overflow-auto"
      onMouseUp={onUp}
    >
      <div className="bg-white rounded-lg shadow max-w-5xl w-[min(1200px,95vw)] mx-auto p-4 relative">
        <button
          aria-label="Close"
          type="button"
          className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border hover:bg-gray-50"
          onClick={onClose}
        >
          &times;
        </button>

        <div className="text-sm font-medium mb-2">
          Measure (click 1–2 laser dots, then 3–4 disc ends)
        </div>

        <div className="border rounded overflow-auto" style={{ maxHeight: "65vh" }}>
          <div
            className="relative inline-block"
            style={{ transform: `scale(${1 / zoom})`, transformOrigin: "top left" }}
          >
            <img
              ref={imgRef}
              src={url}
              alt="to measure"
              className="max-w-none block select-none"
              onMouseMove={onMove}
              onClick={handleClick}
              draggable={false}
            />

            {/* colored guide lines */}
            <svg
              className="absolute inset-0 pointer-events-none"
              viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}
              preserveAspectRatio="none"
            >
              {pts.length >= 2 && (
                <line
                  x1={pts[0].x}
                  y1={pts[0].y}
                  x2={pts[1].x}
                  y2={pts[1].y}
                  stroke="#0ea5e9" /* sky-500 */
                  strokeWidth="6"
                  strokeOpacity="0.9"
                />
              )}
              {pts.length >= 4 && (
                <line
                  x1={pts[2].x}
                  y1={pts[2].y}
                  x2={pts[3].x}
                  y2={pts[3].y}
                  stroke="#10b981" /* emerald-500 */
                  strokeWidth="6"
                  strokeOpacity="0.9"
                />
              )}
            </svg>

            {/* drag handles */}
            <svg
              className="absolute inset-0"
              viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}
              preserveAspectRatio="none"
            >
              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r="12"
                  fill={i < 2 ? "#0ea5e9" : "#10b981"}
                  stroke="white"
                  strokeWidth="3"
                  onMouseDown={onDown(i)}
                  style={{ cursor: "grab" }}
                />
              ))}
            </svg>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Scale (px):</span>
            <span className="font-medium">
              {Number.isFinite(scalePx) ? scalePx.toFixed(1) : "—"}
            </span>
            <span className="ml-3 text-slate-600">(</span>
            <input
              type="number"
              step="0.01"
              className="w-20 border rounded px-2 py-1"
              value={scaleCm}
              onChange={(e) => setScaleCm(parseFloat(e.target.value) || 0)}
            />
            <span className="text-slate-600">cm)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 border rounded"
              onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            >
              –
            </button>
            <span>Zoom {(100 / zoom).toFixed(0)}%</span>
            <button
              className="px-2 py-1 border rounded"
              onClick={() => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))}
            >
              +
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div>
              <span className="text-slate-600">DL (cm):</span>{" "}
              <span className="font-medium">
                {Number.isFinite(dlCm) ? to2(dlCm) : "—"}
              </span>
            </div>
            <div>
              <span className="text-slate-600">DW (cm = DL × 2.3):</span>{" "}
              <span className="font-medium">
                {Number.isFinite(dwCm) ? to2(dwCm) : "—"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button className="px-3 py-2 rounded border" onClick={reset}>
            Reset
          </button>
          <button className="px-3 py-2 rounded bg-sky-600 text-white" onClick={apply}>
            Apply &amp; Fill
          </button>
        </div>
      </div>
    </div>
  );
}

/** ---- Add / Edit Manta modal ---- */
export default function UnifiedMantaModal({
  open,
  onClose,
  sightingId,
  onSave,
  existingManta,
}: Props) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [ageClass, setAgeClass] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null); // Mean Size (cm)
  const [photos, setPhotos] = useState<Uploaded[]>([]);
  const [noPhotos, setNoPhotos] = useState(false);
  const [busy, setBusy] = useState(false);

  const [measureOpen, setMeasureOpen] = useState<{ photoId: string; url: string } | null>(null);
  const [measure, setMeasure] = useState<Record<string, { dlCm: number; dwCm: number }>>({});

  const inputRef = useRef<HTMLInputElement | null>(null);
  const mantaId = useMemo(() => existingManta?.id ?? uuid(), [existingManta?.id]);

  useEffect(() => {
    if (!open) return;
    setName((existingManta?.name || "").trim());
    setGender(existingManta?.gender ?? null);
    setAgeClass(existingManta?.ageClass ?? null);
    setSize(existingManta?.size ?? null);
    setPhotos(existingManta?.photos ?? []);
    setNoPhotos(false);
    setMeasure({});
  }, [open, existingManta]);

  if (!open) return null;

  function recalcMean(next = measure) {
    const values = Object.entries(next)
      .filter(([pid]) => photos.find((p) => p.id === pid)?.view === "dorsal")
      .map(([, r]) => r.dwCm);
    if (values.length === 0) return;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    setSize(to2(mean));
  }

  async function handleFiles(files: File[]) {
    if (!files?.length) return;
    setBusy(true);
    const allow = ["image/jpeg", "image/png", "image/webp"];
    const added: Uploaded[] = [];
    for (const f of files) {
      if (!allow.includes(f.type)) continue;
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const id = uuid();
      const path = `${sightingId}/${mantaId}/${id}.${ext}`;
      try {
        const { error } = await supabase.storage
          .from("temp-images")
          .upload(path, f, { cacheControl: "3600", upsert: false });
        if (error) {
          console.warn("[UnifiedMantaModal] upload error", error.message);
          continue;
        }
        const { data } = supabase.storage.from("temp-images").getPublicUrl(path);
        added.push({ id, name: f.name, url: data?.publicUrl || "", path, view: "other" });
      } catch (e: any) {
        console.warn("[UnifiedMantaModal] upload error", e?.message || e);
      }
    }
    if (added.length) setPhotos((prev) => [...prev, ...added]);
    setBusy(false);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files || []);
    handleFiles(files);
  }
  function onBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
    e.currentTarget.value = "";
  }

  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setMeasure((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    // Mean recompute (if any left)
    setTimeout(() => recalcMean(), 0);
  }

  function setView(id: string, view: View) {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, view } : p)));
  }
  function setBestVentral(id: string) {
    setPhotos((prev) =>
      prev.map((p) =>
        p.view !== "ventral" ? { ...p, isBestVentral: false } : { ...p, isBestVentral: p.id === id }
      )
    );
  }
  function setBestDorsal(id: string) {
    setPhotos((prev) =>
      prev.map((p) =>
        p.view !== "dorsal" ? { ...p, isBestDorsal: false } : { ...p, isBestDorsal: p.id === id }
      )
    );
  }

  function save() {
    if (!name.trim()) {
      alert("You need to choose a temporary name.");
      return;
    }
    if (!noPhotos && photos.length === 0) {
      alert("You need to add a photo image or check that no photos were taken.");
      return;
    }
    const draft: MantaDraft = {
      id: mantaId,
      name: name.trim(),
      gender,
      ageClass,
      size,
      photos,
    };
    onSave(draft);
    onClose();
  }

  const canSave = !!name.trim() && (noPhotos || photos.length > 0);

  return (
    <div className="fixed inset-0 bg-black/40 z-[300000] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
      <div className="bg-white rounded-lg border w-full max-w-5xl p-4 pointer-events-auto relative max-h-[90vh] overflow-auto">
        <button
          aria-label="Close"
          type="button"
          className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border hover:bg-gray-50"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          &times;
        </button>

        <div className="flex items-center justify-between mb-3 pr-10">
          <h3 className="text-lg font-medium">{existingManta ? "Edit Manta" : "Add Manta"}</h3>
          <div className="text-[11px] text-gray-500">sighting: {sightingId.slice(0, 8)}</div>
        </div>

        {/* Top form */}
        <div className="grid md:grid-cols-12 gap-3 mb-4">
          <div className="md:col-span-5 col-span-12">
            <label className="text-sm block mb-1">Temp Name</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., A, B, C"
            />
            <p className="mt-1 text-xs text-slate-500">Please provide a temporary name</p>
          </div>

          <div className="md:col-span-2 col-span-12">
            <label className="text-sm block mb-1">Gender</label>
            <select
              className="w-full border rounded px-2 py-2"
              value={gender ?? ""}
              onChange={(e) => setGender(e.target.value || null)}
            >
              <option value="">—</option>
              <option value="female">female</option>
              <option value="male">male</option>
              <option value="unknown">unknown</option>
            </select>
          </div>

          <div className="md:col-span-3 col-span-12">
            <label className="text-sm block mb-1">Age Class</label>
            <select
              className="w-full border rounded px-2 py-2"
              value={ageClass ?? ""}
              onChange={(e) => setAgeClass(e.target.value || null)}
            >
              <option value="">—</option>
              <option value="juvenile">juvenile</option>
              <option value="subadult">subadult</option>
              <option value="adult">adult</option>
            </select>
          </div>

          <div className="md:col-span-2 col-span-12">
            <label className="text-sm block mb-1">Mean Size (cm)</label>
            <input
              type="number"
              inputMode="decimal"
              step={0.01}
              min={0}
              placeholder="cm"
              className="w-full border rounded px-3 py-2"
              value={(size as any) ?? ""}
              onChange={(e) =>
                setSize(
                  (e.target.value || "")
                    .replace(/[^0-9.]/g, "")
                    .replace(/(\..*)\./g, "$1")
                )
              }
            />
            <div className="text-[11px] text-slate-500 leading-tight">Mean of dorsal measurements</div>
          </div>
        </div>

        {/* Dropzone */}
        <div
          className="mt-1 border-dashed border-2 rounded p-4 text-sm text-gray-600 flex flex-col items-center justify-center"
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
          }}
        >
          <div>Drag &amp; drop photos here</div>
          <div className="my-2">or</div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="px-3 py-1 border rounded"
            disabled={busy}
          >
            Browse…
          </button>
          <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={onBrowse} />
        </div>

        {/* Only show when no photos present */}
        {photos.length === 0 && (
          <div className="mt-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={noPhotos}
                onChange={(e) => setNoPhotos(e.target.checked)}
              />
              No photos taken (allow save without photos)
            </label>
          </div>
        )}

        {/* Photos list */}
        <div className="mt-4 space-y-3">
          {photos.map((p) => (
            <div key={p.id} className="border rounded p-2">
              <div className="grid grid-cols-[112px_1fr_auto] gap-3 items-start">
                <img src={p.url} alt={p.name} className="w-28 h-20 object-cover rounded" />

                <div className="flex gap-8">
                  <div className="w-28">
                    <div className="text-[11px] text-slate-500 mb-1">View</div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`view-${p.id}`}
                        checked={p.view === "ventral"}
                        onChange={() => setView(p.id, "ventral")}
                      />
                      ventral
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`view-${p.id}`}
                        checked={p.view === "dorsal"}
                        onChange={() => setView(p.id, "dorsal")}
                      />
                      dorsal
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`view-${p.id}`}
                        checked={p.view === "other"}
                        onChange={() => setView(p.id, "other")}
                      />
                      other
                    </label>
                  </div>

                  <div className="w-40">
                    <div className="text-[11px] text-slate-500 mb-1">Best</div>
                    <label className="flex items-center gap-2 text-sm text-sky-600">
                      <input
                        type="radio"
                        name={`best-ventral-${mantaId}`}
                        checked={!!p.isBestVentral}
                        onChange={() => setBestVentral(p.id)}
                        disabled={p.view !== "ventral"}
                      />
                      Best ventral
                    </label>
                    <label className="flex items-center gap-2 text-sm text-sky-600">
                      <input
                        type="radio"
                        name={`best-dorsal-${mantaId}`}
                        checked={!!p.isBestDorsal}
                        onChange={() => setBestDorsal(p.id)}
                        disabled={p.view !== "dorsal"}
                      />
                      Best dorsal
                    </label>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {p.view === "dorsal" && measure[p.id] ? (
                    <div className="text-xs text-slate-600">
                      DL: <span className="font-medium">{to2(measure[p.id].dlCm)}</span> cm · DW:{" "}
                      <span className="font-medium">{to2(measure[p.id].dwCm)}</span> cm
                    </div>
                  ) : null}

                  {p.view === "dorsal" && (
                    <button
                      className="px-3 py-1 rounded bg-sky-600 text-white"
                      onClick={() => setMeasureOpen({ photoId: p.id, url: p.url })}
                    >
                      Size
                    </button>
                  )}

                  <button
                    aria-label="Delete photo"
                    className="px-2 py-1 rounded border border-red-300 text-red-600"
                    onClick={() => removePhoto(p.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="px-3 py-2 rounded border"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              save();
            }}
            className="px-3 py-2 rounded bg-sky-600 text-white"
            disabled={busy || !canSave}
          >
            Save Manta
          </button>
        </div>
      </div>

      {measureOpen && (
        <MeasureModal
          url={measureOpen.url}
          onClose={() => setMeasureOpen(null)}
          onApply={(r) => {
            setMeasure((prev) => {
              const next = { ...prev, [measureOpen.photoId]: r };
              // update Mean Size (cm)
              const values = Object.entries(next)
                .filter(([pid]) => photos.find((p) => p.id === pid)?.view === "dorsal")
                .map(([, v]) => v.dwCm);
              if (values.length) setSize(to2(values.reduce((a, b) => a + b, 0) / values.length));
              return next;
            });
          }}
        />
      )}
    </div>
  );
}
