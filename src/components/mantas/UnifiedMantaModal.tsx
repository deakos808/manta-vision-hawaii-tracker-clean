import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import MeasureModal, { MeasureResult } from "./MeasureModal";
import MatchModal from "./MatchModal";
import PhotoEditModal from "./PhotoEditModal";
import { uploadPreparedPair, uploadReeditedPhoto, meanDiscWidthMeters, type EditTransform } from "@/features/photos/photoPreparation";
import type { BasicExif } from "@/lib/exif";
import { readBasicExif } from "@/lib/exif";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { OrganicBiopsyDraft } from "@/features/biopsies/organicBiopsy";

type View = "ventral" | "dorsal" | "other";

export type Uploaded = {
  id: string;
  name: string;
  url: string;
  path: string;
  view: View;
  isBestVentral?: boolean;
  isBestDorsal?: boolean;
  measure?: { dlCm: number; dwCm: number; discPx: number; scalePx: number; scaleCm: number; points?: MeasureResult["points"] };
  previewUrl?: string | null;
  isHeicLike?: boolean;
  storageBucket?: "manta-images";
  originalPath?: string;
  editTransform?: EditTransform;
};

export type MantaDraft = {
  id: string;
  name: string;
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
  biopsy?: OrganicBiopsyDraft | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  sightingId: string;
  onSave: (m: MantaDraft) => void;
  existingManta?: MantaDraft | null;
  automaticName?: string;
  onApplyExifMetadata?: (meta: { date?: string; time?: string; lat?: number; lon?: number }) => void;
  needsExifPrompt?: boolean;
  onApplyExifMetadata?: (meta: { date?: string; time?: string; lat?: number; lon?: number }) => void;
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
  automaticName,
  onApplyExifMetadata,
  needsExifPrompt = false,
}: Props) {
  const [name, setName] = useState(() => (existingManta?.name ?? automaticName ?? "").trim());
  const proposedNameFlow = automaticName !== undefined;
  const [nameTouched, setNameTouched] = useState(false);
  const [gender, setGender] = useState<string | null>(null);
  const [ageClass, setAgeClass] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [noPhotos, setNoPhotos] = useState(false);

  const [photos, setPhotos] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<{ id: string; file: File; exif: BasicExif }[]>([]);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const intakeLock = useRef(false);
  const batchExifChosen = useRef(false);
  const [editingPhoto, setEditingPhoto] = useState<{ photo: Uploaded; file: File } | null>(null);
  const pendingPhoto = pendingPhotos[0];
  const intakeActive = busy || pendingPhotos.length > 0 || editingPhoto !== null;
  const [measureOpen, setMeasureOpen] = useState<Uploaded | null>(null);
  const [matchOpen, setMatchOpen] = useState<Uploaded | null>(null);
  const [potentialCatalogId, setPotentialCatalogId] = useState<number | null>(null);
  const [potentialNoMatch, setPotentialNoMatch] = useState<boolean>(false);

  const [localExifPromptOpen, setLocalExifPromptOpen] = useState(false);
  const [localExifMeta, setLocalExifMeta] = useState<{ date?: string; time?: string; lat?: number; lon?: number } | null>(null);
  const [firstExifMeta, setFirstExifMeta] = useState<{ date?: string; time?: string; lat?: number; lon?: number } | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [mantaId, setMantaId] = useState(() => existingManta?.id ?? uuid());

  useEffect(() => {
    if (!open) return;
    // One identity per new entry, shared by its paths and eventual MantaDraft.
    // Reusing the modal for B must not reuse A's identity.
    setMantaId(existingManta?.id ?? uuid());
    setPendingPhotos([]);
    setEditingPhoto(null);
    setIntakeError(null);
    setName((existingManta?.name ?? automaticName ?? "").trim());
    setNameTouched(false);
    setGender(existingManta?.gender ?? null);
    setAgeClass(existingManta?.ageClass ?? null);
    setSize(existingManta?.size ?? null);
    setPhotos(existingManta?.photos ?? []);
    setPotentialCatalogId(existingManta?.potentialCatalogId ?? null);
    setPotentialNoMatch(existingManta?.potentialNoMatch ?? false);
    setNoPhotos(existingManta?.noPhotos ?? false);
    setFirstExifMeta(existingManta?.firstExifMeta ?? null);
  }, [open, existingManta, automaticName]);

  useEffect(() => {
    return () => {
      // blob previews are revoked on delete; avoid revoking on every photos state change
    };
  }, []);

  const meanDW = useMemo(() => meanDiscWidthMeters(photos), [photos]);

  useEffect(() => {
    // Keep the existing precedence: a changed measured mean updates the editable
    // size field; manual edits remain until the measured mean changes again.
    if (meanDW !== null) setSize(meanDW.toFixed(2));
  }, [meanDW]);

  if (!open) return null;

  async function handleFiles(files: File[]) {
    if (!files.length || intakeLock.current || pendingPhotos.length || editingPhoto) return;
    intakeLock.current = true;
    setBusy(true);
    setIntakeError(null);
    batchExifChosen.current = false;
    try {
      const accepted = files.filter(file => /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name));
      if (accepted.length !== files.length) setIntakeError("Only JPEG, PNG, WebP, HEIC and HEIF photos can be prepared.");
      const queue = [];
      for (const file of accepted) {
        queue.push({ id: crypto.randomUUID(), file, exif: await readBasicExif(file) });
      }
      setPendingPhotos(queue);
    } catch {
      setIntakeError("Could not prepare the selected files. No files were uploaded.");
    } finally {
      intakeLock.current = false;
      setBusy(false);
    }
  }

  async function savePreparedPhoto(prepared: Blob, editTransform: EditTransform) {
    if (!pendingPhoto || intakeLock.current) throw new Error("Photo preparation is already in progress.");
    intakeLock.current = true;
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new Error("Sign in before saving a photo. No files were uploaded.");
      const added = await uploadPreparedPair(supabase.storage.from("manta-images"), {
        uploaderId: data.user.id, sightingId, mantaId,
        photoId: pendingPhoto.id, editId: crypto.randomUUID(),
        original: pendingPhoto.file, prepared, editTransform,
      });
      setPhotos(previous => [...previous, { ...added, previewUrl: URL.createObjectURL(prepared) }]);
      const exif = pendingPhoto.exif;
      if (!batchExifChosen.current) {
        setFirstExifMeta({
          date: formatExifDate(exif.takenAt), time: formatExifTime(exif.takenAt),
          lat: exif.lat, lon: exif.lon,
        });
        batchExifChosen.current = true;
      }
      setPendingPhotos(previous => previous.slice(1));
    } finally {
      intakeLock.current = false;
      setBusy(false);
    }
  }

  async function editCrop(photo: Uploaded) {
    if (intakeActive || intakeLock.current || !photo.originalPath || photo.storageBucket !== "manta-images") return;
    intakeLock.current = true;
    setBusy(true);
    setIntakeError(null);
    try {
      const { data, error } = await supabase.storage.from("manta-images").download(photo.originalPath);
      if (error || !data) throw new Error("Could not load the untouched original. The photo is unchanged.");
      setEditingPhoto({ photo, file: new File([data], photo.name, { type: data.type }) });
    } catch {
      setIntakeError("Could not load the untouched original. The photo is unchanged.");
    } finally { intakeLock.current = false; setBusy(false); }
  }

  async function saveReeditedPhoto(prepared: Blob, editTransform: EditTransform) {
    if (!editingPhoto || intakeLock.current) throw new Error("Photo preparation is already in progress.");
    intakeLock.current = true;
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new Error("Sign in before saving a photo. No files were uploaded.");
      const updated = await uploadReeditedPhoto(supabase.storage.from("manta-images"), editingPhoto.photo, prepared, editTransform, crypto.randomUUID());
      const previewUrl = URL.createObjectURL(prepared);
      setPhotos(previous => previous.map(photo => photo.id === updated.id ? { ...photo, path: updated.path, url: updated.url, editTransform: updated.editTransform, previewUrl } : photo));
      // Keep any previously saved draft's preview alive if this manta edit is cancelled.
      setEditingPhoto(null);
    } finally { intakeLock.current = false; setBusy(false); }
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
                points: r.points,
              },
            }
          : p
      )
    );
  }

  function canSave() {
    const hasName = name.trim().length > 0;
    const hasPhotosOrOverride = photos.length > 0 || noPhotos;
    return hasName && hasPhotosOrOverride;
  }

  function save() {
    const draft: MantaDraft = {
      id: mantaId,
      name: name.trim(),
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
      biopsy: existingManta?.biopsy ?? null,
    };
    onSave(draft);
    onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[300000] bg-black/40 flex items-center justify-center"
      >
        <div
          className="bg-white rounded-lg border w-[min(1100px,95vw)] max-h-[90dvh] overflow-y-auto pointer-events-auto relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute top-3 right-3 text-2xl leading-none hover:text-gray-700"
            onClick={() => { if (!intakeActive) onClose(); }}
          >
            &times;
          </button>

          <div className="px-4 pt-4 text-center">
            <h3 className="text-lg font-medium">{proposedNameFlow && name.trim() ? `Add Manta ${name.trim()}` : "Add Manta"}</h3>
            <div className="text-[11px] text-gray-500 mt-1">sighting: {sightingId.slice(0, 8)}</div>
          </div>

          <div className="px-4 pb-4">
            <div className="mt-4 mb-6">
              <div
                className="min-h-[200px] sm:min-h-[240px] border-dashed border-2 border-sky-300 rounded-lg bg-sky-50/60 p-6 text-slate-600 flex flex-col items-center justify-center"
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <div className="text-lg sm:text-xl font-medium text-slate-800 text-center">Drop a manta photo here</div>
                <div className="my-2">or</div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="px-5 py-2.5 rounded-md bg-sky-700 text-white font-medium hover:bg-sky-800 disabled:opacity-50"
                  disabled={intakeActive}
                >
                  Choose Photo
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept="image/*,.heic,.heif"
                  className="hidden"
                  onChange={onBrowse}
                />
              </div>

              {intakeError && <p role="alert" className="mt-2 text-sm text-red-700">{intakeError}</p>}
              {photos.length === 0 && (
                <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={noPhotos} onChange={(e) => setNoPhotos(e.target.checked)} />
                  No photos taken (allow save without photos)
                </label>
              )}
            </div>

            <div className={"grid md:grid-cols-12 gap-3 " + (proposedNameFlow ? "text-sm text-slate-500" : "")}>
              <div className="md:col-span-5 col-span-12">
                <label htmlFor={`manta-name-${mantaId}`} className="text-sm block mb-1">{proposedNameFlow ? "Proposed Name" : "Temp Name"}</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  id={`manta-name-${mantaId}`}
                  value={name}
                  onBlur={() => setNameTouched(true)}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={proposedNameFlow ? "e.g., A, Kai, Luna" : "e.g., A, B, C"}
                />
                {!name.trim() && (!proposedNameFlow || nameTouched) && <div className="text-xs text-red-500 mt-1">Please provide a temporary name</div>}
              </div>

              <div className="md:col-span-2 col-span-12">
                <label className="text-sm block mb-1">Gender</label>
                <select
                  className={"border rounded px-2 py-2 " + (((gender ?? "") === "") ? "text-slate-400" : "text-slate-900")}
                  value={gender ?? ""}
                  onChange={(e) => setGender(e.target.value || null)}
                >
                  <option value="">e.g., male</option>
                  <option value="female">female</option>
                  <option value="male">male</option>
                  <option value="unknown">unknown</option>
                </select>
              </div>

              <div className="md:col-span-3 col-span-12">
                <label className="text-sm block mb-1">Age Class</label>
                <select
                  className={"border rounded px-2 py-2 " + (((ageClass ?? "") === "") ? "text-slate-400" : "text-slate-900")}
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

              <div className="md:col-span-2 col-span-12">
                <label className="text-sm block mb-1">Mean Size (m)</label>
                <input
                  type="number"
                  className="w-full border rounded px-3 py-2"
                  value={size ?? ""}
                  onChange={(e) => setSize(e.target.value || null)}
                  placeholder="m"
                />
              </div>
            </div>


            <div className="mt-4 space-y-3">
              {photos.map((p) => {
                const canSize = true;
                const ventralDisabled = p.view !== "ventral";
                const dorsalDisabled = p.view !== "dorsal";

                return (
                  <div key={p.id} className="border rounded p-3 grid grid-cols-[110px,1fr,auto] gap-3 items-center">
                    <div>
                      {p.isHeicLike ? (
                        <div className="w-[110px] h-[80px] rounded border bg-slate-100 flex flex-col items-center justify-center text-center px-2">
                          <div className="text-[10px] font-semibold text-slate-700">HEIC</div>
                          <div className="text-[10px] text-slate-500 break-all">{p.name}</div>
                        </div>
                      ) : (
                        <img
                          src={p.previewUrl || p.url}
                          alt={p.name}
                          className="w-[110px] h-[80px] object-cover rounded border"
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-sm">
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

                      <div className="text-sm">
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
                      <button
                        type="button"
                        className="px-2 py-1 rounded border disabled:opacity-50"
                        disabled={intakeActive || !p.originalPath || p.storageBucket !== "manta-images"}
                        title={!p.originalPath ? "Original source unavailable for this legacy photo" : "Edit from the untouched original"}
                        onClick={() => void editCrop(p)}
                      >Edit Crop</button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded bg-sky-600 text-white"
                        disabled={intakeActive}
                        onClick={() => setMeasureOpen(p)}
                      >
                        Size
                      </button>
                      <button type="button" className="text-red-600" disabled={intakeActive} onClick={() => deletePhoto(p.id)}>Delete</button>
                    </div>
                  </div>
                );
              })}

              {photos.length === 0 && <div className="text-sm text-gray-600">No photos added yet.</div>}
            </div>

            <div className="px-0 py-3 mt-2 flex justify-end gap-2 border-t">
              <button type="button" className="px-3 py-2 rounded border" onClick={() => { if (!intakeActive) onClose(); }} disabled={intakeActive}>Cancel</button>
              <button
                type="button"
                className="px-3 py-2 rounded bg-sky-600 text-white disabled:opacity-50"
                onClick={save}
                disabled={intakeActive || !canSave()}
              >
                Save Manta
              </button>
            </div>
          </div>
        </div>
      </div>

      {editingPhoto && (
        <PhotoEditModal
          key={`edit-${editingPhoto.photo.id}`}
          file={editingPhoto.file}
          exifOrientation={editingPhoto.photo.editTransform?.exifOrientation ?? 1}
          initialTransform={editingPhoto.photo.editTransform}
          remaining={1}
          onClose={() => { if (!intakeLock.current) setEditingPhoto(null); }}
          onSave={saveReeditedPhoto}
        />
      )}

      {pendingPhoto && (
        <PhotoEditModal
          key={pendingPhoto.id}
          file={pendingPhoto.file}
          exifOrientation={pendingPhoto.exif.orientation ?? 1}
          remaining={pendingPhotos.length}
          onClose={() => { if (!intakeLock.current) setPendingPhotos(previous => previous.slice(1)); }}
          onSave={savePreparedPhoto}
        />
      )}

      {measureOpen && (
        <MeasureModal
          open={true}
          src={measureOpen.previewUrl || measureOpen.url}
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
                  points: measureOpen.measure.points,
                }
              : undefined
          }
        />
      )}


      <Dialog open={localExifPromptOpen} onOpenChange={setLocalExifPromptOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Use photo metadata?</DialogTitle>
            <DialogDescription>
              This photo includes metadata that may help populate sighting date and location.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            {localExifMeta?.date ? <div>Date: {localExifMeta.date}</div> : null}
            {(typeof localExifMeta?.lat === "number" && typeof localExifMeta?.lon === "number") ? (
              <div>Coordinates: {localExifMeta.lat}, {localExifMeta.lon}</div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded border"
              onClick={() => setLocalExifPromptOpen(false)}
            >
              No, I’ll enter manually
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded bg-sky-600 text-white"
              onClick={() => {
                if (localExifMeta && onApplyExifMetadata) onApplyExifMetadata(localExifMeta);
                setLocalExifPromptOpen(false);
              }}
            >
              Yes, use metadata
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {matchOpen && (
        <MatchModal
          open={true}
          onClose={() => setMatchOpen(null)}
          tempUrl={matchOpen.previewUrl || matchOpen.url}
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
