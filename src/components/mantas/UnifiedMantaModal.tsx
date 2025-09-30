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
  dlCm?: number;  // disc length in cm
  dwCm?: number;  // disc width in cm (DL * 2.3)
};

export type MantaDraft = {
  id: string;
  name: string;
  gender?: string | null;
  ageClass?: string | null;
  size?: string | null; // Mean DW in cm (two decimals as string)
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
  try { return (crypto as any).randomUUID(); }
  catch { return Math.random().toString(36).slice(2); }
}
function mean(nums: number[]): number | null {
  const n = nums.filter((v) => Number.isFinite(v));
  return n.length ? n.reduce((a,b)=>a+b,0)/n.length : null;
}

export default function UnifiedMantaModal({ open, onClose, sightingId, onSave, existingManta }: Props) {
  const [name, setName] = useState<string>("");
  const [nameError, setNameError] = useState(false);
  const [noPhotos, setNoPhotos] = useState(false);

  const [gender, setGender] = useState<string | null>(null);
  const [ageClass, setAgeClass] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null); // Mean DW (cm)
  const [photos, setPhotos] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);

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
    setNameError(false);
  }, [open, existingManta]);

  // Recompute Mean Size (DW) when dorsal measurements change
  useEffect(() => {
    const vals = photos
      .filter(p => p.view === "dorsal" && Number.isFinite(p.dwCm))
      .map(p => Number(p.dwCm));
    const m = mean(vals);
    if (m != null) setSize(m.toFixed(2));
  }, [photos.map(p => `${p.id}:${p.dwCm}`).join(",")]);

  async function handleFiles(files: File[]) {
    if (!files?.length) return;
    setBusy(true);
    const allow = ["image/jpeg","image/png","image/webp","image/heic","image/heif"];
    const added: Uploaded[] = [];

    for (const f of files) {
      if (!allow.includes(f.type)) { console.warn("[UnifiedMantaModal] skip type", f.type); continue; }
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const id = uuid();
      const path = `${sightingId}/${mantaId}/${id}.${ext}`;

      try {
        const { error } = await supabase.storage.from("temp-images").upload(path, f, { cacheControl: "3600", upsert: false });
        if (error) { console.warn("[UnifiedMantaModal] upload error", error.message); continue; }
        const { data } = supabase.storage.from("temp-images").getPublicUrl(path);
        added.push({ id, name: f.name, url: data?.publicUrl || "", path, view: "other" });
      } catch (e: any) { console.warn("[UnifiedMantaModal] upload exception", e?.message || e); }
    }

    if (added.length) setPhotos(prev => [...prev, ...added]);
    setBusy(false);
  }

  const [measureOpen, setMeasureOpen] = useState<{ photoId: string; url: string } | null>(null);
  const [scaleCm, setScaleCm] = useState(60);

  function setView(id: string, view: View) {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, view } : p));
  }
  function setBestVentral(id: string) {
    setPhotos(prev =>
      prev.map(p => p.view !== "ventral"
        ? { ...p, isBestVentral: false }
        : { ...p, isBestVentral: p.id === id }
      )
    );
  }
  function setBestDorsal(id: string) {
    setPhotos(prev =>
      prev.map(p => p.view !== "dorsal"
        ? { ...p, isBestDorsal: false }
        : { ...p, isBestDorsal: p.id === id }
      )
    );
  }

  function save() {
    const trimmed = (name || "").trim();
    if (!trimmed) { setNameError(true); return; }
    if (photos.length === 0 && !noPhotos) {
      alert("You need to add a photo image or check that no photos were taken.");
      return;
    }
    const draft: MantaDraft = { id: mantaId, name: trimmed, gender, ageClass, size, photos };
    onSave(draft);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-[300000] flex items-center justify-center" onClick={(e)=>e.stopPropagation()}>
      <div className="bg-white rounded-lg border w-full max-w-5xl p-4 pointer-events-auto relative">
        <button
          aria-label="Close"
          type="button"
          className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border hover:bg-gray-50"
          onClick={(e)=>{ e.stopPropagation(); onClose(); }}
        >
          &times;
        </button>

        <div className="flex items-center justify-between mb-3 pr-10">
          <h3 className="text-lg font-medium">{existingManta ? "Edit Manta" : "Add Manta"}</h3>
          <div className="text-[11px] text-gray-500">sighting: {sightingId.slice(0,8)}</div>
        </div>

        <div className="grid md:grid-cols-12 gap-3">
          <div className="md:col-span-5 col-span-12">
            <label className="text-sm block mb-1">Temp Name</label>
            <input
              className={`w-full border rounded px-3 py-2 ${nameError && !name.trim() ? "border-red-500" : ""}`}
              value={name}
              onChange={(e)=>{ setName(e.target.value); if (nameError) setNameError(false); }}
              placeholder="e.g., A, B, C"
            />
            {nameError && !name.trim() ? (
              <div className="mt-1 text-xs text-red-600">please choose a temporary name</div>
            ) : null}
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
              type="number" step="0.01" inputMode="decimal" min={0} placeholder="cm"
              className="w-full border rounded px-3 py-2"
              value={(size as any) ?? ""}
              onChange={(e)=> setSize((e.target.value||"").replace(/[^0-9.]/g,"").replace(/(\..*)\./g,"$1"))}
            />
            <div className="mt-1 text-[11px] text-slate-500">Mean of dorsal measurements</div>
          </div>
        </div>

        {/* Dropzone above photos */}
        <div className="mt-4">
          <div
            className="border-dashed border-2 rounded p-4 text-sm text-gray-600 flex flex-col items-center justify-center"
            onDrop={(e)=>{ e.preventDefault(); const files = Array.from(e.dataTransfer.files || []); handleFiles(files); }}
            onDragOver={(e)=>e.preventDefault()}
          >
            <div>Drag &amp; drop photos here</div>
            <div className="my-2">or</div>
            <button type="button" onClick={()=>inputRef.current?.click()} className="px-3 py-1 border rounded" disabled={busy}>Browse…</button>
            <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={(e)=>{ const files = Array.from(e.target.files || []); handleFiles(files); e.currentTarget.value=""; }} />
          </div>
          <div className="mt-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={noPhotos} onChange={e=>setNoPhotos(e.target.checked)} />
              No photos taken (allow save without photos)
            </label>
          </div>
        </div>

        {/* Photos list */}
        <div className="mt-4 space-y-2">
          {photos.map(p=>(
            <div key={p.id} className="flex items-center gap-3 border rounded p-2">
              <img src={p.url} alt={p.name} className="w-[96px] h-[72px] object-cover rounded" />
              <div className="flex-1 grid grid-cols-[140px_1fr_auto] items-center gap-2">
                {/* View column */}
                <div className="text-sm">
                  <div className="text-[11px] text-slate-500 mb-1">View</div>
                  <label className="mr-3"><input type="radio" name={`v-${p.id}`} checked={p.view==="ventral"} onChange={()=>setView(p.id,"ventral")} /> ventral</label>
                  <label className="mr-3"><input type="radio" name={`v-${p.id}`} checked={p.view==="dorsal"} onChange={()=>setView(p.id,"dorsal")} /> dorsal</label>
                  <label><input type="radio" name={`v-${p.id}`} checked={p.view==="other"} onChange={()=>setView(p.id,"other")} /> other</label>
                </div>

                {/* Best for selected view */}
                <div className="text-sm">
                  <div className="text-[11px] text-slate-500 mb-1">Best</div>
                  {p.view === "ventral" ? (
                    <label className="text-sky-700 font-medium">
                      <input type="radio" name="best-ventral" checked={!!p.isBestVentral} onChange={()=>setBestVentral(p.id)} /> Best ventral
                    </label>
                  ) : p.view === "dorsal" ? (
                    <label className="text-sky-700 font-medium">
                      <input type="radio" name="best-dorsal" checked={!!p.isBestDorsal} onChange={()=>setBestDorsal(p.id)} /> Best dorsal
                    </label>
                  ) : <span className="text-slate-400">—</span>}
                </div>

                {/* Actions */}
                <div className="text-right">
                  {p.view === "dorsal" ? (
                    <div className="flex items-center gap-2 justify-end">
                      <button type="button" className="px-3 py-1 rounded bg-sky-600 text-white" onClick={()=>setMeasureOpen({ photoId: p.id, url: p.url })}>
                        Size
                      </button>
                      {Number.isFinite(p.dwCm) ? (
                        <span className="text-xs text-slate-600">DL: {(p.dlCm as number).toFixed(2)} · DW: {(p.dwCm as number).toFixed(2)}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          {photos.length === 0 ? <div className="text-sm text-slate-500">No photos added yet.</div> : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="px-3 py-2 rounded border" onClick={(e)=>{ e.stopPropagation(); onClose(); }} disabled={busy}>Cancel</button>
          <button type="button" className="px-3 py-2 rounded bg-sky-600 text-white" onClick={(e)=>{ e.stopPropagation(); save(); }} disabled={busy || (!noPhotos && photos.length===0)}>Save Manta</button>
        </div>

        {measureOpen ? (
          <MeasureModal
            key={measureOpen.photoId}
            url={measureOpen.url}
            scaleCm={scaleCm}
            onScaleChange={(cm)=>setScaleCm(Number.isFinite(cm)? cm : 60)}
            onClose={()=>setMeasureOpen(null)}
            onApply={(dlCm, dwCm)=>{
              setPhotos(prev => prev.map(p => p.id === measureOpen.photoId ? { ...p, dlCm, dwCm } : p));
              setMeasureOpen(null);
            }}
          />
        ) : null}

        <div id="probe:measure-modal" className="sr-only">probe:measure-modal</div>
      </div>
    </div>
  );
}

type MeasureModalProps = {
  url: string;
  onClose: () => void;
  onApply: (dlCm:number, dwCm:number)=>void;
  scaleCm: number;
  onScaleChange: (n:number)=>void;
};

function MeasureModal({ url, onClose, onApply, scaleCm, onScaleChange }: MeasureModalProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [displayWidth, setDisplayWidth] = useState<number>(800);
  const [displayHeight, setDisplayHeight] = useState<number>(450);
  const [zoom, setZoom] = useState(1);
  const [points, setPoints] = useState<{x:number;y:number}[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    const img = imgRef.current; if (!img) return;
    img.onload = () => {
      const natW = img.naturalWidth, natH = img.naturalHeight;
      const baseW = Math.min(natW, 1000);
      const baseH = natH * (baseW / natW);
      setDisplayWidth(Math.round(baseW * zoom));
      setDisplayHeight(Math.round(baseH * zoom));
    };
  }, [zoom, url]);

  function clamp(n:number,min:number,max:number){ return Math.max(min, Math.min(max, n)); }

  function relPos(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    const y = clamp(e.clientY - rect.top, 0, rect.height);
    return { x, y };
  }
  function dist(a:{x:number;y:number}, b:{x:number;y:number}) { const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx + dy*dy); }

  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    if (dragIdx !== null) return;
    const p = relPos(e);
    setPoints(prev => prev.length >= 4 ? [p] : [...prev, p]);
  }
  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const p = relPos(e);
    const i = points.findIndex(pt => dist(pt,p) <= 10);
    if (i >= 0) setDragIdx(i);
  }
  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (dragIdx === null) return;
    const p = relPos(e);
    setPoints(prev => prev.map((pt, i) => i === dragIdx ? p : pt));
  }
  function onMouseUp(){ setDragIdx(null); }

  const scalePx = points.length >= 2 ? dist(points[0], points[1]) : 0;
  const discPx  = points.length >= 4 ? dist(points[2], points[3]) : 0;
  const dlCm    = scalePx > 0 ? (discPx / scalePx) * scaleCm : 0;
  const dwCm    = dlCm * 2.3;

  return (
    <div className="fixed inset-0 bg-black/60 z-[400000] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg border w-full max-w-5xl p-4 pointer-events-auto relative" onClick={(e)=>e.stopPropagation()}>
        <button aria-label="Close" type="button" className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border hover:bg-gray-50" onClick={onClose}>&times;</button>
        <div className="text-sm font-medium mb-2">Measure (click 1–2 laser dots, then 3–4 disc ends)</div>

        <div
          className="relative border rounded overflow-hidden select-none"
          style={{ width: displayWidth, height: displayHeight }}
          onClick={onClick} onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
        >
          <img ref={imgRef} src={url} alt="to measure" draggable={false} style={{ width: displayWidth, height: displayHeight, userSelect: "none" }} />
          <svg className="absolute inset-0" width={displayWidth} height={displayHeight}>
            {points.length >= 2 ? <line x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} stroke="#12a8cf" strokeWidth={2} /> : null}
            {points.length >= 4 ? <line x1={points[2].x} y1={points[2].y} x2={points[3].x} y2={points[3].y} stroke="#12a8cf" strokeWidth={2} /> : null}
            {points.map((pt, i) => <circle key={i} cx={pt.x} cy={pt.y} r={6} fill="#12a8cf" />)}
          </svg>
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="text-sm text-slate-700 space-x-6">
            <span>Scale (px): <strong>{scalePx.toFixed(1)}</strong> (<input type="number" min={1} step="0.1" value={scaleCm} onChange={(e)=>onScaleChange(parseFloat(e.target.value) || 60)} className="w-20 border rounded px-2 py-0.5 text-sm" /> cm)</span>
            <span>DL (cm): <strong>{dlCm.toFixed(2)}</strong></span>
            <span>DW (cm = DL × 2.3): <strong>{dwCm.toFixed(2)}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 mr-3 text-sm">
              <button className="px-2 py-1 border rounded" onClick={()=>setZoom(z=>Math.max(0.5, z-0.25))}>-</button>
              <span>Zoom {Math.round(zoom*100)}%</span>
              <button className="px-2 py-1 border rounded" onClick={()=>setZoom(z=>Math.min(3, z+0.25))}>+</button>
            </div>
            <button className="px-3 py-1 border rounded" onClick={()=>setPoints([])}>Reset</button>
            <button className="px-3 py-1 rounded bg-sky-600 text-white" onClick={()=>{ if (dlCm>0) onApply(parseFloat(dlCm.toFixed(2)), parseFloat(dwCm.toFixed(2))); }}>Apply &amp; Fill</button>
          </div>
        </div>

        <div id="probe:measure-modal" className="mt-2 text-[10px] text-muted-foreground">probe:measure-modal</div>
      </div>
    </div>
  );
}
