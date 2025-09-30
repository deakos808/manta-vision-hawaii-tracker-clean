// Clean modal with robust measure tool + UI polish
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
  measure?: {
    scalePx: number;   // pixels between laser dots
    discPx: number;    // pixels disc length
    dlCm: number;      // disc length (cm)
    dwCm: number;      // disc width (cm) = dl * 2.3
  };
};

export type MantaDraft = {
  id: string;
  name: string;
  gender?: string | null;
  ageClass?: string | null;
  size?: string | null;       // Mean DW in cm (two decimals as string)
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
  try { return (crypto as any).randomUUID(); } catch { return Math.random().toString(36).slice(2); }
}
function to2(n: number) { return (Math.round(n * 100) / 100).toFixed(2); }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function dist(a: {x:number;y:number}, b:{x:number;y:number}) { return Math.hypot(a.x-b.x, a.y-b.y); }

// ---------------------- Measure Modal ----------------------
type MeasureModalProps = {
  url: string;
  onCancel: () => void;
  onApply: (r: { scalePx: number; discPx: number; dlCm: number; dwCm: number }) => void;
};
function MeasureModal({ url, onCancel, onApply }: MeasureModalProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  // natural image info set on load
  const [nat, setNat] = useState({ w: 0, h: 0 });

  // 0,1 = laser dots; 2,3 = disc ends; all in *natural* pixel space
  const [points, setPoints] = useState<{x:number;y:number}[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // pan/zoom
  const [zoom, setZoom] = useState(1); // default 100%
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panAtDown = useRef({ x: 0, y: 0 });

  // scale in cm (editable), defaults to 60
  const [scaleCm, setScaleCm] = useState(60);

  // derived values
  const scalePx = useMemo(() => (points.length >= 2 ? dist(points[0], points[1]) : NaN), [points]);
  const discPx  = useMemo(() => (points.length >= 4 ? dist(points[2], points[3]) : NaN), [points]);
  const dlCm    = useMemo(() => Number.isFinite(scalePx) && scalePx > 0 && Number.isFinite(discPx) ? (discPx * scaleCm / scalePx) : NaN, [scalePx, discPx, scaleCm]);
  const dwCm    = useMemo(() => Number.isFinite(dlCm) ? dlCm * 2.3 : NaN, [dlCm]);

  // helpers (CSS pixel <-> natural pixel)
  function cssToNat(e: {clientX:number; clientY:number}) {
    const img = imgRef.current!;
    const rect = img.getBoundingClientRect();
    const drawnW = rect.width;
    const drawnH = rect.height;
    const xCss = e.clientX - rect.left - pan.x;
    const yCss = e.clientY - rect.top  - pan.y;
    const xCssUnscaled = xCss / zoom;
    const yCssUnscaled = yCss / zoom;
    const xNat = clamp(xCssUnscaled * (nat.w / drawnW), 0, nat.w);
    const yNat = clamp(yCssUnscaled * (nat.h / drawnH), 0, nat.h);
    return { x: xNat, y: yNat };
  }
  function natToCss(p: {x:number;y:number}) {
    const img = imgRef.current!;
    const rect = img.getBoundingClientRect();
    const drawnW = rect.width;
    const drawnH = rect.height;
    const xCssUnscaled = p.x * (drawnW / nat.w);
    const yCssUnscaled = p.y * (drawnH / nat.h);
    return { x: xCssUnscaled * zoom + pan.x, y: yCssUnscaled * zoom + pan.y };
  }

  // place points by click
  function onImgClick(e: React.MouseEvent) {
    if (dragIdx !== null) { setDragIdx(null); return; } // end drag if any
    if (!nat.w || !nat.h) return;
    const p = cssToNat(e);
    setPoints(prev => {
      if (prev.length >= 4) return [p];        // start over after 4th click
      return [...prev, p];
    });
  }

  // drag & pan
  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!imgRef.current || points.length === 0) { // start panning
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panAtDown.current = { ...pan };
      return;
    }
    // try to grab an existing point (10 px radius)
    const rect = imgRef.current.getBoundingClientRect();
    const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    let idx = -1;
    points.forEach((pt, i) => {
      const c = natToCss(pt);
      if (Math.hypot(c.x - cursor.x, c.y - cursor.y) <= 10) idx = i;
    });
    if (idx >= 0) { setDragIdx(idx); return; }
    isPanning.current = true;
    panStart.current = { x: e.clientX, y: e.clientY };
    panAtDown.current = { ...pan };
  }
  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (dragIdx !== null) {
      const np = cssToNat(e);
      setPoints(prev => prev.map((p, i) => (i === dragIdx ? np : p)));
      return;
    }
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setPan({ x: panAtDown.current.x + dx, y: panAtDown.current.y + dy });
  }
  function onMouseUp() {
    isPanning.current = false;
    setDragIdx(null);
  }
  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom(z => clamp(Number((z + delta).toFixed(2)), 0.25, 4));
  }

  function reset() { setPoints([]); setZoom(1); setPan({x:0,y:0}); }
  function apply() {
    if (!Number.isFinite(scalePx) || scalePx <= 0 || !Number.isFinite(discPx)) return;
    onApply({ scalePx, discPx, dlCm: dlCm, dwCm: dwCm });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[300000] flex items-center justify-center" onClick={(e)=>e.stopPropagation()}>
      <div className="bg-white rounded-lg border w-full max-w-5xl p-4 relative max-h-[90vh] overflow-auto" onClick={(e)=>e.stopPropagation()}>
        <button
          aria-label="Close"
          className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border hover:bg-gray-50"
          onClick={onCancel}
        >&times;</button>

        <h3 className="text-[15px] font-medium mb-3">
          Measure (click 1–2 laser dots, then 3–4 disc ends)
        </h3>

        <div
          className="relative select-none bg-black/5 cursor-crosshair"
          style={{ width: "100%", minHeight: 360 }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onWheel={onWheel}
        >
          <img
            ref={imgRef}
            src={url}
            alt="Measure"
            onLoad={(e:any)=>{ const im=e.target; setNat({ w: im.naturalWidth, h: im.naturalHeight }); }}
            onClick={onImgClick}
            className="block max-w-full h-auto"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "top left", userSelect:"none" }}
            draggable={false}
          />

          {/* overlay SVG (absolute) */}
          <svg className="absolute inset-0 pointer-events-none" style={{ overflow: "visible" }}>
            {/* show first scale dot immediately */}
            {points.length >= 1 && (() => {
              const a = natToCss(points[0]); return <circle cx={a.x} cy={a.y} r={6} fill="#00897B" />;
            })()}
            {/* show scale line + second dot when available */}
            {points.length >= 2 && (() => {
              const a = natToCss(points[0]); const b = natToCss(points[1]);
              return (
                <>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#00897B" strokeWidth={3} />
                  <circle cx={b.x} cy={b.y} r={6} fill="#00897B" />
                </>
              );
            })()}
            {/* first disc dot */}
            {points.length >= 3 && (() => {
              const a = natToCss(points[2]); return <circle cx={a.x} cy={a.y} r={6} fill="#0284C7" />;
            })()}
            {/* full disc line */}
            {points.length >= 4 && (() => {
              const a = natToCss(points[2]); const b = natToCss(points[3]);
              return (
                <>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0284C7" strokeWidth={3} />
                  <circle cx={b.x} cy={b.y} r={6} fill="#0284C7" />
                </>
              );
            })()}
          </svg>
        </div>

        {/* footer */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-600">Scale (px):</span>
            <span className="font-medium">{Number.isFinite(scalePx) ? to2(scalePx) : "—"}</span>
            <span className="mx-2">(</span>
            <input
              type="number" step="0.01" inputMode="decimal"
              value={scaleCm}
              onChange={(e)=> setScaleCm(clamp(parseFloat(e.target.value || "60") || 60, 1, 10000))}
              className="w-20 border rounded px-2 py-1"
              title="Scale in centimeters between laser dots"
            />
            <span>cm)</span>
          </div>

          <div className="flex items-center gap-2">
            <button className="px-2 py-1 border rounded" onClick={()=> setZoom(z=>clamp(Number((z-0.1).toFixed(2)),0.25,4))}>–</button>
            <span>Zoom {Math.round(zoom*100)}%</span>
            <button className="px-2 py-1 border rounded" onClick={()=> setZoom(z=>clamp(Number((z+0.1).toFixed(2)),0.25,4))}>+</button>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div>
              <div><span className="text-slate-600">Disc length (px):</span> <span className="font-medium">{Number.isFinite(discPx) ? to2(discPx) : "—"}</span></div>
            </div>
            <div>
              <div><span className="text-slate-600">DL (cm):</span> <span className="font-medium">{Number.isFinite(dlCm) ? to2(dlCm) : "—"}</span></div>
              <div><span className="text-slate-600">DW (cm = DL × 2.3):</span> <span className="font-medium">{Number.isFinite(dwCm) ? to2(dwCm) : "—"}</span></div>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button className="px-3 py-2 rounded border" onClick={reset}>Reset</button>
            <button className="px-3 py-2 rounded bg-sky-600 text-white" onClick={apply} disabled={!(Number.isFinite(dlCm) && Number.isFinite(dwCm))}>Apply &amp; Fill</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------- Main Modal ----------------------
function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 3h6m-9 3h12m-1 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 11v6M14 11v6" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export default function UnifiedMantaModal({ open, onClose, sightingId, onSave, existingManta }: Props) {
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [gender, setGender] = useState<string | null>(null);
  const [ageClass, setAgeClass] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null); // Mean DW in cm (2dp)
  const [photos, setPhotos] = useState<Uploaded[]>([]);
  const [noPhotos, setNoPhotos] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mantaId = useMemo(()=> existingManta?.id ?? uuid(), [existingManta?.id]);

  const [measureOpen, setMeasureOpen] = useState<{ photoId: string; url: string } | null>(null);

  // mean DW across dorsal photos that have a measure
  const meanSizeDW = useMemo(()=>{
    const vals = photos.filter(p=>p.view === "dorsal" && p.measure && Number.isFinite(p.measure.dwCm)).map(p=>p.measure!.dwCm);
    if (!vals.length) return null;
    return Number((vals.reduce((a,b)=>a+b, 0) / vals.length).toFixed(2));
  }, [photos]);

  useEffect(()=>{
    if (!open) return;
    setName((existingManta?.name || "")); setNameTouched(false);
    setGender(existingManta?.gender ?? null);
    setAgeClass(existingManta?.ageClass ?? null);
    setSize(existingManta?.size ?? null);
    setPhotos(existingManta?.photos ?? []);
    setNoPhotos(false);
  }, [open, existingManta]);

  useEffect(()=>{
    if (meanSizeDW !== null) setSize(to2(meanSizeDW));
  }, [meanSizeDW]);

  if (!open) return null;

  // single best per view
  function setBest(id: string, view: View) {
    setPhotos(prev => prev.map(p => {
      if (p.view !== view) return p;
      if (view === "ventral") return { ...p, isBestVentral: p.id === id };
      if (view === "dorsal")  return { ...p, isBestDorsal:  p.id === id };
      return p;
    }));
  }

  async function handleFiles(files: File[]) {
    if (!files?.length) return;
    setBusy(true);
    const allow = ["image/jpeg","image/png","image/webp"];
    const added: Uploaded[] = [];
    for (const f of files) {
      if (!allow.includes(f.type)) continue;
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const id = uuid();
      const path = `${sightingId}/${mantaId}/${id}.${ext}`;
      try {
        const { error } = await supabase.storage.from("temp-images").upload(path, f, { cacheControl: "3600", upsert: false });
        if (error) { console.warn("[UnifiedMantaModal] upload error", error.message); continue; }
        const { data } = supabase.storage.from("temp-images").getPublicUrl(path);
        added.push({ id, name: f.name, url: data?.publicUrl || "", path, view: "other" });
      } catch (e:any) {
        console.warn("[UnifiedMantaModal] upload error", e?.message || e);
      }
    }
    if (added.length) setPhotos(prev => [...prev, ...added]);
    setBusy(false);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); e.stopPropagation();
    handleFiles(Array.from(e.dataTransfer.files || []));
  }
  function onBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(Array.from(e.target.files || []));
    e.currentTarget.value = "";
  }

  function deletePhoto(id: string) {
    setPhotos(prev => prev.filter(p => p.id !== id));
  }

  function openMeasure(p: Uploaded) {
    setMeasureOpen({ photoId: p.id, url: p.url });
  }

  function save() {
    const nm = (name || "").trim();
    if (!nm) { setNameTouched(true); return; }
    if (photos.length === 0 && !noPhotos) { alert("You need to add a photo image or check that no photos were taken."); return; }

    const draft: MantaDraft = {
      id: mantaId,
      name: nm,
      gender, ageClass,
      size: size ? to2(parseFloat(size)) : null,
      photos
    };
    onSave(draft);
    onClose();
  }

  const showNoPhotos = photos.length === 0;

  return (
    <div className="fixed inset-0 bg-black/40 z-[300000] flex items-center justify-center" onClick={(e)=>e.stopPropagation()}>
      <div className="bg-white rounded-lg border w-full max-w-4xl p-4 relative" onClick={(e)=>e.stopPropagation()}>
        <button
          aria-label="Close"
          className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border hover:bg-gray-50"
          onClick={onClose}
        >&times;</button>

        <div className="flex items-center justify-between mb-3 pr-10">
          <h3 className="text-lg font-medium">{existingManta ? "Edit Manta" : "Add Manta"}</h3>
          <div className="text-[11px] text-gray-500">sighting: {sightingId.slice(0,8)}</div>
        </div>

        {/* Header fields */}
        <div className="grid md:grid-cols-12 gap-3 mb-3">
          <div className="md:col-span-5 col-span-12">
            <label className="text-sm block mb-1">Temp Name</label>
            <input
              className={`w-full border rounded px-3 py-2 ${nameTouched && !name.trim() ? "border-red-400" : ""}`}
              value={name}
              onChange={(e)=> setName(e.target.value)}
              onBlur={()=> setNameTouched(true)}
              placeholder="e.g., A, B, C"
            />
            <div className="text-[11px] mt-1 text-slate-500">Please provide a temporary name</div>
          </div>
          <div className="md:col-span-2 col-span-12">
            <label className="text-sm block mb-1">Gender</label>
            <select className="w-full border rounded px-2 py-2" value={gender ?? ""} onChange={(e)=>setGender(e.target.value || null)}>
              <option value="">—</option>
              <option value="female">female</option>
              <option value="male">male</option>
              <option value="unknown">unknown</option>
            </select>
          </div>
          <div className="md:col-span-3 col-span-12">
            <label className="text-sm block mb-1">Age Class</label>
            <select className="w-full border rounded px-2 py-2" value={ageClass ?? ""} onChange={(e)=>setAgeClass(e.target.value || null)}>
              <option value="">—</option>
              <option value="juvenile">juvenile</option>
              <option value="subadult">subadult</option>
              <option value="adult">adult</option>
            </select>
          </div>
          <div className="md:col-span-2 col-span-12">
            <label className="text-sm block mb-1">Mean Size (cm)</label>
            <input
              type="number" step="0.01" inputMode="decimal" min={0}
              className="w-full border rounded px-3 py-2"
              value={size ?? ""}
              onChange={(e)=> setSize((e.target.value||"").replace(/[^0-9.]/g,"").replace(/(\..*)\./g,"$1"))}
              placeholder="cm"
            />
            <div className="text-[11px] text-slate-500 -mt-1">Mean of dorsal measurements</div>
          </div>
        </div>

        {/* Dropzone */}
        <div
          className="mt-1 border-dashed border-2 rounded p-4 text-sm text-gray-600 flex flex-col items-center justify-center"
          onDrop={onDrop}
          onDragOver={(e)=>{e.preventDefault();}}
        >
          <div>Drag &amp; drop photos here</div>
          <div className="my-2">or</div>
          <button type="button" onClick={()=>inputRef.current?.click()} className="px-3 py-1 border rounded" disabled={busy}>Browse…</button>
          <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={onBrowse} />
        </div>

        {/* No-photos checkbox (only when there are no photos) */}
        {showNoPhotos && (
          <label className="mt-2 text-sm flex items-center gap-2">
            <input type="checkbox" checked={noPhotos} onChange={e=>setNoPhotos(e.target.checked)} />
            <span>No photos taken (allow save without photos)</span>
          </label>
        )}

        {/* Photos list */}
        <div className="mt-3 space-y-3">
          {photos.map(p=>(
            <div key={p.id} className="border rounded p-2 grid grid-cols-[112px_1fr_auto] gap-3 items-start">
              <img src={p.url} alt={p.name} className="w-24 h-24 object-cover rounded" />

              <div className="grid grid-cols-[120px_1fr] gap-4">
                <div>
                  <div className="text-xs text-slate-600 mb-1">View</div>
                  <div className="flex flex-col gap-1 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="radio" name={`view-${p.id}`} checked={p.view==="ventral"} onChange={()=>setPhotos(prev=>prev.map(x=>x.id===p.id?{...x,view:"ventral"}:x))} />
                      ventral
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name={`view-${p.id}`} checked={p.view==="dorsal"} onChange={()=>setPhotos(prev=>prev.map(x=>x.id===p.id?{...x,view:"dorsal"}:x))} />
                      dorsal
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name={`view-${p.id}`} checked={p.view==="other"} onChange={()=>setPhotos(prev=>prev.map(x=>x.id===p.id?{...x,view:"other"}:x))} />
                      other
                    </label>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-600 mb-1">Best</div>
                  <div className="flex flex-col gap-1 text-sm">
                    <label className="flex items-center gap-2 text-sky-700">
                      <input type="radio" name={`bestV-${mantaId}`} checked={!!p.isBestVentral} onChange={()=>setBest(p.id, "ventral")} />
                      Best ventral
                    </label>
                    <label className="flex items-center gap-2 text-sky-700">
                      <input type="radio" name={`bestD-${mantaId}`} checked={!!p.isBestDorsal} onChange={()=>setBest(p.id, "dorsal")} />
                      Best dorsal
                    </label>
                  </div>
                  {p.view === "dorsal" && p.measure && (
                    <div className="mt-1 text-xs text-slate-600">DL: {to2(p.measure.dlCm)} cm · DW: {to2(p.measure.dwCm)} cm</div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 items-end">
                <button type="button" className="px-3 py-1 rounded bg-sky-600 text-white" onClick={()=>openMeasure(p)} title="Measure disc length from dorsal photo" disabled={p.view!=="dorsal"}>Size</button>
                <button type="button" className="p-1 rounded border border-red-300 text-red-600" onClick={()=>deletePhoto(p.id)} title="Delete photo"><TrashIcon/></button>
              </div>
            </div>
          ))}
          {photos.length === 0 && <div className="text-sm text-gray-600">No photos added yet.</div>}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="px-3 py-2 rounded border" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="px-3 py-2 rounded bg-sky-600 text-white" disabled={busy} onClick={save}>Save Manta</button>
        </div>
      </div>

      {/* Inline measure modal (no portal, no createRoot issue) */}
      {measureOpen && (
        <MeasureModal
          url={measureOpen.url}
          onCancel={()=> setMeasureOpen(null)}
          onApply={(r)=> {
            setPhotos(prev => prev.map(x => x.id === measureOpen.photoId ? ({ ...x, measure: r }) : x));
            setMeasureOpen(null);
          }}
        />
      )}
    </div>
  );
}
