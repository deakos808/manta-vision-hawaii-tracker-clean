import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type OverviewStats = {
  total_catalogs: number | null;
  total_sightings: number | null;
  total_mantas: number | null;
  total_photos: number | null;
  avg_sightings_per_catalog: number | null;
  min_sightings_per_catalog: number | null;
  max_sightings_per_catalog: number | null;
  avg_mantas_per_sighting: number | null;
  min_mantas_per_sighting: number | null;
  max_mantas_per_sighting: number | null;
  avg_photos_per_manta: number | null;
};

type RelationshipMetricRow = {
  source: string | null;
  metric: string | null;
  avg_value: number | null;
  min_value: number | null;
  max_value: number | null;
};

type QcSummaryRow = {
  category: string | null;
  issue_type: string | null;
  severity: string | null;
  issue_count: number | null;
};

type DuplicateCatalogRow = {
  category: string | null;
  issue_type: string | null;
  severity: string | null;
  entity_pk: number | null;
  related_pk: number | null;
  details: {
    pk_manta_ids?: number[];
    fk_catalog_id?: number;
    fk_sighting_id?: number;
    duplicate_count?: number;
  } | null;
};

type UnresolvedMprfRow = {
  category: string | null;
  issue_type: string | null;
  severity: string | null;
  entity_pk: number | null;
  related_pk: number | null;
  details: {
    list_manta_ids?: string;
  } | null;
};

const EMPTY_OVERVIEW: OverviewStats = {
  total_catalogs: null,
  total_sightings: null,
  total_mantas: null,
  total_photos: null,
  avg_sightings_per_catalog: null,
  min_sightings_per_catalog: null,
  max_sightings_per_catalog: null,
  avg_mantas_per_sighting: null,
  min_mantas_per_sighting: null,
  max_mantas_per_sighting: null,
  avg_photos_per_manta: null,
};

export default function AdminDataOverviewPage() {
  const [stats, setStats] = useState<OverviewStats>(EMPTY_OVERVIEW);
  const [relationshipRows, setRelationshipRows] = useState<RelationshipMetricRow[]>([]);
  const [summaryRows, setSummaryRows] = useState<QcSummaryRow[]>([]);
  const [duplicateRows, setDuplicateRows] = useState<DuplicateCatalogRow[]>([]);
  const [unresolvedRows, setUnresolvedRows] = useState<UnresolvedMprfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [overviewRes, relationshipRes, summaryRes, duplicatesRes, unresolvedRes] = await Promise.all([
      supabase.rpc("get_admin_data_overview"),
      supabase.rpc("get_relationship_averages_split"),
      supabase
        .from("qc_issue_summary_v")
        .select("*")
        .order("severity", { ascending: true })
        .order("category", { ascending: true })
        .order("issue_type", { ascending: true }),
      supabase
        .from("qc_manta_duplicate_sighting_catalog_v")
        .select("*")
        .order("entity_pk", { ascending: true })
        .order("related_pk", { ascending: true })
        .limit(100),
      supabase
        .from("qc_mprf_unresolved_sightings_v")
        .select("*")
        .order("entity_pk", { ascending: true })
        .limit(100),
    ]);

    if (overviewRes.error) {
      console.error("Overview stats error:", overviewRes.error);
    } else if (overviewRes.data && overviewRes.data.length > 0) {
      setStats(overviewRes.data[0] as OverviewStats);
    } else {
      setStats(EMPTY_OVERVIEW);
    }

    if (relationshipRes.error) {
      console.error("Relationship averages split error:", relationshipRes.error);
      setError((prev) => prev ?? "Failed to load split relationship averages.");
      setRelationshipRows([]);
    } else {
      setRelationshipRows((relationshipRes.data ?? []) as RelationshipMetricRow[]);
    }

    if (summaryRes.error) {
      console.error("QC summary error:", summaryRes.error);
      setError((prev) => prev ?? "Failed to load QC summary.");
      setSummaryRows([]);
    } else {
      setSummaryRows((summaryRes.data ?? []) as QcSummaryRow[]);
    }

    if (duplicatesRes.error) {
      console.error("Duplicate detail error:", duplicatesRes.error);
      setError((prev) => prev ?? "Failed to load duplicate detail view.");
      setDuplicateRows([]);
    } else {
      setDuplicateRows((duplicatesRes.data ?? []) as DuplicateCatalogRow[]);
    }

    if (unresolvedRes.error) {
      console.error("Unresolved MPRF detail error:", unresolvedRes.error);
      setError((prev) => prev ?? "Failed to load unresolved MPRF detail view.");
      setUnresolvedRows([]);
    } else {
      setUnresolvedRows((unresolvedRes.data ?? []) as UnresolvedMprfRow[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const totalIssues = summaryRows.reduce((sum, row) => sum + (row.issue_count ?? 0), 0);
  const highIssues = summaryRows.reduce(
    (sum, row) => sum + (row.severity === "high" ? row.issue_count ?? 0 : 0),
    0,
  );
  const mediumIssues = summaryRows.reduce(
    (sum, row) => sum + (row.severity === "medium" ? row.issue_count ?? 0 : 0),
    0,
  );

  const relationshipBySource = useMemo(() => {
    const grouped = new Map<string, RelationshipMetricRow[]>();
    for (const row of relationshipRows) {
      const source = (row.source ?? "Unknown").toUpperCase();
      if (!grouped.has(source)) grouped.set(source, []);
      grouped.get(source)!.push(row);
    }
    return grouped;
  }, [relationshipRows]);

  const hamerRows = relationshipBySource.get("HAMER") ?? [];
  const mprfRows = relationshipBySource.get("MPRF") ?? [];

  return (
    <Layout>
      <div className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-10 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl font-bold">Data Integrity</h1>
          <p className="mt-2 text-sm sm:text-base text-blue-50">
            Live QC powered by database views for summary and drill-down diagnostics.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-2">
        <Link to="/admin" className="text-sm text-blue-700 underline">
          Admin
        </Link>
        <span className="text-sm text-slate-600"> / Data Integrity</span>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">QC Dashboard</h2>
            <p className="text-sm text-slate-600">
              This page now reads from <code>qc_issue_summary_v</code> and related QC detail views.
            </p>
          </div>
          <Button variant="outline" onClick={() => void fetchAll()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh QC"}
          </Button>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Overview</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Catalogs" value={stats.total_catalogs} />
            <StatCard title="Sightings" value={stats.total_sightings} />
            <StatCard title="Manta Encounters" value={stats.total_mantas} />
            <StatCard title="Photos" value={stats.total_photos} />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Relationship Averages</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RelationshipCard
              title="HAMER"
              subtitle="Primary dataset"
              rows={hamerRows}
              loading={loading}
            />
            <RelationshipCard
              title="MPRF"
              subtitle="Secondary overlay dataset"
              rows={mprfRows}
              loading={loading}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">QC Summary</h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title="Total Open Issues" value={totalIssues} />
            <StatCard title="High Severity" value={highIssues} />
            <StatCard title="Medium Severity" value={mediumIssues} />
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {summaryRows.length === 0 ? (
                <div className="p-5 text-sm text-slate-600">
                  {loading ? "Loading QC summary..." : "No open QC issues found."}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Category</th>
                      <th className="px-4 py-3 font-semibold">Issue Type</th>
                      <th className="px-4 py-3 font-semibold">Severity</th>
                      <th className="px-4 py-3 font-semibold">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((row, idx) => (
                      <tr key={`${row.category}-${row.issue_type}-${idx}`} className="border-t">
                        <td className="px-4 py-3">{row.category ?? "—"}</td>
                        <td className="px-4 py-3">{row.issue_type ?? "—"}</td>
                        <td className="px-4 py-3">
                          <SeverityBadge value={row.severity} />
                        </td>
                        <td className="px-4 py-3 font-semibold">{row.issue_count ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Duplicate Manta / Catalog Pairs</h3>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {duplicateRows.length === 0 ? (
                <div className="p-5 text-sm text-slate-600">
                  {loading ? "Loading duplicate detail..." : "No duplicate manta/catalog pairs found."}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Sighting ID</th>
                      <th className="px-4 py-3 font-semibold">Catalog ID</th>
                      <th className="px-4 py-3 font-semibold">Manta IDs</th>
                      <th className="px-4 py-3 font-semibold">Duplicate Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicateRows.map((row, idx) => (
                      <tr key={`${row.entity_pk}-${row.related_pk}-${idx}`} className="border-t">
                        <td className="px-4 py-3">{row.entity_pk ?? "—"}</td>
                        <td className="px-4 py-3">{row.related_pk ?? "—"}</td>
                        <td className="px-4 py-3">
                          {row.details?.pk_manta_ids?.length
                            ? row.details.pk_manta_ids.join(", ")
                            : "—"}
                        </td>
                        <td className="px-4 py-3">{row.details?.duplicate_count ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Unresolved MPRF Sighting Links</h3>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {unresolvedRows.length === 0 ? (
                <div className="p-5 text-sm text-slate-600">
                  {loading ? "Loading unresolved MPRF detail..." : "No unresolved MPRF sighting mappings found."}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Sighting ID</th>
                      <th className="px-4 py-3 font-semibold">Severity</th>
                      <th className="px-4 py-3 font-semibold">MPRF List ID(s)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unresolvedRows.map((row, idx) => (
                      <tr key={`${row.entity_pk}-${idx}`} className="border-t">
                        <td className="px-4 py-3">{row.entity_pk ?? "—"}</td>
                        <td className="px-4 py-3">
                          <SeverityBadge value={row.severity} />
                        </td>
                        <td className="px-4 py-3">{row.details?.list_manta_ids ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </Layout>
  );
}

function StatCard({ title, value }: { title: string; value: number | null }) {
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="text-sm font-medium text-slate-600">{title}</h3>
        <p className="mt-2 text-3xl font-bold">{value ?? "—"}</p>
      </CardContent>
    </Card>
  );
}

function RelationshipCard({
  title,
  subtitle,
  rows,
  loading,
}: {
  title: string;
  subtitle: string;
  rows: RelationshipMetricRow[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3">
          <h4 className="text-base font-semibold">{title}</h4>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>

        {rows.length === 0 ? (
          <div className="text-sm text-slate-600">
            {loading ? "Loading relationship averages..." : "No relationship averages found."}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row, idx) => (
              <RelationshipMetricRowView key={`${row.source}-${row.metric}-${idx}`} row={row} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RelationshipMetricRowView({ row }: { row: RelationshipMetricRow }) {
  const label = metricLabel(row.metric);
  const avgValue = formatNumber(row.avg_value);
  const minValue = formatInteger(row.min_value);
  const maxValue = formatInteger(row.max_value);

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="font-medium text-sm text-slate-800">{label}</div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
        <p>
          <span className="text-slate-600">Avg:</span>{" "}
          <strong>{avgValue}</strong>
        </p>
        <p>
          <span className="text-slate-600">Min:</span>{" "}
          <strong>{minValue}</strong>
        </p>
        <p>
          <span className="text-slate-600">Max:</span>{" "}
          <strong>{maxValue}</strong>
        </p>
      </div>
    </div>
  );
}

function metricLabel(metric: string | null) {
  switch ((metric ?? "").toLowerCase()) {
    case "sightings_per_catalog":
      return "Sightings per Catalog";
    case "mantas_per_sighting":
      return "Manta Encounters per Sighting";
    case "photos_per_manta":
      return "Photos per Manta Encounter";
    default:
      return metric ?? "Unknown Metric";
  }
}

function formatNumber(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value.toFixed(2);
}

function formatInteger(value: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return String(Math.round(value));
}

function SeverityBadge({ value }: { value: string | null }) {
  const normalized = (value ?? "").toLowerCase();

  const className =
    normalized === "high"
      ? "bg-red-100 text-red-700 border-red-200"
      : normalized === "medium"
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {value ?? "unknown"}
    </span>
  );
}
