import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import MeasureModal, { MeasureResult } from "./MeasureModal";
import MatchModal from "./MatchModal";
import PhotoEditModal from "./PhotoEditModal";
import { readBasicExif } from "@/lib/exif";
import { resolvePhotoUrl } from "@/lib/photoUrl";

type View = "ventral" | "dorsal" | "other";
type MantaSpecies = "alfredi" | "birostris";

export type Uploaded = {
  id: string;
  name: string;
  url: string;
  path: string;
  view: View;
  isBestVentral?: boolean;
  isBestDorsal?: boolean;
  measure?: { dlCm: number; dwCm: number; discPx: number; scalePx: number; scaleCm: number };
  previewUrl?: string | null;
  isHeicLike?: boolean;
  edited?: boolean;
};

export type MantaDraft = {
  id: string;
  name: string;
  species?: MantaSpecies | null;
  gender?: string | null;
  ageClass?: string | null;
  size?: string | null;
  photos: Uploaded[];
  matchedCatalogId?: number | null;
  noMatch?: boolean;
  noPhotos?: boolean;
  potentialCatalogId?: number | null;
  potentialNoMatch?: boolean;
  firstExifMeta?: { date?: string; time?: string; lat?: number; lon?: number } | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  sightingId: string;
  onSave: (m: MantaDraft) => void;
  existingManta?: MantaDraft | null;
  defaultName?: string;
  ordinalLabel?: string;
  canMeasure?: boolean;
  onApplyExifMetadata?: (meta: { date?: string; time?: string; lat?: number; lon?: number }) => void;
  needsExifPrompt?: boolean;
};

function uuid() {
  try {
    return (crypto as any).randomUUID();
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

function pad2(v: number) {
  return String(v).padStart(2, "0");
}

function formatExifDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(d.getTime())) return undefined;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatExifTime(value: unknown): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(d.getTime())) return undefined;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export default function UnifiedMantaModal({
  open,
  onClose,
  sightingId,
  onSave,
  existingManta,
  defaultName = "",
  ordinalLabel = "Manta",
  canMeasure = false,
  onApplyExifMetadata,
  needsExifPrompt = false,
}: Props) {
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<MantaSpecies>("alfredi");
  const [gender, setGender] = useState<string | null>(null);
  const [ageClass, setAgeClass] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [noPhotos, setNoPhotos] = useState(false);

  const [photos, setPhotos] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [measureOpen, setMeasureOpen] = useState<Uploaded | null>(null);
  const [editOpen, setEditOpen] = useState<Uploaded | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<Uploaded | null>(null);
  const [matchOpen, setMatchOpen] = useState<Uploaded | null>(null);
  const [potentialCatalogId, setPotentialCatalogId] = useState<number | null>(null);
  const [potentialNoMatch, setPotentialNoMatch] = useState<boolean>(false);

  const [localExifPromptOpen, setLocalExifPromptOpen] = useState(false);
  const [localExifMeta, setLocalExifMeta] = useState<{ date?: string; time?: string; lat?: number; lon?: number } | null>(null);
  const [localExifDecision, setLocalExifDecision] = useState<"use" | "manual" | null>(null);
  const [firstExifMeta, setFirstExifMeta] = useState<{ date?: string; time?: string; lat?: number; lon?: number } | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const mantaId = useMemo(() => existingManta?.id ?? uuid(), [existingManta?.id]);

  useEffect(() => {
    if (!open) return;
    setName((existingManta?.name || defaultName || "").trim());
    setSpecies((existingManta?.species === "birostris" ? "birostris" : "alfredi"));
    setGender(existingManta?.gender ?? null);
    setAgeClass(existingManta?.ageClass ?? null);
    setSize(existingManta?.size ?? null);
    setPhotos(existingManta?.photos ?? []);
    setPotentialCatalogId(existingManta?.potentialCatalogId ?? null);
    setPotentialNoMatch(existingManta?.potentialNoMatch ?? false);
    setNoPhotos(existingManta?.noPhotos ?? false);
    setFirstExifMeta(existingManta?.firstExifMeta ?? null);
    setLocalExifMeta(null);
    setLocalExifPromptOpen(false);
    setLocalExifDecision(null);
  }, [open, existingManta, defaultName]);

  useEffect(() => {
    return () => {
      // blob previews are revoked on delete; avoid revoking on every photos state change
    };
  }, []);

  const meanDorsalDW = useMemo(() => {
    const vals = photos
      .filter((p) => p.view === "dorsal" && p.measure?.dwCm)
      .map((p) => p.measure!.dwCm);

    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [photos]);

  useEffect(() => {
    if (meanDorsalDW !== null) {
      const meters = meanDorsalDW / 100;
      setSize(meters.toFixed(2));
    }
  }, [meanDorsalDW]);

  useEffect(() => {
    if (!needsExifPrompt || !firstExifMeta || !onApplyExifMetadata) return;
    const hasUsableExif =
      !!firstExifMeta.date ||
      !!firstExifMeta.time ||
      typeof firstExifMeta.lat === "number" ||
      typeof firstExifMeta.lon === "number";
    if (!hasUsableExif) return;
    setLocalExifMeta(firstExifMeta);
    setLocalExifPromptOpen(true);
    setLocalExifDecision(null);
  }, [needsExifPrompt, firstExifMeta, onApplyExifMetadata]);

  if (!open) return null;

  async function handleFiles(files: File[]) {
    if (!files?.length) return;

    setBusy(true);

    const allow = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
    const added: Uploaded[] = [];
    let firstExif: { date?: string; time?: string; lat?: number; lon?: number } | null = null;

    for (const f of files) {
      const lower = f.name.toLowerCase();
      const isHeicLike = f.type === "image/heic" || f.type === "image/heif" || lower.endsWith(".heic") || lower.endsWith(".heif");
      const typeAllowed = allow.includes(f.type) || lower.endsWith(".heic") || lower.endsWith(".heif");
      if (!typeAllowed) continue;

      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const id = uuid();
      const path = `${sightingId}/${mantaId}/${id}.${ext}`;
      const previewUrl = URL.createObjectURL(f);

      try {
        const exif = await readBasicExif(f).catch((err) => {
          console.warn("[UnifiedMantaModal][EXIF] readBasicExif failed", f.name, err);
          return null;
        });
        console.log("[UnifiedMantaModal][EXIF] parsed", {
          file: f.name,
          type: f.type,
          exif,
        });
        if (!firstExif && exif) {
          const takenAt = exif.takenAt ? new Date(exif.takenAt) : null;
          const validTakenAt = takenAt && Number.isFinite(takenAt.getTime()) ? takenAt : null;

          const pad2 = (n: number) => String(n).padStart(2, "0");
          const dateStr = validTakenAt
            ? `${validTakenAt.getFullYear()}-${pad2(validTakenAt.getMonth() + 1)}-${pad2(validTakenAt.getDate())}`
            : undefined;
          const timeStr = validTakenAt
            ? `${pad2(validTakenAt.getHours())}:${pad2(validTakenAt.getMinutes())}`
            : undefined;

          firstExif = {
            date: dateStr,
            time: timeStr,
            lat: typeof exif.lat === "number" ? exif.lat : undefined,
            lon: typeof exif.lon === "number" ? exif.lon : undefined,
          };
          if (firstExif.date || firstExif.time || typeof firstExif.lat === "number" || typeof firstExif.lon === "number") {
            console.log("[UnifiedMantaModal][EXIF] firstExif selected", firstExif);
          } else {
            firstExif = null;
          }
        }
      } catch {}

      try {
        const { error } = await supabase.storage.from("temp-images").upload(path, f, {
          cacheControl: "3600",
          upsert: false,
          contentType: f.type || undefined,
        });

        if (error) {
          console.warn("[UnifiedMantaModal] upload error", error.message);
          continue;
        }

        const { data } = supabase.storage.from("temp-images").getPublicUrl(path);

        added.push({
          id,
          name: f.name,
          url: data?.publicUrl || previewUrl,
          path,
          view: "other",
          previewUrl,
          isHeicLike,
        });
      } catch (e: any) {
        console.warn("[UnifiedMantaModal] upload exception", e?.message || e);
      }
    }

    if (added.length) {
      setPhotos((prev) => [...prev, ...added]);
    }

    if (firstExif) {
      console.log("[UnifiedMantaModal][EXIF] firstExif ready", firstExif);
      setFirstExifMeta(firstExif);
    } else {
      console.log("[UnifiedMantaModal][EXIF] no EXIF found");
    }

    setBusy(false);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    handleFiles(Array.from(e.dataTransfer.files || []));
  }

  function onBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(Array.from(e.target.files || []));
    e.currentTarget.value = "";
  }

  async function replacePhoto(photo: Uploaded, file: File) {
    const lower = file.name.toLowerCase();
    const isHeicLike = file.type === "image/heic" || file.type === "image/heif" || lower.endsWith(".heic") || lower.endsWith(".heif");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const replacementPath = `${sightingId}/${mantaId}/${photo.id}-replacement-${Date.now()}.${ext}`;
    const previewUrl = URL.createObjectURL(file);

    const { error } = await supabase.storage.from("temp-images").upload(replacementPath, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || undefined,
    });

    if (error) {
      try { URL.revokeObjectURL(previewUrl); } catch {}
      throw new Error(error.message || "Could not replace photo.");
    }

    const { data } = supabase.storage.from("temp-images").getPublicUrl(replacementPath);

    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== photo.id) return p;
        if (p.previewUrl && p.previewUrl.startsWith("blob:")) {
          try { URL.revokeObjectURL(p.previewUrl); } catch {}
        }
        return {
          ...p,
          name: file.name,
          path: replacementPath,
          url: data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : previewUrl,
          previewUrl,
          isHeicLike,
          edited: false,
          measure: undefined,
        };
      })
    );
  }

  async function onReplaceBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    e.currentTarget.value = "";
    if (!file || !replaceTarget) return;
    setBusy(true);
    try {
      await replacePhoto(replaceTarget, file);
    } catch (err: any) {
      window.alert(err?.message || "Could not replace photo.");
    } finally {
      setBusy(false);
      setReplaceTarget(null);
    }
  }

  function setView(id: string, view: View) {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, view } : p)));
  }

  function setBestVentral(id: string) {
    setPhotos((prev) =>
      prev.map((p) =>
        p.view !== "ventral" ? { ...p, isBestVentral: false } : { ...p, isBestVentral: p.id === id }
      )
    );
  }

  function setBestDorsal(id: string) {
    setPhotos((prev) =>
      prev.map((p) =>
        p.view !== "dorsal" ? { ...p, isBestDorsal: false } : { ...p, isBestDorsal: p.id === id }
      )
    );
  }

  function deletePhoto(id: string) {
    setPhotos((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found?.previewUrl && found.previewUrl.startsWith("blob:")) {
        try { URL.revokeObjectURL(found.previewUrl); } catch {}
      }
      return prev.filter((p) => p.id !== id);
    });
  }

  async function saveEditedPhoto(photo: Uploaded, blob: Blob) {
    const extless = photo.path.replace(/\.[^.]+$/, "");
    const editedPath = `${extless}-edited-${Date.now()}.jpg`;

    const { error } = await supabase.storage.from("temp-images").upload(editedPath, blob, {
      cacheControl: "3600",
      upsert: true,
      contentType: "image/jpeg",
    });

    if (error) {
      throw new Error(error.message || "Could not upload edited photo.");
    }

    const { data } = supabase.storage.from("temp-images").getPublicUrl(editedPath);
    const previewUrl = URL.createObjectURL(blob);

    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== photo.id) return p;
        if (p.previewUrl && p.previewUrl.startsWith("blob:")) {
          try { URL.revokeObjectURL(p.previewUrl); } catch {}
        }
        return {
          ...p,
          name: `${p.name.replace(/\.[^.]+$/, "")}-edited.jpg`,
          path: editedPath,
          url: data?.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : previewUrl,
          previewUrl,
          isHeicLike: false,
          edited: true,
        };
      })
    );
  }

  function onMeasureApplied(photoId: string, r: MeasureResult) {
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === photoId
          ? {
              ...p,
              measure: {
                dlCm: r.dlCm,
                dwCm: r.dwCm,
                discPx: r.discPx,
                scalePx: r.scalePx,
                scaleCm: r.scaleCm,
              },
            }
          : p
      )
    );
  }

  function canSave() {
    const hasName = name.trim().length > 0;
    const hasPhotosOrOverride = photos.length > 0 || noPhotos;
    const hasResolvedExifChoice = !localExifPromptOpen || localExifDecision !== null;
    return hasName && hasPhotosOrOverride && hasResolvedExifChoice;
  }

  function save() {
    const draft: MantaDraft = {
      id: mantaId,
      name: (name || "").trim(),
      species,
      gender,
      ageClass,
      size: size ?? null,
      photos,
      potentialCatalogId,
      potentialNoMatch,
      matchedCatalogId: potentialCatalogId,
      noMatch: potentialNoMatch,
      noPhotos,
      firstExifMeta,
    };
    onSave(draft);
    onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[300000] bg-black/40 flex items-center justify-center p-3"
      >
        <div
          className="bg-white rounded-lg border w-[min(1180px,96vw)] max-h-[88vh] overflow-y-auto pointer-events-auto relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute top-3 right-3 text-2xl leading-none hover:text-gray-700"
            onClick={onClose}
          >
            &times;
          </button>

          <div className="px-4 pt-3">
            <h3 className="text-base font-semibold">{ordinalLabel} - Add Photos</h3>
            <div className="mt-1 text-[11px] text-slate-500">
              Manta {name || defaultName || "-"} · sighting {sightingId.slice(0, 8)} · {photos.length} photo{photos.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="px-4 pb-4 pt-3">
            <div className="grid items-end gap-2 md:grid-cols-[2fr_170px_120px_140px_minmax(280px,1.5fr)]">
              <div>
                <label className="text-xs block mb-1">Temp Name</label>
                <input
                  className="h-9 w-full border rounded px-3 text-sm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., A, B, C"
                />
                {!name.trim() && <div className="mt-1 text-[11px] text-red-500">Please provide a temporary name</div>}
              </div>

              <div>
                <label className="text-xs block mb-1">Species</label>
                <div className="grid h-9 grid-cols-2 overflow-hidden rounded border bg-white text-xs">
                  <button
                    type="button"
                    className={species === "alfredi" ? "bg-sky-600 font-medium text-white" : "text-slate-700 hover:bg-slate-50"}
                    onClick={() => setSpecies("alfredi")}
                  >
                    alfredi
                  </button>
                  <button
                    type="button"
                    className={species === "birostris" ? "bg-sky-600 font-medium text-white" : "border-l text-slate-700 hover:bg-slate-50"}
                    onClick={() => setSpecies("birostris")}
                  >
                    birostris
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs block mb-1">Gender</label>
                <select
                  className={"h-9 w-full border rounded px-2 text-sm " + (((gender ?? "") === "") ? "text-slate-400" : "text-slate-900")}
                  value={gender ?? ""}
                  onChange={(e) => setGender(e.target.value || null)}
                >
                  <option value="">e.g., male</option>
                  <option value="female">female</option>
                  <option value="male">male</option>
                  <option value="unknown">unknown</option>
                </select>
              </div>

              <div>
                <label className="text-xs block mb-1">Age Class</label>
                <select
                  className={"h-9 w-full border rounded px-2 text-sm " + (((ageClass ?? "") === "") ? "text-slate-400" : "text-slate-900")}
                  value={ageClass ?? ""}
                  onChange={(e) => setAgeClass(e.target.value || null)}
                >
                  <option value="">e.g., adult</option>
                  <option value="juvenile">juvenile</option>
                  <option value="yearling">yearling</option>
                  <option value="adult">adult</option>
                  <option value="unknown">unknown</option>
                </select>
              </div>

              <div
                className="h-16 border-dashed border-2 rounded px-3 text-sm text-gray-600 flex items-center justify-center gap-3"
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <span>Drop photos here</span>
                <span className="text-slate-400">or</span>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="px-3 py-1 border rounded bg-white"
                  disabled={busy}
                >
                  Browse
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept="image/*,.heic,.heif"
                  className="hidden"
                  onChange={onBrowse}
                />
                <input
                  ref={replaceInputRef}
                  type="file"
                  accept="image/*,.heic,.heif"
                  className="hidden"
                  onChange={onReplaceBrowse}
                />
              </div>
            </div>

            {size ? (
              <div className="mt-2 text-xs text-slate-600">Mean size: {size} m</div>
            ) : null}

            {photos.length === 0 && (
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={noPhotos} onChange={(e) => setNoPhotos(e.target.checked)} />
                No photos taken
              </label>
            )}

            {localExifPromptOpen && localExifMeta ? (
              <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm">
                <div className="font-medium text-sky-900">Photo metadata found</div>
                <div className="mt-1 text-xs text-sky-800">
                  Select one option before saving this manta.
                </div>
                <div className="mt-2 grid gap-1 text-xs text-slate-700 sm:grid-cols-2">
                  {localExifMeta.date ? <div>Date: {localExifMeta.date}</div> : null}
                  {localExifMeta.time ? <div>Start time: {localExifMeta.time}</div> : null}
                  {(typeof localExifMeta.lat === "number" && typeof localExifMeta.lon === "number") ? (
                    <div className="sm:col-span-2">Coordinates: {localExifMeta.lat}, {localExifMeta.lon}</div>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <label className={`flex cursor-pointer items-center gap-2 rounded border bg-white px-3 py-2 ${localExifDecision === "use" ? "border-sky-600 ring-1 ring-sky-600" : "border-slate-200"}`}>
                    <input
                      type="radio"
                      name={`exif-choice-${mantaId}`}
                      checked={localExifDecision === "use"}
                      onChange={() => {
                        if (onApplyExifMetadata) onApplyExifMetadata(localExifMeta);
                        setLocalExifDecision("use");
                      }}
                    />
                    <span className="font-medium text-slate-800">Use photo metadata</span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-2 rounded border bg-white px-3 py-2 ${localExifDecision === "manual" ? "border-slate-700 ring-1 ring-slate-700" : "border-slate-200"}`}>
                    <input
                      type="radio"
                      name={`exif-choice-${mantaId}`}
                      checked={localExifDecision === "manual"}
                      onChange={() => setLocalExifDecision("manual")}
                    />
                    <span className="font-medium text-slate-800">Enter manually</span>
                  </label>
                </div>
              </div>
            ) : null}

            <div className="mt-3 space-y-2">
              {photos.map((p) => {
                const canSize = true;
                const ventralDisabled = p.view !== "ventral";
                const dorsalDisabled = p.view !== "dorsal";

                return (
                  <div key={p.id} className="border rounded p-2 grid grid-cols-[86px,1fr,auto] gap-3 items-center">
                    <div>
                      {p.isHeicLike ? (
                        <div className="w-[86px] h-[60px] rounded border bg-slate-100 flex flex-col items-center justify-center text-center px-2">
                          <div className="text-[10px] font-semibold text-slate-700">HEIC</div>
                          <div className="text-[10px] text-slate-500 break-all">{p.name}</div>
                        </div>
                      ) : (
                        <img
                          src={resolvePhotoUrl(p)}
                          alt={p.name}
                          className="w-[86px] h-[60px] cursor-zoom-in object-cover rounded border"
                          title="Double-click to edit photo"
                          onDoubleClick={() => setEditOpen(p)}
                        />
                      )}
                      {p.edited ? <div className="mt-1 text-[10px] text-sky-700">edited</div> : null}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-xs">
                        <div className="text-xs mb-1">View</div>
                        <label className="flex items-center gap-2 mb-1">
                          <input type="radio" name={`view-${p.id}`} checked={p.view === "ventral"} onChange={() => setView(p.id, "ventral")} />
                          ventral
                        </label>
                        <label className="flex items-center gap-2 mb-1">
                          <input type="radio" name={`view-${p.id}`} checked={p.view === "dorsal"} onChange={() => setView(p.id, "dorsal")} />
                          dorsal
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="radio" name={`view-${p.id}`} checked={p.view === "other"} onChange={() => setView(p.id, "other")} />
                          other
                        </label>
                      </div>

                      <div className="text-xs">
                        <div className="text-xs mb-1">Best</div>
                        <label className={`flex items-center gap-2 mb-1 ${ventralDisabled ? "text-slate-400" : ""}`}>
                          <input
                            type="radio"
                            name={`best-ventral-${p.id}`}
                            disabled={ventralDisabled}
                            checked={!!p.isBestVentral}
                            onChange={() => setBestVentral(p.id)}
                          />
                          Best ventral
                        </label>

                        <label className={`flex items-center gap-2 ${dorsalDisabled ? "text-slate-400" : ""}`}>
                          <input
                            type="radio"
                            name={`best-dorsal-${p.id}`}
                            disabled={dorsalDisabled}
                            checked={!!p.isBestDorsal}
                            onChange={() => setBestDorsal(p.id)}
                          />
                          Best dorsal
                        </label>

                        {p.measure && (
                          <div className="text-xs text-slate-600 mt-1">
                            <div className="text-[12px] text-slate-700">
                              DL: {((p.measure?.dlCm ?? 0) / 100).toFixed(2)} m · DW: {((p.measure?.dwCm ?? 0) / 100).toFixed(2)} m
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 justify-self-end">
                      {!p.isHeicLike ? (
                        <button
                          type="button"
                          className="px-2 py-1 rounded border text-xs text-slate-700 hover:bg-slate-50"
                          onClick={() => setEditOpen(p)}
                        >
                          Edit photo
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="px-2 py-1 rounded border text-xs text-slate-700 hover:bg-slate-50"
                        disabled={busy}
                        onClick={() => {
                          const ok = window.confirm(
                            "Replace this photo? Any edits and size measurements for this photo will be lost."
                          );
                          if (!ok) return;
                          setReplaceTarget(p);
                          replaceInputRef.current?.click();
                        }}
                      >
                        Replace photo
                      </button>
                      {canMeasure ? (
                        <button
                          type="button"
                          className="px-2 py-1 rounded bg-sky-600 text-xs text-white"
                          onClick={() => setMeasureOpen(p)}
                        >
                          Size
                        </button>
                      ) : null}
                      {p.view === "ventral" && p.isBestVentral ? (
                        <button
                          type="button"
                          className="px-2 py-1 rounded border border-sky-200 bg-sky-50 text-xs font-medium text-sky-700"
                          onClick={() => setMatchOpen(p)}
                        >
                          Match
                        </button>
                      ) : null}
                      <button type="button" className="text-xs text-red-600" onClick={() => deletePhoto(p.id)}>Delete</button>
                    </div>
                  </div>
                );
              })}

              {photos.length === 0 && <div className="text-sm text-gray-600">No photos added yet.</div>}
            </div>

            <div className="px-0 py-3 mt-2 flex justify-end gap-2 border-t">
              <button type="button" className="px-3 py-2 rounded border" onClick={onClose} disabled={busy}>Cancel</button>
              <button
                type="button"
                className="px-3 py-2 rounded bg-sky-600 text-white disabled:opacity-50"
                onClick={save}
                disabled={busy || !canSave()}
              >
                Save Manta
              </button>
            </div>
          </div>
        </div>
      </div>

      {measureOpen && (
        <MeasureModal
          open={true}
          src={resolvePhotoUrl(measureOpen)}
          onClose={() => setMeasureOpen(null)}
          onApply={(r) => {
            onMeasureApplied(measureOpen.id, r);
            setMeasureOpen(null);
          }}
          initial={
            measureOpen.measure
              ? {
                  dlCm: measureOpen.measure.dlCm,
                  dwCm: measureOpen.measure.dwCm,
                  discPx: measureOpen.measure.discPx,
                  scalePx: measureOpen.measure.scalePx,
                  scaleCm: measureOpen.measure.scaleCm,
                }
              : undefined
          }
        />
      )}

      {editOpen && (
        <PhotoEditModal
          open={true}
          src={resolvePhotoUrl(editOpen)}
          fileName={editOpen.name}
          onClose={() => setEditOpen(null)}
          onSave={(blob) => saveEditedPhoto(editOpen, blob)}
        />
      )}


      {matchOpen && (
        <MatchModal
          open={true}
          onClose={() => setMatchOpen(null)}
          tempUrl={resolvePhotoUrl(matchOpen)}
          aMeta={{ name, gender, ageClass, meanSize: size ? Number(size) : null }}
          onChoose={(id) => {
            setPotentialCatalogId(id);
            setPotentialNoMatch(false);
            setMatchOpen(null);
          }}
          onNoMatch={() => {
            setPotentialCatalogId(null);
            setPotentialNoMatch(true);
            setMatchOpen(null);
          }}
        />
      )}
    </>
  );
}
