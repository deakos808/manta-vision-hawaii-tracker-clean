// src/pages/admin/MatchingPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

type SelfMatchRow = {
  pk_catalog_id: number;
  match_rank: number | null;
  similarity: number | null;
  is_correct_top_match: boolean | null;
};

type CatalogSummary = {
  pk_catalog_id: number;
  bestCorrectRank: number | null;
  bestCorrectSimilarity: number | null;
  candidateRows: number;
};

type MatcherQueryOption = {
  catalog_id: string;
  photo_id: string;
  label: string;
  image_path: string;
  image_url: string;
};

type MatcherCandidate = {
  rank: number;
  catalog_id: string;
  photo_id: string;
  label?: string;
  image_path: string;
  image_url: string;
  overlay_url?: string;
  final_score: number;
  score: number;
  coarse_score: number;
  match_count: number;
  pigment_iou: number;
  median_reprojection_error: number;
  constellation_score?: number;
  constellation_bonus?: number;
  tri_zone_matched_count?: number;
  tri_zone_coverage?: number;
};

type MatcherResponse = {
  summary: {
    query_path: string;
    query_url: string;
    query_region_count: number;
    query_signature_usable: boolean;
    query_signature_quality_flags: string[];
    anchor_count: number;
    prefilter_count: number;
    natural_prefilter_count?: number;
    coarse_score_weight: number;
    coarse_bonus_cap?: number;
    expected_catalog_id?: string;
    expected_catalog_rank?: number | null;
    expected_catalog_in_top_k?: boolean;
    expected_catalog_in_prefilter?: boolean;
    expected_catalog_photo_id?: string;
    expected_catalog_score?: number | null;
    coarse_expected_catalog_rank?: number | null;
    oracle_expected_catalog_rank?: number | null;
    ranked_catalog_count?: number;
    oracle_ranked_catalog_count?: number;
    zone_prefilter_top_n?: number;
    relaxed_prefilter_top_n?: number;
    prefilter_mode?: string;
    prefilter_selected_by_pass?: Record<string, number>;
    generated_dir: string;
  };
  top: MatcherCandidate[];
};

const MATCHER_API_BASE = String(
  import.meta.env.VITE_MATCHER_API_BASE || (import.meta.env.DEV ? "http://127.0.0.1:8766" : "")
).replace(/\/$/, "");

export default function MatchingPage() {
  const [rows, setRows] = useState<SelfMatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [msg, setMsg] = useState<string>("");
  const [matcherOnline, setMatcherOnline] = useState(false);
  const [matcherMsg, setMatcherMsg] = useState("");
  const [queryOptions, setQueryOptions] = useState<MatcherQueryOption[]>([]);
  const [selectedQueryPath, setSelectedQueryPath] = useState("");
  const [manualQueryPath, setManualQueryPath] = useState("");
  const [topK, setTopK] = useState(10);
  const [matcherLoading, setMatcherLoading] = useState(false);
  const [matcherResult, setMatcherResult] = useState<MatcherResponse | null>(null);
  const pageSize = 50;

  const catalogSummaries = useMemo(() => summarizeByCatalog(rows), [rows]);
  const stats = useMemo(() => summarizeRanks(catalogSummaries), [catalogSummaries]);
  const lowPerformers = useMemo(
    () =>
      [...catalogSummaries]
        .filter((row) => row.bestCorrectRank == null || row.bestCorrectRank > 20)
        .sort((a, b) => rankSortValue(b.bestCorrectRank) - rankSortValue(a.bestCorrectRank))
        .slice(0, 25),
    [catalogSummaries],
  );
  const activeQueryPath = String(manualQueryPath || selectedQueryPath).trim();
  const selectedQuery = queryOptions.find((query) => query.image_path === selectedQueryPath);
  const previewQuery = manualQueryPath ? null : selectedQuery;
  const matcherConfigured = Boolean(MATCHER_API_BASE);

  async function fetchRows() {
    setLoading(true);
    setMsg("");

    try {
      const firstPage = await supabase
        .from("embedding_selfmatch_results")
        .select("pk_catalog_id, match_rank, similarity, is_correct_top_match", { count: "exact" })
        .order("pk_catalog_id")
        .range(0, 999);

      if (firstPage.error) throw firstPage.error;

      const allRows = [...((firstPage.data ?? []) as SelfMatchRow[])];
      const storedCount = firstPage.count ?? allRows.length;

      for (let from = 1000; from < storedCount; from += 1000) {
        const to = Math.min(from + 999, storedCount - 1);
        const pageResult = await supabase
          .from("embedding_selfmatch_results")
          .select("pk_catalog_id, match_rank, similarity, is_correct_top_match")
          .order("pk_catalog_id")
          .range(from, to);

        if (pageResult.error) throw pageResult.error;

        allRows.push(...((pageResult.data ?? []) as SelfMatchRow[]));
      }

      setRows(allRows);
      setTotal(storedCount);
      setPage(1);
      setMsg(`Loaded ${allRows.length} of ${storedCount} stored self-match rows.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRows().catch((e) => setMsg(`Load error: ${String(e?.message || e)}`));
  }, []);

  useEffect(() => {
    void checkMatcherApi();
    void fetchMatcherQueries();
  }, []);

  async function checkMatcherApi() {
    if (!MATCHER_API_BASE) {
      setMatcherOnline(false);
      setMatcherMsg("Experimental matcher API is not configured for this deployment.");
      return;
    }

    try {
      const res = await fetch(`${MATCHER_API_BASE}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setMatcherOnline(Boolean(body.ok));
      setMatcherMsg(`Local matcher worker online. Anchors loaded: ${body.anchors_loaded ?? 0}.`);
    } catch (e) {
      setMatcherOnline(false);
      setMatcherMsg(`Local matcher worker is not running. Start it with: npm run dev:matcher-api`);
    }
  }

  async function fetchMatcherQueries() {
    if (!MATCHER_API_BASE) {
      setQueryOptions([]);
      return;
    }

    try {
      const res = await fetch(`${MATCHER_API_BASE}/queries?limit=200`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const queries = (body.queries ?? []) as MatcherQueryOption[];
      setQueryOptions(queries);
      if (!selectedQueryPath && queries[0]?.image_path) {
        setSelectedQueryPath(queries[0].image_path);
      }
    } catch {
      setQueryOptions([]);
    }
  }

  async function runMatcherTest() {
    if (!MATCHER_API_BASE) {
      setMatcherMsg("Experimental matcher API is not configured for this deployment.");
      return;
    }

    const queryPath = String(manualQueryPath || selectedQueryPath).trim();
    if (!queryPath) {
      setMatcherMsg("Choose a query photo or paste a local image path first.");
      return;
    }

    setMatcherLoading(true);
    setMatcherResult(null);
    setMatcherMsg("Running local matcher...");
    try {
      const selected = queryOptions.find((q) => q.image_path === queryPath);
      const res = await fetch(`${MATCHER_API_BASE}/rank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query_path: queryPath,
          query_photo_id: selected?.photo_id ?? "",
          expected_catalog_id: selected?.catalog_id ?? "",
          top_k: topK,
          prefilter_top_n: 120,
          zone_prefilter_top_n: 80,
          relaxed_prefilter_top_n: 300,
          coarse_score_weight: 0.2,
          coarse_bonus_cap: 8,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      setMatcherResult(body as MatcherResponse);
      setMatcherOnline(true);
      setMatcherMsg(`Matcher returned ${body.top?.length ?? 0} ranked candidates.`);
    } catch (e) {
      setMatcherOnline(false);
      setMatcherMsg(`Matcher run failed: ${String((e as Error)?.message || e)}`);
    } finally {
      setMatcherLoading(false);
    }
  }

  const pagedRows = catalogSummaries.slice((page - 1) * pageSize, page * pageSize);

  return (
    <Layout>
      <div className="p-6 space-y-5">
        <div className="text-sm">
          <Link to="/admin" className="text-blue-700 underline">
            Admin
          </Link>
          <span className="text-muted-foreground"> / Match a Photo</span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Match a Photo</h1>
            <p className="text-sm text-muted-foreground">
              Choose a ventral query image, run the local deterministic matcher, and review ranked catalog candidates.
            </p>
          </div>
          <Button variant="outline" onClick={() => void fetchRows()} disabled={loading}>
            {loading ? "Loading..." : "Refresh Diagnostics"}
          </Button>
        </div>

        {msg ? (
          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {msg}
          </div>
        ) : null}

        <Card>
          <CardContent className="p-5 space-y-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Test Matcher</h2>
                <p className="text-sm text-muted-foreground">
                  This is the place to test one photo against the catalog. Pick a query image, run the matcher, then read the ranked candidates below.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void checkMatcherApi()} disabled={matcherLoading || !matcherConfigured}>
                  Check Worker
                </Button>
                <Button onClick={() => void runMatcherTest()} disabled={matcherLoading || !activeQueryPath || !matcherConfigured}>
                  {matcherLoading ? "Matching..." : "Run Test Match"}
                </Button>
              </div>
            </div>

            <div className={`rounded-md border px-3 py-2 text-sm ${matcherOnline ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
              {matcherMsg || "Start the local matcher worker, then choose a query photo."}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-4">
                <section className="space-y-3 rounded-md border bg-slate-50 p-4">
                  <div>
                    <h3 className="font-semibold">1. Choose The Photo To Identify</h3>
                    <p className="text-sm text-muted-foreground">Use a known exported query, or paste a local image path for a new test photo.</p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Known Query Photo</span>
                      <select
                        value={selectedQueryPath}
                        onChange={(e) => {
                          setSelectedQueryPath(e.target.value);
                          setManualQueryPath("");
                        }}
                        className="h-10 w-full rounded-md border bg-white px-3"
                      >
                        {queryOptions.length === 0 ? <option value="">No query manifest loaded</option> : null}
                        {queryOptions.map((query) => (
                          <option key={`${query.catalog_id}-${query.photo_id}-${query.image_path}`} value={query.image_path}>
                            Catalog {query.catalog_id} / Photo {query.photo_id} - {query.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Candidate Count</span>
                      <select value={topK} onChange={(e) => setTopK(Number(e.target.value))} className="h-10 w-full rounded-md border bg-white px-3">
                        <option value={10}>Show Top 10</option>
                        <option value={20}>Show Top 20</option>
                        <option value={25}>Show Top 25</option>
                      </select>
                    </label>
                  </div>

                  <label className="space-y-1 text-sm">
                    <span className="font-medium">Manual Local Image Path</span>
                    <input
                      value={manualQueryPath}
                      onChange={(e) => setManualQueryPath(e.target.value)}
                      placeholder="Optional: export/best_manta_ventral_photos_100/2_manta-1408_photo-2328.jpg"
                      className="h-10 w-full rounded-md border bg-white px-3"
                    />
                  </label>
                </section>

                <section className="space-y-3 rounded-md border p-4">
                  <h3 className="font-semibold">2. Run Match Against Catalog</h3>
                  <p className="text-sm text-muted-foreground">
                    The matcher compares the query photo against catalog and resight anchors, then sorts candidates from most likely to least likely.
                  </p>
                  <Button onClick={() => void runMatcherTest()} disabled={matcherLoading || !activeQueryPath || !matcherConfigured} className="w-full sm:w-auto">
                    {matcherLoading ? "Matching..." : "Run Match And Show Ranked Catalogs"}
                  </Button>
                </section>
              </div>

              <section className="space-y-3 rounded-md border p-4">
                <h3 className="font-semibold">Selected Query Preview</h3>
                {previewQuery ? (
                  <>
                    <div className="overflow-hidden rounded-md border bg-slate-50 p-2">
                      <img src={`${MATCHER_API_BASE}${previewQuery.image_url}`} alt="Selected query manta" className="h-64 w-full object-contain" />
                    </div>
                    <div className="text-sm">
                      <div className="font-medium">Catalog {previewQuery.catalog_id} / Photo {previewQuery.photo_id}</div>
                      <div className="break-all text-xs text-muted-foreground">{previewQuery.image_path}</div>
                    </div>
                  </>
                ) : (
                  <div className="flex h-64 items-center justify-center rounded-md border bg-slate-50 px-4 text-center text-sm text-muted-foreground">
                    {manualQueryPath ? "Manual path selected. Preview appears after the match runs." : "Choose a query photo to preview it here."}
                  </div>
                )}
              </section>
            </div>

            <section className="space-y-3">
              <h3 className="text-lg font-semibold">3. Ranked Possible Matches</h3>
              {matcherLoading ? (
                <div className="rounded-md border bg-blue-50 p-5 text-sm text-blue-900">
                  Matching is running. When it finishes, this section will show the query photo beside catalog ventrals sorted by likely match.
                </div>
              ) : matcherResult ? (
                <MatcherResults result={matcherResult} />
              ) : (
                <div className="rounded-md border bg-slate-50 p-5 text-sm text-muted-foreground">
                  No match results yet. Choose a photo above and click <span className="font-medium text-slate-800">Run Match And Show Ranked Catalogs</span>.
                </div>
              )}
            </section>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <h2 className="font-semibold">Diagnostics Summary</h2>
            <p className="text-sm text-muted-foreground">
              This lower section is not the matcher UI. It is a sanity-check report for exact-image self-match results, used to verify
              the pipeline before judging harder resight matching.
            </p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
              <MetricCard label="Catalogs Loaded" value={stats.total} />
              <MetricCard label="Self-Matched #1" value={stats.rank1} sublabel={pct(stats.rank1, stats.total)} />
              <MetricCard label="Top 10" value={stats.top10} sublabel={pct(stats.top10, stats.total)} />
              <MetricCard label="Top 20" value={stats.top20} sublabel={pct(stats.top20, stats.total)} />
              <MetricCard label="Missing Correct Row" value={stats.missing} />
              <MetricCard label="Raw Pair Rows" value={rows.length} sublabel={`${total} stored`} />
            </div>
            <p className="text-sm text-muted-foreground">
              Current loaded embedding results show {stats.rank1} of {stats.total} catalogs self-matched at rank #1 ({pct(stats.rank1, stats.total)}).
              That is a healthy exact-image sanity check, but it does not prove real resight accuracy.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <h2 className="font-semibold">Deterministic Pigment Matcher Batch</h2>
            <p className="text-sm text-muted-foreground">
              Exact-image self-match is only the first sanity check. It should be near 100% rank #1 before we trust harder resight tests.
              Build reusable photo signatures first, then use the generated CSV/JSON as the deterministic matcher scoreboard.
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-xs">
{`/Users/littlemac/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -B scripts/matching/build_signature_cache.py --manifest export/best_catalog_photos/manifest.csv --image-dir export/best_catalog_photos --cache-dir scripts/matching/cache/photo_signatures`}
            </pre>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-xs">
{`/Users/littlemac/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -B scripts/matching/eval_catalog_selfmatch_rank.py --out-dir scripts/matching/output/catalog_selfmatch`}
            </pre>
            <p className="text-xs text-muted-foreground">
              Quick smoke test: add <code>--limit 25 --query-limit 10</code> to the eval command. Full run writes <code>catalog_selfmatch_results.csv</code> and <code>catalog_selfmatch_summary.json</code>.
            </p>
            <p className="text-sm text-muted-foreground">
              After that passes, export Best Manta Ventral photos and run them against the catalog. The query manifest can be used directly.
            </p>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-xs">
{`npx tsx scripts/export-best-manta-ventral-photos.ts --out ./export/best_manta_ventral_photos --dry-run=false --limit=25`}
            </pre>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-xs">
{`/Users/littlemac/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -B scripts/matching/eval_resight_rank.py --queries-csv export/best_manta_ventral_photos/manifest.csv --out-dir scripts/matching/output/best_manta_resight --query-limit 10`}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold">Low Performing Catalogs</h2>
              <p className="text-sm text-muted-foreground">These did not self-match in the top 20 in the loaded embedding results.</p>
            </div>
            <SummaryTable rows={lowPerformers} emptyText="No low performers in loaded results." />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">Catalog-Level Results</h2>
                <p className="text-sm text-muted-foreground">
                  Showing {pagedRows.length > 0 ? (page - 1) * pageSize + 1 : 0} - {Math.min(page * pageSize, catalogSummaries.length)} of {catalogSummaries.length} catalogs.
                </p>
              </div>
            </div>
            <SummaryTable rows={pagedRows} emptyText="No self-match rows loaded." />
            <div className="flex justify-between border-t p-4">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </Button>
              <Button variant="outline" disabled={page * pageSize >= catalogSummaries.length} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function MatcherResults({ result }: { result: MatcherResponse }) {
  const topHit = result.top[0];

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-blue-50 px-3 py-2 text-sm text-blue-900">
        {topHit ? (
          <>
            Top match: Catalog {topHit.catalog_id}, Photo {topHit.photo_id}, score {formatNumber(topHit.final_score)}. Review the candidate image
            and overlay before treating this as a likely ID.
          </>
        ) : (
          "No ranked candidates returned for this query."
        )}
      </div>

      {result.summary.expected_catalog_id ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            result.summary.expected_catalog_in_top_k ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
          }`}
        >
          Known expected catalog: Catalog {result.summary.expected_catalog_id}
          {typeof result.summary.expected_catalog_rank === "number" ? (
            <>
              {" "}ranked #{result.summary.expected_catalog_rank}
              {result.summary.expected_catalog_photo_id ? ` via Photo ${result.summary.expected_catalog_photo_id}` : ""}.
              {" "}Score {formatNumber(result.summary.expected_catalog_score)}.
            </>
          ) : (
            " was not ranked in the natural candidate set."
          )}
          {result.summary.expected_catalog_in_prefilter === false ? (
            <>
              {" "}It was filtered out before exact scoring.
              {typeof result.summary.oracle_expected_catalog_rank === "number" ? ` Oracle diagnostic rank was #${result.summary.oracle_expected_catalog_rank}.` : ""}
            </>
          ) : null}
          {typeof result.summary.coarse_expected_catalog_rank === "number" ? (
            <> Coarse prefilter rank was #{result.summary.coarse_expected_catalog_rank}.</>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-5">
        <MetricCard label="Query Regions" value={result.summary.query_region_count} />
        <MetricCard label="Usable Signature" value={result.summary.query_signature_usable ? "Yes" : "No"} />
        <MetricCard label="Anchors" value={result.summary.anchor_count} />
        <MetricCard label="Prefiltered" value={result.summary.natural_prefilter_count ?? result.summary.prefilter_count} />
        <MetricCard label="Coarse Tie-Break" value={`${result.summary.coarse_score_weight.toFixed(2)} / cap ${formatNumber(result.summary.coarse_bonus_cap ?? 0)}`} />
      </div>

      {result.summary.prefilter_mode ? (
        <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
          Retrieval: {result.summary.prefilter_mode}; zone pass size {result.summary.zone_prefilter_top_n ?? 0}; relaxed geometry pass size{" "}
          {result.summary.relaxed_prefilter_top_n ?? 0}; selected by pass{" "}
          {JSON.stringify(result.summary.prefilter_selected_by_pass ?? {})}.
        </div>
      ) : null}

      {result.summary.query_signature_quality_flags?.length ? (
        <div className="rounded-md border bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Query quality flags: {result.summary.query_signature_quality_flags.join(", ")}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-2">
          <h3 className="text-base font-semibold">Query Photo To Identify</h3>
          <div className="overflow-hidden rounded-md border bg-slate-50 p-2">
            <img src={`${MATCHER_API_BASE}${result.summary.query_url}`} alt="Query manta" className="h-auto w-full object-contain" />
          </div>
          <p className="break-all text-xs text-muted-foreground">{result.summary.query_path}</p>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold">Catalog Ventrals Sorted By Likely Match</h3>
          <div className="grid gap-3">
            {result.top.map((candidate) => (
              <div key={`${candidate.rank}-${candidate.catalog_id}-${candidate.photo_id}`} className="rounded-md border bg-white p-3">
                <div className="grid gap-3 lg:grid-cols-[160px_160px_minmax(0,1fr)]">
                  <div className="overflow-hidden rounded border bg-slate-50">
                    <img src={`${MATCHER_API_BASE}${candidate.image_url}`} alt={`Catalog ${candidate.catalog_id}`} className="h-40 w-full object-contain" />
                  </div>
                  {candidate.overlay_url ? (
                    <a href={`${MATCHER_API_BASE}${candidate.overlay_url}`} target="_blank" rel="noreferrer" className="overflow-hidden rounded border bg-slate-50">
                      <img src={`${MATCHER_API_BASE}${candidate.overlay_url}`} alt="Match overlay" className="h-40 w-full object-contain" />
                    </a>
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded border bg-slate-50 text-xs text-muted-foreground">
                      No overlay
                    </div>
                  )}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold">
                          #{candidate.rank} Catalog {candidate.catalog_id}
                        </div>
                        <div className="text-sm text-muted-foreground">Photo {candidate.photo_id}</div>
                      </div>
                      <Badge variant={candidate.rank <= 10 ? "default" : "outline"}>Score {formatNumber(candidate.final_score)}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Exact score: {formatNumber(candidate.score)}</span>
                      <span>Coarse score: {formatNumber(candidate.coarse_score)}</span>
                      <span>Region matches: {candidate.match_count}</span>
                      <span>Pigment IoU: {formatNumber(candidate.pigment_iou)}</span>
                      <span>Median error: {formatNumber(candidate.median_reprojection_error)}</span>
                      <span>Matched zones: {candidate.tri_zone_matched_count ?? 0}</span>
                      <span>Constellation: {formatNumber(candidate.constellation_score)}</span>
                      <span>Const bonus: {formatNumber(candidate.constellation_bonus)}</span>
                    </div>
                    {candidate.overlay_url ? (
                      <a href={`${MATCHER_API_BASE}${candidate.overlay_url}`} target="_blank" rel="noreferrer" className="text-sm text-blue-700 underline">
                        Open debug overlay
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryTable({ rows, emptyText }: { rows: CatalogSummary[]; emptyText: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left">
          <tr>
            <th className="px-4 py-3 font-semibold">Catalog ID</th>
            <th className="px-4 py-3 font-semibold">Correct Rank</th>
            <th className="px-4 py-3 font-semibold">Correct Similarity</th>
            <th className="px-4 py-3 font-semibold">Candidate Rows</th>
            <th className="px-4 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.pk_catalog_id} className="border-t">
                <td className="px-4 py-3">{row.pk_catalog_id}</td>
                <td className="px-4 py-3">{row.bestCorrectRank ?? "Missing"}</td>
                <td className="px-4 py-3">{formatNumber(row.bestCorrectSimilarity)}</td>
                <td className="px-4 py-3">{row.candidateRows}</td>
                <td className="px-4 py-3">
                  <RankBadge rank={row.bestCorrectRank} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function MetricCard({ label, value, sublabel }: { label: string; value: number | string; sublabel?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {sublabel ? <div className="mt-1 text-xs text-muted-foreground">{sublabel}</div> : null}
      </CardContent>
    </Card>
  );
}

function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) return <Badge variant="destructive">Missing</Badge>;
  if (rank === 1) return <Badge>Rank #1</Badge>;
  if (rank <= 10) return <Badge variant="secondary">Top 10</Badge>;
  if (rank <= 20) return <Badge variant="outline">Top 20</Badge>;
  return <Badge variant="destructive">Needs Review</Badge>;
}

function summarizeByCatalog(rows: SelfMatchRow[]) {
  const byCatalog = new Map<number, CatalogSummary>();
  for (const row of rows) {
    const existing =
      byCatalog.get(row.pk_catalog_id) ??
      ({
        pk_catalog_id: row.pk_catalog_id,
        bestCorrectRank: null,
        bestCorrectSimilarity: null,
        candidateRows: 0,
      } satisfies CatalogSummary);

    existing.candidateRows += 1;
    if (row.is_correct_top_match && typeof row.match_rank === "number") {
      const shouldReplace =
        existing.bestCorrectRank == null ||
        row.match_rank < existing.bestCorrectRank ||
        (row.match_rank === existing.bestCorrectRank && Number(row.similarity ?? 0) > Number(existing.bestCorrectSimilarity ?? 0));
      if (shouldReplace) {
        existing.bestCorrectRank = row.match_rank;
        existing.bestCorrectSimilarity = row.similarity;
      }
    }
    byCatalog.set(row.pk_catalog_id, existing);
  }
  return [...byCatalog.values()].sort((a, b) => a.pk_catalog_id - b.pk_catalog_id);
}

function summarizeRanks(rows: CatalogSummary[]) {
  const total = rows.length;
  const rank1 = rows.filter((row) => row.bestCorrectRank === 1).length;
  const top10 = rows.filter((row) => typeof row.bestCorrectRank === "number" && row.bestCorrectRank <= 10).length;
  const top20 = rows.filter((row) => typeof row.bestCorrectRank === "number" && row.bestCorrectRank <= 20).length;
  const missing = rows.filter((row) => row.bestCorrectRank == null).length;
  return { total, rank1, top10, top20, missing };
}

function rankSortValue(rank: number | null) {
  return rank == null ? 999999 : rank;
}

function pct(value: number, total: number) {
  return total ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value.toFixed(4);
}
