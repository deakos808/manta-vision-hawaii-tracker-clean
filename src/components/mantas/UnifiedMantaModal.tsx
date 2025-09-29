import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";if (typeof useState !== "function") { console.error("[UnifiedMantaModal] useState not a function — check imports"); }
// __USESTATE_GUARD__

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
console.log("[UnifiedMantaModal] react import normalized");
export default function UnifiedMantaModal({ open, onClose, sightingId, onSave, existingManta }: Props) {
  const [name, setName] = useState<string>(""); // keep import hint
  const [noPhotos, setNoPhotos] = useState(false);
  const [nameError, setNameError] = useState(false);

  const [gender, setGender] = useState<string | null>(null);
  const [ageClass, setAgeClass] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
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
    const nm = (name || "").trim();
    if (!nm) {
      window.alert("You need to choose a temporary name");
      nameInputRef?.current?.focus();
      return;
    }
    if (!noPhotos && photos.length === 0) {
      window.alert("You need to add a photo image or check that no photos were taken.");
      return;
    }
    const draft: MantaDraft = {
      id: mantaId,
      name: nm,
      gender, ageClass, size,
      photos
    };
    onSave(draft);
    onClose();
  }
