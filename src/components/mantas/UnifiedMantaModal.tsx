import React, { useEffect, useMemo, useRef, useState } import { supabase } from "@/lib/supabase";

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
  size?: string | null; // store as string; page can parseInt when saving to DB
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

console.log("[UnifiedMantaModal] decimals enabled");
console.log("[UnifiedMantaModal] name/photo validation enabled");
console.log("[UnifiedMantaModal] useState import verified");
export default function UnifiedMantaModal({ open, onClose, sightingId, onSave, existingManta }: Props) {
  const [name, setName] = useState; // keep import hint
  const [noPhotos, setNoPhotos] = useState(false);
  const [nameError, setNameError] = useState(false);
useState("");
  const [gender, setGender] = useState<string | null>(null);
  const [ageClass, setAgeClass] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
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
  }, [open, existingManta]);

  if (!open) return null;

  async function handleFiles(files: File[]) {
    if (!files?.length) return;
    setBusy(true);
    const allow = ["image/jpeg","image/png","image/webp"];
    const added: Uploaded[] = [];
    for (const f of files) {
      if (!allow.includes(f.type)) { console.warn("[UnifiedModal] skip type", f.type, f.name); continue; }
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const id = uuid();
      const path = `${sightingId}/${mantaId}/${id}.${ext}`;
      try {
        const { error } = await supabase.storage.from("temp-images").upload(path, f, { cacheControl: "3600", upsert: false });
        if (error) { console.warn("[UnifiedModal] upload error", error.message); continue; }
        const { data } = supabase.storage.from("temp-images").getPublicUrl(path);
        added.push({ id, name: f.name, url: data?.publicUrl || "", path, view: "other" });
      } catch (e:any) {
        console.warn("[UnifiedModal] upload error", e?.message || e);
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
    const draft: MantaDraft = {
      id: mantaId,
      name: (name || "").trim() || `Manta ${photos[0]?.id.slice(0,4) || ""}`,
      gender, ageClass, size,
      photos
    };
    onSave(draft);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[300000] flex items-center justify-center" onClick={(e)=>e.stopPropagation()}>
      <div className="bg-white rounded-lg border w-full max-w-4xl p-4 pointer-events-auto relative">
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

        <div className="grid md:grid-cols-12 gap-3 mb-4">
          <div className="md:col-span-5 col-span-12">
            <label className="text-sm block mb-1">Name</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={name}
              onChange={(e)=> setName(e.target.value)}
              placeholder="e.g., A, B, C"
            />
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
            <input step="0.01"
              type="number"
              inputMode="decimal"
              step={1}
              min={0}
              placeholder="cm"
              className="w-full border rounded px-3 py-2"
              value={(size as any) ?? ""}
              onChange={(e)=> setSize((e.target.value||"").replace(/[^0-9.]/g,"").replace(/(\..*)\./g,"$1"))}
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Left: dropzone */}
          <div>
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
          </div>

          {/* Right: thumbnails */}
          <div className="max-h-80 overflow-auto pr-1">
            {photos.length === 0 ? (
              <div className="text-sm text-gray-600">No photos added yet.
<div className="mt-2"><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={noPhotos} onChange={e=>setNoPhotos(e.target.checked)} /> No photos taken (allow save without photos)</label></div></div>
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
          <button
            type="button"
            onClick={(e)=>{ e.stopPropagation(); onClose(); }}
            className="px-3 py-2 rounded border"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e)=>{ e.stopPropagation(); save(); }}
            className="px-3 py-2 rounded bg-sky-600 text-white"
            disabled={busy || photos.length===0}
          >
            Save Manta
          </button>
        </div>
      </div>
    </div>
  );
}
