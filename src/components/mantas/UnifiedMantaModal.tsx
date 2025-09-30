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
  size?: string | null; // keep as string; parent can format 2dp when displaying
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

/** Measurement modal for dorsal photos.
 * Click 1–2 on laser dots (scale = 60 cm). Click 3–4 on disc endpoints.
 * DL = (discPx / scalePx) * 60;  DW = DL * 2.3
 */
function MeasureModal({
  url,
  onClose,
  onApply
}: {
  url: string;
  onClose: () => void;
  onApply: (dlCm: number, dwCm: number) => void;
}) {
  const imgRef = useRef<HTMLImageElement|null>(null);
  const canvasRef = useRef<HTMLCanvasElement|null>(null);
  const [points, setPoints] = useState<{x:number;y:number}[]>([]);

  function reset() { setPoints([]); }

  // Map click to image pixels (handles zoomed display)
  function handleClick(e: React.MouseEvent) {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const scaleX = (img.naturalWidth || rect.width) / rect.width;
    const scaleY = (img.naturalHeight || rect.height) / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top)  * scaleY;
    setPoints(prev => prev.length >= 4 ? prev : [...prev, {x,y}]);
  }

  // Draw overlay
  useEffect(()=>{
    const c = canvasRef.current, img = imgRef.current;
    if (!c || !img) return;
    const rect = img.getBoundingClientRect();
    c.width = Math.max(1, Math.floor(rect.width));
    c.height = Math.max(1, Math.floor(rect.height));
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0,0,c.width,c.height);

    const sx = c.width  / (img.naturalWidth || rect.width);
    const sy = c.height / (img.naturalHeight|| rect.height);

    const drawPt = (p:{x:number;y:number}, color:string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x*sx, p.y*sy, 4, 0, Math.PI*2);
      ctx.fill();
    };
    const drawLine = (a:{x:number;y:number}, b:{x:number;y:number}, color:string) => {
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x*sx, a.y*sy); ctx.lineTo(b.x*sx, b.y*sy); ctx.stroke();
    };

    if (points[0]) drawPt(points[0], '#22c55e');
    if (points[1]) { drawPt(points[1], '#22c55e'); drawLine(points[0], points[1], '#22c55e'); }

    if (points[2]) drawPt(points[2], '#0ea5e9');
    if (points[3]) { drawPt(points[3], '#0ea5e9'); drawLine(points[2], points[3], '#0ea5e9'); }
  }, [points]);

  const dist = (a:{x:number;y:number}, b:{x:number;y:number}) => Math.hypot(a.x-b.x, a.y-b.y);
  const scalePx = points.length >= 2 ? dist(points[0], points[1]) : null;
  const discPx  = points.length >= 4 ? dist(points[2], points[3]) : null;
  const dlCm = (scalePx && discPx && scalePx>0) ? (discPx / scalePx) * 60.0 : null;
  const dwCm = (dlCm!=null) ? dlCm * 2.3 : null;

  return (
    <div className="fixed inset-0 z-[300100] bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-5xl rounded-lg border p-4 relative" onClick={(e)=>e.stopPropagation()}>
        <button className="absolute top-2 right-2 h-8 w-8 rounded-full border grid place-items-center" onClick={onClose} aria-label="Close">&times;</button>
        <h3 className="text-lg font-medium mb-3">Measure (click 1–2 laser dots, then 3–4 disc ends)</h3>
        <div className="relative border rounded overflow-hidden">
          <img ref={imgRef} src={url} alt="measure" className="max-h-[60vh] w-auto block mx-auto" />
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" onClick={handleClick} style={{cursor:'crosshair'}} />
        </div>
        <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div>Scale (px): <span className="font-mono">{scalePx ? scalePx.toFixed(1) : "—"}</span> (60 cm)</div>
            <div>Disc length (px): <span className="font-mono">{discPx ? discPx.toFixed(1) : "—"}</span></div>
          </div>
          <div>
            <div>DL (cm): <span className="font-mono">{dlCm!=null ? dlCm.toFixed(2) : "—"}</span></div>
            <div>DW (cm = DL × 2.3): <span className="font-mono">{dwCm!=null ? dwCm.toFixed(2) : "—"}</span></div>
          </div>
        </div>
        <div className="mt-4 flex justify-between">
          <div className="text-[11px] text-slate-500">probe:measure-modal</div>
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded border" onClick={reset}>Reset</button>
            <button className="px-3 py-2 rounded bg-sky-600 text-white disabled:opacity-50"
              disabled={!(dlCm!=null && dwCm!=null)}
              onClick={()=>{ if (dlCm!=null && dwCm!=null) { onApply(dlCm, dwCm); onClose(); }}}>
              Apply & Fill
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UnifiedMantaModal({ open, onClose, sightingId, onSave, existingManta }: Props) {
  const [name, setName] = useState<string>("");
  const [gender, setGender] = useState<string | null>(null);
  const [ageClass, setAgeClass] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [noPhotos, setNoPhotos] = useState(false);
  const [measureFor, setMeasureFor] = useState<{photoId: string; url: string} | null>(null);
  const [measured, setMeasured] = useState<Record<string, {dlCm:number; dwCm:number}>>({});

  const inputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const mantaId = useMemo(() => existingManta?.id ?? uuid(), [existingManta?.id]);

  useEffect(() => {
    if (!open) return;
    setName((existingManta?.name || "").trim());
    setGender(existingManta?.gender ?? null);
    setAgeClass(existingManta?.ageClass ?? null);
    setSize(existingManta?.size ?? null);
    setPhotos(existingManta?.photos ?? []);
    setNoPhotos(false);
  }, [open, existingManta]);

  if (!open) return null;

  async function handleFiles(files: File[]) {
    if (!files?.length) return;
    setBusy(true);
    const allow = ["image/jpeg","image/png","image/webp"];
    const added: Uploaded[] = [];
    for (const f of files) {
      if (!allow.includes(f.type)) { console.warn("[UnifiedMantaModal] skip type", f.type, f.name); continue; }
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
    const files = Array.from(e.dataTransfer.files || []);
    handleFiles(files);
  }
  function onBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
    e.currentTarget.value = "";
  }

  function setView(id: string, view: View) {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, view } : p));
  }
  function setBestVentral(id: string) {
    setPhotos(prev => prev.map(p => p.view !== "ventral" ? { ...p, isBestVentral: false } : { ...p, isBestVentral: p.id === id }));
  }
  function setBestDorsal(id: string) {
    setPhotos(prev => prev.map(p => p.view !== "dorsal" ? { ...p, isBestDorsal: false } : { ...p, isBestDorsal: p.id === id }));
  }

  function save() {
    const nm = (name || "").trim();
    if (!nm) {
      window.alert("You need to choose a temporary name");
      nameInputRef.current?.focus();
      return;
    }
    if (!noPhotos && photos.length === 0) {
      window.alert("You need to add a photo image or check that no photos were taken.");
      return;
    }
    const draft: MantaDraft = { id: mantaId, name: nm, gender, ageClass, size, photos };
    onSave(draft);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[300000] flex items-center justify-center" onClick={(e)=>e.stopPropagation()}>
      <div className="bg-white rounded-lg border w-full max-w-5xl p-4 pointer-events-auto relative">
        <button aria-label="Close" type="button" className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border hover:bg-gray-50" onClick={(e)=>{ e.stopPropagation(); onClose(); }}>
          &times;
        </button>

        <div className="flex items-center justify-between mb-3 pr-10">
          <h3 className="text-lg font-medium">{existingManta ? "Edit Manta" : "Add Manta"}</h3>
          <div className="text-[11px] text-gray-500">sighting: {sightingId.slice(0,8)}</div>
        </div>

        <div className="grid md:grid-cols-12 gap-3 mb-4">
          <div className="md:col-span-5 col-span-12">
            <label className="text-sm block mb-1">Name</label>
            <input ref={nameInputRef} className="w-full border rounded px-3 py-2" value={name} onChange={(e)=> setName(e.target.value)} placeholder="e.g., A, B, C" />
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
            <label className="text-sm block mb-1">Size (cm)</label>
            <input
              type="number" step="0.01" inputMode="decimal" min={0} placeholder="cm"
              className="w-full border rounded px-3 py-2"
              value={(size as any) ?? ""}
              onChange={(e)=> setSize((e.target.value||"").replace(/[^0-9.]/g,"").replace(/(..*)./g,"$1"))}
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Left: centered dropzone */}
          <div className="flex items-center justify-center">
            <div
              className="mt-1 border-dashed border-2 rounded p-6 text-sm text-gray-600 flex flex-col items-center justify-center w-full"
              onDrop={onDrop}
              onDragOver={(e)=>{e.preventDefault();}}
            >
              <div>Drag &amp; drop photos here</div>
              <div className="my-2">or</div>
              <button type="button" onClick={()=>inputRef.current?.click()} className="px-3 py-1 border rounded" disabled={busy}>Browse…</button>
              <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={onBrowse} />
              {photos.length === 0 && (
                <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={noPhotos} onChange={(e)=>setNoPhotos(e.target.checked)} />
                  No photos taken (allow save without photos)
                </label>
              )}
            </div>
          </div>

          {/* Right: photos as rows */}
          <div className="max-h-80 overflow-auto pr-1">
            {photos.length === 0 ? (
              <div className="text-sm text-gray-600">No photos added yet.</div>
            ) : (
              <div className="space-y-2">
                {photos.map(p=>(
                  <div key={p.id} className="border rounded p-2 flex items-center gap-3">
                    <img src={p.url} alt={p.name} className="w-24 h-24 object-cover rounded" />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-600">View:</span>
                      {(["ventral","dorsal","other"] as View[]).map(v=>(
                        <label key={v} className="text-xs flex items-center gap-1">
                          <input type="radio" name={`view-${p.id}`} checked={p.view===v} onChange={()=>setView(p.id, v)} />
                          {v}
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.view==="ventral" && (
                        <label className="text-xs flex items-center gap-1">
                          <input type="radio" name="best-ventral" checked={!!p.isBestVentral} onChange={()=>setBestVentral(p.id)} />
                          Best
                        </label>
                      )}
                      {p.view==="dorsal" && (
                        <label className="text-xs flex items-center gap-1">
                          <input type="radio" name="best-dorsal" checked={!!p.isBestDorsal} onChange={()=>setBestDorsal(p.id)} />
                          Best
                        </label>
                      )}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      {p.view === "dorsal" && (
                        <>
                          <button type="button" className="px-2 py-1 border rounded text-xs" onClick={()=> setMeasureFor({photoId: p.id, url: p.url})}>
                            Size
                          </button>
                          {measured[p.id] ? (
                            <div className="text-[11px] text-slate-600 whitespace-nowrap">
                              DL: {measured[p.id].dlCm.toFixed(2)} cm · DW: {measured[p.id].dwCm.toFixed(2)} cm
                            </div>
                          ) : <div className="text-[11px] text-slate-400">—</div>}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={(e)=>{ e.stopPropagation(); onClose(); }} className="px-3 py-2 rounded border" disabled={busy}>Cancel</button>
          <button
            type="button"
            onClick={(e)=>{ e.stopPropagation(); save(); }}
            className="px-3 py-2 rounded bg-sky-600 text-white disabled:opacity-50"
            disabled={busy || !(((name || "").trim()) && (photos.length > 0 || noPhotos))}
          >
            Save Manta
          </button>
        </div>
      </div>

      {measureFor && (
        <MeasureModal
          url={measureFor.url}
          onClose={()=> setMeasureFor(null)}
          onApply={(dlCm, dwCm)=>{
            setMeasured(prev => ({ ...prev, [measureFor.photoId]: { dlCm, dwCm }}));
            // Fill overall Size (cm) with DW to two decimals
            setSize(dwCm.toFixed(2));
          }}
        />
      )}
    </div>
  );
}
