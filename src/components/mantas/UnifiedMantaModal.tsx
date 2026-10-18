import { Trash2 } from "lucide-react";
import { MantaImage } from "@/features/photos/MantaImage";
import { SPECIES_OPTIONS, type CatalogSpecies } from "@/features/sightings/catalogSpecies";
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import MeasureModal, { MeasureResult } from "./MeasureModal";
import MatchModal from "./MatchModal";
import KnownMantaLookup from "./KnownMantaLookup";
import { knownIdentification, type IdentificationProposal } from "@/features/sightings/knownIdentification";
import PhotoEditModal from "./PhotoEditModal";
import { designatedBestPhoto, invalidPhotoInjury, photoDisplaySource, photoForPayload, type InjuryModifier } from "@/features/photos/photoPresentation";
import { uploadPreparedPair, uploadReeditedPhoto, type EditTransform } from "@/features/photos/photoPreparation";
import type { BasicExif } from "@/lib/exif";
import { readBasicExif } from "@/lib/exif";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { OrganicBiopsyDraft } from "@/features/biopsies/organicBiopsy";

import { sizeSourcesForPayload, isExternal, invalidExternalMeasurement, measuredPhotoForPayload, measurementSummary, type PhotoMeasurement } from "@/features/photos/photoMeasurements";
import PhotoMeasurementControls from "./PhotoMeasurementControls";

type View = "ventral" | "dorsal" | "other";

export type Uploaded = {
  id: string;
  name: string;
  url?: string;
  path: string;
  view: View;
  isBestVentral?: boolean;
  isBestDorsal?: boolean;
  isPhotogrammetry?: boolean | null;
  isInjury?: boolean | null;
  injuryModifiers?: InjuryModifier[] | null;
  measure?: PhotoMeasurement;
  previewUrl?: string | null;
  isHeicLike?: boolean;
  storageBucket?: "manta-images";
  originalPath?: string;
  editTransform?: EditTransform;
  captureDate?: string;
  captureTime?: string;
};

export type MantaDraft = {
  id: string;
  name: string;
  gender?: string | null;
  ageClass?: string | null;
  species?: CatalogSpecies | null;
  size?: string | null; // legacy, source unspecified; never inferred to be an estimate
  estimatedSize?: string | null; // explicit contributor visual estimate in meters
  photos: Uploaded[];
  matchedCatalogId?: number | null;
  identificationProposal?: IdentificationProposal | null;
  noMatch?: boolean;
  noPhotos?: boolean;
  potentialCatalogId?: number | null;
  potentialNoMatch?: boolean;
  firstExifMeta?: { date?: string; time?: string; lat?: number; lon?: number } | null;
  biopsy?: OrganicBiopsyDraft | null;
};

type Props = {
  open: boolean;
  showSize: boolean;
  allowMatching: boolean;
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

export default function UnifiedMantaModal({
  open,
  allowMatching,
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
  const [species, setSpecies] = useState<CatalogSpecies | null>(null);
  const [ageClass, setAgeClass] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [estimatedSize, setEstimatedSize] = useState<string | null>(null);
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
  const [knownOpen, setKnownOpen] = useState(false);
  const [identificationProposal, setIdentificationProposal] = useState<IdentificationProposal | null>(null);
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
    setSpecies(existingManta?.species ?? null);
    setSize(existingManta?.size ?? null);
    setEstimatedSize(existingManta?.estimatedSize ?? null);
    setPhotos(existingManta?.photos ?? []);
    setPotentialCatalogId(existingManta?.matchedCatalogId ?? existingManta?.potentialCatalogId ?? null);
    setPotentialNoMatch(existingManta?.noMatch !== undefined
      ? existingManta.noMatch
      : existingManta?.potentialNoMatch ?? false);
    setNoPhotos(existingManta?.noPhotos ?? false);
    setKnownOpen(false);
    setIdentificationProposal(existingManta?.identificationProposal ?? null);
    setFirstExifMeta(existingManta?.firstExifMeta ?? null);
  }, [open, existingManta, automaticName]);

  useEffect(() => {
    return () => {
      // blob previews are revoked on delete; avoid revoking on every photos state change
    };
  }, []);

  const summary = measurementSummary(photos);
  const measuredDW = summary.dw.mean;
  const bestVentral = designatedBestPhoto(photos, "ventral");
  const hasMatch = potentialCatalogId != null && Number.isInteger(Number(potentialCatalogId)) && Number(potentialCatalogId) > 0;
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
      const exif = pendingPhoto.exif;
      setPhotos(previous => [...previous, { ...added, isPhotogrammetry: false, captureDate: exif.captureDate, captureTime: exif.captureTime, previewUrl: URL.createObjectURL(prepared) }]);
      if (!batchExifChosen.current && typeof exif.lat === "number" && typeof exif.lon === "number") {
        setFirstExifMeta({
          date: exif.captureDate, time: exif.captureTime,
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
      setPhotos(previous => previous.map(photo => photo.id === updated.id ? { ...photo, path: updated.path, editTransform: updated.editTransform, previewUrl } : photo));
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
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, view, isBestVentral: view === "ventral" && !!p.isBestVentral, isBestDorsal: view === "dorsal" && !!p.isBestDorsal } : p)));
  }

  function setBestVentral(id: string, checked = true) {
    setPhotos(previous => previous.map(photo => photo.id === id
      ? { ...photo, isBestVentral: checked && photo.view === "ventral" }
      : checked && photo.isBestVentral ? { ...photo, isBestVentral: false } : photo));
  }

  function setBestDorsal(id: string, checked = true) {
    setPhotos(previous => previous.map(photo => photo.id === id
      ? { ...photo, isBestDorsal: checked && photo.view === "dorsal" }
      : checked && photo.isBestDorsal ? { ...photo, isBestDorsal: false } : photo));
  }

  // Photo evidence never overwrites the independent visual estimate or legacy value.
  function updateMeasuredPhotos(next: Uploaded[]) {
    setPhotos(next);
  }

  function deletePhoto(id: string) {
    const found = photos.find((p) => p.id === id);
    if (found?.previewUrl?.startsWith("blob:")) {
      try { URL.revokeObjectURL(found.previewUrl); } catch {}
    }
    const next = photos.filter((p) => p.id !== id);
    if (found?.measure) updateMeasuredPhotos(next);
    else setPhotos(next);
  }

  function onMeasureApplied(photoId: string, r: MeasureResult) {
    const previous = photos.find((p) => p.id === photoId)?.measure;
    if (previous && !isExternal(previous) && previous.dlCm === r.dlCm && previous.dwCm === r.dwCm
        && previous.discPx === r.discPx && previous.scalePx === r.scalePx
        && previous.scaleCm === r.scaleCm
        && JSON.stringify(previous.points) === JSON.stringify(r.points)) return;
    updateMeasuredPhotos(photos.map((p) => p.id === photoId
      ? { ...p, measure: {
          dlCm: r.dlCm, dwCm: r.dwCm, discPx: r.discPx,
          scalePx: r.scalePx, scaleCm: r.scaleCm, points: r.points,
        } }
      : p));
  }

  function canSave() {
    const hasName = name.trim().length > 0;
    const hasPhotosOrOverride = photos.length > 0 || noPhotos;
    return hasName && hasPhotosOrOverride && !photos.some(invalidExternalMeasurement) && !photos.some(invalidPhotoInjury) && (!estimatedSize || (Number.isFinite(Number(estimatedSize)) && Number(estimatedSize) > 0));
  }

  function save() {
    const draft: MantaDraft = {
      id: mantaId,
      name: name.trim(),
      gender,
      ageClass,
      species,
      ...sizeSourcesForPayload(photos, estimatedSize, size),
      photos: photos.map(p => photoForPayload(measuredPhotoForPayload(p))),
      potentialCatalogId,
      identificationProposal,
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
            <h3 className="text-lg font-medium">{existingManta ? "Edit Manta" : "Add Manta"}</h3>
          </div>

          <div className="px-4 pb-4">
            <div className="mt-4 mb-6">
              <div
                className="min-h-[112px] sm:min-h-[96px] border-dashed border-2 border-sky-300 rounded-lg bg-sky-50/60 p-3 text-slate-600 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4"
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <div className="text-sm font-medium text-slate-800 text-center">Drop a manta photo here</div>
                <div className="text-sm">or</div>
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

            <div className="space-y-3">
              <div>
                <label htmlFor={`manta-name-${mantaId}`} className="block text-xs">Temp Name</label>
                <input className="min-h-11 w-36 rounded border px-2 text-sm lg:min-h-8" id={`manta-name-${mantaId}`} value={name}
                  onBlur={() => setNameTouched(true)} onChange={e => setName(e.target.value)} placeholder="e.g., A, B, C" />
                {!name.trim() && (!proposedNameFlow || nameTouched) && <div className="text-xs text-red-500">Please provide a temporary name</div>}
              </div>
              <div className="grid grid-cols-1 items-start gap-x-4 gap-y-2 text-xs lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.9fr)_minmax(0,1.1fr)]">
                <fieldset className="min-w-0"><legend className="font-medium">Species</legend>
                  <div className="flex flex-wrap gap-x-3">
                    {SPECIES_OPTIONS.map(option => <label key={option.value} className="flex min-h-11 items-center gap-1 lg:min-h-8">
                      <input type="radio" name={`species-${mantaId}`} checked={(species ?? "") === option.value} onChange={() => setSpecies(option.value || null)} />
                      {option.value ? option.value.replace("mobula", "Mobula") : "Unknown / unspecified"}
                    </label>)}
                  </div>
                </fieldset>
                <fieldset><legend className="font-medium">Gender</legend><div className="flex flex-wrap gap-x-3">
                  {["", "female", "male", "unknown"].map(value => <label key={value} className="flex min-h-11 items-center gap-1 lg:min-h-8">
                    <input type="radio" name={`gender-${mantaId}`} checked={(gender ?? "") === value} onChange={() => setGender(value || null)} />{value || "Unspecified"}
                  </label>)}
                </div></fieldset>
                <fieldset><legend className="font-medium">Age Class</legend><div className="flex flex-wrap gap-x-3">
                  {["", "juvenile", "yearling", "adult", "unknown"].map(value => <label key={value} className="flex min-h-11 items-center gap-1 lg:min-h-8">
                    <input type="radio" name={`age-${mantaId}`} checked={(ageClass ?? "") === value} onChange={() => setAgeClass(value || null)} />{value || "Unspecified"}
                  </label>)}
                </div></fieldset>
              </div>
            </div>

            <div className="mt-3 divide-y divide-slate-200">
              {photos.map((p) => {

                return (
                  <div key={p.id} className="grid grid-cols-[64px_minmax(0,1fr)_44px] items-start gap-2 py-2 lg:grid-cols-[64px_210px_180px_minmax(0,1fr)_32px]">
                    <div>
                      {p.isHeicLike ? <div className="flex h-16 w-16 items-center justify-center rounded border text-xs">HEIC</div> :
                        <MantaImage src={photoDisplaySource(p)} alt={p.name} className="h-16 w-16 rounded border object-cover" />}
                      <button type="button" className="min-h-11 w-16 text-[10px] underline disabled:opacity-50 lg:min-h-7"
                        disabled={intakeActive || !p.originalPath || p.storageBucket !== "manta-images"}
                        title={!p.originalPath ? "Original source unavailable for this legacy photo" : "Edit from the untouched original"} onClick={() => void editCrop(p)}>Edit Crop</button>
                    </div>
                    <div className="min-w-0 space-y-1 lg:contents">
                      <fieldset className="min-w-0 rounded bg-slate-50 px-2 py-1 text-xs"><legend className="font-medium">View</legend>
                        <div className="flex flex-wrap gap-x-3 lg:block">
                        {["ventral", "dorsal", "other"].map(view => <div key={view} className="flex min-h-11 items-center gap-3 lg:min-h-7">
                          <label className="flex min-h-11 items-center gap-1 lg:min-h-7"><input type="radio" name={`view-${p.id}`} checked={p.view === view} onChange={() => setView(p.id, view as View)} disabled={intakeActive} />{view[0].toUpperCase() + view.slice(1)}</label>
                          {p.view === view && view !== "other" && <label className="flex min-h-11 items-center gap-1 lg:min-h-7"><input type="checkbox" aria-label={`Best ${view}`} checked={view === "ventral" ? !!p.isBestVentral : !!p.isBestDorsal} disabled={intakeActive}
                            onChange={e => view === "ventral" ? setBestVentral(p.id, e.target.checked) : setBestDorsal(p.id, e.target.checked)} />Best</label>}
                        </div>)}
                        </div>
                      </fieldset>
                      <fieldset className="min-w-0 rounded border border-slate-100 px-2 py-1 text-xs"><legend className="font-medium">Injury</legend>
                        <label className="flex min-h-11 items-center gap-1 lg:min-h-7"><input type="checkbox" checked={p.isInjury === true} disabled={intakeActive}
                          onChange={e => setPhotos(previous => previous.map(photo => photo.id === p.id ? { ...photo, isInjury: e.target.checked, ...(!e.target.checked ? { injuryModifiers: [] } : {}) } : photo))} />Injury</label>
                        {p.isInjury && <div className="flex flex-wrap gap-x-3">
                          {(["predation", "entanglement"] as const).map(modifier => <label key={modifier} className="flex min-h-11 items-center gap-1 lg:min-h-7">
                            <input type="checkbox" checked={Array.isArray(p.injuryModifiers) && p.injuryModifiers.includes(modifier)} disabled={intakeActive} onChange={e => setPhotos(previous => previous.map(photo => photo.id === p.id ? { ...photo,
                              injuryModifiers: e.target.checked ? [...(Array.isArray(photo.injuryModifiers) ? photo.injuryModifiers : []).filter(value => value !== modifier), modifier] : (Array.isArray(photo.injuryModifiers) ? photo.injuryModifiers : []).filter(value => value !== modifier) } : photo))} />
                            {modifier === "predation" ? "Predation" : "Entanglement"}
                          </label>)}
                        </div>}
                        {invalidPhotoInjury(p) && <p role="alert" className="text-red-700">Review injury modifiers before saving.</p>}
                      </fieldset>
                      <fieldset className="min-w-0 rounded bg-slate-100/60 px-2 py-1 text-xs"><legend className="font-medium">Photogrammetry</legend>
                        <label className="flex min-h-11 items-center gap-1 lg:min-h-7"><input type="checkbox" checked={p.isPhotogrammetry === true} disabled={intakeActive}
                          onChange={e => setPhotos(previous => previous.map(photo => photo.id === p.id ? { ...photo, isPhotogrammetry: e.target.checked } : photo))} />Photogrammetry</label>
                        <PhotoMeasurementControls id={p.id} isPhotogrammetry={p.isPhotogrammetry} measure={p.measure} disabled={intakeActive}
                          onChange={measure => updateMeasuredPhotos(photos.map(photo => photo.id === p.id ? { ...photo, measure } : photo))} onMeasure={() => setMeasureOpen(p)} />
                      </fieldset>
                    </div>
                    <button type="button" aria-label={`Delete photo ${p.name}`} title="Delete" className="flex min-h-11 min-w-11 items-center justify-center text-red-700 lg:min-h-8 lg:min-w-8" disabled={intakeActive} onClick={() => deletePhoto(p.id)}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                );
              })}

              {photos.length === 0 && <div className="text-sm text-gray-600">No photos added yet.</div>}
            </div>

            <section className="my-4 rounded border p-3" aria-label="Proposed identification">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {bestVentral && <button type="button" className="min-h-11 rounded border px-2 lg:min-h-8" disabled={intakeActive || !allowMatching} onClick={() => setMatchOpen(bestVentral)}>Match Photo</button>}
                <fieldset className="flex flex-wrap gap-3"><legend className="sr-only">Proposed identification status</legend>
                  <label className="flex min-h-11 items-center gap-1 lg:min-h-8"><input type="radio" name={`identification-${mantaId}`} checked={hasMatch} disabled={intakeActive || (!hasMatch && !allowMatching)} onChange={() => { if (allowMatching) { if (bestVentral) setMatchOpen(bestVentral); else setKnownOpen(true); } }} />Match</label>
                  <label className="flex min-h-11 items-center gap-1 lg:min-h-8"><input type="radio" name={`identification-${mantaId}`} checked={!hasMatch && potentialNoMatch} disabled={intakeActive} onChange={() => { setPotentialCatalogId(null); setPotentialNoMatch(true); setIdentificationProposal(null); }} />New</label>
                  <label className="flex min-h-11 items-center gap-1 lg:min-h-8"><input type="radio" name={`identification-${mantaId}`} checked={!hasMatch && !potentialNoMatch} disabled={intakeActive} onChange={() => { setPotentialCatalogId(null); setPotentialNoMatch(false); setIdentificationProposal(null); }} />Unknown</label>
                </fieldset>
                {!bestVentral && <button type="button" className="min-h-11 underline lg:min-h-8" disabled={intakeActive || !allowMatching} onClick={() => setKnownOpen(true)}>Suggest Identity</button>}
              </div>
              {potentialCatalogId != null && <div className="mt-3 text-sm">
                <strong>Proposed identification</strong>
                <div>{identificationProposal?.catalogName} · Catalog #{potentialCatalogId}</div>
                <div>{identificationProposal?.method === 'contributor_known' ? 'Contributor-known identity' : 'Photo match proposal'}</div>
                <p>Awaiting HAMER review</p>
                {identificationProposal?.method === 'contributor_known' && <label className="block mt-2">How do you recognize this manta? (optional)
                  <textarea className="block border rounded p-2 w-full" value={identificationProposal.evidence ?? ''}
                    onChange={e => setIdentificationProposal({ ...identificationProposal, evidence: e.target.value })} /></label>}
              </div>}
              {potentialNoMatch && <p className="mt-2 text-sm">No Match / New Individual — awaiting HAMER review</p>}
            </section>
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
          src={photoDisplaySource(measureOpen) || ""}
          onClose={() => setMeasureOpen(null)}
          onApply={(r) => {
            onMeasureApplied(measureOpen.id, r);
            setMeasureOpen(null);
          }}
          initial={
            measureOpen.measure && !isExternal(measureOpen.measure)
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
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
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

          <div className="flex flex-wrap justify-end gap-2">
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

      {knownOpen && <KnownMantaLookup initialEvidence={identificationProposal?.evidence}
        onClose={() => setKnownOpen(false)} onConfirm={(row, evidence) => {
          const proposal = knownIdentification(row, evidence);
          setPotentialCatalogId(proposal.matchedCatalogId); setPotentialNoMatch(false);
          setIdentificationProposal(proposal.identificationProposal); setKnownOpen(false);
        }} />}
      {matchOpen && (
        <div className="relative z-[400000]">
        <MatchModal
          open={true}
          rankedEnabled={allowMatching}
          onClose={() => setMatchOpen(null)}
          tempUrl={photoDisplaySource(matchOpen) || ""}
          aMeta={{ name, gender, ageClass, species, meanSize: measuredDW }}
          onChoose={(id, catalogName) => {
            if (!Number.isInteger(id) || id <= 0) return;
            setIdentificationProposal({ method: "photo_match", catalogName });
            setPotentialCatalogId(id);
            setPotentialNoMatch(false);
            setMatchOpen(null);
          }}
          onNoMatch={() => {
            setIdentificationProposal(null);
            setPotentialCatalogId(null);
            setPotentialNoMatch(true);
            setMatchOpen(null);
          }}
        />
        </div>
      )}
    </>
  );
}
