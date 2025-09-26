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
  size?: string | null;
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

export default function UnifiedMantaModal({ open, onClose, sightingId, onSave, existingManta }: Props) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [ageClass, setAgeClass] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mantaId = useMemo(() => existingManta?.id ?? uuid(), [existingManta?.id]);

  useEffect(() => {
    if (!open) return;
    console.log("[UnifiedModal] open", { sightingId, mantaId, hasExisting: !!existingManta });
    setName((existingManta?.name || "").trim());
    setGender(existingManta?.gender ?? null);
    setAgeClass(existingManta?.ageClass ?? null);
    setSize(existingManta?.size ?? null);
    setPhotos(existingManta?.photos ?? []);
  }, [open, existingManta, sightingId, mantaId]);

  if (!open) return null;

  async function handleFiles(files: File[]) {
    if (!files?.length) return;
    setBusy(true);
    const allow = ["image/jpeg", "image/png", "image/webp"];
    const added: Uploaded[] = [];
    for (const f of files) {
      if (!allow.includes(f.type)) { console.warn("[UnifiedModal] skip type", f.type, f.name); continue; }
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const id = uuid();
      const path = `${sightingId}/${mantaId}/${id}.${ext}`;
      console.log("[UnifiedModal] upload ->", path);
      const { error } = await supabase.storage.from("temp-images").upload(path, f, { cacheControl: "3600", upsert: false });
      if (error) { console.warn("[UnifiedModal] upload error", error.message); continue; }
      const { data } = supabase.storage.from("temp-images").getPublicUrl(path);
      added.push({ id, name: f.name, url: data?.publicUrl || "", path, view: "other" });
    }
    if (added.length) setPhotos(prev => [...prev, ...added]);
    setBusy(false);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files || []);
    console.log("[UnifiedModal] drop:", files.map(f => f.name));
    handleFiles(files);
  }
  function onBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    console.log("[UnifiedModal] browse selected:", files.map(f => f.name));
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
    const draft: MantaDraft = {
      id: mantaId,
      name: (name || "").trim() || `Manta ${photos[0]?.id.slice(0,4) || ""}`,
      gender, ageClass, size,
      photos
    };
    console.log("[UnifiedModal] save ->", draft);
    onSave(draft);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[300000] flex items-center justify-center" onClick={(e)=>e.stopPropagation()}>
      <div className="bg-white rounded-lg border w-full max-w-4xl p-4 relative pointer-events-auto">
        <button
          data-close-x
          aria-label="Close"
          type="button"
          className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border hover:bg-gray-50"
          onClick={(e)=>{ e.stopPropagation(); onClose(); }}
        >
          &times;
        </button>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium">{existingManta ? "Edit Manta" : "Add Manta"}</h3>
          
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="text-sm block mb-1">Temporary Name</label>
              <input className="w-full border rounded px-3 py-2" value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g., A, B, C" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-sm block mb-1">Gender</label>
                <select className="w-full border rounded px-2 py-2" value={gender ?? ""} onChange={e=>setGender(e.target.value || null)}>
                  <option value="">—</option>
                  <option value="female">female</option>
                  <option value="male">male</option>
                  <option value="unknown">unknown</option>
                </select>
              </div>
              <div>
                <label className="text-sm block mb-1">Age Class</label>
                <select className="w-full border rounded px-2 py-2" value={ageClass ?? ""} onChange={e=>setAgeClass(e.target.value || null)}>
                  <option value="">—</option>
                  <option value="juvenile">juvenile</option>
                  <option value="subadult">subadult</option>
                  <option value="adult">adult</option>
                </select>
              </div>
              <div>
                <label className="text-sm block mb-1">Size</label>
                <select className="w-full border rounded px-2 py-2" value={size ?? ""} onChange={e=>setSize(e.target.value || null)}>
                  <option value="">—</option>
                  <option value="small">small</option>
                  <option value="medium">medium</option>
                  <option value="large">large</option>
                </select>
              </div>
            </div>

            <div onDrop={onDrop} onDragOver={(e)=>{e.preventDefault();}} className="mt-1 border-dashed border-2 rounded p-4 text-sm text-gray-600 flex flex-col items-center justify-center">
              <div>Drag & drop photos here</div>
              <div className="my-2">or</div>
              <button type="button" onClick={()=>inputRef.current?.click()} className="px-3 py-1 border rounded" disabled={busy}>Browse…</button>
              <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={onBrowse} />
            </div>
          </div>

            <div className="max-h-80 overflow-auto pr-1">
              {photos.length === 0 ? (
                <div className="text-sm text-gray-600">No photos added yet.</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {photos.map(p=>(
                    <div key={p.id} className="border rounded p-2">
                      <img src={p.url} alt={p.name} className="w-full h-24 object-cover rounded mb-2" />
                      <div className="text-xs break-all mb-2">{p.name}</div>
                      <div className="text-xs mb-1">View</div>
                      <select className="w-full border rounded px-2 py-1 text-sm mb-2" value={p.view} onChange={(e)=>setView(p.id, e.target.value as View)}>
                        <option value="ventral">ventral</option>
                        <option value="dorsal">dorsal</option>
                        <option value="other">other</option>
                      </select>
                      {p.view === "ventral" && (
                        <label className="text-xs flex items-center gap-2 mb-1">
                          <input type="radio" name="best-ventral" checked={!!p.isBestVentral} onChange={()=>setBestVentral(p.id)} />
                          Best ventral
                        </label>
                      )}
                      {p.view === "dorsal" && (
                        <label className="text-xs flex items-center gap-2 mb-1">
                          <input type="radio" name="best-dorsal" checked={!!p.isBestDorsal} onChange={()=>setBestDorsal(p.id)} />
                          Best dorsal
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={(e)=>{e.stopPropagation(); onClose();}} className="px-3 py-2 rounded border" disabled={busy}>Cancel</button>
          <button type="button" onClick={(e)=>{e.stopPropagation(); save();}} className="px-3 py-2 rounded bg-sky-600 text-white" disabled={busy || photos.length===0}>Save Manta</button>
        </div>
      </div>
    </div>
  );
}
