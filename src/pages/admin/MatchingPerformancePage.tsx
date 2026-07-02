import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { AlertTriangle, BarChart3, CheckCircle2, Info, RefreshCw } from "lucide-react";

type PerformanceRow = {
  run_id?: string | null;
  evaluation_type?: string | null;
  query_photo_id: number | null;
  query_catalog_id: number | null;
  expected_catalog_id: number | null;
  expected_photo_id?: number | null;
  true_rank: number | null;
  true_score: number | null;
  top_catalog_id: number | null;
  top_photo_id: number | null;
  top_score: number | null;
  score_gap?: number | null;
  query_region_count?: number | null;
  top_match_region_count?: number | null;
  body_mask_confidence?: number | null;
  pigment_iou?: number | null;
  median_reprojection_error?: number | null;
  debug_overlay_path?: string | null;
  diagnostic_flags?: string[] | string | null;
  reviewer_reason?: string | null;
  created_at?: string | null;
};

type LoadState = "loading" | "ready" | "empty" | "missing";

type LegacySelfMatchRow = {
  pk_catalog_id: number;
  match_rank: number | null;
  similarity: number | null;
  is_correct_top_match: boolean | null;
};

const RESULT_TABLE = "manta_match_performance_results";

export default function MatchingPerformancePage() {
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");

  const loadResults = async () => {
    setState("loading");
    setMessage("");

    const { data, error } = await supabase
      .from("embedding_selfmatch_results")
      .select("pk_catalog_id, match_rank, similarity, is_correct_top_match")
      .order("pk_catalog_id")
      .range(0, 20000);

    if (error) {
      setRows([]);
      setState("missing");
      setMessage(error.message);
      return;
    }

    const loaded = mapLegacyRows((data ?? []) as LegacySelfMatchRow[]);
    setRows(loaded);
    setState(loaded.length ? "ready" : "empty");
  };

  useEffect(() => {
    void loadResults();
  }, []);

  const stats = useMemo(() => summarize(rows), [rows]);
  const lowPerformers = useMemo(
    () =>
      [...rows]
        .filter((row) => needsReview(row))
        .sort((a, b) => rankSortValue(b.true_rank) - rankSortValue(a.true_rank))
        .slice(0, 50),
    [rows],
  );

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="text-sm">
          <Link to="/admin" className="text-blue-700 underline">
            Admin
          </Link>
          <span className="text-muted-foreground"> / Matching Performance</span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Matching Performance</h1>
            <p className="text-sm text-muted-foreground">
              Track self-match and resight ranking quality for the automated ventral matcher.
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadResults()} disabled={state === "loading"}>
            <RefreshCw className={`mr-2 h-4 w-4 ${state === "loading" ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-3">
              <BarChart3 className="mt-1 h-5 w-5 text-blue-700" />
              <div className="space-y-1">
                <h2 className="font-semibold">Evaluation Ladder</h2>
                <p className="text-sm text-muted-foreground">
                  First, every best catalog ventral photo should rank itself #1 against the best catalog set. After that is stable,
                  use best manta ventral resight photos as queries and track whether the correct catalog lands in the top 10 or top 20.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {state === "missing" ? (
          <SetupNotice message={message} />
        ) : state === "empty" ? (
          <EmptyNotice />
        ) : state === "ready" ? (
          <LegacyNotice />
        ) : null}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
          <MetricCard label="Evaluated" value={stats.total} />
          <MetricCard label="Rank #1" value={stats.rank1} sublabel={pct(stats.rank1, stats.total)} />
          <MetricCard label="Top 10" value={stats.top10} sublabel={pct(stats.top10, stats.total)} targetMet={stats.top10Rate >= 90} />
          <MetricCard label="Top 20" value={stats.top20} sublabel={pct(stats.top20, stats.total)} />
          <MetricCard label="Median Rank" value={stats.medianRank ?? "—"} />
          <MetricCard label="Needs Review" value={stats.needsReview} />
        </div>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">Rank Distribution</h2>
                <p className="text-sm text-muted-foreground">Goal: at least 90% of usable resight queries in the top 10.</p>
              </div>
              <Badge variant={stats.top10Rate >= 90 && stats.total > 0 ? "default" : "secondary"}>
                Top 10: {stats.top10Rate.toFixed(1)}%
              </Badge>
            </div>
            <div className="space-y-3">
              <DistributionBar label="#1" value={stats.rank1} total={stats.total} />
              <DistributionBar label="2-10" value={stats.rank2To10} total={stats.total} />
              <DistributionBar label="11-20" value={stats.rank11To20} total={stats.total} />
              <DistributionBar label="21-50" value={stats.rank21To50} total={stats.total} />
              <DistributionBar label=">50 / missing" value={stats.over50OrMissing} total={stats.total} tone="warn" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold">Low Performers</h2>
              <p className="text-sm text-muted-foreground">
                Review these first for bad anchors, parallax, crop issues, glare, weak pigment, or segmentation failures.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Query Photo</th>
                    <th className="px-4 py-3 font-semibold">Expected Catalog</th>
                    <th className="px-4 py-3 font-semibold">Rank</th>
                    <th className="px-4 py-3 font-semibold">Top Match</th>
                    <th className="px-4 py-3 font-semibold">True Score</th>
                    <th className="px-4 py-3 font-semibold">Score Gap</th>
                    <th className="px-4 py-3 font-semibold">Diagnostics</th>
                  </tr>
                </thead>
                <tbody>
                  {lowPerformers.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>
                        No low performers loaded.
                      </td>
                    </tr>
                  ) : (
                    lowPerformers.map((row) => (
                      <tr key={`${row.run_id ?? "run"}-${row.query_photo_id}`} className="border-t">
                        <td className="px-4 py-3">{row.query_photo_id ?? "—"}</td>
                        <td className="px-4 py-3">{row.expected_catalog_id ?? row.query_catalog_id ?? "—"}</td>
                        <td className="px-4 py-3">
                          <RankBadge rank={row.true_rank} />
                        </td>
                        <td className="px-4 py-3">
                          {row.top_catalog_id ?? "—"}
                          {row.top_photo_id ? <span className="text-muted-foreground"> / {row.top_photo_id}</span> : null}
                        </td>
                        <td className="px-4 py-3">{formatNumber(row.true_score)}</td>
                        <td className="px-4 py-3">{formatNumber(row.score_gap)}</td>
                        <td className="px-4 py-3">
                          <DiagnosticCell row={row} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function SetupNotice({ message }: { message: string }) {
  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 h-5 w-5 text-amber-700" />
          <div>
            <h2 className="font-semibold text-amber-950">No stored performance table found</h2>
            <p className="text-sm text-amber-900">
              The dashboard expects rows in <code>{RESULT_TABLE}</code>. Current load message: {message}
            </p>
          </div>
        </div>
        <RunCommandBlock />
      </CardContent>
    </Card>
  );
}

function EmptyNotice() {
  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-1 h-5 w-5 text-blue-700" />
          <div>
            <h2 className="font-semibold text-blue-950">Ready for first run</h2>
            <p className="text-sm text-blue-900">The performance table exists, but no rows are available yet.</p>
          </div>
        </div>
        <RunCommandBlock />
      </CardContent>
    </Card>
  );
}

function LegacyNotice() {
  return (
    <Card className="border-slate-200 bg-slate-50">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <Info className="mt-1 h-5 w-5 text-slate-700" />
          <div className="space-y-1">
            <h2 className="font-semibold">Showing legacy embedding self-match data</h2>
            <p className="text-sm text-muted-foreground">
              This page is summarizing <code>embedding_selfmatch_results</code> until deterministic pigment-region runs are imported into <code>{RESULT_TABLE}</code>.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RunCommandBlock() {
  return (
    <div className="rounded-md border bg-white p-3">
      <div className="text-xs font-semibold uppercase text-muted-foreground">Local self-match command</div>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">
{`/Users/littlemac/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/matching/eval_catalog_selfmatch_rank.py --out-dir scripts/matching/output/catalog_selfmatch`}
      </pre>
      <p className="mt-2 text-xs text-muted-foreground">
        Use <code>--limit 25 --query-limit 10</code> for a quick smoke test before running the full catalog.
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sublabel,
  targetMet,
}: {
  label: string;
  value: number | string;
  sublabel?: string;
  targetMet?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
        {sublabel ? (
          <div className={`mt-1 text-xs ${targetMet ? "text-green-700" : "text-muted-foreground"}`}>{sublabel}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DistributionBar({ label, value, total, tone = "normal" }: { label: string; value: number; total: number; tone?: "normal" | "warn" }) {
  const width = total > 0 ? Math.round((value / total) * 100) : 0;
  const barClass = tone === "warn" ? "bg-amber-500" : "bg-blue-600";
  return (
    <div className="grid grid-cols-[90px_1fr_70px] items-center gap-3">
      <div className="text-sm">{label}</div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${barClass}`} style={{ width: `${width}%` }} />
      </div>
      <div className="text-right text-sm tabular-nums">{value}</div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number | null }) {
  if (rank == null) return <Badge variant="destructive">Missing</Badge>;
  if (rank === 1) return <Badge>#{rank}</Badge>;
  if (rank <= 10) return <Badge variant="secondary">#{rank}</Badge>;
  if (rank <= 20) return <Badge variant="outline">#{rank}</Badge>;
  return <Badge variant="destructive">#{rank}</Badge>;
}

function DiagnosticCell({ row }: { row: PerformanceRow }) {
  const flags = normalizeFlags(row.diagnostic_flags);
  return (
    <div className="max-w-sm space-y-1">
      <div className="text-xs text-muted-foreground">
        regions {row.query_region_count ?? "—"} / iou {formatNumber(row.pigment_iou)} / err {formatNumber(row.median_reprojection_error)}
      </div>
      {flags.length ? <div className="text-xs">{flags.join(", ")}</div> : null}
      {row.reviewer_reason ? <div className="text-xs text-amber-700">{row.reviewer_reason}</div> : null}
      {row.debug_overlay_path ? (
        <a href={row.debug_overlay_path} className="text-xs text-blue-700 underline">
          Debug overlay
        </a>
      ) : null}
    </div>
  );
}

function summarize(rows: PerformanceRow[]) {
  const ranks = rows.map((row) => row.true_rank).filter((rank): rank is number => typeof rank === "number");
  const sorted = [...ranks].sort((a, b) => a - b);
  const total = rows.length;
  const rank1 = rows.filter((row) => row.true_rank === 1).length;
  const top10 = rows.filter((row) => typeof row.true_rank === "number" && row.true_rank <= 10).length;
  const top20 = rows.filter((row) => typeof row.true_rank === "number" && row.true_rank <= 20).length;
  const rank2To10 = rows.filter((row) => typeof row.true_rank === "number" && row.true_rank >= 2 && row.true_rank <= 10).length;
  const rank11To20 = rows.filter((row) => typeof row.true_rank === "number" && row.true_rank >= 11 && row.true_rank <= 20).length;
  const rank21To50 = rows.filter((row) => typeof row.true_rank === "number" && row.true_rank >= 21 && row.true_rank <= 50).length;
  const over50OrMissing = rows.filter((row) => row.true_rank == null || row.true_rank > 50).length;
  return {
    total,
    rank1,
    top10,
    top20,
    rank2To10,
    rank11To20,
    rank21To50,
    over50OrMissing,
    top10Rate: total ? (top10 / total) * 100 : 0,
    medianRank: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    needsReview: rows.filter((row) => needsReview(row)).length,
  };
}

function mapLegacyRows(rows: LegacySelfMatchRow[]): PerformanceRow[] {
  const byCatalog = new Map<number, PerformanceRow & { candidate_count?: number }>();

  for (const row of rows) {
    const existing =
      byCatalog.get(row.pk_catalog_id) ??
      ({
        run_id: "legacy_embedding_selfmatch",
        evaluation_type: "embedding_best_catalog_selfmatch",
        query_photo_id: null,
        query_catalog_id: row.pk_catalog_id,
        expected_catalog_id: row.pk_catalog_id,
        expected_photo_id: null,
        true_rank: null,
        true_score: null,
        top_catalog_id: null,
        top_photo_id: null,
        top_score: null,
        score_gap: null,
        diagnostic_flags: null,
        reviewer_reason: null,
        candidate_count: 0,
      } satisfies PerformanceRow & { candidate_count?: number });

    existing.candidate_count = (existing.candidate_count ?? 0) + 1;
    if (row.is_correct_top_match && typeof row.match_rank === "number") {
      const shouldReplace =
        existing.true_rank == null ||
        row.match_rank < existing.true_rank ||
        (row.match_rank === existing.true_rank && Number(row.similarity ?? 0) > Number(existing.true_score ?? 0));

      if (shouldReplace) {
        existing.true_rank = row.match_rank;
        existing.true_score = row.similarity;
      }
    }
    byCatalog.set(row.pk_catalog_id, existing);
  }

  return [...byCatalog.values()]
    .map((row) => {
      const flags = [];
      if (row.true_rank == null) flags.push("missing_correct_row");
      else if (row.true_rank > 20) flags.push("rank_gt_20");
      else if (row.true_rank > 10) flags.push("rank_11_to_20");
      if (typeof row.true_score === "number" && row.true_score <= 0) flags.push("zero_true_score");
      return {
        ...row,
        diagnostic_flags: flags.join(","),
      };
    })
    .sort((a, b) => Number(a.query_catalog_id ?? 0) - Number(b.query_catalog_id ?? 0));
}

function needsReview(row: PerformanceRow) {
  return (
    row.true_rank == null ||
    row.true_rank > 20 ||
    (typeof row.true_score === "number" && row.true_score <= 0) ||
    (typeof row.query_region_count === "number" && row.query_region_count < 5)
  );
}

function rankSortValue(rank: number | null) {
  return rank == null ? 999999 : rank;
}

function pct(value: number, total: number) {
  return total ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value >= 100 ? value.toFixed(1) : value.toFixed(3);
}

function normalizeFlags(value: PerformanceRow["diagnostic_flags"]) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
