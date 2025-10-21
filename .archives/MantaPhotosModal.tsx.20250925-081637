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

type Props = {
  open: boolean;
  onClose: () => void;
  sightingId: string;
  onAddManta: (manta: { id: string; name: string; photos: Uploaded[] }) => void;
  initialTempName?: string;
};

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  return Math.random().toString(36).slice(2);
}

export default function MantaPhotosModal({ open, onClose, sightingId, onAddManta, initialTempName }: Props) {
  const [tempName, setTempName] = useState("");
  const [photos, setPhotos] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  
  const [lastMsg, setLastMsg] = useState<string>("probe: mounted");
const inputRef = useRef<HTMLInputElement | null>(null);

  const tempMantaId = useMemo(() => uuid(), []);

  useEffect(() => { if (open) console.log("[PhotosModal] mounted for", sightingId, "manta", tempMantaId); }, [open, sightingId, tempMantaId]);
  useEffect(() => { if (open) setTempName((initialTempName || "").trim()); }, [open, initialTempName]);

  if (!open) return null;

  async function handleFiles(files: File[]) {
  if (!files.length) return;
  setBusy(true);
  setLastMsg("uploading " + files.length + "...");
  const allow = ["image/jpeg","image/png","image/webp"];
  const uploaded: Uploaded[] = [];
  for (const f of files) {
    if (!allow.includes(f.type)) { console.warn("[PhotosModal] skip type", f.type); continue; }
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
    const id = uuid();
    const path = `${sightingId}/${tempMantaId}/${id}.${ext}`;
    console.log("[PhotosModal] upload ->", path);
    const { error } = await supabase.storage.from("temp-images").upload(path, f, { cacheControl: "3600", upsert: false });
    if (error) { console.warn("[PhotosModal] upload error", error.message); setLastMsg("upload error: " + error.message); continue; }
    const { data } = supabase.storage.from("temp-images").getPublicUrl(path);
    uploaded.push({ id, name: f.name, url: data?.publicUrl || "", path, view: "other" });
  }
  if (uploaded.length) {
    setPhotos(prev => [...prev, ...uploaded]);
    console.log("[PhotosModal] uploaded ok:", uploaded.length);
    setLastMsg("uploaded " + uploaded.length);
  } else {
    if (files.length) console.log("[PhotosModal] no files uploaded");
  }
  setBusy(false);
}/${tempMantaId}/${id}.${ext}`;
      const { error } = await supabase.storage.from("temp-images").upload(path, f, { cacheControl: "3600", upsert: false });
      if (error) { console.warn("[PhotosModal] upload error", error.message); continue; }
      const { data } = supabase.storage.from("temp-images").getPublicUrl(path);
      uploaded.push({ id, name: f.name, url: data?.publicUrl || "", path, view: "other" });
    }
    if (uploaded.length) setPhotos(prev => [...prev, ...uploaded]);
    setBusy(false);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files || []);
  console.log("[PhotosModal] drop:", files.map(f=>f.name));
  setLastMsg("drop " + files.length + " file(s)");
  handleFiles(files);
}
  function onBrowse(e: React.ChangeEvent<HTMLInputElement>) {
  const files = Array.from(e.target.files || []);
  console.log("[PhotosModal] browse selected:", files.map(f=>f.name));
  setLastMsg("browse " + files.length + " file(s)");
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
  function submitManta() {
    const name = (tempName || "").trim() || `Manta ${photos.length ? photos[0].id.slice(0,4) : ""}`;
    onAddManta({ id: tempMantaId, name, photos });
    setTempName(""); setPhotos([]);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center" onClick={(e)=>e.stopPropagation()}>
      <div className="bg-white rounded-lg border w-full max-w-3xl p-4">
        <div className="flex items-center justify-between mb-3">
  <h3 className="text-lg font-medium">Add Manta & Photos</h3>
  <button type="button" onClick={(e)=>{e.stopPropagation(); onClose();}} className="px-2 py-1 border rounded">Close</button>
</div>
<div className="text-[11px] text-muted-foreground mb-2">last event: {lastMsg}</div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm block mb-1">Temporary Name</label>
            <input className="w-full border rounded px-3 py-2" placeholder="e.g., A, B, C" value={tempName} onChange={(e)=>setTempName(e.target.value)} />
            <div onDragOver={(e)=>e.preventDefault()} onDrop={onDrop} className="mt-3 border-dashed border-2 rounded p-4 text-sm text-gray-600 flex flex-col items-center justify-center">
              <div>Drag & drop photos here</div>
              <div className="my-2">or</div>
              <button type="button" onClick={()=>inputRef.current?.click()} className="px-3 py-1 border rounded" disabled={busy}>Browse…</button>
              <input
  ref={inputRef}
  type="file"
  multiple
  accept="image/*"
  className="hidden"
  onChange={onBrowse}
/>
<div className="mt-3 w-full text-left">
  <label className="text-xs block mb-1">Or use this chooser</label>
  <input data-visible-file type="file" multiple accept="image/*" onChange={onBrowse} />
</div>
<div className="mt-2 text-xs">JPG/PNG/WebP • uploads to temp-images</div>
            </div>
          </div>

          <div className="max-h-72 overflow-auto pr-1">
            {photos.length === 0 ? (
              <div className="text-sm text-gray-600">No photos added yet.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {photos.map((p)=>(
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
          <button type="button" onClick={(e)=>{e.stopPropagation(); submitManta();}} className="px-3 py-2 rounded bg-sky-600 text-white" disabled={busy || photos.length===0}>Save Manta</button>
        </div>
      </div>
    </div>
  );
}
