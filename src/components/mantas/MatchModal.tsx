import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import CatalogFilterBox, { type FiltersState } from '@/components/catalog/CatalogFilterBox';

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
  mprf?: string | null;
};

type Meta = { name?: string|null; gender?: string|null; ageClass?: string|null; meanSize?: number|string|null };

type SortMode = "catalog" | "closest";

type MatcherCandidate = {
  rank: number;
  catalog_id: string;
  photo_id: string;
  final_score?: number;
  score?: number;
  coarse_score?: number;
  match_count?: number;
  pigment_iou?: number;
  median_reprojection_error?: number;
  tri_zone_matched_count?: number;
  tri_zone_coverage?: number;
  large_region_penalty?: number;
  query_important_region_coverage?: number;
  candidate_important_region_coverage?: number;
  regional_mean_coverage?: number;
  regional_imbalance?: number;
  orientation_normalized_regional_score?: number;
  orientation_match_mode?: string;
  regional_red_flags?: string[];
};

type MatcherResponse = {
  summary?: {
    query_path?: string;
    query_url?: string;
    query_region_count?: number;
    query_signature_usable?: boolean;
    query_signature_quality_flags?: string[];
    anchor_count?: number;
    prefilter_count?: number;
    ranked_catalog_count?: number;
  };
  top?: MatcherCandidate[];
};

type MatcherHealth = {
  ok?: boolean;
  anchor_load_status?: string;
  anchor_load_processed?: number;
  anchor_load_total?: number;
  anchor_load_current?: {
    catalog_id?: string;
    photo_id?: string;
  } | null;
  rank_status?: string;
  rank_processed?: number;
  rank_total?: number;
  rank_current?: {
    catalog_id?: string;
    photo_id?: string;
  } | null;
};

type MatcherJobResponse = {
  job_id?: string;
  status?: string;
  phase?: string;
  processed?: number;
  total?: number;
  current?: {
    catalog_id?: string;
    photo_id?: string;
  } | null;
  result?: MatcherResponse | null;
  error?: string;
};

type MatcherProgress = {
  label: string;
  processed: number;
  total: number;
};

interface Props {
  open: boolean;
  onClose: () => void;
  tempUrl?: string | null;
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
  mprf: [],
};

const MATCHER_API_BASE = String(
  import.meta.env.VITE_MATCHER_API_BASE || (import.meta.env.DEV ? "http://127.0.0.1:8766" : "")
).replace(/\/$/, "");

function imgFromRow(r?: CatalogRow): string {
  if (!r) return '/manta-logo.svg';
  return r.best_catalog_ventral_thumb_url || r.best_catalog_ventral_path || r.thumbnail_url || '/manta-logo.svg';
}


const TOOLBAR_H = 260;
const QUERY_IMAGE_H = 'min(340px, 32dvh)';
const CANDIDATE_IMAGE_H = 'min(220px, 22dvh)';

const MatchModal: React.FC<Props> = ({ open, onClose, tempUrl, aMeta, onChoose, onNoMatch }) => {
  const [leftSrc, setLeftSrc] = useState<string | null>(tempUrl ?? null);
  useEffect(() => {
    if (open) {
      if (tempUrl) setLeftSrc(tempUrl);
    } else {
      setLeftSrc(null);
    }
  }, [open, tempUrl]);

  const safeClose = () => { try { onClose(); } catch { /* noop */ } };

  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [sortAsc, setSortAsc] = useState(true);
  const [catalogSortField, setCatalogSortField] = useState<"catalog_id" | "first_sighting" | "last_sighting" | "last_size">("catalog_id");
  const [viewMode, setViewMode] = useState<"ventral" | "dorsal">("ventral");
  const [catalogIdPrefix, setCatalogIdPrefix] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("catalog");
  const [matcherLoading, setMatcherLoading] = useState(false);
  const [matcherMsg, setMatcherMsg] = useState("");
  const [matcherProgress, setMatcherProgress] = useState<MatcherProgress | null>(null);
  const [matcherResult, setMatcherResult] = useState<MatcherResponse | null>(null);
  const [candidateInfoOpen, setCandidateInfoOpen] = useState(false);
  const matcherRunIdRef = useRef(0);
  const [idx, setIdx] = useState(0);
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
    setCandidateInfoOpen(false);
  }, [idx, sortMode, matcherResult]);

  const filteredSummaryClean = useMemo(() => {
    const parts:string[]=[];
    if (filters.species.length) parts.push(filters.species.join(', '));
    if (filters.population.length) parts.push(filters.population.join(', '));
    if (filters.island.length) parts.push(filters.island.join(', '));
    if (filters.sitelocation.length) parts.push(filters.sitelocation.join(', '));
    if (filters.gender.length) parts.push(filters.gender.join(', '));
    if (filters.age_class.length) parts.push(filters.age_class.join(', '));
    if (!parts.length) return '';
    return parts.join(' • ');
  }, [filters]);
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

  useEffect(() => {
    if (!open) {
      matcherRunIdRef.current += 1;
      setMatcherLoading(false);
      return;
    }
    setSortMode("catalog");
    setMatcherLoading(false);
    setMatcherMsg("");
    setMatcherProgress(null);
    setMatcherResult(null);
  }, [open, tempUrl]);

  const matcherByCatalog = useMemo(() => {
    const map = new Map<number, MatcherCandidate>();
    for (const candidate of matcherResult?.top ?? []) {
      const catalogId = Number(candidate.catalog_id);
      if (Number.isFinite(catalogId)) map.set(catalogId, candidate);
    }
    return map;
  }, [matcherResult]);

  async function runClosestMatch() {
    if (!MATCHER_API_BASE) {
      setMatcherMsg("Experimental matcher is not configured for this deployment. Catalog browsing is unchanged.");
      return;
    }

    const queryUrl = String(tempUrl || "").trim();
    if (!queryUrl) {
      setMatcherMsg("No ventral best photo URL is available for matching.");
      return;
    }
    if (queryUrl.startsWith("blob:")) {
      setMatcherMsg("Save or use the uploaded photo URL before running the local matcher.");
      return;
    }

    setMatcherLoading(true);
    setMatcherMsg("Running experimental local matcher...");
    setMatcherProgress({ label: "Starting matcher", processed: 0, total: 1 });
    setMatcherResult(null);
    let progressTimer: ReturnType<typeof window.setInterval> | null = null;
    const updateProgress = (body: MatcherHealth | null) => {
      if (!body) return;
      const anchorProcessed = body.anchor_load_processed ?? 0;
      const anchorTotal = body.anchor_load_total ?? 0;
      if (body.anchor_load_status === "loading" && anchorTotal > 0) {
        const current = body.anchor_load_current;
        const currentLabel = current?.catalog_id
          ? ` Catalog ${current.catalog_id}${current.photo_id ? `, photo ${current.photo_id}` : ""}.`
          : "";
        setMatcherProgress({ label: "Loading matcher anchors", processed: anchorProcessed, total: anchorTotal });
        setMatcherMsg(`Loading matcher anchors ${anchorProcessed}/${anchorTotal}.${currentLabel}`);
        return;
      }

      const rankProcessed = body.rank_processed ?? 0;
      const rankTotal = body.rank_total ?? 0;
      if (body.rank_status === "scoring" && rankTotal > 0) {
        const current = body.rank_current;
        const currentLabel = current?.catalog_id
          ? ` Catalog ${current.catalog_id}${current.photo_id ? `, photo ${current.photo_id}` : ""}.`
          : "";
        setMatcherProgress({ label: "Scoring catalog candidates", processed: rankProcessed, total: rankTotal });
        setMatcherMsg(`Scoring catalog candidates ${rankProcessed}/${rankTotal}.${currentLabel}`);
        return;
      }

      if (body.anchor_load_status === "loaded" && !body.rank_status?.includes("scoring")) {
        setMatcherProgress((prev) => prev ?? { label: "Preparing catalog candidates", processed: 0, total: 1 });
      }
    };
    try {
      const health = await fetch(`${MATCHER_API_BASE}/health`);
      if (!health.ok) throw new Error(`health check failed with HTTP ${health.status}`);
      updateProgress((await health.json().catch(() => null)) as MatcherHealth | null);
      progressTimer = window.setInterval(() => {
        fetch(`${MATCHER_API_BASE}/health`)
          .then((res) => (res.ok ? res.json() : null))
          .then((body: MatcherHealth | null) => updateProgress(body))
          .catch(() => {});
      }, 3000);

      const res = await fetch(`${MATCHER_API_BASE}/rank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query_url: queryUrl,
          top_k: 100,
          prefilter_top_n: 90,
          zone_prefilter_top_n: 60,
          relaxed_prefilter_top_n: 180,
          coarse_score_weight: 0.2,
          coarse_bonus_cap: 8,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setMatcherResult(body as MatcherResponse);
      setSortMode("closest");
      setIdx(0);
      setMatcherProgress(null);
      setMatcherMsg(`Experimental matcher returned ${(body?.top ?? []).length} ranked catalog candidates. Use these as review suggestions, not an ID decision.`);
    } catch (e) {
      setSortMode("catalog");
      const message = String((e as Error)?.message || e);
      const offline =
        message === "Failed to fetch" ||
        message.includes("NetworkError") ||
        message.includes("Load failed");
      setMatcherMsg(
        offline
          ? "Local matcher worker is not running. Start it with: npm run dev:matcher-api. Catalog browsing is unchanged."
          : `Matcher unavailable: ${message}. Catalog browsing is unchanged.`
      );
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
      setMatcherLoading(false);
    }
  }

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
    arrHas(filters.age_class, null, c.age_class ?? null) &&
    arrHas(filters.mprf, null, c.mprf ?? null);

  const speciesOk = filters.species.length === 0 ||
    (c.species ? filters.species.map(normStr).includes(normStr(c.species)) : false);

  return byText && byFilters && speciesOk;
});
return base.sort((a, b) => {
  if (sortMode === "closest" && matcherByCatalog.size) {
    const ma = matcherByCatalog.get(a.pk_catalog_id);
    const mb = matcherByCatalog.get(b.pk_catalog_id);
    if (ma && mb) return ma.rank - mb.rank;
    if (ma) return -1;
    if (mb) return 1;
  }
  return sortAsc ? a.pk_catalog_id - b.pk_catalog_id : b.pk_catalog_id - a.pk_catalog_id;
});
  }, [rows, search, filters, sortAsc, sortMode, matcherByCatalog]);

  useEffect(() => {
    setIdx((i) => (filtered.length ? Math.min(i, filtered.length - 1) : 0));
  }, [filtered.length]);

  if (!open) return null;
  const current = filtered[idx];
  const currentMatch = current ? matcherByCatalog.get(current.pk_catalog_id) : null;
  const qualityFlags = matcherResult?.summary?.query_signature_quality_flags ?? [];
  const matcherStatusMessage = matcherMsg || (!MATCHER_API_BASE ? "Experimental matcher is not configured for this deployment." : "");
  const progressPct = matcherProgress && matcherProgress.total > 0
    ? Math.min(100, Math.max(0, Math.round((matcherProgress.processed / matcherProgress.total) * 100)))
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-black/50" onClick={(()=>{ try{ onClose && onClose(); }catch{} })} />
      <div className="relative flex h-[calc(100dvh-2rem)] w-[min(1280px,96vw)] flex-col overflow-hidden rounded bg-white shadow">
        <div className="flex flex-none items-center justify-between border-b px-4 py-3">
          <div className="text-lg font-semibold">Find Catalog Match</div>
          <button type="button" className="h-8 w-8 grid place-items-center rounded hover:bg-gray-100" onClick={(()=>{ try{ onClose && onClose(); }catch{} })} aria-label="Close">×</button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-3">
        <div className="grid h-full min-h-0 grid-cols-1 gap-3 md:grid-cols-2">
          <div className="min-h-0 overflow-y-auto rounded border bg-white p-3">
            <div className="text-sm font-medium mb-2">Photo to match</div>
            <div className="grid w-full place-items-center rounded bg-gray-50" style={{ height: QUERY_IMAGE_H }}>
              <img
                src={leftSrc || '/manta-logo.svg'}
                alt="Photo to match"
                className="max-w-full max-h-full object-contain"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/manta-logo.svg'; }}
              />
            </div>
            <div className="mt-3 text-xs text-gray-600 space-y-1">
              <div>Temp name: {aMeta?.name ?? '—'}</div>
              <div>Gender: {aMeta?.gender ?? '—'}</div>
              <div>Age class: {aMeta?.ageClass ?? '—'}</div>
              <div>Mean size: {aMeta?.meanSize != null ? `${aMeta.meanSize} cm` : '—'}</div>
            </div>
          </div>

              <div className="flex min-h-0 flex-col overflow-hidden rounded border bg-white p-3">
            <div className="flex-none overflow-y-auto pr-1" style={{ maxHeight: TOOLBAR_H }}>
              <input
                className="border rounded px-3 py-2 text-sm w-full mb-2"
                placeholder="Search by Catalog ID or name…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setIdx(0); }}
              />
              <div className="mb-2 rounded-md border border-sky-100 bg-sky-50 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={`rounded border px-3 py-1 text-xs ${sortMode === "catalog" ? "border-slate-700 bg-white text-slate-900" : "bg-white text-slate-700"}`}
                    onClick={() => { setSortMode("catalog"); setIdx(0); }}
                  >
                    Catalog ID order
                  </button>
                  <button
                    type="button"
                    className={`rounded border px-3 py-1 text-xs font-medium ${sortMode === "closest" ? "border-sky-700 bg-sky-700 text-white" : "border-sky-300 bg-white text-sky-800"} disabled:opacity-50`}
                    onClick={() => { if (matcherResult) { setSortMode("closest"); setIdx(0); } else void runClosestMatch(); }}
                    disabled={matcherLoading || !tempUrl || !MATCHER_API_BASE}
                  >
                    {matcherLoading ? "Matching..." : matcherResult ? "Experimental score order" : "Run Experimental Match"}
                  </button>
                </div>
                <div className="mt-2 text-[11px] leading-snug text-sky-900">
                  Experimental suggestions can reduce scrolling, but they are not authoritative. Confirm the image visually before choosing a catalog match.
                </div>
                {matcherStatusMessage ? (
                  <div className={`mt-2 rounded border px-2 py-1 text-xs ${matcherResult ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                    {matcherStatusMessage}
                    {matcherLoading && matcherProgress ? (
                      <div className="mt-2">
                        <div className="mb-1 flex items-center justify-between text-[11px]">
                          <span>{matcherProgress.label}</span>
                          <span>{matcherProgress.processed}/{matcherProgress.total} · {progressPct}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-amber-100">
                          <div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${progressPct}%` }} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="scale-[0.95] origin-top-left"><CatalogFilterBox
                catalog={rows}
                filters={filters}
                setFilters={(f) => { setFilters(f); setIdx(0); }}
                sortField={catalogSortField}
                setSortField={setCatalogSortField}
                sortAsc={sortAsc}
                setSortAsc={setSortAsc}
                viewMode={viewMode}
                setViewMode={setViewMode}
                catalogIdPrefix={catalogIdPrefix}
                setCatalogIdPrefix={setCatalogIdPrefix}
                onOpenStats={() => {}}
                onClearAll={() => { setSearch(''); setFilters(EMPTY_FILTERS); setSortAsc(true); setIdx(0); }}
              /></div>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              <div className="text-xs text-gray-600">
                {filtered.length ? `${idx + 1} of ${filtered.length} total` : "0 of 0 total"}{filteredSummaryClean ? ` (filtered by: ${filteredSummaryClean})` : ""}
              </div>

              <div className="relative mt-2 overflow-visible rounded border bg-white">
                {current ? (
                  <div className="absolute right-2 top-2 z-10">
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-sm hover:bg-slate-50"
                      onClick={() => setCandidateInfoOpen((isOpen) => !isOpen)}
                      aria-label="Show candidate details"
                      title="Candidate details"
                    >
                      <Info className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {candidateInfoOpen ? (
                      <div className="absolute right-0 top-9 z-20 max-h-[min(420px,55dvh)] w-80 overflow-y-auto rounded border border-slate-200 bg-white p-3 text-left text-xs text-slate-700 shadow-lg">
                        <div className="font-medium text-slate-900">
                          Catalog {current.pk_catalog_id}{current.name ? `: ${current.name}` : ''}
                        </div>
                        <div className="mt-1 text-slate-600">
                          {current.species || '—'} · {current.gender || '—'} · {current.age_class || '—'}
                        </div>
                        {currentMatch ? (
                          <div className="mt-3 rounded border border-sky-100 bg-sky-50 p-2 text-sky-900">
                            <div className="font-medium">Experimental rank #{currentMatch.rank}</div>
                            <div>Score: {formatMatchNumber(currentMatch.final_score ?? currentMatch.score)}</div>
                            <div>Anchor photo: {currentMatch.photo_id || '—'}</div>
                            <div>Regions: {currentMatch.match_count ?? '—'} · Zones: {currentMatch.tri_zone_matched_count ?? 0}</div>
                            <div>Important coverage: query {formatPct(currentMatch.query_important_region_coverage)} · candidate {formatPct(currentMatch.candidate_important_region_coverage)}</div>
                            <div>Regional consistency: {formatPct(currentMatch.regional_mean_coverage)} · imbalance {formatPct(currentMatch.regional_imbalance)}</div>
                            {currentMatch.orientation_normalized_regional_score != null ? (
                              <div>Orientation-normalized regional score: {formatMatchNumber(currentMatch.orientation_normalized_regional_score)}</div>
                            ) : null}
                            {currentMatch.regional_red_flags?.length ? (
                              <div>Review flags: {currentMatch.regional_red_flags.join(', ')}</div>
                            ) : null}
                            {qualityFlags.length ? <div>Flags: {qualityFlags.join(', ')}</div> : null}
                          </div>
                        ) : matcherResult ? (
                          <div className="mt-3 rounded border border-slate-100 bg-slate-50 p-2 text-slate-600">
                            No local matcher rank for this catalog in the returned top candidates.
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="grid w-full place-items-center bg-gray-50" style={{ height: CANDIDATE_IMAGE_H }}>
                  {current ? (
                    <img
                      src={imgFromRow(current)}
                      alt={current?.name ?? 'catalog'}
                      className="max-w-full max-h-full object-contain"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/manta-logo.svg'; }}
                    />
                  ) : (
                    <div className="text-xs text-gray-500">{loading ? 'Loading...' : 'No records.'}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-none flex-col gap-2 border-t bg-white py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <button type="button" className="px-3 py-1 rounded border text-sm disabled:opacity-50" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx <= 0 || !filtered.length}>Prev</button>
                <button type="button" className="px-3 py-1 rounded border text-sm disabled:opacity-50" onClick={() => setIdx((i) => Math.min(filtered.length - 1, i + 1))} disabled={idx >= filtered.length - 1 || !filtered.length}>Next</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50" disabled={!current} onClick={() => { if (current && onChoose) onChoose(current.pk_catalog_id); safeClose(); }}>This Matches</button>
                <button type="button" className="px-3 py-1 rounded border text-sm" onClick={() => { if (onNoMatch) onNoMatch(); safeClose(); }}>No Matches Found</button>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

function formatMatchNumber(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(4) : "—";
}

function formatPct(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "—";
}

export default MatchModal;
