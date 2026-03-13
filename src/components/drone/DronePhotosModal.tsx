import React, { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { readBasicExif } from "@/lib/exif";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

type ExifSuggestion = {
  date?: string;
  time?: string;
  lat?: number;
  lon?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  draftId: string;
  onAdd: (items: UploadedDronePhoto[], firstExif?: ExifSuggestion | null) => void;
};

function uuid() {
  try {
    return (crypto as any).randomUUID();
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toLocalHm(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export default function DronePhotosModal({ open, onClose, draftId, onAdd }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: File[]) {
    if (!files.length) return;

    setBusy(true);
    const added: UploadedDronePhoto[] = [];
    let firstExif: ExifSuggestion | null = null;

    for (const f of files) {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const id = uuid();
      const path = `drone/${draftId}/${id}.${ext}`;

      const { error } = await supabase.storage
        .from("temp-images")
        .upload(path, f, { upsert: false, cacheControl: "3600" });

      if (error) {
        console.warn("[DronePhotosModal] upload error", error.message, "for", path);
        continue;
      }

      const { data: pub } = supabase.storage.from("temp-images").getPublicUrl(path);
      const url = pub?.publicUrl || "";

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

      if (!firstExif && (item.date || item.time || typeof item.lat === "number" || typeof item.lon === "number")) {
        firstExif = {
          date: item.date,
          time: item.time,
          lat: item.lat,
          lon: item.lon,
        };
      }

      added.push(item);
    }

    if (added.length) onAdd(added, firstExif);
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
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Photos</DialogTitle>
        </DialogHeader>

        <div
          className="border-2 border-dashed rounded p-6 text-sm text-gray-600 flex flex-col items-center justify-center"
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div>Drag &amp; drop drone photos here</div>
          <div className="my-2">or</div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="px-3 py-1 border rounded"
            disabled={busy}
          >
            {busy ? "Uploading..." : "Choose Files..."}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onBrowse}
          />
          <div className="mt-2 text-[11px] text-gray-500">
            Uploads go to <code>temp-images/drone/&lt;draftId&gt;/</code>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
