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
  dlPx?: number | null;
  dlCm?: number | null;
  dwCm?: number | null; // DL * 2.3
};

export type MantaDraft = {
  id: string;
  name: string;
  gender?: string | null;
  ageClass?: string | null;
  size?: string | null; // mean DW (cm)
  photos: Uploaded[];
  potentialCatalogId?: number | null;
  potentialNoMatch?: boolean;
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
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* Measure modal — fixed 100% scale, click 1–2 for scale (laser dots), 3–4 for disc ends */
function MeasureModal(props: {
  open: boolean;
  src: string;
  onClose: () => void;
  onApply: (data: { scalePx: number; discPx: number; dlCm: number; dwCm: number; scaleCm: number }) => void;
  defaultScaleCm?: number;
}) {
  const { open, src, onClose, onApply, defaultScaleCm = 60 } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [scaleCm, setScaleCm] = useState<number>(defaultScaleCm);
  const [showScaleEdit, setShowScaleEdit] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPoints([]);
    setDragIdx(null);
    setScaleCm(defaultScaleCm);
    setShowScaleEdit(false);
  }, [open, src, defaultScaleCm]);

  if (!open) return null;

  const getLocal = (e: React.MouseEvent) => {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const r = img.getBoundingClientRect();
    const x = clamp(e.clientX - r.left, 0, r.width);
    const y = clamp(e.clientY - r.top, 0, r.height);
    return { x, y };
  };

  const onClick = (e: React.MouseEvent) => {
    if (dragIdx !== null) return;
    const p = getLocal(e);
    setPoints((prev) => (prev.length >= 4 ? prev : [...prev, p]));
  };

  const onMouseDownHandle = (idx: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragIdx(idx);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragIdx === null) return;
    const p = getLocal(e);
    setPoints((prev) => {
      const nxt = prev.slice();
      nxt[dragIdx] = p;
      return nxt;
    });
  };

  const onMouseUp = () => setDragIdx(null);

  const scalePx = useMemo(() => (points.length >= 2 ? dist(points[0], points[1]) : NaN), [points]);
  const discPx = useMemo(() => (points.length >= 4 ? dist(points[2], points[3]) : NaN), [points]);
  const dlCm = useMemo(
    () => (Number.isFinite(scalePx) && Number.isFinite(discPx) && scalePx > 0 ? (discPx / scalePx) * scaleCm : NaN),
    [scalePx, discPx, scaleCm]
  );
  const dwCm = useMemo(() => (Number.isFinite(dlCm) ? dlCm * 2.3 : NaN), [dlCm]);

  const to2 = (n: number) => (Number.isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : "—");

  const reset = () => {
    setPoints([]);
    setDragIdx(null);
  };

  const apply = () => {
    onApply({
      scalePx: Number.isFinite(scalePx) ? scalePx : 0,
      discPx: Number.isFinite(discPx) ? discPx : 0,
      dlCm: Number.isFinite(dlCm) ? Number(dlCm.toFixed(2)) : 0,
      dwCm: Number.isFinite(dwCm) ? Number(dwCm.toFixed(2)) : 0,
      scaleCm,
    });
    onClose();
  };

  const dot = (p: { x: number; y: number }, i: number) => (
    <div
      key={"pt-" + i}
      onMouseDown={onMouseDownHandle(i)}
      style={{
        position: "absolute",
        left: (imgRef.current?.getBoundingClientRect().left || 0) + p.x - 6 + "px",
        top: (imgRef.current?.getBoundingClientRect().top || 0) + p.y - 6 + "px",
        width: 12,
        height: 12,
        background: "#0ea5e9",
        borderRadius: "9999px",
        cursor: "grab",
        boxShadow: "0 0 0 2px white",
        pointerEvents: "auto",
      }}
    />
  );

  const line = (a: { x: number; y: number }, b: { x: number; y: number }, color: string) => {
    const x1 = (imgRef.current?.getBoundingClientRect().left || 0) + a.x;
    const y1 = (imgRef.current?.getBoundingClientRect().top || 0) + a.y;
    const x2 = (imgRef.current?.getBoundingClientRect().left || 0) + b.x;
    const y2 = (imgRef.current?.getBoundingClientRect().top || 0) + b.y;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ang = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
    return (
      <div
        key={`ln-${x1}-${y1}-${x2}-${y2}-${color}`}
        style={{
          position: "absolute",
          left: x1,
          top: y1,
          width: len,
          height: 2,
          background: color,
          transform: `rotate(${ang}deg)`,
          transformOrigin: "0 0",
          pointerEvents: "none",
        }}
      />
    );
  };

  return (
    <div className="fixed inset-0 z-[300000] bg-black/50 flex items-center justify-center" onMouseUp={onMouseUp}>
      <div className="bg-white w-[95vw] max-w-[1100px] max-h-[85vh] overflow-y-auto rounded shadow relative">
        <button
          className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border text-gray-600"
          onClick={onClose}
          aria-label="Close"
          type="button"
        >
          ×
        </button>

        <div className="px-6 pt-5 pb-2 text-sm text-gray-700">Measure (click 1–2 laser dots, then 3–4 disc ends)</div>

        <div
          ref={wrapRef}
          className="relative px-6 pb-4 select-none"
          onMouseMove={onMouseMove}
          onClick={onClick}
          style={{ cursor: "crosshair" }}
        >
          <img ref={imgRef} src={src} alt="measure" className="w-full h-auto rounded shadow block" draggable={false} />
          {points[0] && points[1] && line(points[0], points[1], "#0ea5e9")}
          {points[2] && points[3] && line(points[2], points[3], "#14b8a6")}
          {points.map((p, i) => dot(p, i))}
        </div>

        <div className="px-6 pb-5 grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
          <div className="text-sm">
            <div>
              <span className="text-gray-600">Disc length (px): </span>
              <span className="font-medium">{Number.isFinite(discPx) ? to2(discPx) : "—"}</span>
            </div>
            <div>
              <span className="text-gray-600">Scale (px): </span>
              <span className="font-medium">{Number.isFinite(scalePx) ? to2(scalePx) : "—"}</span>
            </div>
            <div className="mt-1">
              <span className="text-gray-600">Scale = </span>
              {!showScaleEdit ? (
                <>
                  <span className="font-medium">{scaleCm}</span>
                  <span className="ml-1">cm</span>
                  <button className="ml-3 text-blue-600 underline text-xs" onClick={() => setShowScaleEdit(true)}>
                    change
                  </button>
                </>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    className="border rounded px-2 py-1 w-20"
                    value={scaleCm}
                    onChange={(e) => setScaleCm(Number(e.target.value || 0))}
                  />
                  <span className="text-gray-500">cm</span>
                  <button className="ml-2 text-blue-600 underline text-xs" onClick={() => setShowScaleEdit(false)}>
                    done
                  </button>
                </span>
              )}
            </div>
          </div>

          <div className="text-sm">
            <div>
              <span className="text-gray-600">DL (cm): </span>
              <span className="font-medium">{Number.isFinite(dlCm) ? to2(dlCm) : "—"}</span>
            </div>
            <div>
              <span className="text-gray-600">DW (cm): </span>
              <span className="font-medium">{Number.isFinite(dwCm) ? to2(dwCm) : "—"}</span>
            </div>
          </div>

          <div className="flex md:justify-end gap-2">
            <button className="px-3 py-2 rounded border" onClick={reset}>
              Reset
            </button>
            <button className="px-3 py-2 rounded bg-sky-600 text-white disabled:opacity-50" onClick={apply} disabled={!Number.isFinite(dwCm)}>
              Apply &amp; Fill
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Simple placeholder Match modal */
function MatchModal(props: {
  open: boolean;
  onClose: () => void;
  leftSrc: string;
}) {
  const { open, onClose, leftSrc } = props;
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[300000] bg-black/50 flex items-center justify-center">
      <div className="bg-white w-[95vw] max-w-[1100px] max-h-[85vh] overflow-y-auto rounded shadow relative p-4">
        <button
          className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border text-gray-600"
          onClick={onClose}
          aria-label="Close"
          type="button"
        >
          ×
        </button>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-sm font-medium mb-2">Best ventral</div>
            <img src={leftSrc} alt="ventral" className="w-full h-auto rounded border" />
          </div>
          <div className="text-sm text-gray-600">
            <div className="mb-2 font-medium">Catalog browser (placeholder)</div>
            <div className="p-3 border rounded bg-gray-50">
              This is a placeholder for the catalog match workflow. Use will be added in a follow-up patch.
            </div>
            <div className="mt-3 flex gap-2">
              <button className="px-3 py-2 rounded bg-blue-600 text-white">This Matches</button>
              <button className="px-3 py-2 rounded border">No Matches Found</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UnifiedMantaModal({ open, onClose, sightingId, onSave, existingManta }: Props) {
  const [name, setName] = useState(existingManta?.name ?? "");
  const [gender, setGender] = useState<string | null>(existingManta?.gender ?? null);
  const [ageClass, setAgeClass] = useState<string | null>(existingManta?.ageClass ?? null);
  const [size, setSize] = useState<string | null>(existingManta?.size ?? null);
  const [photos, setPhotos] = useState<Uploaded[]>(existingManta?.photos ?? []);
  const [noPhotos, setNoPhotos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [measurePhoto, setMeasurePhoto] = useState<Uploaded | null>(null);
  const [matchPhoto, setMatchPhoto] = useState<Uploaded | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const mantaId = useMemo(() => existingManta?.id ?? uuid(), [existingManta?.id]);

  useEffect(() => {
    if (!open) return;
    setName(existingManta?.name ?? "");
    setGender(existingManta?.gender ?? null);
    setAgeClass(existingManta?.ageClass ?? null);
    setSize(existingManta?.size ?? null);
    setPhotos(existingManta?.photos ?? []);
    setNoPhotos(false);
  }, [open, existingManta]);

  if (!open) return null;

  const handleFiles = async (files: File[]) => {
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
        const { error } = await supabase.storage.from("temp-images").upload(path, f, { cacheControl: "3600", upsert: false });
        if (error) continue;
        const { data } = supabase.storage.from("temp-images").getPublicUrl(path);
        added.push({ id, name: f.name, url: data?.publicUrl || "", path, view: "other" });
      } catch {
        /* ignore */
      }
    }
    if (added.length) setPhotos((prev) => [...prev, ...added]);
    setBusy(false);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    handleFiles(files);
  };
  const onBrowse = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
    if (e.currentTarget) e.currentTarget.value = "";
  };

  const setView = (id: string, view: View) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, view } : p)));
  };
  const setBestVentral = (id: string) => {
    setPhotos((prev) =>
      prev.map((p) =>
        p.view !== "ventral" ? { ...p, isBestVentral: false } : { ...p, isBestVentral: p.id === id }
      )
    );
  };
  const setBestDorsal = (id: string) => {
    setPhotos((prev) =>
      prev.map((p) => (p.view !== "dorsal" ? { ...p, isBestDorsal: false } : { ...p, isBestDorsal: p.id === id }))
    );
  };
  const deletePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const recalcMean = (list: Uploaded[]) => {
    const usable = list.filter((p) => p.view === "ventral" && Number.isFinite(p.dwCm));
    if (!usable.length) return null;
    const mean = usable.reduce((a, b) => a + (b.dwCm || 0), 0) / usable.length;
    return (Math.round(mean * 100) / 100).toFixed(2);
  };

  const canSave = (name.trim().length > 0) && (noPhotos || photos.length > 0);

  const save = () => {
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
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[300000] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <div className="bg-white rounded-lg border w-full max-w-5xl pointer-events-auto relative">
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

          <div className="p-4">
            <div className="grid md:grid-cols-12 gap-3 mb-3">
              <div className="md:col-span-5">
                <label className="text-sm block mb-1">Temp Name</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., A, B, C"
                />
                <div className="text-xs text-gray-500 mt-1">Please provide a temporary name</div>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm block mb-1">Gender</label>
                <select className="w-full border rounded px-2 py-2" value={gender ?? ""} onChange={(e) => setGender(e.target.value || null)}>
                  <option value="">—</option>
                  <option value="female">female</option>
                  <option value="male">male</option>
                  <option value="unknown">unknown</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="text-sm block mb-1">Age Class</label>
                <select className="w-full border rounded px-2 py-2" value={ageClass ?? ""} onChange={(e) => setAgeClass(e.target.value || null)}>
                  <option value="">—</option>
                  <option value="juvenile">juvenile</option>
                  <option value="subadult">subadult</option>
                  <option value="adult">adult</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm block mb-1">Mean Size (cm)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  className="w-full border rounded px-3 py-2"
                  value={size ?? ""}
                  placeholder="cm"
                  onChange={(e) => setSize(e.target.value || null)}
                />
                <div className="text-[11px] text-gray-500 leading-tight mt-1">Mean of dorsal measurements</div>
              </div>
            </div>

            <div
              className="mt-1 border-dashed border-2 rounded p-4 text-sm text-gray-600 flex flex-col items-center justify-center"
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <div>Drag &amp; drop photos here</div>
              <div className="my-2">or</div>
              <button type="button" onClick={() => inputRef.current?.click()} className="px-3 py-1 border rounded" disabled={busy}>
                Browse…
              </button>
              <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={onBrowse} />
            </div>

            <div className="text-sm text-gray-600 mt-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={noPhotos} onChange={(e) => setNoPhotos(e.target.checked)} />
                No photos taken (allow save without photos)
              </label>
            </div>

            <div className="mt-3 space-y-3 max-h-[380px] overflow-auto pr-1">
              {photos.map((p) => {
                const sizeEnabled = p.view === "ventral";
                const bestVDisabled = p.view !== "ventral";
                const bestDDisabled = p.view !== "dorsal";
                return (
                  <div key={p.id} className="border rounded p-2 grid grid-cols-12 gap-3 items-start">
                    <div className="col-span-2">
                      <img src={p.url} alt={p.name} className="w-full h-24 object-cover rounded border" />
                    </div>

                    <div className="col-span-3">
                      <div className="text-xs mb-1">View</div>
                      <div className="flex flex-col gap-1 text-sm">
                        <label className="inline-flex items-center gap-2">
                          <input type="radio" checked={p.view === "ventral"} onChange={() => setView(p.id, "ventral")} />
                          ventral
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input type="radio" checked={p.view === "dorsal"} onChange={() => setView(p.id, "dorsal")} />
                          dorsal
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input type="radio" checked={p.view === "other"} onChange={() => setView(p.id, "other")} />
                          other
                        </label>
                      </div>
                    </div>

                    <div className="col-span-4">
                      <div className="text-xs mb-1">Best</div>
                      <div className="flex flex-col gap-1 text-sm">
                        <label className={`inline-flex items-center gap-2 ${bestVDisabled ? "opacity-50" : ""}`}>
                          <input
                            type="radio"
                            name={"best-ventral"}
                            checked={!!p.isBestVentral}
                            onChange={() => setBestVentral(p.id)}
                            disabled={bestVDisabled}
                          />
                          <span className="text-blue-600">Best ventral</span>
                          {p.view === "ventral" && p.isBestVentral && (
                            <button className="ml-2 text-blue-600 underline text-xs" onClick={() => setMatchPhoto(p)}>
                              Match
                            </button>
                          )}
                        </label>

                        <label className={`inline-flex items-center gap-2 ${bestDDisabled ? "opacity-50" : ""}`}>
                          <input
                            type="radio"
                            name={"best-dorsal"}
                            checked={!!p.isBestDorsal}
                            onChange={() => setBestDorsal(p.id)}
                            disabled={bestDDisabled}
                          />
                          <span className="text-blue-600">Best dorsal</span>
                        </label>
                      </div>

                      {(Number.isFinite(p.dlCm) || Number.isFinite(p.dwCm)) && (
                        <div className="text-xs text-gray-600 mt-1">
                          DL: {Number.isFinite(p.dlCm) ? p.dlCm?.toFixed(2) : "—"} cm · DW:{" "}
                          {Number.isFinite(p.dwCm) ? p.dwCm?.toFixed(2) : "—"} cm
                        </div>
                      )}
                    </div>

                    <div className="col-span-3 flex items-center justify-end gap-2">
                      <button
                        className={`px-2 py-1 rounded text-white flex items-center gap-1 ${sizeEnabled ? "bg-sky-600" : "bg-sky-600 opacity-40 cursor-not-allowed"}`}
                        onClick={() => sizeEnabled && setMeasurePhoto(p)}
                        disabled={!sizeEnabled}
                        title="Size"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M3 21L21 3M7 7l3 3M10 4l3 3M4 10l3 3M13 7l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        <span className="text-xs">Size</span>
                      </button>

                      <button className="p-1 text-red-600 hover:text-red-700" title="Delete" onClick={() => deletePhoto(p.id)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M4 7h16M9 7l1 13a2 2 0 002 2h0a2 2 0 002-2l1-13M9 3h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M10 11v8M14 11v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
              {photos.length === 0 && <div className="text-sm text-gray-600">No photos added yet.</div>}
            </div>

            <div className="px-0 py-3 flex justify-end gap-2 border-t mt-3">
              <button className="px-3 py-2 rounded border" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button className="px-3 py-2 rounded bg-sky-600 text-white disabled:opacity-50" onClick={save} disabled={busy || !canSave}>
                Save Manta
              </button>
            </div>
          </div>
        </div>
      </div>

      {measurePhoto && (
        <MeasureModal
          open={!!measurePhoto}
          src={measurePhoto.url}
          onClose={() => setMeasurePhoto(null)}
          onApply={({ dlCm, dwCm }) => {
            setPhotos((prev) => {
              const nxt = prev.map((ph) => (ph.id === measurePhoto.id ? { ...ph, dlCm, dwCm } : ph));
              const mean = recalcMean(nxt);
              setSize(mean);
              return nxt;
            });
          }}
        />
      )}

      {matchPhoto && <MatchModal open={!!matchPhoto} onClose={() => setMatchPhoto(null)} leftSrc={matchPhoto.url} />}
    </>
  );
}
