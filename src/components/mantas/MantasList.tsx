import MeasurementSummary from "./MeasurementSummary";
import { designatedBestPhoto } from "@/features/photos/photoPresentation";
import { mantaPhotoSource } from "@/features/photos/authenticatedPhotoUrl";
import { MantaImage } from "@/features/photos/MantaImage";
import { speciesLabel } from "@/features/sightings/catalogSpecies";
import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { MantaDraft } from "@/components/mantas/UnifiedMantaModal";
import {
  newOrganicBiopsy,
  type OrganicBiopsyDraft,
} from "@/features/biopsies/organicBiopsy";

type Photo = {
  thumbnail_url?: string;
  url?: string;
  storage_path?: string;
  view?: string;
  photo_view?: string;
  is_best_manta_ventral_photo?: boolean;
  is_best_manta_dorsal_photo?: boolean;
};

type Props = {
  mantas: MantaDraft[];
  setMantas: React.Dispatch<React.SetStateAction<MantaDraft[]>>;
  onEdit: (m: MantaDraft) => void;
  onRemove: (id: string) => void;
  onSuggestIdentity: (m: MantaDraft) => void;
  openMatch: (m: MantaDraft, ventralUrl?: string) => void;
  totalPhotosAll: number;
  sightingDate: string;
  allowBiopsyEntry: boolean;
  allowMatching: boolean;
  showSize: boolean;
};

const TILE_W=48;
const TILE_H=36;
const CELL_H = 136; // tile row + meta row baseline

function urlFor(p: any): string | undefined {
  return mantaPhotoSource(p || {});
}
function fmtSizeCm(v:any){ const n=Number(v); return Number.isFinite(n)&&n>0 ? n.toFixed(2)+" cm" : "0.00 cm"; }
function tempName(m:any){
  const v = m?.name ?? m?.tempName ?? m?.mantaName ?? m?.label ?? m?.temp_name ?? m?.mp_number;
  const s = v!=null ? String(v).trim() : "";
  return s || "—";
}

function ImgTile({url, placeholder}:{url?:string; placeholder:string}){
  return (
    <div className="overflow-hidden rounded border bg-white flex items-center justify-center shrink-0" style={{width:TILE_W, height:TILE_H}}>
      {url ? <MantaImage src={url} alt={placeholder} style={{ width: "100%", height: "100%", minWidth: 0, minHeight: 0, objectFit: "contain", objectPosition: "center", display: "block" }}/> :
        <div className="text-xs text-slate-400 select-none">{placeholder}</div>}
    </div>
  );
}


export default function MantasList({
  mantas,
  setMantas,
  onEdit,
  onRemove,
  onSuggestIdentity,
  openMatch,
  sightingDate,
  allowBiopsyEntry,
  allowMatching,
}: Props){
  const GRID = "grid grid-cols-[minmax(0,1fr)_112px] items-start gap-2 p-2 lg:grid-cols-[minmax(145px,1.2fr)_170px_minmax(150px,1fr)_125px_72px] lg:items-center";

  return (
    <div className="-mx-4 divide-y divide-slate-200 sm:mx-0">
      {/* Rows */}
      <div className="divide-y divide-slate-200">
        {mantas.map((m:any, idx:number)=>{
          const vent = designatedBestPhoto(m?.photos,'ventral');
          const dor  = designatedBestPhoto(m?.photos,'dorsal');
          const ventUrl = urlFor(vent);
          const dorUrl  = urlFor(dor);
          const count = Array.isArray(m?.photos) ? m.photos.length : 0;
          const matchedId = "matchedCatalogId" in m ? m.matchedCatalogId : (m?.matched_catalog_id ?? m?.fk_catalog_id ?? m?.potentialCatalogId) ?? null;
          const hasMatch = Number.isInteger(Number(matchedId)) && Number(matchedId) > 0;
          const noMatch = !!(m?.noMatch ?? m?.no_match ?? m?.potentialNoMatch);
          const biopsy = m.biopsy as OrganicBiopsyDraft | null | undefined;
          const updateBiopsy = (patch: Partial<OrganicBiopsyDraft>) => {
            setMantas((current) => current.map((candidate) =>
              String(candidate.id) === String(m.id)
                ? {
                    ...candidate,
                    biopsy: {
                      ...(candidate.biopsy ?? newOrganicBiopsy(sightingDate)),
                      ...patch,
                    } as OrganicBiopsyDraft,
                  }
                : candidate
            ));
          };

          return (
            <div key={String(m?.id ?? idx)}>
            <div className={GRID}>
              <div className="min-w-0 lg:contents">
                <div className="min-w-0 lg:col-start-1 lg:row-start-1">
                  <div className="break-words text-sm font-medium">{tempName(m)}</div>
                  <div className="text-xs text-slate-600"><span className="sr-only">Proposed species: </span>{speciesLabel(m?.species)}</div>
                  <div className="text-[10px] text-slate-500">{m?.gender || "—"} · {m?.ageClass || "—"}</div>
                  {hasMatch ? <details className="text-xs">
                    <summary className="cursor-pointer py-1">{m.identificationProposal?.catalogName || 'Contributor proposed'} · Catalog #{matchedId}</summary>
                    <div>{m.identificationProposal?.method === 'contributor_known' ? 'Contributor-known identity' : 'Photo match proposal'}</div>
                    {m.identificationProposal?.evidence && <p className="whitespace-pre-wrap break-words">Recognition evidence: {m.identificationProposal.evidence}</p>}
                    <div className="text-slate-600">Pending Admin review</div>
                  </details> : <div className="text-xs">{noMatch ? 'New — pending Admin review' : 'Unknown'}</div>}
                </div>
                <div className="flex items-center lg:col-start-5 lg:row-start-1">
                  <button type="button" aria-label="Edit manta" title="Edit" className="min-h-11 min-w-11 rounded text-xs hover:bg-slate-100 lg:min-h-8 lg:min-w-8" onClick={()=>onEdit(m)}><Pencil className="mx-auto h-4 w-4" aria-hidden="true" /></button>
                  <button type="button" aria-label="Remove manta" title="Remove" className="min-h-11 min-w-11 rounded text-xs text-red-700 hover:bg-slate-100 lg:min-h-8 lg:min-w-8" onClick={()=>onRemove(String(m?.id ?? idx))}><Trash2 className="mx-auto h-4 w-4" aria-hidden="true" /></button>
                </div>
              </div>
              <div className="min-w-0 rounded bg-slate-50 p-1.5 lg:col-start-2 lg:row-start-1">
                <div className="flex justify-center gap-1">
                  <div><div className="mb-0.5 text-center text-[10px] text-slate-500">Ventral</div><ImgTile url={ventUrl} placeholder="ventral" /></div>
                  <div><div className="mb-0.5 text-center text-[10px] text-slate-500">Dorsal</div><ImgTile url={dorUrl} placeholder="dorsal" /></div>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-2 text-[10px]">
                  <span>{count} {count === 1 ? "photo" : "photos"}</span>
                  {vent && allowMatching && <button type="button" aria-label="Match Photo"
                    className="min-h-11 underline disabled:opacity-50 lg:min-h-7" disabled={!allowMatching || !ventUrl}
                    title={!ventUrl ? 'Add a ventral photo to find a match' : !allowMatching ? 'An active account is required' : 'Find catalog match'}
                    onClick={()=>{ (window as any).__matchStartCatalogId = (m?.matchedCatalogId ?? m?.matched_catalog_id ?? m?.fk_catalog_id ?? m?.pk_catalog_id ?? null); openMatch(m, ventUrl); }}>
                    Match Photo
                  </button>}
                  {!vent && allowMatching && <button type="button" className="min-h-11 underline lg:min-h-7" onClick={() => onSuggestIdentity(m)}>Suggest Identity</button>}
                </div>
              </div>
              <div className="min-w-0 rounded bg-slate-100/60 p-1.5 lg:col-start-3 lg:row-start-1 [&_dl]:gap-x-1 [&_dl]:text-center [&_dd]:break-words [&_dd]:text-xs [&_dd]:whitespace-normal [&_summary]:min-h-11 [&_summary]:text-xs lg:[&_summary]:min-h-7">
                <MeasurementSummary photos={m.photos ?? []} legacySize={m.size} />
              </div>
              <div className="min-w-0 p-1.5 lg:col-start-4 lg:row-start-1">
                <label htmlFor={`estimated-size-${m.id}`} className="block text-xs"><span className="sr-only">Visually estimated DW (m) — optional</span><span aria-hidden="true">Visual DW (m)</span></label>
                <input id={`estimated-size-${m.id}`} type="number" min="0" step="any" placeholder="optional" value={m.estimatedSize ?? ""}
                  className="mt-1 min-h-11 w-24 max-w-full rounded border px-2 text-sm lg:min-h-8" onChange={e => setMantas(previous => previous.map(candidate =>
                    candidate.id === m.id ? { ...candidate, estimatedSize: e.target.value || null } : candidate))} />
                <p className="mt-0.5 text-[10px] text-slate-600">Visual estimate only</p>
              </div>
            </div>
            {allowBiopsyEntry && (
              <div className="px-6 pb-3">
                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(biopsy?.collected)}
                    onChange={(event) => {
                      setMantas((current) => current.map((candidate) =>
                        String(candidate.id) === String(m.id)
                          ? {
                              ...candidate,
                              biopsy: event.target.checked
                                ? newOrganicBiopsy(sightingDate)
                                : null,
                            }
                          : candidate
                      ));
                    }}
                  />
                  Biopsy collected for {tempName(m)}
                </label>
                {biopsy?.collected && (
                  <details className="mt-2 rounded border bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-medium text-slate-700">
                      Biopsy details — {tempName(m)}
                    </summary>
                    <div className="mt-3 grid gap-3 md:grid-cols-4">
                      <label className="text-xs text-slate-600">Sample date
                        <input type="date" required value={biopsy.sampleDate} onChange={(e) => updateBiopsy({ sampleDate: e.target.value })} className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm" />
                      </label>
                      <label className="text-xs text-slate-600">Sample time
                        <input type="time" value={biopsy.sampleTime ?? ""} onChange={(e) => updateBiopsy({ sampleTime: e.target.value })} className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm" />
                      </label>
                      <label className="text-xs text-slate-600">Collector
                        <input required value={biopsy.collector} onChange={(e) => updateBiopsy({ collector: e.target.value })} className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm" />
                      </label>
                      <label className="text-xs text-slate-600">Collection method
                        <input required value={biopsy.method} onChange={(e) => updateBiopsy({ method: e.target.value })} className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm" />
                      </label>
                      <label className="text-xs text-slate-600">Tissue type
                        <input required value={biopsy.tissueType} onChange={(e) => updateBiopsy({ tissueType: e.target.value })} className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm" />
                      </label>
                      <label className="text-xs text-slate-600">Sample ID
                        <input value={biopsy.sampleId ?? ""} onChange={(e) => updateBiopsy({ sampleId: e.target.value })} className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm" />
                      </label>
                      <label className="text-xs text-slate-600">Lab ID
                        <input value={biopsy.labId ?? ""} onChange={(e) => updateBiopsy({ labId: e.target.value })} className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-sm" />
                      </label>
                      <label className="text-xs text-slate-600 md:col-span-4">Biopsy notes
                        <textarea value={biopsy.notes ?? ""} onChange={(e) => updateBiopsy({ notes: e.target.value })} className="mt-1 min-h-16 w-full rounded border bg-white px-2 py-1.5 text-sm" />
                      </label>
                    </div>
                  </details>
                )}
              </div>
            )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
