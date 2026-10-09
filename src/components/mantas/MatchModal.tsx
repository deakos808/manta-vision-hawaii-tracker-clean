import { speciesLabel } from "@/features/sightings/catalogSpecies";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import CatalogFilterBox, { type FiltersState } from '@/components/catalog/CatalogFilterBox';
import { useRankedCatalogMatch } from '@/features/matching/rankedMatchWorkflow';

function normStr(v?: string | null): string {
  return (v ?? "").toString().normalize("NFC").trim().toLowerCase();
}

function arrHas(active: string[], arr?: (string | null)[] | null, single?: string | null) {
  if (active.length === 0) return true;
  const want = active.map(normStr);
  if (arr && arr.length) {
    const hay = arr.map(normStr);
    return hay.some(x => x && want.includes(x));
  }
  if (single) return want.includes(normStr(single));
  return false;
}



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
  populations?: string[] | null;
  islands?: string[] | null;
  locations?: string[] | null;
};

type Meta = { species?: string|null; name?: string|null; gender?: string|null; ageClass?: string|null; meanSize?: number|null };

interface Props {
  open: boolean;
  onClose: () => void;
  tempUrl?: string | null;
  aMeta?: Meta;
  onChoose?: (catalogId: number) => void;
  onNoMatch?: () => void;
  rankedEnabled?: boolean;
}

const EMPTY_FILTERS: FiltersState = {
  population: [],
  island: [],
  sitelocation: [],
  gender: [],
  age_class: [],
  species: [],
  mprf: [],
};

function imgFromRow(r?: CatalogRow): string {
  if (!r) return '/manta-logo.svg';
  return r.best_catalog_ventral_thumb_url || r.best_catalog_ventral_path || r.thumbnail_url || '/manta-logo.svg';
}


const IMAGE_FRAME = "w-full h-[min(56vh,560px)] min-h-[260px] rounded bg-gray-50 grid place-items-center overflow-hidden";
// Ranked suggestions remain preserved for the separate matcher-compatibility
// reconciliation. Keep production on the proven manual catalog workflow until
// the 768/1024-dimensional contract is resolved with evidence.
const RANKED_MATCHING_AVAILABLE = false;

const MatchModal: React.FC<Props> = ({
  open,
  onClose,
  tempUrl,
  aMeta,
  onChoose,
  onNoMatch,
  rankedEnabled = true,
}) => {
  const [mode, setMode] = useState<'suggested' | 'manual'>('manual');
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const actionLockRef = useRef(false);
  useEffect(() => {
    if (open) {
      setMode('manual');
      setCleanupError(null);
    }
  }, [open, tempUrl]);

  const rankedIntegrationAvailable = rankedEnabled && RANKED_MATCHING_AVAILABLE;
  const ranked = useRankedCatalogMatch(open && rankedIntegrationAvailable, tempUrl);

  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [idx, setIdx] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const catalogViewerRef = useRef<HTMLDivElement>(null);
  // Jump to provided start catalog id (set via window.__matchStartCatalogId) when rows are ready.
  useEffect(() => {
    try {
      if (!open) return;
      const start = (typeof window !== 'undefined' && (window as any).__matchStartCatalogId) ?? null;
      if (start == null) return;
      const target = Number(start);
      if (!Number.isFinite(target)) return;
      const list: any[] = Array.isArray(rows) ? rows : [];
      const keys = ['pk_catalog_id','pk_catalog','catalog_id','id'] as const;
      const pos = list.findIndex((r:any) => keys.some(k => Number((r||{})[k]) === target));
      if (pos >= 0) setIdx(pos);
    } catch {}
  }, [open, rows]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from('catalog_with_photo_view').select('*');
      if (!cancelled) {
        if (error) setRows([]);
        else setRows((data as unknown as CatalogRow[]) ?? []);
        setLoading(false);
        setIdx(0);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const base = rows.filter((c) => {
  const nm = normStr(c.name);
  const byText = (nm ? nm.includes(s) : false) || String(c.pk_catalog_id).includes(s);

  const byFilters =
    arrHas(filters.population, c.populations ?? null, c.population ?? null) &&
    arrHas(filters.island,     c.islands     ?? null, c.island     ?? null) &&
    arrHas(filters.sitelocation, c.locations ?? null, c.sitelocation ?? null) &&
    arrHas(filters.gender,    null, c.gender ?? null) &&
    arrHas(filters.age_class, null, c.age_class ?? null);

  const speciesOk = filters.species.length === 0 ||
    (c.species ? filters.species.map(normStr).includes(normStr(c.species)) : false);

  return byText && byFilters && speciesOk;
});
return base.sort((a, b) => a.pk_catalog_id - b.pk_catalog_id);
}, [rows, search, filters]);useEffect(() => {
    setIdx((i) => (filtered.length ? Math.min(i, filtered.length - 1) : 0));
  }, [filtered.length]);

  const previousCandidate = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const nextCandidate = useCallback(() => setIdx((i) => Math.max(0, Math.min(filtered.length - 1, i + 1))), [filtered.length]);

  useEffect(() => {
    if (!open || mode !== 'manual') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
      const focus = document.activeElement;
      // Portalled filter menus and controls outside this dialog own their keys.
      if (focus && focus !== document.body && (
        !dialogRef.current?.contains(focus) ||
        focus.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"]), [aria-label="Catalog search and filters"]')
      )) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        if (event.key === 'ArrowLeft') previousCandidate();
        else nextCandidate();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, mode, previousCandidate, nextCandidate]);

  useEffect(() => {
    const viewer = catalogViewerRef.current;
    if (!open || mode !== 'manual' || !viewer) return;
    let distance = 0;
    let lastEvent = -Infinity;
    let advanced = false;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      // Consume horizontal gestures only; vertical scrolling remains native.
      event.preventDefault();
      const now = performance.now();
      if (now - lastEvent > 220) { distance = 0; advanced = false; }
      lastEvent = now;
      if (advanced) return; // Includes momentum until the gesture becomes idle.
      const pixels = event.deltaX * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewer.clientWidth : 1);
      distance += pixels;
      if (Math.abs(distance) < 45) return;
      advanced = true;
      if (distance > 0) nextCandidate();
      else previousCandidate();
    };
    viewer.addEventListener('wheel', onWheel, { passive: false });
    return () => viewer.removeEventListener('wheel', onWheel);
  }, [open, mode, previousCandidate, nextCandidate]);

  async function cleanupBefore(action: () => void) {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setActionBusy(true);
    setCleanupError(null);
    try {
      if (!(await ranked.cleanup())) {
        setCleanupError('Temporary matching data could not be removed. Please try again.');
        return;
      }
      action();
    } finally {
      actionLockRef.current = false;
      setActionBusy(false);
    }
  }

  const closeModal = () => void cleanupBefore(onClose);
  const browseManually = () => void cleanupBefore(() => setMode('manual'));
  const chooseMatch = (catalogId: number | string) => {
    const numericId = Number(catalogId);
    if (!Number.isFinite(numericId)) return;
    void cleanupBefore(() => {
      onChoose?.(numericId);
      onClose();
    });
  };
  const chooseNoMatch = () => void cleanupBefore(() => {
    onNoMatch?.();
    onClose();
  });

  if (!open) return null;
  const current = filtered[idx];
  const progressText = ranked.progress === 'preparing'
    ? 'Preparing selected photo…'
    : ranked.progress === 'uploading'
      ? 'Uploading a temporary derivative…'
      : ranked.progress === 'embedding'
        ? 'Generating the photo embedding…'
        : ranked.progress === 'matching'
          ? 'Ranking catalog candidates…'
          : 'Loading suggested matches…';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-black/50" onClick={closeModal} />
      <div
        className="relative bg-white w-[min(1600px,96vw)] max-h-[92vh] rounded shadow overflow-hidden"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="find-match-title"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div id="find-match-title" className="text-lg font-semibold">Find Catalog Match</div>
          <button type="button" className="h-8 w-8 grid place-items-center rounded hover:bg-gray-100 disabled:opacity-50" onClick={closeModal} disabled={actionBusy} aria-label="Close match dialog">×</button>
        </div>

        {rankedIntegrationAvailable && <div className="px-4 pt-3" role="tablist" aria-label="Catalog match method">
          <div className="inline-flex rounded border p-1 gap-1">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'suggested'}
              className={`px-3 py-2 rounded text-sm ${mode === 'suggested' ? 'bg-sky-600 text-white' : 'hover:bg-slate-100'}`}
              onClick={() => setMode('suggested')}
            >
              Suggested Matches
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'manual'}
              className={`px-3 py-2 rounded text-sm ${mode === 'manual' ? 'bg-sky-600 text-white' : 'hover:bg-slate-100'}`}
              onClick={browseManually}
              disabled={actionBusy}
            >
              Browse Catalog Manually
            </button>
          </div>
        </div>}

        {(cleanupError || !rankedEnabled) && (
          <div role="alert" className="mx-4 mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {cleanupError || 'Find Match is available only to active signed-in users.'}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(200px,1fr)] gap-3 p-3 max-h-[calc(92vh-112px)] overflow-auto">
          <div className="min-w-0 border rounded p-3 bg-white">
            <div className="text-sm font-medium mb-2">Submitted photo</div>
            <div className={IMAGE_FRAME}>
              <img
                src={tempUrl || '/manta-logo.svg'}
                alt="Submitted manta photo"
                className="w-full h-full min-h-0 object-contain"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/manta-logo.svg'; }}
              />
            </div>
            <div className="mt-3 text-xs text-gray-600 space-y-1">
              <div>Proposed name: {aMeta?.name ?? '—'}</div>
              <div>Proposed species: {speciesLabel(aMeta?.species)}</div>
              <div>Gender: {aMeta?.gender ?? '—'}</div>
              <div>Age class: {aMeta?.ageClass ?? '—'}</div>
              {aMeta?.meanSize != null && <div>Mean size: {aMeta.meanSize} m</div>}
            </div>
          </div>

          {rankedIntegrationAvailable && mode === 'suggested' ? (
            <div className="border rounded p-3 bg-white flex flex-col min-h-[520px]" role="tabpanel">
              <div className="flex items-center justify-between gap-3 border-b pb-3">
                <div>
                  <h2 className="font-semibold">Suggested Matches</h2>
                  <p className="text-xs text-slate-600">Select a candidate explicitly, or browse the full catalog.</p>
                </div>
                <button type="button" className="px-3 py-2 rounded border text-sm" onClick={browseManually} disabled={actionBusy}>
                  Browse Catalog Manually
                </button>
              </div>

              {ranked.loading && (
                <div role="status" aria-live="polite" className="py-8 text-center text-sky-700">
                  {progressText}
                </div>
              )}

              {ranked.error && (
                <div className="py-5 space-y-3">
                  <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{ranked.error}</p>
                  <button type="button" className="px-3 py-2 rounded bg-sky-600 text-white text-sm" onClick={browseManually} disabled={actionBusy}>
                    Browse Catalog Manually
                  </button>
                </div>
              )}

              {!ranked.loading && !ranked.error && ranked.matches.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-600">No suggested matches were returned.</p>
              )}

              {!ranked.loading && !ranked.error && ranked.matches.length > 0 && (
                <div className="mt-3 space-y-3 overflow-auto" aria-label="Ranked catalog candidates">
                  {ranked.matches.map((candidate, rank) => (
                    <article key={`${candidate.catalog_id}-${rank}`} className="flex gap-3 rounded border p-3">
                      <img
                        src={candidate.thumb_url || '/manta-logo.svg'}
                        alt={candidate.name || `Catalog ${candidate.catalog_id}`}
                        className="h-24 w-24 rounded border object-cover"
                        referrerPolicy="no-referrer"
                        onError={(event) => { event.currentTarget.src = '/manta-logo.svg'; }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{rank + 1}. {candidate.name || `Catalog ${candidate.catalog_id}`}</div>
                        <div className="text-sm text-slate-600">Catalog {candidate.catalog_id}</div>
                        <div className="text-sm text-slate-600">Match score: {Number(candidate.score).toFixed(4)}</div>
                      </div>
                      <button
                        type="button"
                        className="self-center px-3 py-2 rounded bg-sky-600 text-white text-sm disabled:opacity-50"
                        onClick={() => chooseMatch(candidate.catalog_id)}
                        disabled={actionBusy}
                      >
                        Select match
                      </button>
                    </article>
                  ))}
                </div>
              )}

              <div className="mt-auto pt-3 border-t flex justify-end">
                <button type="button" className="px-3 py-2 rounded border text-sm disabled:opacity-50" onClick={chooseNoMatch} disabled={actionBusy}>
                  No Matches Found – New Individual
                </button>
              </div>
            </div>
          ) : (
          <div className="min-w-0 border rounded p-3 bg-white flex flex-col" role="tabpanel">
            <div className="text-sm font-medium mb-2">Catalog photo</div>
            <div className="text-xs text-gray-600 mb-2">Catalog species: {speciesLabel(current?.species)}</div>
            <div ref={catalogViewerRef} className={IMAGE_FRAME}>
              <img
                src={imgFromRow(current)}
                alt={current?.name ?? 'catalog'}
                className="w-full h-full min-h-0 object-contain"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/manta-logo.svg'; }}
              />
            </div>

            <div className="flex gap-2 overflow-x-auto py-2 mt-2" aria-label="Catalog candidates" tabIndex={0}>
              {filtered.map((candidate, candidateIndex) => (
                <button key={candidate.pk_catalog_id} type="button"
                  aria-label={`Catalog ${candidate.pk_catalog_id}${candidate.name ? `: ${candidate.name}` : ''}`}
                  aria-pressed={candidateIndex === idx}
                  onClick={() => setIdx(candidateIndex)}
                  className={`shrink-0 w-20 rounded border-2 p-1 text-xs ${candidateIndex === idx ? 'border-sky-600 bg-sky-50' : 'border-transparent bg-gray-50 hover:border-gray-300'}`}>
                  <img src={imgFromRow(candidate)} alt="" loading="lazy" className="h-16 w-full object-contain" referrerPolicy="no-referrer"
                    onError={(event) => { event.currentTarget.src = '/manta-logo.svg'; }} />
                  {candidate.pk_catalog_id}
                </button>
              ))}
            </div>
            <div className="text-xs text-gray-500" role="status">{filtered.length ? `${idx + 1} of ${filtered.length} candidates` : loading ? 'Loading…' : '0 candidates'}</div>
            <div className="mt-3 text-xs text-gray-700 min-h-[40px]">
              {current ? (
                <div>
                  <div>Catalog {current.pk_catalog_id}{current.name ? `: ${current.name}` : ''}</div>
                  <div>{current.gender || '—'} · {current.age_class || '—'}</div>
                  <div>{current.locations?.join(', ') || current.sitelocation || current.populations?.join(', ') || current.population || ''}</div>
                </div>
              ) : (
                <div className="text-gray-500">{loading ? 'Loading…' : 'No records.'}</div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t flex flex-wrap gap-3 items-center justify-between">
              <div className="flex flex-wrap gap-2">
                <button type="button" className="px-3 py-1 rounded border text-sm disabled:opacity-50" onClick={previousCandidate} disabled={idx <= 0 || !filtered.length}>Prev</button>
                <button type="button" className="px-3 py-1 rounded border text-sm disabled:opacity-50" onClick={nextCandidate} disabled={idx >= filtered.length - 1 || !filtered.length}>Next</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50" disabled={!current || actionBusy} onClick={() => current && chooseMatch(current.pk_catalog_id)}>This is a match</button>
                <button type="button" className="px-3 py-1 rounded border text-sm disabled:opacity-50" onClick={chooseNoMatch} disabled={actionBusy}>No Match / New Individual</button>
              </div>
            </div>
          </div>
          )}
          <aside className="min-w-0 border rounded p-3" aria-label="Catalog search and filters">
            <input className="border rounded px-3 py-2 text-sm w-full mb-3"
              aria-label="Search Catalog ID or name" placeholder="Search Catalog ID or name"
              value={search} onChange={(event) => { setSearch(event.target.value); setIdx(0); }} />
            <CatalogFilterBox compact catalog={rows} filters={filters}
              setFilters={(next) => { setFilters(next); setIdx(0); }}
              onClearAll={() => { setSearch(''); setFilters(EMPTY_FILTERS); setIdx(0); }} />
          </aside>
        </div>
      </div>
    </div>
  );
};

export default MatchModal;
