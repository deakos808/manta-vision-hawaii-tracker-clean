import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import MeasureModal, { MeasureResult } from "./MeasureModal";
import MatchModal from "./MatchModal";

type View = "ventral" | "dorsal" | "other";

export type Uploaded = {
  id: string;
  name: string;
  url: string;
  path: string;
  view: View;
  isBestVentral?: boolean;
  isBestDorsal?: boolean;
  measure?: { dlCm: number; dwCm: number; discPx: number; scalePx: number; scaleCm: number };
};

export type MantaDraft = {
  id: string;
  name: string;
  gender?: string | null;
  ageClass?: string | null;
  size?: string | null; // mean DW(cm) from dorsal photos
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

function uuid() { try { return (crypto as any).randomUUID(); } catch { return Math.random().toString(36).slice(2); } }
const to2 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : n.toFixed(2));

export default function UnifiedMantaModal({ open, onClose, sightingId, onSave, existingManta }: Props) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [ageClass, setAgeClass] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null); // mean of dorsal DW
  const [noPhotos, setNoPhotos] = useState(false);

  const [photos, setPhotos] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [measureOpen, setMeasureOpen] = useState<Uploaded | null>(null);
  const [matchOpen, setMatchOpen] = useState<Uploaded | null>(null);
  const [potentialCatalogId, setPotentialCatalogId] = useState<number | null>(null);
  const [potentialNoMatch, setPotentialNoMatch] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const mantaId = useMemo(() => existingManta?.id ?? uuid(), [existingManta?.id]);

  useEffect(() => {
    if (!open) return;
    setName((existingManta?.name || "").trim());
    setGender(existingManta?.gender ?? null);
    setAgeClass(existingManta?.ageClass ?? null);
    setSize(existingManta?.size ?? null);
    setPhotos(existingManta?.photos ?? []);
    setPotentialCatalogId(existingManta?.potentialCatalogId ?? null);
    setPotentialNoMatch(existingManta?.potentialNoMatch ?? false);
  }, [open, existingManta]);

  const meanDorsalDW = useMemo(() => {
    const vals = photos.filter(p => p.view === "dorsal" && p.measure?.dwCm).map(p => p.measure!.dwCm);
    if (vals.length === 0) return null;
    return vals.reduce((a,b)=>a+b,0) / vals.length;
  }, [photos]);

  useEffect(() => {
    if (meanDorsalDW !== null) setSize(meanDorsalDW.toFixed(2));
  }, [meanDorsalDW]);

  if (!open) return null;

  async function handleFiles(files: File[]) {
    if (!files?.length) return;
    setBusy(true);
    const allow = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    const added: Uploaded[] = [];
    for (const f of files) {
      if (!allow.includes(f.type)) continue;
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const id = uuid();
      const path = `${sightingId}/${mantaId}/${id}.${ext}`;
      try {
        const { error } = await supabase.storage.from("temp-images").upload(path, f, { cacheControl: "3600", upsert: false });
        if (error) { console.warn("[upload error]", error.message); continue; }
        const { data } = supabase.storage.from("temp-images").getPublicUrl(path);
        added.push({ id, name: f.name, url: data?.publicUrl || "", path, view: "other" });
      } catch (e:any) {
        console.warn("[upload]", e?.message || e);
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

  function setView(id: string, view: View) {
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, view } : p));
  }
  function setBestVentral(id: string) {
    setPhotos(prev => prev.map(p => p.view !== "ventral" ? { ...p, isBestVentral: false } : { ...p, isBestVentral: p.id === id }));
  }
  function setBestDorsal(id: string) {
    setPhotos(prev => prev.map(p => p.view !== "dorsal" ? { ...p, isBestDorsal: false } : { ...p, isBestDorsal: p.id === id }));
  }
  function deletePhoto(id: string) {
    setPhotos(prev => prev.filter(p => p.id !== id));
  }

  function onMeasureApplied(photoId: string, r: MeasureResult) {
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, measure: { dlCm: r.dlCm, dwCm: r.dwCm, discPx: r.discPx, scalePx: r.scalePx, scaleCm: r.scaleCm } } : p));
  }

  function canSave() {
    const hasName = name.trim().length > 0;
    const hasPhotosOrOverride = photos.length > 0 || noPhotos;
    return hasName && hasPhotosOrOverride;
  }

  function save() {
    const draft: MantaDraft = {
      id: mantaId,
      name: (name || "").trim(),
      gender, ageClass,
      size: size ?? null,
      photos,
      potentialCatalogId,
      potentialNoMatch,
    };
    onSave(draft);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-[300000] bg-black/40 flex items-center justify-center" onClick={(e)=>{e.stopPropagation(); onClose();}}>
        <div className="bg-white rounded-lg border w-[min(1100px,95vw)] pointer-events-auto relative" onClick={(e)=>e.stopPropagation()}>
          <button aria-label="Close" type="button" className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border hover:bg-gray-50" onClick={onClose}>&times;</button>

          <div className="flex items-center justify-between px-4 pt-4">
            <h3 className="text-lg font-medium">Add Manta</h3>
            <div className="text-[11px] text-gray-500">sighting: {sightingId.slice(0,8)}</div>
          </div>

          <div className="px-4 pb-4">
            <div className="grid md:grid-cols-12 gap-3">
              <div className="md:col-span-5 col-span-12">
                <label className="text-sm block mb-1">Temp Name</label>
                <input className="w-full border rounded px-3 py-2" value={name} onChange={(e)=> setName(e.target.value)} placeholder="e.g., A, B, C" />
                {!name.trim() && <div className="text-xs text-red-500 mt-1">Please provide a temporary name</div>}
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
                <input type="number" className="w-full border rounded px-3 py-2" value={size ?? ""} onChange={(e)=> setSize(e.target.value || null)} placeholder="cm" />
                <div className="text-[10px] text-slate-500">Mean of dorsal measurements</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="border-dashed border-2 rounded p-4 text-sm text-gray-600 flex flex-col items-center justify-center" onDrop={onDrop} onDragOver={(e)=>e.preventDefault()}>
                <div>Drag &amp; drop photos here</div>
                <div className="my-2">or</div>
                <button type="button" onClick={()=>inputRef.current?.click()} className="px-3 py-1 border rounded" disabled={busy}>Browse…</button>
                <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={onBrowse} />
              </div>
              {photos.length === 0 && (
                <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={noPhotos} onChange={(e)=>setNoPhotos(e.target.checked)} />
                  No photos taken (allow save without photos)
                </label>
              )}
            </div>

            <div className="mt-4 space-y-3">
              {photos.map((p)=> {
                const canSize = p.view === "dorsal";
                const ventralDisabled = p.view !== "ventral";
                const dorsalDisabled = p.view !== "dorsal";
                return (
                  <div key={p.id} className="border rounded p-3 grid grid-cols-[110px,1fr,auto] gap-3 items-center">
                    <div>
                      <img src={p.url} alt={p.name} className="w-[110px] h-[80px] object-cover rounded border" />
                      {p.view === "ventral" && p.isBestVentral && (<div className="text-xs text-blue-600 underline cursor-pointer mt-1" onClick={()=>setMatchOpen(p)}>Match</div>)}
{p.view === "ventral" && p.isBestVentral && (
                        <button className="text-blue-600 underline text-xs mt-1" onClick={()=> setMatchOpen(p)}>Match</button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-sm">
                        <div className="text-xs mb-1">View</div>
                        <label className="flex items-center gap-2 mb-1"><input type="radio" name={`view-${p.id}`} checked={p.view==="ventral"} onChange={()=>setView(p.id,"ventral")} /> ventral</label>
                        <label className="flex items-center gap-2 mb-1"><input type="radio" name={`view-${p.id}`} checked={p.view==="dorsal"} onChange={()=>setView(p.id,"dorsal")} /> dorsal</label>
                        <label className="flex items-center gap-2"><input type="radio" name={`view-${p.id}`} checked={p.view==="other"} onChange={()=>setView(p.id,"other")} /> other</label>
                      </div>

                      <div className="text-sm">
                        <div className="text-xs mb-1">Best</div>
                        <label className={`flex items-center gap-2 mb-1 ${ventralDisabled ? "text-slate-400" : ""}`}>
                          <input type="radio" name={`best-ventral-${p.id}`} disabled={ventralDisabled} checked={!!p.isBestVentral} onChange={()=>setBestVentral(p.id)} /> Best ventral
                        </label>
                        <label className={`flex items-center gap-2 ${dorsalDisabled ? "text-slate-400" : ""}`}>
                          <input type="radio" name={`best-dorsal-${p.id}`} disabled={dorsalDisabled} checked={!!p.isBestDorsal} onChange={()=>setBestDorsal(p.id)} /> Best dorsal
                        </label>
                        {p.measure && (
                          <div className="text-xs text-slate-600 mt-1">
                            DL: {to2(p.measure.dlCm)} cm · DW: {to2(p.measure.dwCm)} cm
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 justify-self-end">
                      <button
                        className={`px-2 py-1 rounded ${canSize ? "bg-sky-600 text-white" : "bg-gray-200 text-gray-500 cursor-not-allowed"}`}
                        disabled={!canSize}
                        onClick={()=> canSize && setMeasureOpen(p)}
                      >
                        Size
                      </button>
                      <button className="text-red-600" onClick={()=>deletePhoto(p.id)}>Delete</button>
                    </div>
                  </div>
                );
              })}
              {photos.length === 0 && <div className="text-sm text-gray-600">No photos added yet.</div>}
            </div>

            <div className="px-0 py-3 mt-2 flex justify-end gap-2 border-t">
              <button className="px-3 py-2 rounded border" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="px-3 py-2 rounded bg-sky-600 text-white disabled:opacity-50" onClick={save} disabled={busy || !canSave()}>Save Manta</button>
            </div>
          </div>
        </div>
      </div>

      {measureOpen && (
        <MeasureModal
          open={true}
          src={measureOpen.url}
          onClose={()=> setMeasureOpen(null)}
          onApply={(r)=> { onMeasureApplied(measureOpen.id, r); setMeasureOpen(null); }}
          initial={measureOpen.measure ? { dlCm: measureOpen.measure.dlCm, dwCm: measureOpen.measure.dwCm, discPx: measureOpen.measure.discPx, scalePx: measureOpen.measure.scalePx, scaleCm: measureOpen.measure.scaleCm } : undefined}
        />
      )}

      {matchOpen && (
        <MatchModal
          open={true}
          onClose={()=> setMatchOpen(null)}
          ventralUrl={matchOpen.url}
          aMeta={{ name, gender, ageClass, meanSize: size ? Number(size) : null }}
          onChoose={(id)=> { setPotentialCatalogId(id); setPotentialNoMatch(false); setMatchOpen(null); }}
          onNoMatch={()=> { setPotentialCatalogId(null); setPotentialNoMatch(true); setMatchOpen(null); }}
        />
      )}
    </>
  );
}
