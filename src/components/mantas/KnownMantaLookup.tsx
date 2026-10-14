import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MantaImage } from '@/features/photos/MantaImage';
import { speciesLabel } from '@/features/sightings/catalogSpecies';
import { catalogTextMatches, type CatalogIdentity } from '@/features/sightings/knownIdentification';

export default function KnownMantaLookup({ onClose, onConfirm, initialEvidence = '' }: {
  onClose: () => void;
  onConfirm: (row: CatalogIdentity, evidence: string) => void;
  initialEvidence?: string;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus();
  }, []);
  const [rows, setRows] = useState<CatalogIdentity[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CatalogIdentity | null>(null);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from('catalog_with_photo_view')
        .select('pk_catalog_id,name,species,best_catalog_ventral_path,best_catalog_ventral_thumb_url');
      if (!cancelled) { setRows(data ?? []); setError(!!error); setLoading(false); }
    })().catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);
  const results = search.trim() ? rows.filter(row => catalogTextMatches(row, search))
    .sort((a, b) => a.pk_catalog_id - b.pk_catalog_id) : [];
  return <div className="fixed inset-0 z-[400000] bg-black/50 flex items-center justify-center p-3">
    <section ref={dialog} onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }} role="dialog" aria-modal="true" aria-labelledby="known-manta-title" className="bg-white rounded-lg p-4 w-full max-w-xl max-h-[90dvh] overflow-y-auto">
      <div className="flex justify-between gap-3"><h3 id="known-manta-title" className="text-lg font-semibold">I know this manta</h3>
        <button type="button" onClick={onClose} aria-label="Close catalog lookup">Close</button></div>
      <p className="text-sm text-slate-600 my-2">Search the catalog when you already know the individual. HAMER reviews every proposed identification.</p>
      <label className="block text-sm">Catalog ID or manta name
        <input autoFocus className="block w-full border rounded p-2 mt-1" value={search}
          onChange={e => { setSearch(e.target.value); setSelected(null); }} placeholder="e.g., 733 or Left Spot" /></label>
      {loading && <p role="status">Loading catalog…</p>}
      {error && <p role="alert">Unable to load the catalog. Close and try again.</p>}
      {!loading && !error && search.trim() && !results.length && <p role="status">No matching catalog identities.</p>}
      <div className="my-3 max-h-64 overflow-y-auto space-y-2">
        {results.map(row => <button type="button" key={row.pk_catalog_id} aria-pressed={selected?.pk_catalog_id === row.pk_catalog_id}
          onClick={() => setSelected(row)} className={'w-full flex items-center gap-3 border rounded p-2 text-left ' + (selected?.pk_catalog_id === row.pk_catalog_id ? 'border-sky-600 bg-sky-50' : '')}>
          {(row.best_catalog_ventral_path || row.best_catalog_ventral_thumb_url) && <MantaImage className="w-20 h-16 object-contain" src={row.best_catalog_ventral_path || row.best_catalog_ventral_thumb_url!} alt="Catalog ventral pattern" />}
          <span><strong>{row.name || 'Unnamed manta'}</strong><span className="block">Catalog #{row.pk_catalog_id}</span><span className="block text-sm">{speciesLabel(row.species)}</span></span>
        </button>)}
      </div>
      <label className="block text-sm">How do you recognize this manta? <span className="text-slate-500">(optional)</span>
        <textarea className="block w-full border rounded p-2 mt-1" rows={3} value={evidence} onChange={e => setEvidence(e.target.value)} /></label>
      <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" className="border rounded px-3 py-2" onClick={onClose}>Cancel</button>
        <button type="button" disabled={!selected} className="bg-sky-700 text-white rounded px-3 py-2 disabled:opacity-50"
          onClick={() => { if (selected) onConfirm(selected, evidence); }}>Propose this identification</button></div>
    </section>
  </div>;
}
