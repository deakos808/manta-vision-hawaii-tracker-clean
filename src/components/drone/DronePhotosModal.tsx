import React, { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { readBasicExif } from "@/lib/exif";

export type UploadedDronePhoto = {
  id: string;
  name: string;
  url: string;
  path: string;
  date?: string;
  time?: string;
  lat?: number;
  lon?: number;
  total_mantas?: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  draftId: string;
  onAdd: (items: UploadedDronePhoto[]) => void;
};

function uuid() {
  try { return (crypto as any).randomUUID(); }
  catch { return Math.random().toString(36).slice(2); }
}
function pad2(n: number) { return String(n).padStart(2, "0"); }
function toLocalYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function toLocalHm(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export default function DronePhotosModal({ open, onClose, draftId, onAdd }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function handleFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    const added: UploadedDronePhoto[] = [];

    for (const f of files) {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const id = uuid();
      const path = `drone/${draftId}/${id}.${ext}`;

      // upload to existing temp-images bucket
      const { error } = await supabase.storage
        .from("temp-images")
        .upload(path, f, { upsert: false, cacheControl: "3600" });
      if (error) {
        console.warn("[DronePhotosModal] upload error", error.message, "for", path);
        continue;
      }

      const { data: pub } = supabase.storage.from("temp-images").getPublicUrl(path);
      const url = pub?.publicUrl || "";

      // read exif (non-blocking failure)
      const { takenAt, lat, lon } = await readBasicExif(f);
      const item: UploadedDronePhoto = {
        id,
        name: f.name,
        url,
        path,
        date: takenAt ? toLocalYmd(takenAt) : undefined,
        time: takenAt ? toLocalHm(takenAt) : undefined,
        lat,
        lon,
        total_mantas: null,
      };
      added.push(item);
    }

    if (added.length) onAdd(added);
    setBusy(false);
    onClose();
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

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center" onClick={(e)=>{ e.stopPropagation(); onClose(); }}>
      <div className="bg-white rounded-lg border w-full max-w-2xl p-4 relative" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium">Add Photos</h3>
          <button type="button" onClick={onClose} className="px-2 py-1 border rounded">Close</button>
        </div>
        <div
          className="border-2 border-dashed rounded p-6 text-sm text-gray-600 flex flex-col items-center justify-center"
          onDrop={onDrop}
          onDragOver={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
        >
          <div>Drag & drop drone photos here</div>
          <div className="my-2">or</div>
          <button type="button" onClick={()=>inputRef.current?.click()} className="px-3 py-1 border rounded" disabled={busy}>
            {busy ? "Uploading…" : "Choose Files…"}
          </button>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={onBrowse} />
          <div className="mt-2 text-[11px] text-gray-500">Uploads go to <code>temp-images/drone/&lt;draftId&gt;/</code></div>
        </div>
      </div>
    </div>
  );
}
