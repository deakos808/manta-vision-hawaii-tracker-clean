
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import CatalogFilterBox, { type FiltersState } from '@/components/catalog/CatalogFilterBox';

type CatalogRow = {
  pk_catalog_id: number;
  name: string | null;
  species?: string | null;
  gender?: string | null;
  age_class?: string | null;
  population?: string | null;
  island?: string | null;
  sitelocation?: string | null;
  best_catalog_ventral_thumb_url?: string | null;
  best_catalog_ventral_path?: string | null;
  thumbnail_url?: string | null;
};

type Meta = { name?: string|null; gender?: string|null; ageClass?: string|null; meanSize?: number|null };

interface Props {
  open: boolean;
  onClose: () => void;
  tempUrl?: string | null;     /* <- reference (best ventral) image URL passed in */
  aMeta?: Meta;
  onChoose?: (catalogId: number) => void;
  onNoMatch?: () => void;
}

const EMPTY_FILTERS: FiltersState = {
  population: [],
  island: [],
  sitelocation: [],
  gender: [],
  age_class: [],
  species: [],
};

function imgFromRow(r?: CatalogRow): string {
  if (!r) return '/manta-logo.svg';
  return r.best_catalog_ventral_thumb_url || r.best_catalog_ventral_path || r.thumbnail_url || '/manta-logo.svg';
const MatchModal: React.FC<Props> = ({ open, onClose, tempUrl, aMeta, onChoose, onNoMatch }) => {
  const [leftSrc, setLeftSrc] = useState<string | null>(tempUrl ?? null);
  useEffect(() => { if (open) { if (tempUrl) setLeftSrc(tempUrl); } else { setLeftSrc(null); } }, [open, tempUrl]);
/* helpful debug so we know what we're rendering on the left */
  useEffect(() => { if (open) console.log('[MatchModal] tempUrl for left image:', tempUrl); }, [open, tempUrl]);

  const safeClose = () => { try { if (typeof onClose === 'function') onClose(); } catch (e) { console.warn('[MatchModal] onClose error', e); } };

  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [sortAsc, setSortAsc] = useState(true);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from('catalog_with_photo_view').select('*');
      if (!cancelled) {
        if (error) { console.error('[MatchModal] load', error); setRows([]); }
        else setRows((data as unknown as CatalogRow[]) ?? []);
        setLoading(false);
        setIdx(0);
    })();
    return () => { cancelled = true; };
  }, [open]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const matchesList = (list: string[], v?: string | null) => list.length === 0 || (v ? list.includes(v) : false);
    const base = rows.filter((c) => {
      const byText = (c.name ? c.name.toLowerCase().includes(s) : false) || String(c.pk_catalog_id).includes(s);
      const byFilters =
        matchesList(filters.population, c.population ?? undefined) &&
        matchesList(filters.island, c.island ?? undefined) &&
        matchesList(filters.sitelocation, c.sitelocation ?? undefined) &&
        matchesList(filters.gender, c.gender ?? undefined) &&
        matchesList(filters.age_class, c.age_class ?? undefined);
      const speciesOk = filters.species.length === 0 || (c.species ? filters.species.includes(c.species) : false);
      return byText && byFilters && speciesOk;
    });
    return base.sort((a, b) => (sortAsc ? a.pk_catalog_id - b.pk_catalog_id : b.pk_catalog_id - a.pk_catalog_id));
  }, [rows, search, filters, sortAsc]);

  useEffect(() => { setIdx((i) => (filtered.length ? Math.min(i, filtered.length - 1) : 0)); }, [filtered.length]);

  if (!open) return null;
  const current = filtered[idx];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={safeClose} />
      <div className="relative bg-white w-[min(1200px,96vw)] max-h-[92vh] rounded shadow overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="text-lg font-semibold">Find Catalog Match</div>
          <button className="h-8 w-8 grid place-items-center rounded hover:bg-gray-100" onClick={safeClose} aria-label="Close">×</button>
        </div>

        <div className="p-3 overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* left: reference image */}
            <div className="border rounded p-3 bg-white">
              <div className="text-sm font-medium mb-2">Best ventral (temp)</div>
              <div className="w-full h-[420px] grid place-items-center bg-gray-50 rounded">
  <img
  src={leftSrc || "/manta-logo.svg"}
  alt="temp"
  className="max-w-full max-h-full object-contain"
  referrerPolicy="no-referrer"
  crossOrigin="anonymous"
  onError={(e) => {
    console.warn('[MatchModal] left image failed to load:', leftSrc);
    (e.currentTarget as HTMLImageElement).src = '/manta-logo.svg';
  }}
</div>
              <div className="mt-3 text-xs text-gray-600 space-y-1">
                <div>Temp name: {aMeta?.name ?? '—'}</div>
                <div>Gender: {aMeta?.gender ?? '—'}</div>
                <div>Age class: {aMeta?.ageClass ?? '—'}</div>
                <div>Mean size: {aMeta?.meanSize != null ? `${aMeta.meanSize} cm` : '—'}</div>
              </div>
            </div>

            {/* right: catalog candidate */}
            <div className="border rounded p-3 bg-white flex flex-col">
              <div className="flex flex-col gap-2 mb-2">
                <input
                  className="border rounded px-3 py-2 text-sm"
                  placeholder="Search by Catalog ID or name..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setIdx(0); }}
                <CatalogFilterBox
                  catalog={rows}
                  filters={filters}
                  setFilters={(f) => { setFilters(f); setIdx(0); }}
                  sortAsc={sortAsc}
                  setSortAsc={setSortAsc}
                  onClearAll={() => { setSearch(''); setFilters(EMPTY_FILTERS); setSortAsc(true); setIdx(0); }}
                <div className="text-xs text-gray-600">
                  {filtered.length ? `${idx + 1} of ${filtered.length} total` : '0 of 0 total'}
                </div>
              </div>

              <div className="w-full h-[420px] grid place-items-center bg-gray-50 rounded">
                <img
                  src={imgFromRow(current)}
                  alt={current?.name ?? 'catalog'}
                  className="max-w-full max-h-full object-contain"
                  referrerPolicy="no-referrer"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/manta-logo.svg'; }}
              </div>

              <div className="mt-3 text-xs text-gray-700 min-h-[40px]">
                {current ? (
                  <div>
                    <div>Catalog {current.pk_catalog_id}{current.name ? `: ${current.name}` : ''}</div>
                    <div>{current.species || '—'} · {current.gender || '—'} · {current.age_class || '—'}</div>
                  </div>
                ) : (
                  <div className="text-gray-500">{loading ? 'Loading…' : 'No records.'}</div>
                )}
              </div>

              <div className="mt-auto pt-3 border-t flex items-center justify-between">
                <div className="flex gap-2">
                  <button className="px-3 py-1 rounded border text-sm disabled:opacity-50" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx <= 0 || !filtered.length}>Prev</button>
                  <button className="px-3 py-1 rounded border text-sm disabled:opacity-50" onClick={() => setIdx((i) => Math.min(filtered.length - 1, i + 1))} disabled={idx >= filtered.length - 1 || !filtered.length}>Next</button>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50" disabled={!current} onClick={() => { if (current && onChoose) onChoose(current.pk_catalog_id); safeClose(); }}>This Matches</button>
                  <button className="px-3 py-1 rounded border text-sm" onClick={() => { if (onNoMatch) onNoMatch(); safeClose(); }}>No Matches Found</button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
export default MatchModal;
