import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Download, ExternalLink, RefreshCw } from "lucide-react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { buildCatalogImageUrl } from "@/lib/catalogImage";

type DuplicatePair = {
  review_index: number;
  review_bucket: string;
  catalog_id_a: number;
  catalog_id_b: number;
  lower_catalog_id: number;
  higher_catalog_id: number;
  score: number | null;
  image_url: string;
  source_file_path: string;
};

type CatalogRow = {
  pk_catalog_id: number;
  name?: string | null;
  species?: string | null;
  gender?: string | null;
  age_class?: string | null;
  date_first_sighted?: string | null;
  date_last_sighted?: string | null;
  [key: string]: unknown;
};

type Decision = "same_manta" | "different_now" | "needs_review";

type DecisionRow = {
  decision: Decision;
  note: string;
  updated_at: string;
};

const STORAGE_KEY = "hmt_duplicate_catalog_review_decisions_v1";

export default function DuplicateCatalogReviewPage() {
  const [pairs, setPairs] = useState<DuplicatePair[]>([]);
  const [catalogs, setCatalogs] = useState<Map<number, CatalogRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [filter, setFilter] = useState<"all" | "undecided" | Decision>("undecided");
  const [decisions, setDecisions] = useState<Record<string, DecisionRow>>(() => readDecisions());
  const [noteDraft, setNoteDraft] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/qc/duplicate-catalog-review/duplicate_pairs.json?ts=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("No duplicate review manifest found. Run npm run qc:audit-manta-catalog-links.");
        const manifest = (await res.json()) as { pairs: DuplicatePair[] };
        const nextPairs = manifest.pairs ?? [];
        if (!alive) return;
        setPairs(nextPairs);
        await loadCatalogRows(nextPairs, alive, setCatalogs);
      } catch (error) {
        if (alive) setLoadError(error instanceof Error ? error.message : "Failed to load duplicate review manifest.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, []);

  const visiblePairs = useMemo(() => {
    if (filter === "all") return pairs;
    if (filter === "undecided") return pairs.filter((pair) => !decisions[pairKey(pair)]);
    return pairs.filter((pair) => decisions[pairKey(pair)]?.decision === filter);
  }, [decisions, filter, pairs]);

  const activePair = visiblePairs[Math.min(index, Math.max(visiblePairs.length - 1, 0))] ?? null;
  const activeDecision = activePair ? decisions[pairKey(activePair)] : null;

  useEffect(() => {
    setIndex(0);
  }, [filter]);

  useEffect(() => {
    setNoteDraft(activeDecision?.note ?? "");
  }, [activeDecision?.note, activePair?.review_index]);

  function saveDecision(decision: Decision) {
    if (!activePair) return;
    const key = pairKey(activePair);
    const next = {
      ...decisions,
      [key]: {
        decision,
        note: noteDraft.trim(),
        updated_at: new Date().toISOString(),
      },
    };
    setDecisions(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function go(delta: number) {
    setIndex((value) => Math.min(Math.max(value + delta, 0), Math.max(visiblePairs.length - 1, 0)));
  }

  function exportCsv() {
    const rows = Object.entries(decisions).map(([key, row]) => {
      const pair = pairs.find((candidate) => pairKey(candidate) === key);
      return {
        catalog_id_a: pair?.catalog_id_a ?? "",
        catalog_id_b: pair?.catalog_id_b ?? "",
        lower_catalog_id: pair?.lower_catalog_id ?? "",
        higher_catalog_id: pair?.higher_catalog_id ?? "",
        decision: row.decision,
        note: row.note,
        updated_at: row.updated_at,
        source_file_path: pair?.source_file_path ?? "",
      };
    });
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `duplicate_catalog_review_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const decidedCount = Object.keys(decisions).length;

  return (
    <Layout>
      <div className="w-full bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-8 text-white">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-3xl font-bold">Duplicate Catalog Review</h1>
          <p className="mt-2 text-blue-50">
            Compare historical duplicate suggestions against the current catalog before changing any IDs.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        <div>
          <Link to="/admin/qc" className="text-sm text-blue-700 underline">
            Admin / Data Quality Control
          </Link>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-slate-700">
              {loading ? "Loading duplicate pairs..." : `${pairs.length} pairs loaded · ${decidedCount} decisions saved in this browser`}
              {loadError ? <span className="ml-2 text-red-700">{loadError}</span> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterButton label="Undecided" active={filter === "undecided"} onClick={() => setFilter("undecided")} />
              <FilterButton label="All" active={filter === "all"} onClick={() => setFilter("all")} />
              <FilterButton label="Same" active={filter === "same_manta"} onClick={() => setFilter("same_manta")} />
              <FilterButton label="Different" active={filter === "different_now"} onClick={() => setFilter("different_now")} />
              <FilterButton label="Review" active={filter === "needs_review"} onClick={() => setFilter("needs_review")} />
              <Button variant="outline" onClick={() => window.location.reload()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reload
              </Button>
              <Button variant="outline" onClick={exportCsv} disabled={decidedCount === 0}>
                <Download className="mr-2 h-4 w-4" />
                Export Decisions
              </Button>
            </div>
          </CardContent>
        </Card>

        {!activePair ? (
          <Card>
            <CardContent className="p-6 text-sm text-slate-600">
              {loading ? "Loading..." : "No pairs match the current filter."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm text-slate-600">
                      Pair {index + 1} of {visiblePairs.length} · Source #{activePair.review_index}
                    </div>
                    <h2 className="text-xl font-semibold">
                      Catalog {activePair.catalog_id_a} vs {activePair.catalog_id_b}
                    </h2>
                    <div className="text-xs text-slate-500">
                      Lower ID {activePair.lower_catalog_id}; higher ID {activePair.higher_catalog_id}; score {activePair.score ?? "n/a"}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => go(-1)} disabled={index === 0}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Previous
                    </Button>
                    <Button variant="outline" onClick={() => go(1)} disabled={index >= visiblePairs.length - 1}>
                      Next
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-md border bg-slate-950">
                  <img
                    src={activePair.image_url}
                    alt={`Duplicate comparison for catalog ${activePair.catalog_id_a} and ${activePair.catalog_id_b}`}
                    className="max-h-[68vh] w-full object-contain"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <DecisionButton label="Same Manta" active={activeDecision?.decision === "same_manta"} onClick={() => saveDecision("same_manta")} />
                  <DecisionButton label="Different Now" active={activeDecision?.decision === "different_now"} onClick={() => saveDecision("different_now")} />
                  <DecisionButton label="Needs Review" active={activeDecision?.decision === "needs_review"} onClick={() => saveDecision("needs_review")} />
                </div>

                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Notes</span>
                  <textarea
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2"
                    placeholder="Optional note for this pair..."
                  />
                </label>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <CatalogSideCard label="First ID" catalog={catalogs.get(activePair.catalog_id_a)} catalogId={activePair.catalog_id_a} />
              <CatalogSideCard label="Second ID" catalog={catalogs.get(activePair.catalog_id_b)} catalogId={activePair.catalog_id_b} />
            </div>
          </div>
        )}
      </main>
    </Layout>
  );
}

function CatalogSideCard({ label, catalog, catalogId }: { label: string; catalog: CatalogRow | undefined; catalogId: number }) {
  const imageUrl = catalog ? buildCatalogImageUrl(catalog, "ventral") : "/hamer-icon.png";
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase text-slate-500">{label}</div>
            <h3 className="text-lg font-semibold">Catalog {catalogId}</h3>
            <p className="text-sm text-slate-700">{catalog?.name || "No current catalog row found"}</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/browse/catalog?catalogId=${catalogId}`} target="_blank">
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Open
            </Link>
          </Button>
        </div>
        <img
          src={imageUrl}
          alt={`Catalog ${catalogId}`}
          className="h-56 w-full rounded-md border bg-slate-50 object-contain"
        />
        <div className="grid grid-cols-2 gap-2 text-sm text-slate-700">
          <Info label="Species" value={catalog?.species} />
          <Info label="Gender" value={catalog?.gender} />
          <Info label="Age" value={catalog?.age_class} />
          <Info label="First" value={catalog?.date_first_sighted} />
          <Info label="Last" value={catalog?.date_last_sighted} />
        </div>
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <span className="text-slate-500">{label}: </span>
      <span>{String(value ?? "—")}</span>
    </div>
  );
}

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Button variant={active ? "default" : "outline"} onClick={onClick}>
      {label}
    </Button>
  );
}

function DecisionButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Button variant={active ? "default" : "outline"} onClick={onClick}>
      {label}
    </Button>
  );
}

async function loadCatalogRows(
  pairs: DuplicatePair[],
  alive: boolean,
  setCatalogs: (rows: Map<number, CatalogRow>) => void,
) {
  const ids = Array.from(new Set(pairs.flatMap((pair) => [pair.catalog_id_a, pair.catalog_id_b]))).sort((a, b) => a - b);
  const rows: CatalogRow[] = [];
  const pageSize = 250;
  for (let i = 0; i < ids.length; i += pageSize) {
    const chunk = ids.slice(i, i + pageSize);
    const { data, error } = await supabase.from("catalog").select("*").in("pk_catalog_id", chunk);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as CatalogRow[]));
  }
  if (!alive) return;
  setCatalogs(new Map(rows.map((row) => [Number(row.pk_catalog_id), row])));
}

function pairKey(pair: DuplicatePair) {
  return `${pair.catalog_id_a}:${pair.catalog_id_b}`;
}

function readDecisions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, DecisionRow>;
  } catch {
    return {};
  }
}

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: Record<string, unknown>[]) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n");
}
