import { MantaImage } from "@/features/photos/MantaImage";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import type { Contribution } from './contributions';
import { detailFields, loadContributionCatalog, loadContributionDetail, loadContributionPhotos, type CatalogLink } from './contributionDetails';

export type ContributionModal = { kind: 'photos' | 'more'; row: Contribution } | { kind: 'catalog'; id: number } | { kind: 'catalog-list'; links: CatalogLink[] };
const text = (value: unknown) => Array.isArray(value) ? value.join(', ') : String(value ?? '—');
export function ReadOnlyFields({ fields }: { fields: [string, unknown][] }) {
  return <dl className="grid grid-cols-[minmax(6rem,1fr)_minmax(0,3fr)] gap-x-3 gap-y-2 text-sm">
    {fields.filter(([,v]) => v != null && v !== '').map(([label,value]) => <div key={label} className="contents"><dt className="text-slate-500">{label}</dt><dd className="min-w-0 break-words whitespace-pre-wrap">{text(value)}</dd></div>)}
  </dl>;
}
function Photo({ url, name, heic }: { url?: string; name: string; heic?: boolean }) {
  const [failed,setFailed] = useState(false);
  return !url || heic || failed ? <div className="h-52 bg-slate-100 grid place-items-center text-sm text-slate-600">{heic ? 'HEIC photo — preview unavailable' : 'Image unavailable'}</div>
    : <MantaImage src={url} alt={name} loading="lazy" className="w-full h-52 object-contain bg-white" onError={() => setFailed(true)} />;
}
export default function ContributionModals({ selection, userId, onClose, onCatalog }: { selection: ContributionModal; userId: string; onClose: () => void; onCatalog: (id: number) => void }) {
  const q = useQuery({
    queryKey: ['contribution-detail',userId,selection.kind,selection.kind === 'catalog' ? selection.id : 'row' in selection ? selection.row.key : 'list'],
    queryFn: async () => {
      if (selection.kind === 'photos') return { photos: await loadContributionPhotos(supabase,userId,selection.row) };
      if (selection.kind === 'more') return { detail: await loadContributionDetail(supabase,userId,selection.row) };
      if (selection.kind === 'catalog') return { catalog: await loadContributionCatalog(supabase,selection.id) };
      return {};
    }, enabled: selection.kind !== 'catalog-list', gcTime: 0,
  });
  const title = selection.kind === 'photos' ? 'Contribution photos' : selection.kind === 'more' ? selection.row.source === 'historical' ? 'Historical sighting record' : 'Stored submission' : 'Catalog individuals';
  const detail = q.data?.detail;
  const catalog = q.data?.catalog;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="w-[calc(100%-2rem)] max-w-4xl max-h-[85dvh] overflow-y-auto">
    <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
    {selection.kind === 'catalog-list' ? <ul className="space-y-2">{selection.links.map((c,i) => <li key={i}>{c.id ? <button className="py-2 text-sky-700 underline" onClick={() => onCatalog(c.id!)}>{c.label}: {c.name || c.id}</button> : c.label}</li>)}</ul>
      : q.isPending ? <p role="status">Loading…</p> : q.isError ? <div role="alert">Unable to load this record. <button className="underline" onClick={() => void q.refetch()}>Try again</button></div> : <>
        {q.data?.photos && (q.data.photos.length ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{q.data.photos.map((p,i) => <figure key={`${p.url}-${i}`} className="border rounded overflow-hidden"><Photo url={p.url} name={p.name} heic={p.heic} /><figcaption className="p-2 text-xs break-words">{p.name}<br />View: {p.view}{p.bestVentral && ' · Best ventral'}{p.bestDorsal && ' · Best dorsal'}</figcaption></figure>)}</div> : <p>No photos attached.</p>)}
        {selection.kind === 'more' && detail && <div className="space-y-4">
          <p className="text-sm font-medium">Status: {selection.row.status}</p>
          <ReadOnlyFields fields={detailFields(detail,selection.row.source)} />
          {selection.row.source === 'submission' && Array.isArray(detail.payload?.mantas) && <section className="space-y-3"><h3 className="font-medium">Mantas</h3>{detail.payload.mantas.map((m: any,i: number) => <div key={m.id || i} className="border rounded p-3"><ReadOnlyFields fields={[
            ['Proposed name',m.name],['Gender',m.gender],['Age class',m.ageClass],['Mean size (m)',m.size],['Photos',Array.isArray(m.photos) ? m.photos.length : 0],
            ['Catalog decision',m.noMatch === true ? 'New individual' : m.matchedCatalogId ? `Match: ${m.matchedCatalogId}` : 'Pending decision'],['Biopsy',m.biopsy ? 'Recorded in submission' : null],
          ]} /></div>)}</section>}
        </div>}
        {catalog && <div className="grid sm:grid-cols-2 gap-4"><Photo url={catalog.image} name={catalog.name || 'Catalog manta'} /><ReadOnlyFields fields={[
          ['Name',catalog.name],['Catalog ID',catalog.pk_catalog_id],['Species',catalog.species],['Gender',catalog.gender],['Age class',catalog.age_class],['Population',catalog.populations],['Islands',catalog.islands],['First sighting',catalog.first_sighting],['Last sighting',catalog.last_sighting],['Total sightings',catalog.total_sightings],['Last size (m)',catalog.last_size_m],
        ]} /></div>}
      </>}
  </DialogContent></Dialog>;
}
