import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Info,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Trash2,
  XCircle,
} from "lucide-react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { logDataChange } from "@/lib/dataChangeAudit";
import { SightingDetailModal } from "@/pages/browse_data/Sightings";
import { resolvePhotoUrl } from "@/lib/photoUrl";
import MatchModal from "@/components/mantas/MatchModal";
import {
  dlM,
  dlPx,
  dwDlRatio,
  dwM,
  dwPx,
  formatCalibration,
  formatMeters,
  formatPx,
  formatRatio,
  hasLegacySizeExport,
  isDuplicateLegacyImport,
  legacyShotType,
  legacySizeId,
  photoCodeId,
  scalePx,
  scaleCorrectedPx,
  sizeMeasurementIncludedInMean,
  sizeMeasurementLabel,
} from "@/utils/sizeMeasurements";

type Severity = "error" | "warning" | "info";

type QcFinding = {
  domain: string;
  severity: Severity;
  check_name: string;
  table_name?: string;
  primary_key?: string | number | null;
  related_photo_id?: string | number | null;
  related_catalog_id?: string | number | null;
  related_manta_id?: string | number | null;
  related_sighting_id?: string | number | null;
  message: string;
  suggested_action?: string;
  metadata?: Record<string, unknown>;
};

type DomainSnapshot = {
  domain: string;
  checked_at: string;
  summary: Record<string, unknown>;
  findings: QcFinding[];
};

type SummaryDomain = {
  domain: string;
  summary: Record<string, unknown>;
  findings: {
    total: number;
    errors: number;
    warnings: number;
    info: number;
  };
};

type SummarySnapshot = {
  checked_at: string;
  database_available: boolean;
  storage_checks_enabled: boolean;
  domains: SummaryDomain[];
  totals: SummaryDomain["findings"];
  rerun_commands?: {
    local?: string;
    with_storage_probe?: string;
    schema?: string;
  };
};

type QcArea = {
  slug: string;
  title: string;
  domain: string;
  tableLabel: string;
  browsePath?: string;
  cleanMeaning: string;
  maintainWhen: string;
  infoMeaning?: string;
};

type RecordTarget = {
  type: "sighting" | "manta" | "catalog" | "photo" | "size" | "biopsy";
  id: number;
};

type DuplicateRemovalPlan = {
  keepSightingId: number;
  deleteSightingId: number;
  deleteMantaId: number;
};

type DuplicateGroupRemovalPlan = {
  keepSightingId: number;
  deleteSightingId: number;
  staleListOnly: boolean;
  listedSightingId: number;
  pointedSightingId: number;
};

type DuplicateRemovalOptions = {
  useDuplicateBestVentralPhoto: boolean;
  mantaChoices?: DuplicateMantaMergeChoice[];
};

type DuplicateMantaMergeChoice = {
  duplicateMantaId: number;
  action: "merge" | "move";
  keptMantaId?: number;
};

const QC_AREAS: QcArea[] = [
  {
    slug: "catalog",
    title: "Catalog QC",
    domain: "catalog",
    tableLabel: "Catalog",
    browsePath: "/browse/catalog",
    cleanMeaning: "Catalog IDs and best catalog ventral anchors look internally consistent.",
    maintainWhen: "Review if best catalog photos are not actually ventral or multiple anchors appear.",
  },
  {
    slug: "sightings",
    title: "Sightings QC",
    domain: "sightings",
    tableLabel: "Sightings",
    browsePath: "/browse/sightings",
    cleanMeaning: "Sighting IDs, dates, and location fields are present and recognizable.",
    maintainWhen: "Review missing dates, missing locations, or odd island/location labels.",
  },
  {
    slug: "mantas",
    title: "Mantas QC",
    domain: "mantas",
    tableLabel: "Mantas",
    browsePath: "/browse/mantas",
    cleanMeaning: "Manta encounter rows link to expected catalog and sighting rows.",
    maintainWhen: "Review manta encounters missing catalog or sighting links, or links pointing to missing records.",
    infoMeaning: "Info items are visibility notes only. Missing catalog or sighting links are treated as errors.",
  },
  {
    slug: "photos",
    title: "Photos QC",
    domain: "photos",
    tableLabel: "Photos",
    browsePath: "/browse/photos",
    cleanMeaning: "Photo rows link correctly and best-photo flags match the photo metadata.",
    maintainWhen: "Review broken links, duplicate best flags, missing storage paths, or view-label mismatches.",
  },
  {
    slug: "sizes",
    title: "Sizes QC",
    domain: "sizes",
    tableLabel: "Sizes",
    browsePath: "/browse/sizes",
    cleanMeaning: "Size records exist in the expected table and values are plausible.",
    maintainWhen: "Review if the size table is missing, links are orphaned, or values fall outside the review range.",
  },
  {
    slug: "biopsies",
    title: "Biopsies QC",
    domain: "biopsies",
    tableLabel: "Biopsies",
    browsePath: "/browse/biopsies",
    cleanMeaning: "Biopsy rows have primary keys, valid manta anchors, synchronized sighting/catalog links, and child photos on the sampled manta encounter.",
    maintainWhen: "Review orphan links, mismatched manta/sighting/catalog relationships, missing child photos, duplicate sample identifiers, or no-ventral catalog exceptions.",
  },
  {
    slug: "photo-storage",
    title: "Photo Storage / Export QC",
    domain: "photo-storage",
    tableLabel: "Storage / Exports",
    cleanMeaning: "Export manifests, local files, and database photo rows agree.",
    maintainWhen: "Review missing exported files, storage path drift, or manifest/photo mismatches.",
  },
];

const DEFAULT_COMMANDS = {
  local: "npm run qc:data",
  with_storage_probe: "npm run qc:data -- --check-storage=true",
  schema: "npm run qc:schema",
};

export default function DataQualityControlPage() {
  const navigate = useNavigate();
  const params = useParams();
  const selected = QC_AREAS.find((area) => area.slug === params.domain) ?? null;
  const [summary, setSummary] = useState<SummarySnapshot | null>(null);
  const [domainSnapshot, setDomainSnapshot] = useState<DomainSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [recordTarget, setRecordTarget] = useState<RecordTarget | null>(null);
  const [sizeReviewMantaId, setSizeReviewMantaId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadSummary() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/qc/qc_summary.json?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error("No browser-readable QC snapshot was found.");
        const data = (await res.json()) as SummarySnapshot;
        if (!alive) return;
        setSummary(data);
      } catch (error) {
        if (!alive) return;
        setSummary(null);
        setLoadError(error instanceof Error ? error.message : "Failed to load QC snapshot.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    void loadSummary();
    return () => {
      alive = false;
    };
  }, [refreshIndex]);

  useEffect(() => {
    let alive = true;

    async function loadDomain() {
      setDomainSnapshot(null);
      if (!selected) return;
      try {
        const res = await fetch(`/qc/${selected.domain}.json?ts=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as DomainSnapshot;
        if (alive) setDomainSnapshot(data);
      } catch {
        if (alive) setDomainSnapshot(null);
      }
    }

    void loadDomain();
    return () => {
      alive = false;
    };
  }, [selected, refreshIndex]);

  const domainRows = useMemo(() => {
    return QC_AREAS.map((area) => ({
      area,
      summary: summary?.domains.find((row) => row.domain === area.domain) ?? null,
    }));
  }, [summary]);

  const pageTitle = selected?.title ?? "Data Quality Control";
  const commands = summary?.rerun_commands ?? DEFAULT_COMMANDS;
  const selectedSummary = selected ? summary?.domains.find((row) => row.domain === selected.domain) ?? null : null;

  function markFindingsResolved(resolvedFindings: QcFinding[]) {
    const keys = new Set(resolvedFindings.map(findingKey));
    setActionMessage("QC item resolved locally. Run QC again when you are ready to refresh the full snapshot counts.");
    setDomainSnapshot((current) => {
      if (!current) return current;
      return {
        ...current,
        findings: current.findings.filter((candidate) => !keys.has(findingKey(candidate))),
      };
    });
    setSummary((current) => {
      if (!current || !selected) return current;
      return resolvedFindings.reduce(
        (next, finding) => adjustSummaryCounts(next, selected.domain, finding.severity, -1),
        current
      );
    });
  }

  function openRecordFromQc(target: RecordTarget) {
    if (selected?.domain === "sizes" && target.type === "manta") {
      setSizeReviewMantaId(target.id);
      setRecordTarget(null);
      return;
    }
    setRecordTarget(target);
  }

  function markSightingRelatedFindingsResolved(sightingId: number) {
    if (!domainSnapshot) return;
    const resolvedFindings = domainSnapshot.findings.filter((finding) => findingReferencesSighting(finding, sightingId));
    if (resolvedFindings.length > 0) markFindingsResolved(resolvedFindings);
  }

  function markSightingLocationFindingsResolved(sightingId: number) {
    if (!domainSnapshot) return;
    const resolvedFindings = domainSnapshot.findings.filter(
      (finding) => findingReferencesSighting(finding, sightingId) && isSightingLocationFinding(finding)
    );
    if (resolvedFindings.length > 0) markFindingsResolved(resolvedFindings);
  }

  function markMantaNoVentralPhotoFindingsResolved(mantaId: number) {
    if (!domainSnapshot || selected?.domain !== "photos") return;

    const noVentralResolvedChecks = new Set([
      "photo_manta_catalog_link_present",
      "best_manta_ventral_has_ventral_view",
    ]);

    const resolvedFindings = domainSnapshot.findings.filter((finding) => {
      if (!noVentralResolvedChecks.has(finding.check_name)) return false;

      const metadata = finding.metadata ?? {};
      if (numericId(finding.related_manta_id) === mantaId) return true;
      if (finding.table_name === "mantas" && numericId(finding.primary_key) === mantaId) return true;
      if (numericId(metadata.manta_id) === mantaId) return true;
      if (numericId(metadata.pk_manta_id) === mantaId) return true;
      if (numericId(metadata.fk_manta_id) === mantaId) return true;

      const text = `${finding.message ?? ""} ${finding.suggested_action ?? ""}`;
      return text.includes(`manta ${mantaId}`) || text.includes(`Manta ${mantaId}`);
    });

    if (resolvedFindings.length > 0) markFindingsResolved(resolvedFindings);
  }

  function markPhotoRelatedFindingsResolved(photoId: number) {
    if (!domainSnapshot || selected?.domain !== "photos") return;

    const resolvedFindings = domainSnapshot.findings.filter((finding) => findingReferencesPhoto(finding, photoId));
    if (resolvedFindings.length > 0) markFindingsResolved(resolvedFindings);
  }

  return (
    <Layout>
      <div className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 py-8">
        <div className="max-w-6xl mx-auto space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold">{pageTitle}</h1>
              <p className="mt-2 text-sm sm:text-base text-blue-50">
                Quick maintenance status for the browser tables.
              </p>
            </div>
            <HeroStatus
              summary={selected ? selectedSummary : makeOverallSummary(summary)}
              label={selected?.tableLabel ?? "Overall QC"}
            />
          </div>
          <HeroScoreboard summary={summary} selected={selected} loading={loading} />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-2">
        <Link to="/admin" className="text-sm text-blue-700 underline">
          Admin
        </Link>
        <span className="text-sm text-slate-600"> / </span>
        <Link to="/admin/qc" className="text-sm text-blue-700 underline">
          Data Quality Control
        </Link>
        {selected ? <span className="text-sm text-slate-600"> / {selected.title}</span> : null}
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {loadError ? (
          <Card>
            <CardContent className="p-5 text-sm text-amber-700">
              No QC snapshot is available yet. Run <code>{commands.local}</code>, then refresh this page.
            </CardContent>
          </Card>
        ) : null}

        {!selected ? (
          <>
            <DashboardGrid rows={domainRows} onOpen={(slug) => navigate(`/admin/qc/${slug}`)} />
          </>
        ) : (
          <DomainPanel
            area={selected}
            summaryRow={selectedSummary}
            snapshot={domainSnapshot}
            onOpenRecord={openRecordFromQc}
            onFindingsResolved={markFindingsResolved}
            actionMessage={actionMessage}
          />
        )}

        <RunCommands commands={commands} loading={loading} onRefresh={() => setRefreshIndex((value) => value + 1)} />
        {recordTarget?.type === "sighting" ? (
          <SightingDetailModal
            open={true}
            onOpenChange={(open) => !open && setRecordTarget(null)}
            sightingId={recordTarget.id}
            onOpenMantas={() => undefined}
            onOpenRecord={openRecordFromQc}
            isAdmin={true}
            onSaved={(event) => {
              if (event?.type === "sighting_updated") {
                const locationFields = new Set(["location_unknown", "location", "sitelocation", "latitude", "longitude"]);
                if (event.changedFields.some((field) => locationFields.has(field))) {
                  markSightingLocationFindingsResolved(event.sightingId);
                  return;
                }
                setRefreshIndex((value) => value + 1);
                return;
              }
              if (
                event?.type === "linked_manta_deleted" ||
                event?.type === "sighting_manta_summary_synced" ||
                event?.type === "sighting_deleted"
              ) {
                markSightingRelatedFindingsResolved(event.sightingId);
                return;
              }
              setRefreshIndex((value) => value + 1);
            }}
          />
        ) : (
        <QcRecordModal
          target={recordTarget}
          onOpenChange={(open) => !open && setRecordTarget(null)}
          onOpenRecord={openRecordFromQc}
          qcFindings={domainSnapshot?.findings ?? []}
          onMantaNoVentralUpdated={markMantaNoVentralPhotoFindingsResolved}
          onPhotoDeleted={markPhotoRelatedFindingsResolved}
        />
      )}
        <SizeQcReviewModal
          mantaId={sizeReviewMantaId}
          findings={domainSnapshot?.findings ?? []}
          onOpenChange={(open) => !open && setSizeReviewMantaId(null)}
          onFindingsResolved={markFindingsResolved}
        />
      </div>
    </Layout>
  );
}

function findingReferencesSighting(finding: QcFinding, sightingId: number) {
  if (numericId(finding.related_sighting_id) === sightingId) return true;
  if (finding.table_name === "sightings" && numericId(finding.primary_key) === sightingId) return true;
  const listed = getSightingContext(finding, "listed_sighting");
  const pointed = getSightingContext(finding, "manta_points_to_sighting");
  return numericId(listed?.id) === sightingId || numericId(pointed?.id) === sightingId;
}

function isSightingLocationFinding(finding: QcFinding) {
  return (
    finding.check_name === "sighting_location_present" ||
    finding.check_name === "sighting_map_coordinates_present" ||
    finding.check_name === "sighting_map_coordinates_valid"
  );
}

function HeroStatus({ summary, label }: { summary: SummaryDomain | null; label: string }) {
  const status = getStatus(summary);
  const Icon = status.icon;
  return (
    <div className="rounded-lg bg-white/15 px-4 py-3 text-left ring-1 ring-white/25" title={status.description}>
      <div className="text-xs uppercase tracking-wide text-blue-50">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-lg font-semibold">
        <Icon className="h-6 w-6" />
        {status.heroLabel}
      </div>
    </div>
  );
}

function HeroScoreboard({
  summary,
  selected,
  loading,
}: {
  summary: SummarySnapshot | null;
  selected: QcArea | null;
  loading: boolean;
}) {
  if (loading) {
    return <div className="rounded-lg bg-white/10 px-4 py-3 text-sm text-blue-50">Loading latest QC status...</div>;
  }

  if (!summary) {
    return <div className="rounded-lg bg-white/10 px-4 py-3 text-sm text-blue-50">No QC run has been loaded yet.</div>;
  }

  const domains = selected
    ? summary.domains.filter((row) => row.domain === selected.domain)
    : summary.domains;

  return (
    <div className="rounded-lg bg-white/10 p-3 ring-1 ring-white/20">
      <div className="mb-3 flex flex-col gap-1 text-sm text-blue-50 sm:flex-row sm:items-center sm:justify-between">
        <span>Last checked {formatDateTime(summary.checked_at)}</span>
        <span>Database {summary.database_available ? "checked" : "not checked"} · Storage objects {summary.storage_checks_enabled ? "checked" : "not checked"}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {domains.map((row) => {
          const area = QC_AREAS.find((candidate) => candidate.domain === row.domain);
          return <HeroDomainPill key={row.domain} label={area?.tableLabel ?? row.domain} summary={row} />;
        })}
      </div>
    </div>
  );
}

function HeroDomainPill({ label, summary }: { label: string; summary: SummaryDomain }) {
  const status = getStatus(summary);
  const Icon = status.icon;
  return (
    <div className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-slate-900" title={status.description}>
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${status.iconClass}`} />
        <span className="font-medium">{label}</span>
      </div>
      <span className="text-xs text-slate-600">
        {summary.findings.errors}E / {summary.findings.warnings}W
      </span>
    </div>
  );
}

function DashboardGrid({
  rows,
  onOpen,
}: {
  rows: Array<{ area: QcArea; summary: SummaryDomain | null }>;
  onOpen: (slug: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Browser Page Maintenance</h2>
        <p className="text-sm text-slate-600">
          Start with the red cards. Green cards do not need maintenance from the latest QC run.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map(({ area, summary }) => (
          <DashboardCard key={area.slug} area={area} summary={summary} onOpen={() => onOpen(area.slug)} />
        ))}
      </div>
    </section>
  );
}

function DashboardCard({
  area,
  summary,
  onOpen,
}: {
  area: QcArea;
  summary: SummaryDomain | null;
  onOpen: () => void;
}) {
  const status = getStatus(summary);
  const Icon = status.icon;

  return (
    <Card className={`border ${status.borderClass}`}>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{area.tableLabel}</h3>
            <p className="text-sm text-slate-600">{area.title}</p>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${status.badgeClass}`} title={status.description}>
            <Icon className="h-3.5 w-3.5" />
            {status.label}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <CountTile label="Errors" value={summary?.findings.errors ?? 0} tone="error" />
          <CountTile label="Warnings" value={summary?.findings.warnings ?? 0} tone="warning" />
          <CountTile label="Info" value={summary?.findings.info ?? 0} tone="info" explanation={area.infoMeaning} />
        </div>

        <p className="text-sm text-slate-700">
          {summary ? (summary.findings.errors || summary.findings.warnings ? area.maintainWhen : area.cleanMeaning) : "This page has not been checked yet."}
        </p>

        <Button variant="outline" onClick={onOpen}>
          Review Details
        </Button>
      </CardContent>
    </Card>
  );
}

function DomainPanel({
  area,
  summaryRow,
  snapshot,
  onOpenRecord,
  onFindingsResolved,
  actionMessage,
}: {
  area: QcArea;
  summaryRow: SummaryDomain | null;
  snapshot: DomainSnapshot | null;
  onOpenRecord: (target: RecordTarget) => void;
  onFindingsResolved: (findings: QcFinding[]) => void;
  actionMessage: string | null;
}) {
  const status = getStatus(summaryRow);
  const Icon = status.icon;
  const findings = snapshot?.findings ?? [];
  const maintenanceFindings = findings.filter((finding) => finding.severity === "error" || finding.severity === "warning");
  const topFindings = maintenanceFindings.slice(0, 25);
  const showSightingContext = area.domain === "sightings";
  const showItemPosition = area.domain === "photos";

  return (
    <div className="space-y-6">
      <Card className={`border ${status.borderClass}`}>
        <CardContent className="p-5 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${status.badgeClass}`} title={status.description}>
                <Icon className="h-3.5 w-3.5" />
                {status.label}
              </span>
              <h2 className="text-xl font-semibold">{area.title}</h2>
              <p className="text-sm text-slate-700">
                {summaryRow?.findings.errors || summaryRow?.findings.warnings ? area.maintainWhen : area.cleanMeaning}
              </p>
            </div>
            {area.browsePath ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" asChild>
                  <Link to={area.browsePath}>Open {area.tableLabel}</Link>
                </Button>
                {area.domain === "sightings" ? (
                  <Button variant="outline" asChild>
                    <Link to="/admin/qc/sightings/missing-locations">Review Missing Locations</Link>
                  </Button>
                ) : null}
                {area.domain === "mantas" ? (
                  <Button variant="outline" asChild>
                    <Link to="/admin/manta-catalog-link-review">Review Missing Catalog Links</Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <CountTile label="Errors" value={summaryRow?.findings.errors ?? 0} tone="error" />
            <CountTile label="Warnings" value={summaryRow?.findings.warnings ?? 0} tone="warning" />
            <CountTile label="Info" value={summaryRow?.findings.info ?? 0} tone="info" explanation={area.infoMeaning} />
            <InfoTile label="Rows / Files Checked" value={rowsCheckedLabel(summaryRow?.summary)} />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4" />
              What Clean Means
            </div>
            <p className="text-sm text-slate-700">{area.cleanMeaning}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {actionMessage ? (
            <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {actionMessage}
            </div>
          ) : null}
          {!summaryRow ? (
            <div className="p-5 text-sm text-slate-600">
              No QC result exists for this browser page yet. Run <code>{DEFAULT_COMMANDS.local}</code>.
            </div>
          ) : topFindings.length === 0 ? (
            <div className="p-5 text-sm text-slate-600">
              No errors or warnings for this page in the latest QC run. Nothing needs maintenance here right now.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Priority</th>
                  {showItemPosition ? <th className="px-4 py-3 font-semibold">Item</th> : null}
                  {showSightingContext ? (
                    <th className="px-4 py-3 font-semibold">Sighting ID</th>
                  ) : (
                    <th className="px-4 py-3 font-semibold">Record</th>
                  )}
                  <th className="px-4 py-3 font-semibold">What QC Found</th>
                  {showSightingContext ? <th className="px-4 py-3 font-semibold">Sighting Comparison</th> : null}
                  <th className="px-4 py-3 font-semibold">{showSightingContext ? "Sighting To Keep / Action" : "What To Do"}</th>
                </tr>
              </thead>
              <tbody>
                {topFindings.map((finding, index) => (
                  <tr key={`${finding.check_name}-${recordLabel(finding)}-${index}`} className="border-t align-top">
                    <td className="px-4 py-3">
                      <SeverityBadge severity={finding.severity} />
                    </td>
                    {showItemPosition ? (
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-slate-600">
                        {index + 1} of {maintenanceFindings.length}
                      </td>
                    ) : null}
                    {showSightingContext ? (
                      <td className="px-4 py-3 whitespace-nowrap">
                        <SightingIssueReference finding={finding} onOpenRecord={onOpenRecord} />
                      </td>
                    ) : (
                      <td className="px-4 py-3 whitespace-nowrap">
                        <RecordReference finding={finding} onOpenRecord={onOpenRecord} />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <LinkedFindingMessage finding={finding} onOpenRecord={onOpenRecord} />
                    </td>
                    {showSightingContext ? (
                      <td className="px-4 py-3 min-w-[320px]">
                        <SightingComparisonCell finding={finding} onOpenRecord={onOpenRecord} />
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      <FindingActionCell
                        finding={finding}
                        findings={findings}
                        onFindingsResolved={onFindingsResolved}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {summaryRow && maintenanceFindings.length > topFindings.length ? (
        <p className="text-sm text-slate-600">
          Showing the first {topFindings.length} of {maintenanceFindings.length} maintenance items. Full output is in{" "}
          <code>scripts/qc/output/{area.domain}.json</code>.
        </p>
      ) : null}
    </div>
  );
}

function FindingActionCell({
  finding,
  findings,
  onFindingsResolved,
}: {
  finding: QcFinding;
  findings: QcFinding[];
  onFindingsResolved: (findings: QcFinding[]) => void;
}) {
  const groupFindings = duplicateGroupFindings(findings, finding);
  const groupPlan = duplicateGroupRemovalPlan(finding);
  const canRemoveGroup = groupPlan ? duplicateGroupRemovalIsSafeForFinding(groupPlan, finding) : false;
  const missingMantaFindings = missingListedMantaGroupFindings(findings, finding);
  const mprfReconcileFindings = mprfSightingListReconcileFindings(findings, finding);
  return (
    <div className="space-y-3">
      <div>{finding.suggested_action ?? "Review this record in the matching browser page."}</div>
      {mprfReconcileFindings.length > 0 ? (
        <MprfSightingListReconcileAction
          finding={finding}
          groupFindings={mprfReconcileFindings}
          onResolved={() => onFindingsResolved(mprfReconcileFindings)}
        />
      ) : groupFindings.length > 1 && canRemoveGroup ? (
        <DuplicateSightingGroupRemovalAction
          finding={finding}
          groupFindings={groupFindings}
          onResolved={() => onFindingsResolved(groupFindings)}
        />
      ) : groupFindings.length > 1 && groupPlan?.staleListOnly ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          <div className="mb-1 font-semibold">Keep both sightings</div>
          <div>
            This later sighting has its own manta count, so it is not treated as a zero-manta duplicate shell.
            Repair the stale manta list or duplicate manta rows instead of deleting the sighting.
          </div>
        </div>
      ) : missingMantaFindings.length > 0 ? (
        <MissingListedMantaCleanupAction
          finding={finding}
          groupFindings={missingMantaFindings}
          onResolved={() => onFindingsResolved(missingMantaFindings)}
        />
      ) : (
        <DuplicateSightingRemovalAction finding={finding} onResolved={() => onFindingsResolved([finding])} />
      )}
    </div>
  );
}

function MprfSightingListReconcileAction({
  finding,
  groupFindings,
  onResolved,
}: {
  finding: QcFinding;
  groupFindings: QcFinding[];
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sightingId = numericId(finding.related_sighting_id);
  const mantaIds = Array.from(
    new Set(groupFindings.map((item) => numericId(item.related_manta_id)).filter((id): id is number => id != null))
  ).sort((a, b) => a - b);

  if (!sightingId || mantaIds.length === 0) return null;

  async function reconcileList() {
    const reason = window.prompt(
      `Reason for reconciling MPRF list_manta_ids_2 for sighting ${sightingId}? ` +
        "This reason will be written to the audit ledger."
    );
    if (!reason?.trim()) {
      setMessage("A reason is required before changing raw data.");
      return;
    }
    const confirmed = window.confirm(
      `Reconcile sighting ${sightingId} from list_manta_ids_2?\n\n` +
        `This will audit every change, move listed manta row${mantaIds.length === 1 ? "" : "s"} ${mantaIds.join(", ")} to sighting ${sightingId} when needed, ` +
        "merge duplicate manta rows already represented on this sighting, move child links with the manta rows, and sync total_mantas/list fields.\n\n" +
        "It will not delete either sighting."
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    try {
      const result = await reconcileMprfSightingListWithAudit(sightingId, reason.trim());
      setMessage(result);
      onResolved();
    } catch (error) {
      setMessage(formatUnknownError(error, "Could not reconcile MPRF sighting list."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950">
      <div className="mb-2 font-semibold">MPRF list reconciliation available</div>
      <div className="mb-3">
        Use <code>list_manta_ids_2</code> as the source list for sighting {sightingId}. This keeps both sightings,
        repairs linked manta rows, merges duplicate manta rows on this sighting when there is one clear catalog match,
        and syncs the sighting&apos;s total/list summary fields.
      </div>
      <Button type="button" variant="outline" size="sm" onClick={reconcileList} disabled={busy}>
        {busy ? "Reconciling..." : "Reconcile MPRF List"}
      </Button>
      {message ? <div className="mt-2 text-sky-800">{message}</div> : null}
    </div>
  );
}

function MissingListedMantaCleanupAction({
  finding,
  groupFindings,
  onResolved,
}: {
  finding: QcFinding;
  groupFindings: QcFinding[];
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sightingId = numericId(finding.related_sighting_id);
  const missingMantaIds = Array.from(
    new Set(groupFindings.map((item) => numericId(item.related_manta_id)).filter((id): id is number => id != null))
  ).sort((a, b) => a - b);

  if (!sightingId || missingMantaIds.length === 0) return null;

  async function removeMissingIds() {
    const confirmed = window.confirm(
      `Remove missing manta ID${missingMantaIds.length === 1 ? "" : "s"} ${missingMantaIds.join(", ")} from sighting ${sightingId}'s list? ` +
        "This updates only the stale sighting list field and audits the change."
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    try {
      const result = await removeMissingListedMantaIdsWithAudit(sightingId, missingMantaIds);
      setMessage(result);
      onResolved();
    } catch (error) {
      setMessage(formatUnknownError(error, "Could not remove stale manta IDs."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
      <div className="mb-2 font-semibold">Stale sighting list cleanup available</div>
      <div className="mb-3">
        Sighting {sightingId} lists missing manta ID{missingMantaIds.length === 1 ? "" : "s"}{" "}
        {missingMantaIds.join(", ")}. Remove only those missing IDs from <code>list_manta_ids_2</code>.
      </div>
      <Button type="button" variant="outline" size="sm" onClick={removeMissingIds} disabled={busy}>
        {busy ? "Removing..." : "Remove Missing IDs"}
      </Button>
      {message ? <div className="mt-2 text-amber-800">{message}</div> : null}
    </div>
  );
}

function DuplicateSightingGroupRemovalAction({
  finding,
  groupFindings,
  onResolved,
}: {
  finding: QcFinding;
  groupFindings: QcFinding[];
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [useDuplicateBestVentralPhotos, setUseDuplicateBestVentralPhotos] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [mantaChoices, setMantaChoices] = useState<DuplicateMantaMergeChoice[] | null>(null);
  const basePlan = duplicateGroupRemovalPlan(finding);
  const [selectedKeepSightingId, setSelectedKeepSightingId] = useState<number | null>(null);
  const selectedKeepId = selectedKeepSightingId ?? basePlan?.keepSightingId ?? null;
  const plan = basePlan && selectedKeepId
    ? duplicateGroupPlanWithKeptSighting(basePlan, finding, selectedKeepId)
    : null;
  const timePreview = plan?.staleListOnly ? duplicateTimeWindowPreview(finding) : null;

  if (!plan) return null;

  async function removeDuplicateGroup() {
    if (!plan) return;
    const confirmed = window.confirm(
      `Merge duplicate sighting ${plan.deleteSightingId} into sighting ${plan.keepSightingId}? ` +
        (plan.staleListOnly
          ? `This will audit the deletion after confirming it has no manta rows and all listed mantas already point to sighting ${plan.keepSightingId}.` +
            (timePreview ? ` It will also update sighting ${plan.keepSightingId}'s time window from ${timePreview.current} to ${timePreview.updated}.` : "")
          : `This will audit every step, merge duplicate sighting ${plan.deleteSightingId}'s mantas/photos/notes into sighting ${plan.keepSightingId}, and then remove the duplicate sighting.`)
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    try {
      const result = await removeDuplicateSightingGroupWithAudit(plan, {
        useDuplicateBestVentralPhoto: useDuplicateBestVentralPhotos,
        mantaChoices: mantaChoices ?? undefined,
      });
      setMessage(result);
      onResolved();
    } catch (error) {
      setMessage(formatUnknownError(error, "Could not remove duplicate group."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
      <div className="mb-2 font-semibold">Duplicate group removal available</div>
      <div className="mb-3">
        Merge duplicate sighting {plan.deleteSightingId} into sighting {plan.keepSightingId}
        {plan.staleListOnly
          ? " after confirming its listed mantas already point to the kept sighting."
          : ` and merge ${groupFindings.length} listed duplicate manta rows.`}
      </div>
      <label className="mb-3 block rounded border border-red-100 bg-white/70 p-2 text-xs text-red-950">
        <span className="mb-1 block font-semibold">Sighting to keep</span>
        <select
          className="w-full rounded border border-red-200 bg-white px-2 py-1"
          value={plan.keepSightingId}
          disabled={busy}
          onChange={(event) => {
            setSelectedKeepSightingId(Number(event.target.value));
            setMantaChoices(null);
          }}
        >
          <option value={plan.listedSightingId}>Keep sighting {plan.listedSightingId}</option>
          <option value={plan.pointedSightingId}>Keep sighting {plan.pointedSightingId}</option>
        </select>
        <span className="mt-1 block">
          Pick the sighting with the better/complete record. The removed sighting&apos;s notes, child links, and selected manta data will be merged where possible.
        </span>
      </label>
      {timePreview ? (
        <div className="mb-3 rounded border border-red-100 bg-white/70 p-2 text-xs text-red-950">
          Before deleting {plan.deleteSightingId}, update sighting {plan.keepSightingId}&apos;s time window from{" "}
          <strong>{timePreview.current}</strong> to <strong>{timePreview.updated}</strong>.
        </div>
      ) : null}
      {!plan.staleListOnly ? (
        <>
          <label className="mb-3 flex items-start gap-2 rounded border border-red-100 bg-white/70 p-2 text-xs text-red-950">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={useDuplicateBestVentralPhotos}
              onChange={(event) => setUseDuplicateBestVentralPhotos(event.target.checked)}
              disabled={busy}
            />
            <span>
              Use each duplicate manta&apos;s best ventral photo as the kept manta&apos;s best ventral photo when one exists.
              Leave unchecked to keep current best photos and preserve duplicate photos as extra non-best photos.
            </span>
          </label>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowReview(true)} disabled={busy}>
            Review Manta Merge Choices
          </Button>
          {mantaChoices ? (
            <div className="mt-2 rounded border border-red-100 bg-white/70 p-2 text-xs text-red-950">
              {mantaChoices.length} manta choice{mantaChoices.length === 1 ? "" : "s"} selected for this duplicate sighting.
            </div>
          ) : null}
        </>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={removeDuplicateGroup} disabled={busy} className="mt-3">
        {busy ? "Merging..." : "Merge Duplicate Group"}
      </Button>
      {message ? <div className="mt-2 text-red-800">{message}</div> : null}
      {!plan.staleListOnly ? (
        <DuplicateSightingMergeReviewDialog
          open={showReview}
          onOpenChange={setShowReview}
          plan={plan}
          onChoicesSaved={(choices) => {
            setMantaChoices(choices);
            setShowReview(false);
          }}
        />
      ) : null}
    </div>
  );
}

function DuplicateSightingMergeReviewDialog({
  open,
  onOpenChange,
  plan,
  onChoicesSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: DuplicateGroupRemovalPlan;
  onChoicesSaved: (choices: DuplicateMantaMergeChoice[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keepMantas, setKeepMantas] = useState<Array<Record<string, any>>>([]);
  const [duplicateMantas, setDuplicateMantas] = useState<Array<Record<string, any>>>([]);
  const [choices, setChoices] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!open) return;
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [kept, duplicate] = await Promise.all([
          loadRowsByColumn("mantas", "fk_sighting_id", plan.keepSightingId),
          loadRowsByColumn("mantas", "fk_sighting_id", plan.deleteSightingId),
        ]);
        if (!alive) return;
        const keptSorted = kept.sort((a, b) => Number(a.pk_manta_id) - Number(b.pk_manta_id));
        const duplicateSorted = duplicate.sort((a, b) => Number(a.pk_manta_id) - Number(b.pk_manta_id));
        setKeepMantas(keptSorted);
        setDuplicateMantas(duplicateSorted);
        setChoices(
          Object.fromEntries(
            duplicateSorted.map((manta) => {
              const autoMatch = keptSorted.find(
                (keptManta) =>
                  numericId(keptManta.fk_catalog_id) != null &&
                  numericId(keptManta.fk_catalog_id) === numericId(manta.fk_catalog_id)
              );
              return [Number(manta.pk_manta_id), autoMatch ? `merge:${autoMatch.pk_manta_id}` : "move"];
            })
          )
        );
      } catch (loadError) {
        if (alive) setError(formatUnknownError(loadError, "Could not load duplicate sighting mantas."));
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [open, plan.keepSightingId, plan.deleteSightingId]);

  function saveChoices() {
    const nextChoices = duplicateMantas.map((manta) => {
      const duplicateMantaId = Number(manta.pk_manta_id);
      const rawChoice = choices[duplicateMantaId] ?? "move";
      if (rawChoice.startsWith("merge:")) {
        return {
          duplicateMantaId,
          action: "merge" as const,
          keptMantaId: Number(rawChoice.replace("merge:", "")),
        };
      }
      return { duplicateMantaId, action: "move" as const };
    });
    onChoicesSaved(nextChoices);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Review Duplicate Sighting Mantas</DialogTitle>
          <DialogDescription>
            Choose whether each manta from duplicate sighting {plan.deleteSightingId} should merge into an existing manta on sighting {plan.keepSightingId}, or move over as an additional manta.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="text-sm text-slate-600">Loading manta rows...</div>
        ) : error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <MantaChoiceList title={`Kept sighting ${plan.keepSightingId}`} mantas={keepMantas} />
              <div className="rounded-md border border-slate-200">
                <div className="border-b bg-slate-50 px-3 py-2 font-semibold">Duplicate sighting {plan.deleteSightingId}</div>
                <div className="divide-y">
                  {duplicateMantas.map((manta) => {
                    const duplicateMantaId = Number(manta.pk_manta_id);
                    return (
                      <div key={duplicateMantaId} className="grid gap-2 p-3">
                        <MantaChoiceSummary manta={manta} />
                        <select
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                          value={choices[duplicateMantaId] ?? "move"}
                          onChange={(event) =>
                            setChoices((prev) => ({ ...prev, [duplicateMantaId]: event.target.value }))
                          }
                        >
                          <option value="move">Move this manta into kept sighting as an additional manta</option>
                          {keepMantas.map((keptManta) => (
                            <option key={keptManta.pk_manta_id} value={`merge:${keptManta.pk_manta_id}`}>
                              Merge into manta {keptManta.pk_manta_id} | catalog {formatPlainValue(keptManta.fk_catalog_id)} | {formatPlainValue(keptManta.name)}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
              Saving choices does not edit raw data. The actual audited changes happen only when you click Remove Duplicate Group.
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={saveChoices}>
                Save Choices
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MantaChoiceList({ title, mantas }: { title: string; mantas: Array<Record<string, any>> }) {
  return (
    <div className="rounded-md border border-slate-200">
      <div className="border-b bg-slate-50 px-3 py-2 font-semibold">{title}</div>
      <div className="divide-y">
        {mantas.length ? mantas.map((manta) => <MantaChoiceSummary key={String(manta.pk_manta_id)} manta={manta} />) : <div className="p-3 text-sm text-slate-500">No linked manta rows.</div>}
      </div>
    </div>
  );
}

function MantaChoiceSummary({ manta }: { manta: Record<string, any> }) {
  return (
    <div className="p-3 text-sm">
      <div className="font-medium">Manta {formatPlainValue(manta.pk_manta_id)}</div>
      <div className="text-slate-700">Catalog: {formatPlainValue(manta.fk_catalog_id)}</div>
      <div className="text-slate-700">Name: {formatPlainValue(manta.name)}</div>
      <div className="text-slate-500">
        {formatPlainValue(manta.gender)} / {formatPlainValue(manta.age_class)}
      </div>
    </div>
  );
}

function DuplicateSightingRemovalAction({
  finding,
  onResolved,
}: {
  finding: QcFinding;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [useDuplicateBestVentralPhoto, setUseDuplicateBestVentralPhoto] = useState(false);
  const plan = duplicateRemovalPlan(finding);

  if (!plan) return null;

  async function removeDuplicate() {
    if (!plan) return;
    const confirmed = window.confirm(
      `Remove duplicate sighting ${plan.deleteSightingId} and duplicate manta ${plan.deleteMantaId}? ` +
        `This will audit every step, preserve linked photos by moving them to the kept manta, and then remove the duplicate rows.`
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    try {
      const result = await removeDuplicateSightingWithAudit(plan, { useDuplicateBestVentralPhoto });
      setMessage(result);
      onResolved();
    } catch (error) {
      setMessage(formatUnknownError(error, "Could not remove duplicate."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
      <div className="mb-2 font-semibold">
        Duplicate removal available
      </div>
      <div className="mb-3">
        Keep sighting {plan.keepSightingId}; remove sighting {plan.deleteSightingId} and manta {plan.deleteMantaId}.
      </div>
      <label className="mb-3 flex items-start gap-2 rounded border border-red-100 bg-white/70 p-2 text-xs text-red-950">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={useDuplicateBestVentralPhoto}
          onChange={(event) => setUseDuplicateBestVentralPhoto(event.target.checked)}
          disabled={busy}
        />
        <span>
          Use the duplicate manta&apos;s best ventral photo as the kept manta&apos;s best ventral photo if one exists.
          Leave unchecked to keep the current best photo and preserve duplicate photos as extra non-best photos.
        </span>
      </label>
      <Button type="button" variant="outline" size="sm" onClick={removeDuplicate} disabled={busy}>
        {busy ? "Removing..." : "Remove Duplicate"}
      </Button>
      {message ? <div className="mt-2 text-red-800">{message}</div> : null}
    </div>
  );
}

type SightingContext = {
  id?: string | number;
  source?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  island?: string;
  population?: string;
  location?: string;
  latitude?: string | number;
  longitude?: string | number;
  photographer?: string;
  organization?: string;
  total_mantas?: string | number;
};

function getSightingContext(finding: QcFinding, key: "listed_sighting" | "manta_points_to_sighting") {
  const value = finding.metadata?.[key];
  if (!value || typeof value !== "object") return null;
  return value as SightingContext;
}

function SightingComparisonCell({
  finding,
  onOpenRecord,
}: {
  finding: QcFinding;
  onOpenRecord: (target: RecordTarget) => void;
}) {
  const listed = getSightingContext(finding, "listed_sighting");
  const pointed = getSightingContext(finding, "manta_points_to_sighting");
  if (!listed && !pointed) return <span className="text-slate-500">—</span>;
  const differences = sightingDifferences(listed, pointed);

  return (
    <div className="space-y-2">
      <div className="grid gap-2 text-xs md:grid-cols-2">
        <SightingMiniCard title="Listed Sighting" row={listed} onOpenRecord={onOpenRecord} />
        <SightingMiniCard title="Manta Points To" row={pointed} onOpenRecord={onOpenRecord} />
      </div>
      {differences.length ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <div className="font-semibold">Different fields</div>
          <div>{differences.join(", ")}</div>
        </div>
      ) : (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
          Displayed fields match.
        </div>
      )}
    </div>
  );
}

function SourcePill({ source, label }: { source?: string; label?: string }) {
  const normalized = source === "MPRF" ? "MPRF" : source === "Missing" ? "Missing" : "HAMER";
  const classes =
    normalized === "MPRF"
      ? "border-cyan-200 bg-cyan-50 text-cyan-800"
      : normalized === "Missing"
        ? "border-slate-200 bg-slate-50 text-slate-600"
        : "border-emerald-200 bg-emerald-50 text-emerald-800";
  const text = label ? `${label}: ${normalized}` : normalized;
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 font-medium ${classes}`} title={text}>
      {text}
    </span>
  );
}

function duplicateRemovalPlan(finding: QcFinding): DuplicateRemovalPlan | null {
  if (finding.check_name !== "listed_manta_row_links_back_to_sighting") return null;
  if (finding.metadata?.mismatch_type !== "listed_manta_points_to_other_sighting") return null;
  const keepSightingId = numericId(finding.related_sighting_id);
  const deleteMantaId = numericId(finding.related_manta_id) ?? numericId(finding.primary_key);
  const pointed = getSightingContext(finding, "manta_points_to_sighting");
  const deleteSightingId = numericId(pointed?.id);
  if (!keepSightingId || !deleteMantaId || !deleteSightingId) return null;
  if (keepSightingId === deleteSightingId) return null;
  return { keepSightingId, deleteSightingId, deleteMantaId };
}

function duplicateGroupRemovalPlan(finding: QcFinding): DuplicateGroupRemovalPlan | null {
  if (finding.check_name !== "listed_manta_row_links_back_to_sighting") return null;
  if (finding.metadata?.mismatch_type !== "listed_manta_points_to_other_sighting") return null;
  const listedSightingId = numericId(finding.related_sighting_id);
  const listed = getSightingContext(finding, "listed_sighting");
  const pointed = getSightingContext(finding, "manta_points_to_sighting");
  const pointedSightingId = numericId(pointed?.id);
  if (!listedSightingId || !pointedSightingId || listedSightingId === pointedSightingId) return null;

  const listedTotal = Number(listed?.total_mantas ?? 0);
  const pointedTotal = Number(pointed?.total_mantas ?? 0);
  const keepSightingId =
    pointedTotal > listedTotal
      ? pointedSightingId
      : listedTotal > pointedTotal
        ? listedSightingId
        : Math.min(listedSightingId, pointedSightingId);
  const deleteSightingId = keepSightingId === listedSightingId ? pointedSightingId : listedSightingId;
  return {
    keepSightingId,
    deleteSightingId,
    staleListOnly: deleteSightingId === listedSightingId && Number(listed?.total_mantas ?? 0) === 0,
    listedSightingId,
    pointedSightingId,
  };
}

function duplicateGroupRemovalIsSafeForFinding(plan: DuplicateGroupRemovalPlan, finding: QcFinding) {
  if (!plan.staleListOnly) return true;
  const listed = getSightingContext(finding, "listed_sighting");
  return Number(listed?.total_mantas ?? 0) === 0;
}

function duplicateGroupPlanWithKeptSighting(
  basePlan: DuplicateGroupRemovalPlan,
  finding: QcFinding,
  keepSightingId: number
): DuplicateGroupRemovalPlan {
  const deleteSightingId =
    keepSightingId === basePlan.listedSightingId ? basePlan.pointedSightingId : basePlan.listedSightingId;
  const listed = getSightingContext(finding, "listed_sighting");
  return {
    ...basePlan,
    keepSightingId,
    deleteSightingId,
    staleListOnly: deleteSightingId === basePlan.listedSightingId && Number(listed?.total_mantas ?? 0) === 0,
  };
}

function duplicateGroupFindings(findings: QcFinding[], finding: QcFinding) {
  const plan = duplicateGroupRemovalPlan(finding);
  if (!plan) return [];
  const pairKey = [plan.listedSightingId, plan.pointedSightingId].sort((a, b) => a - b).join(":");
  return findings.filter((candidate) => {
    const candidatePlan = duplicateGroupRemovalPlan(candidate);
    if (!candidatePlan) return false;
    return [candidatePlan.listedSightingId, candidatePlan.pointedSightingId].sort((a, b) => a - b).join(":") === pairKey;
  });
}

function isMprfSightingListReconcileFinding(finding: QcFinding) {
  if (finding.check_name !== "listed_manta_row_links_back_to_sighting") return false;
  if (finding.metadata?.mismatch_type !== "listed_manta_points_to_other_sighting") return false;
  if (finding.metadata?.repair_strategy === "reconcile_mprf_manta_list") return true;
  const listed = getSightingContext(finding, "listed_sighting");
  return comparableValue(listed?.source) === "mprf";
}

function mprfSightingListReconcileFindings(findings: QcFinding[], finding: QcFinding) {
  if (!isMprfSightingListReconcileFinding(finding)) return [];
  const sightingId = numericId(finding.related_sighting_id);
  if (!sightingId) return [];
  return findings.filter(
    (candidate) =>
      isMprfSightingListReconcileFinding(candidate) &&
      numericId(candidate.related_sighting_id) === sightingId
  );
}

function missingListedMantaGroupFindings(findings: QcFinding[], finding: QcFinding) {
  if (finding.check_name !== "listed_manta_id_has_manta_row") return [];
  const sightingId = numericId(finding.related_sighting_id);
  if (!sightingId) return [];
  return findings.filter(
    (candidate) =>
      candidate.check_name === "listed_manta_id_has_manta_row" &&
      numericId(candidate.related_sighting_id) === sightingId
  );
}

function duplicateTimeWindowPreview(finding: QcFinding) {
  const listed = getSightingContext(finding, "listed_sighting");
  const pointed = getSightingContext(finding, "manta_points_to_sighting");
  if (!listed || !pointed) return null;
  const patch = buildCombinedSightingTimePatch(
    {
      sighting_date: pointed.date,
      start_time: pointed.start_time,
      end_time: pointed.end_time,
    },
    {
      sighting_date: listed.date,
      start_time: listed.start_time,
      end_time: listed.end_time,
    }
  );
  if (!Object.keys(patch).length) return null;
  const updatedStart = String(patch.start_time ?? pointed.start_time ?? "").trim();
  const updatedEnd = String(patch.end_time ?? pointed.end_time ?? "").trim();
  return {
    current: formatTimeWindow(pointed.start_time, pointed.end_time),
    updated: formatTimeWindow(updatedStart, updatedEnd),
  };
}

async function removeDuplicateSightingWithAudit(
  plan: DuplicateRemovalPlan,
  options: DuplicateRemovalOptions = { useDuplicateBestVentralPhoto: false }
) {
  const reason = `User-confirmed duplicate: sighting ${plan.deleteSightingId} is a replicate of sighting ${plan.keepSightingId}; preserve linked child data, then remove duplicate manta ${plan.deleteMantaId} and duplicate sighting ${plan.deleteSightingId}.`;

  const [keepSighting, deleteSighting, deleteManta] = await Promise.all([
    loadSingleRow("sightings", "pk_sighting_id", plan.keepSightingId),
    loadSingleRow("sightings", "pk_sighting_id", plan.deleteSightingId),
    loadSingleRow("mantas", "pk_manta_id", plan.deleteMantaId),
  ]);

  if (!keepSighting) throw new Error(`Kept sighting ${plan.keepSightingId} was not found.`);
  if (!deleteSighting) {
    return `Duplicate sighting ${plan.deleteSightingId} was already removed. Marked the stale QC rows resolved locally.`;
  }
  if (!deleteManta) throw new Error(`Duplicate manta ${plan.deleteMantaId} was not found.`);
  if (Number(deleteManta.fk_sighting_id) !== plan.deleteSightingId) {
    throw new Error(`Manta ${plan.deleteMantaId} no longer points to sighting ${plan.deleteSightingId}; refresh QC before removing.`);
  }

  const { data: duplicateSightingMantas, error: duplicateMantasError } = await supabase
    .from("mantas")
    .select("*")
    .eq("fk_sighting_id", plan.deleteSightingId)
    .order("pk_manta_id", { ascending: true });
  if (duplicateMantasError) throw duplicateMantasError;
  const unexpectedMantas = (duplicateSightingMantas ?? []).filter(
    (row: any) => Number(row.pk_manta_id) !== plan.deleteMantaId
  );
  if (unexpectedMantas.length) {
    throw new Error(`Duplicate sighting ${plan.deleteSightingId} has more than one manta row. Open it and review manually.`);
  }

  const canonicalManta = await findCanonicalManta(plan, deleteManta);
  const [photos, canonicalMantaPhotos, catalogPhotos, mantaSizes, biopsies] = await Promise.all([
    loadRowsByOr("photos", `fk_manta_id.eq.${plan.deleteMantaId},fk_sighting_id.eq.${plan.deleteSightingId}`),
    loadRowsByColumn("photos", "fk_manta_id", Number(canonicalManta.pk_manta_id)),
    deleteManta.fk_catalog_id == null ? Promise.resolve([]) : loadRowsByColumn("photos", "fk_catalog_id", Number(deleteManta.fk_catalog_id)),
    loadRowsByColumn("manta_sizes", "fk_manta_id", plan.deleteMantaId),
    loadRowsByOr("biopsies", `fk_manta_id.eq.${plan.deleteMantaId},fk_sighting_id.eq.${plan.deleteSightingId}`),
  ]);

  if (biopsies.length) {
    throw new Error(`Duplicate manta/sighting has ${biopsies.length} biopsy row(s). Review manually before deleting.`);
  }

  const duplicateBestVentralPhoto = photos.find(
    (photo) =>
      Number(photo.fk_manta_id) === plan.deleteMantaId &&
      comparableValue(photo.photo_view) === "ventral" &&
      photo.is_best_manta_ventral_photo === true
  );
  const canonicalBestVentralPhoto = canonicalMantaPhotos.find(
    (photo) =>
      Number(photo.fk_manta_id) === Number(canonicalManta.pk_manta_id) &&
      comparableValue(photo.photo_view) === "ventral" &&
      photo.is_best_manta_ventral_photo === true
  );
  const preferredBestVentralPhotoId =
    options.useDuplicateBestVentralPhoto && duplicateBestVentralPhoto
      ? numericId(duplicateBestVentralPhoto.pk_photo_id)
      : null;

  if (preferredBestVentralPhotoId && canonicalBestVentralPhoto) {
    const patch = { is_best_manta_ventral_photo: false };
    await logDataChange({
      action: "update",
      tableName: "photos",
      primaryKey: String(canonicalBestVentralPhoto.pk_photo_id),
      recordLabel: `photo ${canonicalBestVentralPhoto.pk_photo_id}`,
      reason: `${reason} Duplicate photo ${preferredBestVentralPhotoId} was selected as the kept manta best ventral photo.`,
      oldData: pickChangedOldData(canonicalBestVentralPhoto, patch),
      newData: patch,
      changedFields: Object.keys(patch),
      metadata: {
        qc_action: "remove_duplicate_sighting",
        qc_step: "clear_existing_best_ventral_before_duplicate_photo_merge",
        ...plan,
        canonical_manta_id: canonicalManta.pk_manta_id,
        preferred_best_ventral_photo_id: preferredBestVentralPhotoId,
      },
    });
    const { error } = await supabase
      .from("photos")
      .update(patch)
      .eq("pk_photo_id", canonicalBestVentralPhoto.pk_photo_id);
    if (error) throw error;
  }

  for (const photo of photos) {
    const patch: Record<string, unknown> = {};
    if (Number(photo.fk_manta_id) === plan.deleteMantaId) patch.fk_manta_id = canonicalManta.pk_manta_id;
    if (Number(photo.fk_sighting_id) === plan.deleteSightingId) patch.fk_sighting_id = plan.keepSightingId;
    clearConflictingBestPhotoFlags(photo, patch, {
      canonicalMantaId: Number(canonicalManta.pk_manta_id),
      canonicalMantaPhotos,
      catalogPhotos,
      preferredBestVentralPhotoId,
    });
    if (Object.keys(patch).length === 0) continue;
    await logDataChange({
      action: "update",
      tableName: "photos",
      primaryKey: String(photo.pk_photo_id),
      recordLabel: `photo ${photo.pk_photo_id}`,
      reason,
      oldData: pickChangedOldData(photo, patch),
      newData: patch,
      changedFields: Object.keys(patch),
      metadata: {
        qc_action: "remove_duplicate_sighting",
        ...plan,
        canonical_manta_id: canonicalManta.pk_manta_id,
        preferred_best_ventral_photo_id: preferredBestVentralPhotoId,
      },
    });
    const { error } = await supabase.from("photos").update(patch).eq("pk_photo_id", photo.pk_photo_id);
    if (error) throw error;
  }

  for (const sizeRow of mantaSizes) {
    const patch = { fk_manta_id: canonicalManta.pk_manta_id };
    await logDataChange({
      action: "update",
      tableName: "manta_sizes",
      primaryKey: String(sizeRow.pk_manta_size_id ?? sizeRow.pk_size_id ?? sizeRow.id),
      recordLabel: `manta size ${sizeRow.pk_manta_size_id ?? sizeRow.pk_size_id ?? sizeRow.id}`,
      reason,
      oldData: { fk_manta_id: sizeRow.fk_manta_id },
      newData: patch,
      changedFields: ["fk_manta_id"],
      metadata: { qc_action: "remove_duplicate_sighting", ...plan, canonical_manta_id: canonicalManta.pk_manta_id },
    });
    const key = sizeRow.pk_manta_size_id ? "pk_manta_size_id" : sizeRow.pk_size_id ? "pk_size_id" : "id";
    const { error } = await supabase.from("manta_sizes").update(patch).eq(key, sizeRow[key]);
    if (error) throw error;
  }

  const keepPatch = buildKeptSightingPatch(keepSighting, deleteSighting, plan.deleteMantaId);
  if (Object.keys(keepPatch).length) {
    await logDataChange({
      action: "update",
      tableName: "sightings",
      primaryKey: plan.keepSightingId,
      recordLabel: `sighting ${plan.keepSightingId}`,
      reason,
      oldData: pickChangedOldData(keepSighting, keepPatch),
      newData: keepPatch,
      changedFields: Object.keys(keepPatch),
      metadata: { qc_action: "remove_duplicate_sighting", ...plan, canonical_manta_id: canonicalManta.pk_manta_id },
    });
    const { error } = await supabase.from("sightings").update(keepPatch).eq("pk_sighting_id", plan.keepSightingId);
    if (error) throw error;
  }

  await logDataChange({
    action: "delete",
    tableName: "mantas",
    primaryKey: plan.deleteMantaId,
    recordLabel: `manta ${plan.deleteMantaId}`,
    reason,
    oldData: deleteManta,
    newData: {},
    changedFields: Object.keys(deleteManta),
    metadata: { qc_action: "remove_duplicate_sighting", ...plan, canonical_manta_id: canonicalManta.pk_manta_id },
  });
  const mantaDelete = await supabase.from("mantas").delete().eq("pk_manta_id", plan.deleteMantaId);
  if (mantaDelete.error) throw mantaDelete.error;

  await logDataChange({
    action: "delete",
    tableName: "sightings",
    primaryKey: plan.deleteSightingId,
    recordLabel: `sighting ${plan.deleteSightingId}`,
    reason,
    oldData: deleteSighting,
    newData: {},
    changedFields: Object.keys(deleteSighting),
    metadata: { qc_action: "remove_duplicate_sighting", ...plan, canonical_manta_id: canonicalManta.pk_manta_id },
  });
  const sightingDelete = await supabase.from("sightings").delete().eq("pk_sighting_id", plan.deleteSightingId);
  if (sightingDelete.error) throw sightingDelete.error;

  return `Removed duplicate sighting ${plan.deleteSightingId}; moved child records to manta ${canonicalManta.pk_manta_id}.`;
}

async function removeDuplicateSightingGroupWithAudit(
  plan: DuplicateGroupRemovalPlan,
  options: DuplicateRemovalOptions = { useDuplicateBestVentralPhoto: false }
) {
  const reason = plan.staleListOnly
    ? `User-confirmed stale duplicate sighting: sighting ${plan.deleteSightingId} is a newer zero-manta duplicate of sighting ${plan.keepSightingId}; its listed mantas already point to the kept sighting, so remove the stale duplicate sighting.`
    : `User-confirmed duplicate group: sighting ${plan.deleteSightingId} is a replicate of sighting ${plan.keepSightingId}; merge duplicate manta/photo links into the kept sighting, then remove the duplicate sighting group.`;

  const [keepSighting, deleteSighting, duplicateMantas] = await Promise.all([
    loadSingleRow("sightings", "pk_sighting_id", plan.keepSightingId),
    loadSingleRow("sightings", "pk_sighting_id", plan.deleteSightingId),
    loadRowsByColumn("mantas", "fk_sighting_id", plan.deleteSightingId),
  ]);

  if (!keepSighting) throw new Error(`Kept sighting ${plan.keepSightingId} was not found.`);
  if (!deleteSighting) {
    return `Duplicate sighting ${plan.deleteSightingId} was already removed. Marked the stale QC rows resolved locally.`;
  }
  if (plan.staleListOnly) {
    if (duplicateMantas.length > 0) {
      throw new Error(`Duplicate sighting ${plan.deleteSightingId} now has linked manta rows. Refresh QC before removing.`);
    }
    await removeStaleDuplicateSightingWithAudit(plan, keepSighting, deleteSighting, reason);
    return `Removed stale duplicate sighting ${plan.deleteSightingId}; listed mantas already belonged to sighting ${plan.keepSightingId}.`;
  }
  if (duplicateMantas.length === 0) {
    throw new Error(`Duplicate sighting ${plan.deleteSightingId} has no linked manta rows to merge.`);
  }

  const explicitChoicesByMantaId = new Map(
    (options.mantaChoices ?? []).map((choice) => [choice.duplicateMantaId, choice])
  );
  const pairings: Array<{ duplicate: Record<string, any>; canonical: Record<string, any> }> = [];
  const moveOnlyMantas: Array<Record<string, any>> = [];
  const canonicalIds = new Set<number>();
  for (const duplicateManta of duplicateMantas) {
    const duplicateMantaId = Number(duplicateManta.pk_manta_id);
    const explicitChoice = explicitChoicesByMantaId.get(duplicateMantaId);
    if (explicitChoice?.action === "move") {
      moveOnlyMantas.push(duplicateManta);
      continue;
    }

    const canonical = explicitChoice?.keptMantaId
      ? await loadSingleRow("mantas", "pk_manta_id", explicitChoice.keptMantaId)
      : await findCanonicalManta(
          {
            keepSightingId: plan.keepSightingId,
            deleteSightingId: plan.deleteSightingId,
            deleteMantaId: duplicateMantaId,
          },
          duplicateManta
        );
    if (!canonical) throw new Error(`Kept manta ${explicitChoice?.keptMantaId} was not found.`);
    if (Number(canonical.fk_sighting_id) !== plan.keepSightingId) {
      throw new Error(`Kept manta ${canonical.pk_manta_id} does not point to sighting ${plan.keepSightingId}. Review choices before removing.`);
    }
    const canonicalId = Number(canonical.pk_manta_id);
    if (canonicalIds.has(canonicalId)) {
      throw new Error(`More than one duplicate manta maps to kept manta ${canonicalId}. Review this duplicate group manually.`);
    }
    canonicalIds.add(canonicalId);
    pairings.push({ duplicate: duplicateManta, canonical });
  }

  const duplicateMantaIds = pairings.map((pair) => Number(pair.duplicate.pk_manta_id));
  const moveOnlyMantaIds = moveOnlyMantas.map((manta) => Number(manta.pk_manta_id));
  const affectedDuplicateMantaIds = [...duplicateMantaIds, ...moveOnlyMantaIds];
  const duplicateToCanonical = new Map<number, Record<string, any>>(
    pairings.map((pair) => [Number(pair.duplicate.pk_manta_id), pair.canonical])
  );
  const [photos, mantaSizes, biopsies, mprfMantaMapRows] = await Promise.all([
    loadRowsByColumnsOr("photos", [
      { key: "fk_sighting_id", value: plan.deleteSightingId },
      ...affectedDuplicateMantaIds.map((id) => ({ key: "fk_manta_id", value: id })),
    ]),
    loadRowsByColumnsOr(
      "manta_sizes",
      duplicateMantaIds.map((id) => ({ key: "fk_manta_id", value: id }))
    ),
    loadRowsByColumnsOr("biopsies", [
      { key: "fk_sighting_id", value: plan.deleteSightingId },
      ...affectedDuplicateMantaIds.map((id) => ({ key: "fk_manta_id", value: id })),
    ]),
    loadRowsByColumnsOr(
      "mprf_manta_map",
      duplicateMantaIds.map((id) => ({ key: "pk_manta_id", value: id }))
    ),
  ]);

  const allCatalogIds = Array.from(
    new Set(pairings.map((pair) => numericId(pair.duplicate.fk_catalog_id)).filter((id): id is number => id != null))
  );
  const [canonicalPhotoGroups, catalogPhotoGroups] = await Promise.all([
    Promise.all(pairings.map((pair) => loadRowsByColumn("photos", "fk_manta_id", Number(pair.canonical.pk_manta_id)))),
    Promise.all(allCatalogIds.map((catalogId) => loadRowsByColumn("photos", "fk_catalog_id", catalogId))),
  ]);
  const canonicalPhotosByMantaId = new Map<number, Array<Record<string, any>>>();
  pairings.forEach((pair, index) => {
    canonicalPhotosByMantaId.set(Number(pair.canonical.pk_manta_id), canonicalPhotoGroups[index]);
  });
  const catalogPhotos = catalogPhotoGroups.flat();

  const preferredBestVentralByDuplicateManta = new Map<number, number>();
  if (options.useDuplicateBestVentralPhoto) {
    for (const pair of pairings) {
      const duplicateMantaId = Number(pair.duplicate.pk_manta_id);
      const canonicalMantaId = Number(pair.canonical.pk_manta_id);
      const duplicateBestVentralPhoto = photos.find(
        (photo) =>
          Number(photo.fk_manta_id) === duplicateMantaId &&
          comparableValue(photo.photo_view) === "ventral" &&
          photo.is_best_manta_ventral_photo === true
      );
      const preferredPhotoId = numericId(duplicateBestVentralPhoto?.pk_photo_id);
      if (!preferredPhotoId) continue;
      preferredBestVentralByDuplicateManta.set(duplicateMantaId, preferredPhotoId);
      const canonicalBestVentralPhoto = (canonicalPhotosByMantaId.get(canonicalMantaId) ?? []).find(
        (photo) =>
          Number(photo.fk_manta_id) === canonicalMantaId &&
          comparableValue(photo.photo_view) === "ventral" &&
          photo.is_best_manta_ventral_photo === true
      );
      if (!canonicalBestVentralPhoto) continue;
      const patch = { is_best_manta_ventral_photo: false };
      await logDataChange({
        action: "update",
        tableName: "photos",
        primaryKey: String(canonicalBestVentralPhoto.pk_photo_id),
        recordLabel: `photo ${canonicalBestVentralPhoto.pk_photo_id}`,
        reason: `${reason} Duplicate photo ${preferredPhotoId} was selected as kept manta ${canonicalMantaId}'s best ventral photo.`,
        oldData: pickChangedOldData(canonicalBestVentralPhoto, patch),
        newData: patch,
        changedFields: Object.keys(patch),
        metadata: {
          qc_action: "remove_duplicate_sighting_group",
          qc_step: "clear_existing_best_ventral_before_duplicate_photo_merge",
          ...plan,
          duplicate_manta_id: duplicateMantaId,
          canonical_manta_id: canonicalMantaId,
          preferred_best_ventral_photo_id: preferredPhotoId,
        },
      });
      const { error } = await supabase
        .from("photos")
        .update(patch)
        .eq("pk_photo_id", canonicalBestVentralPhoto.pk_photo_id);
      if (error) throw error;
    }
  }

  for (const photo of photos) {
    const patch: Record<string, unknown> = {};
    const duplicateMantaId = numericId(photo.fk_manta_id);
    const canonicalManta = duplicateMantaId ? duplicateToCanonical.get(duplicateMantaId) : null;
    if (canonicalManta) patch.fk_manta_id = canonicalManta.pk_manta_id;
    if (Number(photo.fk_sighting_id) === plan.deleteSightingId) patch.fk_sighting_id = plan.keepSightingId;
    if (canonicalManta && duplicateMantaId) {
      clearConflictingBestPhotoFlags(photo, patch, {
        canonicalMantaId: Number(canonicalManta.pk_manta_id),
        canonicalMantaPhotos: canonicalPhotosByMantaId.get(Number(canonicalManta.pk_manta_id)) ?? [],
        catalogPhotos,
        preferredBestVentralPhotoId: preferredBestVentralByDuplicateManta.get(duplicateMantaId) ?? null,
      });
    }
    if (Object.keys(patch).length === 0) continue;
    await logDataChange({
      action: "update",
      tableName: "photos",
      primaryKey: String(photo.pk_photo_id),
      recordLabel: `photo ${photo.pk_photo_id}`,
      reason,
      oldData: pickChangedOldData(photo, patch),
      newData: patch,
      changedFields: Object.keys(patch),
      metadata: {
        qc_action: "remove_duplicate_sighting_group",
        ...plan,
        duplicate_manta_id: duplicateMantaId,
        canonical_manta_id: canonicalManta?.pk_manta_id ?? null,
        preferred_best_ventral_photo_id: duplicateMantaId
          ? preferredBestVentralByDuplicateManta.get(duplicateMantaId) ?? null
          : null,
      },
    });
    const { error } = await supabase.from("photos").update(patch).eq("pk_photo_id", photo.pk_photo_id);
    if (error) throw error;
  }

  for (const biopsy of biopsies) {
    const patch: Record<string, unknown> = {};
    const duplicateMantaId = numericId(biopsy.fk_manta_id);
    const canonicalManta = duplicateMantaId ? duplicateToCanonical.get(duplicateMantaId) : null;
    if (canonicalManta) patch.fk_manta_id = canonicalManta.pk_manta_id;
    if (Number(biopsy.fk_sighting_id) === plan.deleteSightingId) patch.fk_sighting_id = plan.keepSightingId;
    if (Object.keys(patch).length === 0) continue;
    await logDataChange({
      action: "update",
      tableName: "biopsies",
      primaryKey: String(biopsy.pk_biopsy_id ?? biopsy.id),
      recordLabel: `biopsy ${biopsy.pk_biopsy_id ?? biopsy.id}`,
      reason,
      oldData: pickChangedOldData(biopsy, patch),
      newData: patch,
      changedFields: Object.keys(patch),
      metadata: {
        qc_action: "remove_duplicate_sighting_group",
        ...plan,
        duplicate_manta_id: duplicateMantaId,
        canonical_manta_id: canonicalManta?.pk_manta_id ?? null,
      },
    });
    const key = biopsy.pk_biopsy_id ? "pk_biopsy_id" : "id";
    const { error } = await supabase.from("biopsies").update(patch).eq(key, biopsy[key]);
    if (error) throw error;
  }

  for (const sizeRow of mantaSizes) {
    const duplicateMantaId = numericId(sizeRow.fk_manta_id);
    const canonicalManta = duplicateMantaId ? duplicateToCanonical.get(duplicateMantaId) : null;
    if (!canonicalManta) continue;
    const patch = { fk_manta_id: canonicalManta.pk_manta_id };
    await logDataChange({
      action: "update",
      tableName: "manta_sizes",
      primaryKey: String(sizeRow.pk_manta_size_id ?? sizeRow.pk_size_id ?? sizeRow.id),
      recordLabel: `manta size ${sizeRow.pk_manta_size_id ?? sizeRow.pk_size_id ?? sizeRow.id}`,
      reason,
      oldData: { fk_manta_id: sizeRow.fk_manta_id },
      newData: patch,
      changedFields: ["fk_manta_id"],
      metadata: {
        qc_action: "remove_duplicate_sighting_group",
        ...plan,
        duplicate_manta_id: duplicateMantaId,
        canonical_manta_id: canonicalManta.pk_manta_id,
      },
    });
    const key = sizeRow.pk_manta_size_id ? "pk_manta_size_id" : sizeRow.pk_size_id ? "pk_size_id" : "id";
    const { error } = await supabase.from("manta_sizes").update(patch).eq(key, sizeRow[key]);
    if (error) throw error;
  }

  for (const mapRow of mprfMantaMapRows) {
    const duplicateMantaId = numericId(mapRow.pk_manta_id);
    const canonicalManta = duplicateMantaId ? duplicateToCanonical.get(duplicateMantaId) : null;
    if (!canonicalManta) continue;
    const patch = { pk_manta_id: Number(canonicalManta.pk_manta_id) };
    const mapPrimaryKey = String(mapRow.pk_mprf_manta_id ?? mapRow.pk_manta_id ?? JSON.stringify(mapRow));
    await logDataChange({
      action: "update",
      tableName: "mprf_manta_map",
      primaryKey: mapPrimaryKey,
      recordLabel: `mprf manta map ${mapPrimaryKey}`,
      reason,
      oldData: pickChangedOldData(mapRow, patch),
      newData: patch,
      changedFields: ["pk_manta_id"],
      metadata: {
        qc_action: "remove_duplicate_sighting_group",
        qc_step: "move_mprf_manta_map_to_kept_manta",
        ...plan,
        duplicate_manta_id: duplicateMantaId,
        canonical_manta_id: canonicalManta.pk_manta_id,
      },
    });
    const { error } = await supabase
      .from("mprf_manta_map")
      .update(patch)
      .eq("pk_manta_id", duplicateMantaId);
    if (error) {
      if (error.code === "23505" || error.code === "409" || /duplicate|conflict/i.test(error.message ?? "")) {
        await logDataChange({
          action: "delete",
          tableName: "mprf_manta_map",
          primaryKey: mapPrimaryKey,
          recordLabel: `mprf manta map ${mapPrimaryKey}`,
          reason: `${reason} Kept manta ${canonicalManta.pk_manta_id} already has an MPRF source-map row, so remove the duplicate source-map row before deleting manta ${duplicateMantaId}.`,
          oldData: mapRow,
          newData: {},
          changedFields: Object.keys(mapRow),
          metadata: {
            qc_action: "remove_duplicate_sighting_group",
            qc_step: "delete_duplicate_mprf_manta_map_after_merge_conflict",
            ...plan,
            duplicate_manta_id: duplicateMantaId,
            canonical_manta_id: canonicalManta.pk_manta_id,
          },
        });
        const deleteResult = await supabase.from("mprf_manta_map").delete().eq("pk_manta_id", duplicateMantaId);
        if (deleteResult.error) throw deleteResult.error;
      } else {
        throw error;
      }
    }
  }

  for (const movedManta of moveOnlyMantas) {
    const patch = { fk_sighting_id: plan.keepSightingId };
    await logDataChange({
      action: "update",
      tableName: "mantas",
      primaryKey: String(movedManta.pk_manta_id),
      recordLabel: `manta ${movedManta.pk_manta_id}`,
      reason,
      oldData: pickChangedOldData(movedManta, patch),
      newData: patch,
      changedFields: ["fk_sighting_id"],
      metadata: {
        qc_action: "remove_duplicate_sighting_group",
        qc_step: "move_unique_duplicate_sighting_manta_to_kept_sighting",
        ...plan,
        moved_manta_id: movedManta.pk_manta_id,
      },
    });
    const { error } = await supabase
      .from("mantas")
      .update(patch)
      .eq("pk_manta_id", movedManta.pk_manta_id);
    if (error) throw error;
  }

  const keepPatch = buildKeptSightingPatch(keepSighting, deleteSighting, duplicateMantaIds);
  if (Object.keys(keepPatch).length) {
    await logDataChange({
      action: "update",
      tableName: "sightings",
      primaryKey: plan.keepSightingId,
      recordLabel: `sighting ${plan.keepSightingId}`,
      reason,
      oldData: pickChangedOldData(keepSighting, keepPatch),
      newData: keepPatch,
      changedFields: Object.keys(keepPatch),
      metadata: {
        qc_action: "remove_duplicate_sighting_group",
        ...plan,
        duplicate_manta_ids: duplicateMantaIds,
        canonical_manta_ids: pairings.map((pair) => Number(pair.canonical.pk_manta_id)),
      },
    });
    const { error } = await supabase.from("sightings").update(keepPatch).eq("pk_sighting_id", plan.keepSightingId);
    if (error) throw error;
  }

  for (const pair of pairings) {
    await logDataChange({
      action: "delete",
      tableName: "mantas",
      primaryKey: pair.duplicate.pk_manta_id,
      recordLabel: `manta ${pair.duplicate.pk_manta_id}`,
      reason,
      oldData: pair.duplicate,
      newData: {},
      changedFields: Object.keys(pair.duplicate),
      metadata: {
        qc_action: "remove_duplicate_sighting_group",
        ...plan,
        duplicate_manta_id: pair.duplicate.pk_manta_id,
        canonical_manta_id: pair.canonical.pk_manta_id,
      },
    });
    const { error } = await supabase.from("mantas").delete().eq("pk_manta_id", pair.duplicate.pk_manta_id);
    if (error) throw error;
  }

  await logDataChange({
    action: "delete",
    tableName: "sightings",
    primaryKey: plan.deleteSightingId,
    recordLabel: `sighting ${plan.deleteSightingId}`,
    reason,
    oldData: deleteSighting,
    newData: {},
    changedFields: Object.keys(deleteSighting),
    metadata: {
      qc_action: "remove_duplicate_sighting_group",
      ...plan,
      duplicate_manta_ids: duplicateMantaIds,
      canonical_manta_ids: pairings.map((pair) => Number(pair.canonical.pk_manta_id)),
    },
  });
  const { error: sightingDeleteError } = await supabase
    .from("sightings")
    .delete()
    .eq("pk_sighting_id", plan.deleteSightingId);
  if (sightingDeleteError) throw sightingDeleteError;

  await syncSightingSummaryWithLinkedMantas(plan.keepSightingId, reason, {
    qc_action: "remove_duplicate_sighting_group",
    qc_step: "sync_kept_sighting_after_duplicate_group_review",
    ...plan,
    merged_duplicate_manta_ids: duplicateMantaIds,
    moved_duplicate_manta_ids: moveOnlyMantaIds,
    canonical_manta_ids: pairings.map((pair) => Number(pair.canonical.pk_manta_id)),
  });

  return `Removed duplicate sighting ${plan.deleteSightingId}; merged ${pairings.length} duplicate manta row(s) and moved ${moveOnlyMantaIds.length} manta row(s) into sighting ${plan.keepSightingId}.`;
}

async function reconcileMprfSightingListWithAudit(sightingId: number, reason: string) {
  const sighting = await loadSingleRow("sightings", "pk_sighting_id", sightingId);
  if (!sighting) throw new Error(`Sighting ${sightingId} was not found.`);

  const listedMantaIds = Array.from(new Set(parsePositiveIdList(sighting.list_manta_ids_2))).sort((a, b) => a - b);
  if (listedMantaIds.length === 0) {
    throw new Error(`Sighting ${sightingId} has no manta IDs in list_manta_ids_2 to reconcile.`);
  }

  const listedMantas = await Promise.all(listedMantaIds.map((id) => loadSingleRow("mantas", "pk_manta_id", id)));
  const missingMantaIds = listedMantaIds.filter((_, index) => !listedMantas[index]);
  if (missingMantaIds.length) {
    throw new Error(`Sighting ${sightingId} still lists manta row(s) that do not exist: ${missingMantaIds.join(", ")}.`);
  }

  const targetMantas = await loadRowsByColumn("mantas", "fk_sighting_id", sightingId);
  const targetMantasById = new Map(targetMantas.map((manta) => [Number(manta.pk_manta_id), manta]));
  const touchedOtherSightingIds = new Set<number>();
  let movedCount = 0;
  let mergedCount = 0;

  for (const listedManta of listedMantas.filter((row): row is Record<string, any> => Boolean(row))) {
    const listedMantaId = Number(listedManta.pk_manta_id);
    if (targetMantasById.has(listedMantaId) && Number(listedManta.fk_sighting_id) === sightingId) continue;

    const oldSightingId = numericId(listedManta.fk_sighting_id);
    if (oldSightingId && oldSightingId !== sightingId) touchedOtherSightingIds.add(oldSightingId);

    const listedCatalogId = numericId(listedManta.fk_catalog_id);
    const canonicalCandidates = listedCatalogId
      ? Array.from(targetMantasById.values()).filter(
          (targetManta) =>
            Number(targetManta.pk_manta_id) !== listedMantaId &&
            numericId(targetManta.fk_catalog_id) === listedCatalogId
        )
      : [];

    if (canonicalCandidates.length > 1) {
      throw new Error(
        `Sighting ${sightingId} has more than one existing manta for catalog ${listedCatalogId}. Review manta ${listedMantaId} manually.`
      );
    }

    if (canonicalCandidates.length === 1) {
      await mergeMprfListedMantaIntoCanonical({
        duplicateManta: listedManta,
        canonicalManta: canonicalCandidates[0],
        targetSightingId: sightingId,
        reason,
      });
      mergedCount += 1;
      continue;
    }

    const patch = { fk_sighting_id: sightingId };
    await logDataChange({
      action: "update",
      tableName: "mantas",
      primaryKey: String(listedMantaId),
      recordLabel: `manta ${listedMantaId}`,
      reason,
      oldData: pickChangedOldData(listedManta, patch),
      newData: patch,
      changedFields: ["fk_sighting_id"],
      metadata: {
        qc_action: "reconcile_mprf_sighting_list",
        qc_step: "move_listed_manta_to_mprf_sighting",
        sighting_id: sightingId,
        listed_manta_id: listedMantaId,
        old_sighting_id: oldSightingId,
        list_source_column: "list_manta_ids_2",
      },
    });
    const { error } = await supabase.from("mantas").update(patch).eq("pk_manta_id", listedMantaId);
    if (error) throw error;

    await moveChildSightingLinksForManta(listedMantaId, oldSightingId, sightingId, reason, {
      qc_action: "reconcile_mprf_sighting_list",
      qc_step: "move_listed_manta_child_sighting_links",
      sighting_id: sightingId,
      listed_manta_id: listedMantaId,
      old_sighting_id: oldSightingId,
    });

    targetMantasById.set(listedMantaId, { ...listedManta, fk_sighting_id: sightingId });
    movedCount += 1;
  }

  await syncSightingSummaryWithLinkedMantas(sightingId, reason, {
    qc_action: "reconcile_mprf_sighting_list",
    qc_step: "sync_reconciled_mprf_sighting",
    sighting_id: sightingId,
    listed_manta_ids: listedMantaIds,
  });
  for (const oldSightingId of touchedOtherSightingIds) {
    await syncSightingSummaryWithLinkedMantas(oldSightingId, reason, {
      qc_action: "reconcile_mprf_sighting_list",
      qc_step: "sync_previous_sighting_after_mprf_reconcile",
      reconciled_sighting_id: sightingId,
      previous_sighting_id: oldSightingId,
    });
  }

  return `Reconciled sighting ${sightingId}: moved ${movedCount} manta row(s), merged ${mergedCount} duplicate manta row(s), and synced summary fields.`;
}

async function mergeMprfListedMantaIntoCanonical({
  duplicateManta,
  canonicalManta,
  targetSightingId,
  reason,
}: {
  duplicateManta: Record<string, any>;
  canonicalManta: Record<string, any>;
  targetSightingId: number;
  reason: string;
}) {
  const duplicateMantaId = Number(duplicateManta.pk_manta_id);
  const canonicalMantaId = Number(canonicalManta.pk_manta_id);
  const oldSightingId = numericId(duplicateManta.fk_sighting_id);
  const [photos, mantaSizes, biopsies, mprfMantaMapRows] = await Promise.all([
    loadRowsByColumn("photos", "fk_manta_id", duplicateMantaId),
    loadRowsByColumn("manta_sizes", "fk_manta_id", duplicateMantaId),
    loadRowsByColumn("biopsies", "fk_manta_id", duplicateMantaId),
    loadRowsByColumn("mprf_manta_map", "pk_manta_id", duplicateMantaId),
  ]);

  for (const photo of photos) {
    const patch: Record<string, unknown> = { fk_manta_id: canonicalMantaId };
    if (numericId(photo.fk_sighting_id) === oldSightingId || numericId(photo.fk_sighting_id) == null) {
      patch.fk_sighting_id = targetSightingId;
    }
    await logDataChange({
      action: "update",
      tableName: "photos",
      primaryKey: String(photo.pk_photo_id),
      recordLabel: `photo ${photo.pk_photo_id}`,
      reason,
      oldData: pickChangedOldData(photo, patch),
      newData: patch,
      changedFields: Object.keys(patch),
      metadata: {
        qc_action: "reconcile_mprf_sighting_list",
        qc_step: "move_duplicate_mprf_manta_photo_to_canonical",
        target_sighting_id: targetSightingId,
        duplicate_manta_id: duplicateMantaId,
        canonical_manta_id: canonicalMantaId,
      },
    });
    const { error } = await supabase.from("photos").update(patch).eq("pk_photo_id", photo.pk_photo_id);
    if (error) throw error;
  }

  for (const biopsy of biopsies) {
    const patch: Record<string, unknown> = { fk_manta_id: canonicalMantaId };
    if (numericId(biopsy.fk_sighting_id) === oldSightingId || numericId(biopsy.fk_sighting_id) == null) {
      patch.fk_sighting_id = targetSightingId;
    }
    await logDataChange({
      action: "update",
      tableName: "biopsies",
      primaryKey: String(biopsy.pk_biopsy_id ?? biopsy.id),
      recordLabel: `biopsy ${biopsy.pk_biopsy_id ?? biopsy.id}`,
      reason,
      oldData: pickChangedOldData(biopsy, patch),
      newData: patch,
      changedFields: Object.keys(patch),
      metadata: {
        qc_action: "reconcile_mprf_sighting_list",
        qc_step: "move_duplicate_mprf_manta_biopsy_to_canonical",
        target_sighting_id: targetSightingId,
        duplicate_manta_id: duplicateMantaId,
        canonical_manta_id: canonicalMantaId,
      },
    });
    const key = biopsy.pk_biopsy_id ? "pk_biopsy_id" : "id";
    const { error } = await supabase.from("biopsies").update(patch).eq(key, biopsy[key]);
    if (error) throw error;
  }

  for (const sizeRow of mantaSizes) {
    const patch = { fk_manta_id: canonicalMantaId };
    await logDataChange({
      action: "update",
      tableName: "manta_sizes",
      primaryKey: String(sizeRow.pk_manta_size_id ?? sizeRow.pk_size_id ?? sizeRow.id),
      recordLabel: `manta size ${sizeRow.pk_manta_size_id ?? sizeRow.pk_size_id ?? sizeRow.id}`,
      reason,
      oldData: pickChangedOldData(sizeRow, patch),
      newData: patch,
      changedFields: ["fk_manta_id"],
      metadata: {
        qc_action: "reconcile_mprf_sighting_list",
        qc_step: "move_duplicate_mprf_manta_size_to_canonical",
        target_sighting_id: targetSightingId,
        duplicate_manta_id: duplicateMantaId,
        canonical_manta_id: canonicalMantaId,
      },
    });
    const key = sizeRow.pk_manta_size_id ? "pk_manta_size_id" : sizeRow.pk_size_id ? "pk_size_id" : "id";
    const { error } = await supabase.from("manta_sizes").update(patch).eq(key, sizeRow[key]);
    if (error) throw error;
  }

  for (const mapRow of mprfMantaMapRows) {
    const patch = { pk_manta_id: canonicalMantaId };
    const mapPrimaryKey = String(mapRow.pk_mprf_manta_id ?? mapRow.pk_manta_id ?? JSON.stringify(mapRow));
    await logDataChange({
      action: "update",
      tableName: "mprf_manta_map",
      primaryKey: mapPrimaryKey,
      recordLabel: `mprf manta map ${mapPrimaryKey}`,
      reason,
      oldData: pickChangedOldData(mapRow, patch),
      newData: patch,
      changedFields: ["pk_manta_id"],
      metadata: {
        qc_action: "reconcile_mprf_sighting_list",
        qc_step: "move_duplicate_mprf_manta_map_to_canonical",
        target_sighting_id: targetSightingId,
        duplicate_manta_id: duplicateMantaId,
        canonical_manta_id: canonicalMantaId,
      },
    });
    const { error } = await supabase.from("mprf_manta_map").update(patch).eq("pk_manta_id", duplicateMantaId);
    if (error) {
      if (error.code === "23505" || error.code === "409" || /duplicate|conflict/i.test(error.message ?? "")) {
        await logDataChange({
          action: "delete",
          tableName: "mprf_manta_map",
          primaryKey: mapPrimaryKey,
          recordLabel: `mprf manta map ${mapPrimaryKey}`,
          reason: `${reason} Kept manta ${canonicalMantaId} already has an MPRF source-map row.`,
          oldData: mapRow,
          newData: {},
          changedFields: Object.keys(mapRow),
          metadata: {
            qc_action: "reconcile_mprf_sighting_list",
            qc_step: "delete_duplicate_mprf_manta_map_after_reconcile_conflict",
            target_sighting_id: targetSightingId,
            duplicate_manta_id: duplicateMantaId,
            canonical_manta_id: canonicalMantaId,
          },
        });
        const deleteResult = await supabase.from("mprf_manta_map").delete().eq("pk_manta_id", duplicateMantaId);
        if (deleteResult.error) throw deleteResult.error;
      } else {
        throw error;
      }
    }
  }

  await logDataChange({
    action: "delete",
    tableName: "mantas",
    primaryKey: String(duplicateMantaId),
    recordLabel: `manta ${duplicateMantaId}`,
    reason,
    oldData: duplicateManta,
    newData: {},
    changedFields: Object.keys(duplicateManta),
    metadata: {
      qc_action: "reconcile_mprf_sighting_list",
      qc_step: "delete_duplicate_mprf_manta_after_merge",
      target_sighting_id: targetSightingId,
      duplicate_manta_id: duplicateMantaId,
      canonical_manta_id: canonicalMantaId,
    },
  });
  const { error } = await supabase.from("mantas").delete().eq("pk_manta_id", duplicateMantaId);
  if (error) throw error;
}

async function moveChildSightingLinksForManta(
  mantaId: number,
  oldSightingId: number | null,
  newSightingId: number,
  reason: string,
  metadata: Record<string, unknown>
) {
  if (!oldSightingId || oldSightingId === newSightingId) return;
  const [photos, biopsies] = await Promise.all([
    loadRowsByColumn("photos", "fk_manta_id", mantaId),
    loadRowsByColumn("biopsies", "fk_manta_id", mantaId),
  ]);
  for (const photo of photos.filter((row) => numericId(row.fk_sighting_id) === oldSightingId)) {
    const patch = { fk_sighting_id: newSightingId };
    await logDataChange({
      action: "update",
      tableName: "photos",
      primaryKey: String(photo.pk_photo_id),
      recordLabel: `photo ${photo.pk_photo_id}`,
      reason,
      oldData: pickChangedOldData(photo, patch),
      newData: patch,
      changedFields: ["fk_sighting_id"],
      metadata,
    });
    const { error } = await supabase.from("photos").update(patch).eq("pk_photo_id", photo.pk_photo_id);
    if (error) throw error;
  }
  for (const biopsy of biopsies.filter((row) => numericId(row.fk_sighting_id) === oldSightingId)) {
    const patch = { fk_sighting_id: newSightingId };
    await logDataChange({
      action: "update",
      tableName: "biopsies",
      primaryKey: String(biopsy.pk_biopsy_id ?? biopsy.id),
      recordLabel: `biopsy ${biopsy.pk_biopsy_id ?? biopsy.id}`,
      reason,
      oldData: pickChangedOldData(biopsy, patch),
      newData: patch,
      changedFields: ["fk_sighting_id"],
      metadata,
    });
    const key = biopsy.pk_biopsy_id ? "pk_biopsy_id" : "id";
    const { error } = await supabase.from("biopsies").update(patch).eq(key, biopsy[key]);
    if (error) throw error;
  }
}

async function removeStaleDuplicateSightingWithAudit(
  plan: DuplicateGroupRemovalPlan,
  keepSighting: Record<string, any>,
  deleteSighting: Record<string, any>,
  reason: string
) {
  const listedMantaIds = parsePositiveIdList(deleteSighting.list_manta_ids_2);
  if (listedMantaIds.length === 0) {
    throw new Error(`Duplicate sighting ${plan.deleteSightingId} has no listed mantas to verify. Review manually before deleting.`);
  }

  const [listedMantas, photos, biopsies, mprfMapRows] = await Promise.all([
    Promise.all(listedMantaIds.map((id) => loadSingleRow("mantas", "pk_manta_id", id))),
    loadRowsByColumn("photos", "fk_sighting_id", plan.deleteSightingId),
    loadRowsByColumn("biopsies", "fk_sighting_id", plan.deleteSightingId),
    loadRowsByColumn("mprf_sighting_map", "pk_sighting_id", plan.deleteSightingId),
  ]);

  const missingMantaIds = listedMantaIds.filter((id, index) => !listedMantas[index]);
  if (missingMantaIds.length) {
    throw new Error(
      `Duplicate sighting ${plan.deleteSightingId} lists manta row(s) that no longer exist: ${missingMantaIds.join(", ")}. Review manually.`
    );
  }
  const wrongSightingMantaIds = listedMantas
    .filter((row): row is Record<string, any> => Boolean(row))
    .filter((row) => Number(row.fk_sighting_id) !== plan.keepSightingId)
    .map((row) => Number(row.pk_manta_id));
  if (wrongSightingMantaIds.length) {
    throw new Error(
      `Duplicate sighting ${plan.deleteSightingId} has listed manta row(s) that do not point to kept sighting ${plan.keepSightingId}: ${wrongSightingMantaIds.join(", ")}.`
    );
  }
  if (photos.length) {
    throw new Error(`Duplicate sighting ${plan.deleteSightingId} still has ${photos.length} linked photo row(s). Move or review photos first.`);
  }
  if (biopsies.length) {
    throw new Error(`Duplicate sighting ${plan.deleteSightingId} still has ${biopsies.length} linked biopsy row(s). Review manually before deleting.`);
  }

  const timePatch = buildCombinedSightingTimePatch(keepSighting, deleteSighting);
  if (Object.keys(timePatch).length) {
    await logDataChange({
      action: "update",
      tableName: "sightings",
      primaryKey: plan.keepSightingId,
      recordLabel: `sighting ${plan.keepSightingId}`,
      reason: `${reason} Preserve the broader sighting time window before deleting duplicate sighting ${plan.deleteSightingId}.`,
      oldData: pickChangedOldData(keepSighting, timePatch),
      newData: timePatch,
      changedFields: Object.keys(timePatch),
      metadata: {
        qc_action: "remove_stale_duplicate_sighting",
        qc_step: "preserve_combined_time_span",
        ...plan,
        duplicate_start_time: deleteSighting.start_time ?? null,
        duplicate_end_time: deleteSighting.end_time ?? null,
      },
    });
    const { error } = await supabase.from("sightings").update(timePatch).eq("pk_sighting_id", plan.keepSightingId);
    if (error) throw error;
  }

  for (const mapRow of mprfMapRows) {
    await logDataChange({
      action: "delete",
      tableName: "mprf_sighting_map",
      primaryKey: String(mapRow.pk_mprf_sighting_id),
      recordLabel: `mprf sighting map ${mapRow.pk_mprf_sighting_id}`,
      reason,
      oldData: mapRow,
      newData: {},
      changedFields: Object.keys(mapRow),
      metadata: {
        qc_action: "remove_stale_duplicate_sighting",
        qc_step: "delete_mprf_sighting_map_before_duplicate_sighting",
        ...plan,
        listed_manta_ids_verified_on_kept_sighting: listedMantaIds,
      },
    });
    const { error } = await supabase
      .from("mprf_sighting_map")
      .delete()
      .eq("pk_mprf_sighting_id", mapRow.pk_mprf_sighting_id);
    if (error) throw error;
  }

  await logDataChange({
    action: "delete",
    tableName: "sightings",
    primaryKey: plan.deleteSightingId,
    recordLabel: `sighting ${plan.deleteSightingId}`,
    reason,
    oldData: deleteSighting,
    newData: {},
    changedFields: Object.keys(deleteSighting),
    metadata: {
      qc_action: "remove_stale_duplicate_sighting",
      ...plan,
      listed_manta_ids_verified_on_kept_sighting: listedMantaIds,
      deleted_mprf_sighting_map_ids: mprfMapRows.map((row) => row.pk_mprf_sighting_id),
    },
  });
  const { error } = await supabase.from("sightings").delete().eq("pk_sighting_id", plan.deleteSightingId);
  if (error) throw error;
}

async function removeMissingListedMantaIdsWithAudit(sightingId: number, missingMantaIds: number[]) {
  const sighting = await loadSingleRow("sightings", "pk_sighting_id", sightingId);
  if (!sighting) throw new Error(`Sighting ${sightingId} was not found.`);

  const currentIds = parsePositiveIdList(sighting.list_manta_ids_2);
  const missingIdSet = new Set(missingMantaIds.map(String));
  const cleanedIds = currentIds.filter((id) => !missingIdSet.has(String(id)));
  const removedIds = currentIds.filter((id) => missingIdSet.has(String(id)));
  if (removedIds.length === 0) {
    return `Sighting ${sightingId} no longer lists those missing manta IDs. Marked the stale QC rows resolved locally.`;
  }

  const stillExistingRows = await Promise.all(removedIds.map((id) => loadSingleRow("mantas", "pk_manta_id", id)));
  const stillExistingIds = removedIds.filter((_, index) => Boolean(stillExistingRows[index]));
  if (stillExistingIds.length) {
    throw new Error(`Manta row(s) now exist for ${stillExistingIds.join(", ")}. Refresh QC before editing the list.`);
  }

  const patch = { list_manta_ids_2: cleanedIds.join(",") };
  const reason = `User-confirmed stale list cleanup: sighting ${sightingId} listed missing manta row(s) ${removedIds.join(", ")}; remove only those stale IDs from list_manta_ids_2.`;
  await logDataChange({
    action: "update",
    tableName: "sightings",
    primaryKey: sightingId,
    recordLabel: `sighting ${sightingId}`,
    reason,
    oldData: pickChangedOldData(sighting, patch),
    newData: patch,
    changedFields: Object.keys(patch),
    metadata: {
      qc_action: "remove_missing_listed_manta_ids",
      sighting_id: sightingId,
      removed_manta_ids: removedIds,
    },
  });
  const { error } = await supabase.from("sightings").update(patch).eq("pk_sighting_id", sightingId);
  if (error) throw error;
  return `Removed missing manta ID${removedIds.length === 1 ? "" : "s"} ${removedIds.join(", ")} from sighting ${sightingId}.`;
}

function clearConflictingBestPhotoFlags(
  photo: Record<string, any>,
  patch: Record<string, unknown>,
  context: {
    canonicalMantaId: number;
    canonicalMantaPhotos: Array<Record<string, any>>;
    catalogPhotos: Array<Record<string, any>>;
    preferredBestVentralPhotoId?: number | null;
  }
) {
  const photoId = Number(photo.pk_photo_id);
  const view = comparableValue(photo.photo_view);
  const catalogId = numericId(photo.fk_catalog_id);
  const rules = [
    {
      flag: "is_best_manta_ventral_photo",
      expectedView: "ventral",
      rows: context.canonicalMantaPhotos,
      matchesScope: (row: Record<string, any>) => Number(row.fk_manta_id) === context.canonicalMantaId,
    },
    {
      flag: "is_best_manta_dorsal_photo",
      expectedView: "dorsal",
      rows: context.canonicalMantaPhotos,
      matchesScope: (row: Record<string, any>) => Number(row.fk_manta_id) === context.canonicalMantaId,
    },
    {
      flag: "is_best_catalog_ventral_photo",
      expectedView: "ventral",
      rows: context.catalogPhotos,
      matchesScope: (row: Record<string, any>) => catalogId != null && Number(row.fk_catalog_id) === catalogId,
    },
    {
      flag: "is_best_catalog_dorsal_photo",
      expectedView: "dorsal",
      rows: context.catalogPhotos,
      matchesScope: (row: Record<string, any>) => catalogId != null && Number(row.fk_catalog_id) === catalogId,
    },
  ];

  for (const rule of rules) {
    if (photo[rule.flag] !== true || view !== rule.expectedView) continue;
    if (rule.flag === "is_best_manta_ventral_photo" && context.preferredBestVentralPhotoId === photoId) {
      continue;
    }
    const hasExistingBest = rule.rows.some(
      (row) =>
        Number(row.pk_photo_id) !== photoId &&
        comparableValue(row.photo_view) === rule.expectedView &&
        row[rule.flag] === true &&
        rule.matchesScope(row)
    );
    if (hasExistingBest) {
      patch[rule.flag] = false;
    }
  }
}

async function loadSingleRow(tableName: string, key: string, value: number) {
  const { data, error } = await supabase.from(tableName).select("*").eq(key, value).maybeSingle();
  if (error) throw error;
  return (data ?? null) as Record<string, any> | null;
}

async function loadRowsByColumn(tableName: string, key: string, value: number) {
  const { data, error } = await supabase.from(tableName).select("*").eq(key, value);
  if (error) {
    if (error.code === "42P01" || /does not exist|not found/i.test(error.message ?? "")) return [];
    throw error;
  }
  return (data ?? []) as Array<Record<string, any>>;
}

async function loadRowsByColumnsOr(tableName: string, filters: Array<{ key: string; value: number }>) {
  const rowsByKey = new Map<string, Record<string, any>>();
  for (const filter of filters) {
    const rows = await loadRowsByColumn(tableName, filter.key, filter.value);
    for (const row of rows) {
      const rowKey = String(row.pk_photo_id ?? row.pk_manta_size_id ?? row.pk_size_id ?? row.pk_biopsy_id ?? row.id ?? JSON.stringify(row));
      rowsByKey.set(rowKey, row);
    }
  }
  return Array.from(rowsByKey.values());
}

async function loadRowsByOr(tableName: string, expression: string) {
  const { data, error } = await supabase.from(tableName).select("*").or(expression);
  if (error) {
    if (error.code === "42P01" || /does not exist|not found/i.test(error.message ?? "")) return [];
    throw error;
  }
  return (data ?? []) as Array<Record<string, any>>;
}

async function findCanonicalManta(plan: DuplicateRemovalPlan, deleteManta: Record<string, any>) {
  const { data, error } = await supabase
    .from("mantas")
    .select("*")
    .eq("fk_sighting_id", plan.keepSightingId)
    .eq("fk_catalog_id", deleteManta.fk_catalog_id)
    .neq("pk_manta_id", plan.deleteMantaId);
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, any>>;
  const sameName = rows.filter((row) => comparableValue(row.name) === comparableValue(deleteManta.name));
  const candidates = sameName.length ? sameName : rows;
  if (candidates.length !== 1) {
    throw new Error(`Could not identify exactly one kept manta on sighting ${plan.keepSightingId}; review manually.`);
  }
  return candidates[0];
}

function buildKeptSightingPatch(
  keepSighting: Record<string, any>,
  deleteSighting: Record<string, any>,
  deleteMantaIds: number | number[]
) {
  const patch: Record<string, unknown> = {};
  Object.assign(patch, buildCombinedSightingTimePatch(keepSighting, deleteSighting));
  const deleteIds = new Set((Array.isArray(deleteMantaIds) ? deleteMantaIds : [deleteMantaIds]).map(String));
  const oldList = String(keepSighting.list_manta_ids_2 ?? "");
  const cleanedList = oldList
    .split(/[,\s|;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, arr) => !deleteIds.has(item) && arr.indexOf(item) === index)
    .join(",");
  if (oldList.trim() && cleanedList !== oldList.trim()) {
    patch.list_manta_ids_2 = cleanedList;
  }

  const appendMergedText = (field: "notes" | "behavior", label: string) => {
    const keepText = String(keepSighting[field] ?? "").trim();
    const deleteText = String(deleteSighting[field] ?? "").trim();
    if (!deleteText || keepText.includes(deleteText)) return;
    patch[field] = keepText
      ? `${keepText}\n\n[Duplicate sighting ${deleteSighting.pk_sighting_id} ${label} preserved before merge]\n${deleteText}`
      : `[Duplicate sighting ${deleteSighting.pk_sighting_id} ${label} preserved before merge]\n${deleteText}`;
  };
  appendMergedText("notes", "notes");
  appendMergedText("behavior", "behavior");

  const copyIfKeptBlank = [
    "sighting_date",
    "population",
    "island",
    "sitelocation",
    "location",
    "latitude",
    "longitude",
    "location_unknown",
    "photographer",
    "organization",
  ];
  for (const field of copyIfKeptBlank) {
    const keepValue = keepSighting[field];
    const deleteValue = deleteSighting[field];
    const keepBlank = keepValue == null || String(keepValue).trim() === "";
    const deleteHasValue = deleteValue != null && String(deleteValue).trim() !== "";
    if (keepBlank && deleteHasValue) {
      patch[field] = deleteValue;
    }
  }

  return patch;
}

function buildCombinedSightingTimePatch(keepSighting: Record<string, any>, deleteSighting: Record<string, any>) {
  const keepStart = parseSightingDateTime(keepSighting.sighting_date, keepSighting.start_time);
  const keepEnd = parseSightingDateTime(keepSighting.sighting_date, keepSighting.end_time);
  const deleteStart = parseSightingDateTime(deleteSighting.sighting_date, deleteSighting.start_time);
  const deleteEnd = parseSightingDateTime(deleteSighting.sighting_date, deleteSighting.end_time);
  const patch: Record<string, unknown> = {};

  if (keepStart && deleteStart && deleteStart.ms < keepStart.ms) {
    patch.start_time = deleteStart.value;
  }
  if (keepEnd && deleteEnd && deleteEnd.ms > keepEnd.ms) {
    patch.end_time = deleteEnd.value;
  }
  return patch;
}

async function syncSightingSummaryWithLinkedMantas(
  sightingId: number,
  reason: string,
  metadata: Record<string, unknown>
) {
  const [sighting, linkedMantas] = await Promise.all([
    loadSingleRow("sightings", "pk_sighting_id", sightingId),
    loadRowsByColumn("mantas", "fk_sighting_id", sightingId),
  ]);
  if (!sighting) throw new Error(`Sighting ${sightingId} was not found while syncing summary fields.`);

  const sortedMantas = linkedMantas.sort((left, right) => Number(left.pk_manta_id) - Number(right.pk_manta_id));
  const mantaIds = sortedMantas.map((manta) => Number(manta.pk_manta_id)).filter((id) => Number.isFinite(id));
  const catalogIds = sortedMantas
    .map((manta) => numericId(manta.fk_catalog_id))
    .filter((id): id is number => id != null);
  const patch: Record<string, unknown> = {
    total_mantas: mantaIds.length,
    total_manta_ids: mantaIds.length,
    list_manta_ids_2: mantaIds.length ? mantaIds.join(",") : null,
    list_catalog_ids: catalogIds.length ? catalogIds.join(",") : null,
  };
  const changedFields = Object.keys(patch).filter(
    (field) => comparableValue(sighting[field]) !== comparableValue(patch[field])
  );
  if (changedFields.length === 0) return;

  const changedPatch = Object.fromEntries(changedFields.map((field) => [field, patch[field]]));
  await logDataChange({
    action: "update",
    tableName: "sightings",
    primaryKey: sightingId,
    recordLabel: `sighting ${sightingId}`,
    reason: `${reason} Sync sighting summary fields after QC repair.`,
    oldData: pickChangedOldData(sighting, changedPatch),
    newData: changedPatch,
    changedFields,
    metadata,
  });
  const { error } = await supabase.from("sightings").update(changedPatch).eq("pk_sighting_id", sightingId);
  if (error) throw error;
}

function parseSightingDateTime(dateValue: unknown, timeValue: unknown) {
  const rawTime = String(timeValue ?? "").trim();
  if (!rawTime) return null;
  const explicitMatch = rawTime.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})/);
  if (explicitMatch) {
    const [, month, day, year, hour, minute] = explicitMatch;
    const fullYear = Number(year) < 100 ? 2000 + Number(year) : Number(year);
    const ms = Date.UTC(fullYear, Number(month) - 1, Number(day), Number(hour), Number(minute));
    return Number.isFinite(ms) ? { ms, value: rawTime } : null;
  }

  const dateMatch = String(dateValue ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  const timeMatch = rawTime.match(/^(\d{1,2}):(\d{2})/);
  if (!dateMatch || !timeMatch) return null;
  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;
  const ms = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isFinite(ms) ? { ms, value: rawTime } : null;
}

function formatTimeWindow(startTime: unknown, endTime: unknown) {
  const start = String(startTime ?? "").trim();
  const end = String(endTime ?? "").trim();
  if (start && end) return `${start} - ${end}`;
  return start || end || "blank";
}

function pickChangedOldData(row: Record<string, unknown>, patch: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(patch).map((key) => [key, row[key]]));
}

function formatUnknownError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [candidate.message, candidate.details, candidate.hint, candidate.code]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .map((part) => part.trim());
    if (parts.length) return parts.join(" ");
  }
  return fallback;
}

function SightingMiniCard({
  title,
  row,
  onOpenRecord,
}: {
  title: string;
  row: SightingContext | null;
  onOpenRecord: (target: RecordTarget) => void;
}) {
  if (!row) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-500">
        <div className="mb-1 font-semibold text-slate-700">{title}</div>
        Missing sighting row
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <div className="mb-1 flex flex-wrap items-center gap-1 font-semibold text-slate-700">
        <span>{title}</span>
        <SourcePill source={row.source} label="" />
      </div>
      <div>
        ID:{" "}
        {numericId(row.id) ? (
          <button
            type="button"
            className="text-blue-700 underline hover:text-blue-800"
            onClick={() => onOpenRecord({ type: "sighting", id: numericId(row.id)! })}
          >
            {row.id}
          </button>
        ) : (
          "—"
        )}
      </div>
      <div>Date: {formatPlainValue(row.date)}</div>
      <ComparisonLine label="Time" value={formatTimeRange(row)} />
      <ComparisonLine label="Location" value={row.location} />
      <ComparisonLine label="Island" value={row.island} />
      <div>Photographer: {formatPlainValue(row.photographer)}</div>
      <div>
        Total mantas:{" "}
        {numericId(row.id) ? (
          <button
            type="button"
            className="text-blue-700 underline hover:text-blue-800"
            onClick={() => onOpenRecord({ type: "sighting", id: numericId(row.id)! })}
            title={`Open linked mantas for sighting ${row.id}`}
          >
            {formatPlainValue(row.total_mantas)}
          </button>
        ) : (
          formatPlainValue(row.total_mantas)
        )}
      </div>
    </div>
  );
}

function ComparisonLine({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      {label}: {formatPlainValue(value)}
    </div>
  );
}

function formatTimeRange(row: SightingContext) {
  const start = formatPlainValue(row.start_time);
  const end = formatPlainValue(row.end_time);
  if (start === "—" && end === "—") return "—";
  if (end === "—") return start;
  if (start === "—") return end;
  return `${start} - ${end}`;
}

function comparableValue(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function comparableTime(row: SightingContext | null) {
  if (!row) return "";
  return comparableValue(formatTimeRange(row));
}

function comparableCoordinate(lat: unknown, lon: unknown) {
  const parsedLat = Number(lat);
  const parsedLon = Number(lon);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) return "";
  return `${parsedLat.toFixed(5)},${parsedLon.toFixed(5)}`;
}

function sightingDifferences(listed: SightingContext | null, pointed: SightingContext | null) {
  if (!listed || !pointed) return ["missing sighting row"];
  const checks: Array<[string, string, string]> = [
    ["Source", comparableValue(listed.source), comparableValue(pointed.source)],
    ["Date", comparableValue(listed.date), comparableValue(pointed.date)],
    ["Time", comparableTime(listed), comparableTime(pointed)],
    ["Location", comparableValue(listed.location), comparableValue(pointed.location)],
    ["Island", comparableValue(listed.island), comparableValue(pointed.island)],
    ["Photographer", comparableValue(listed.photographer), comparableValue(pointed.photographer)],
    ["Total mantas", comparableValue(listed.total_mantas), comparableValue(pointed.total_mantas)],
    [
      "Coordinates",
      comparableCoordinate(listed.latitude, listed.longitude),
      comparableCoordinate(pointed.latitude, pointed.longitude),
    ],
  ];
  return checks
    .filter(([, left, right]) => left !== right)
    .map(([label]) => label);
}

function RecordReference({
  finding,
  onOpenRecord,
}: {
  finding: QcFinding;
  onOpenRecord: (target: RecordTarget) => void;
}) {
  const target = targetFromFinding(finding);
  if (!target) return <span>{recordLabel(finding)}</span>;
  return (
    <button
      type="button"
      className="text-blue-700 underline hover:text-blue-800"
      onClick={() => onOpenRecord(target)}
      title={`Open ${target.type} ${target.id}`}
    >
      {target.type} {target.id}
    </button>
  );
}

function SightingIssueReference({
  finding,
  onOpenRecord,
}: {
  finding: QcFinding;
  onOpenRecord: (target: RecordTarget) => void;
}) {
  const sightingId =
    numericId(finding.related_sighting_id) ??
    numericId(getSightingContext(finding, "listed_sighting")?.id) ??
    (finding.table_name === "sightings" ? numericId(finding.primary_key) : null);

  if (!sightingId) return <span className="text-slate-500">—</span>;

  return (
    <button
      type="button"
      className="text-blue-700 underline hover:text-blue-800"
      onClick={() => onOpenRecord({ type: "sighting", id: sightingId })}
      title={`Open sighting ${sightingId}`}
    >
      sighting {sightingId}
    </button>
  );
}

function LinkedFindingMessage({
  finding,
  onOpenRecord,
}: {
  finding: QcFinding;
  onOpenRecord: (target: RecordTarget) => void;
}) {
  const parts = linkableMessageParts(finding.message);
  if (parts.length === 0) return <>{finding.message}</>;
  return (
    <>
      {parts.map((part, index) => {
        if (!part.target) return <span key={index}>{part.text}</span>;
        return (
          <button
            key={index}
            type="button"
            className="text-blue-700 underline hover:text-blue-800"
            onClick={() => onOpenRecord(part.target!)}
            title={`Open ${part.target.type} ${part.target.id}`}
          >
            {part.text}
          </button>
        );
      })}
    </>
  );
}

function targetFromFinding(finding: QcFinding): RecordTarget | null {
  const primaryId = numericId(finding.primary_key);
  const relatedPhotoId = numericId(finding.related_photo_id);
  if (finding.table_name === "photos" && primaryId) return { type: "photo", id: primaryId };
  if (relatedPhotoId) return { type: "photo", id: relatedPhotoId };
  if (numericId(finding.related_manta_id)) return { type: "manta", id: numericId(finding.related_manta_id)! };
  if (numericId(finding.related_sighting_id)) return { type: "sighting", id: numericId(finding.related_sighting_id)! };
  if (numericId(finding.related_catalog_id)) return { type: "catalog", id: numericId(finding.related_catalog_id)! };
  if (primaryId) {
    if (finding.table_name === "mantas") return { type: "manta", id: primaryId };
    if (finding.table_name === "sightings") return { type: "sighting", id: primaryId };
    if (finding.table_name === "catalog") return { type: "catalog", id: primaryId };
    if (finding.table_name === "manta_sizes") return { type: "size", id: primaryId };
    if (finding.table_name === "biopsies") return { type: "biopsy", id: primaryId };
  }
  return null;
}

function linkableMessageParts(message: string) {
  const regex = /\b(Sighting|sighting|manta|Manta|catalog|Catalog|photo|Photo|size|Size|biopsy|Biopsy)\s+(\d+)\b/g;
  const parts: Array<{ text: string; target?: RecordTarget }> = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(message))) {
    if (match.index > cursor) parts.push({ text: message.slice(cursor, match.index) });
    const kind = match[1].toLowerCase();
    const type =
      kind === "sighting"
        ? "sighting"
        : kind === "manta"
          ? "manta"
          : kind === "catalog"
            ? "catalog"
            : kind === "photo"
              ? "photo"
              : kind === "size"
                ? "size"
                : "biopsy";
    parts.push({ text: match[0], target: { type, id: Number(match[2]) } });
    cursor = match.index + match[0].length;
  }
  if (cursor < message.length) parts.push({ text: message.slice(cursor) });
  return parts;
}

function numericId(value: unknown) {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function parsePositiveIdList(value: unknown) {
  return Array.from(String(value ?? "").matchAll(/\d+/g))
    .map((match) => Number(match[0]))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function mean(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (usable.length === 0) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function finiteNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function SizeQcReviewModal({
  mantaId,
  findings,
  onOpenChange,
  onFindingsResolved,
}: {
  mantaId: number | null;
  findings: QcFinding[];
  onOpenChange: (open: boolean) => void;
  onFindingsResolved: (findings: QcFinding[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [manta, setManta] = useState<Record<string, unknown> | null>(null);
  const [sizeRows, setSizeRows] = useState<Array<Record<string, unknown>>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [deletingSizeId, setDeletingSizeId] = useState<number | null>(null);
  const open = mantaId != null;

  const sizeFindings = useMemo(() => {
    if (!mantaId) return [] as QcFinding[];
    return findings.filter((finding) => {
      if (finding.domain !== "sizes") return false;
      if (numericId(finding.related_manta_id) === mantaId) return true;
      if (finding.table_name === "mantas" && numericId(finding.primary_key) === mantaId) return true;
      return false;
    });
  }, [findings, mantaId]);

  const directSizeFindingsById = useMemo(() => {
    const map = new Map<number, QcFinding[]>();
    for (const finding of sizeFindings) {
      if (finding.table_name !== "manta_sizes") continue;
      const sizeId = numericId(finding.primary_key);
      if (!sizeId) continue;
      map.set(sizeId, [...(map.get(sizeId) ?? []), finding]);
    }
    return map;
  }, [sizeFindings]);

  const storedMeanFindings = useMemo(
    () => sizeFindings.filter((finding) => finding.table_name === "mantas"),
    [sizeFindings]
  );
  const includedDwValues = useMemo(
    () => sizeRows.map((row) => (sizeMeasurementIncludedInMean(row) ? dwM(row) : null)).filter((value): value is number => value != null),
    [sizeRows]
  );
  const calculatedMeanDw = useMemo(
    () => mean(includedDwValues),
    [includedDwValues]
  );
  const includedSizeCount = includedDwValues.length;
  const minIncludedDw = includedDwValues.length ? Math.min(...includedDwValues) : null;
  const maxIncludedDw = includedDwValues.length ? Math.max(...includedDwValues) : null;
  const visibleSizeRows = useMemo(
    () => sizeRows.filter((row) => hasLegacySizeExport(row) && !isDuplicateLegacyImport(row)),
    [sizeRows]
  );
  const hiddenDuplicateCount = sizeRows.length - visibleSizeRows.length;
  const hiddenDuplicateImportCount = sizeRows.filter((row) => isDuplicateLegacyImport(row)).length;
  const hiddenNotInExportCount = sizeRows.filter((row) => !hasLegacySizeExport(row)).length;

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!mantaId) return;
      setLoading(true);
      setManta(null);
      setSizeRows([]);
      setMessage(null);
      setDeletingSizeId(null);
      try {
        const [{ data: mantaRow, error: mantaError }, { data: sizes, error: sizeError }] = await Promise.all([
          supabase
            .from("mantas")
            .select("pk_manta_id,fk_catalog_id,fk_sighting_id,name,gender,age_class,size_m")
            .eq("pk_manta_id", mantaId)
            .maybeSingle(),
          supabase.from("manta_sizes").select("*").eq("fk_manta_id", mantaId).order("pk_manta_size_id", { ascending: true }),
        ]);
        if (mantaError) throw mantaError;
        if (sizeError) throw sizeError;
        if (!alive) return;
        setManta((mantaRow ?? null) as Record<string, unknown> | null);
        setSizeRows((sizes ?? []) as Array<Record<string, unknown>>);
      } catch (error) {
        if (alive) setMessage(formatUnknownError(error, "Could not load size measurements."));
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [mantaId]);

  async function deleteSizeRow(row: Record<string, unknown>) {
    const sizeId = numericId(row.pk_manta_size_id);
    if (!sizeId || !mantaId) return;
    const rowFindings = directSizeFindingsById.get(sizeId) ?? [];
    const reason = window.prompt(
      `Reason for removing unusable size measurement ${sizeId}?\n\nUse this when scale pixels, DL pixels, or other required measurement inputs were not measurable, so no reliable size can be produced. The reason will be written to the audit ledger.`
    )?.trim();
    if (!reason) {
      setMessage("Size delete canceled: an audit reason is required.");
      return;
    }

    const confirmed = window.confirm(
      `Delete size measurement ${sizeId} from manta ${mantaId}?\n\n` +
        `Scale px: ${formatPx(scalePx(row))}\n` +
        `DL: ${formatMeters(dlM(row))}\n` +
        `DW: ${formatMeters(dwM(row))}\n` +
        `Photo code: ${formatPlainValue(row.photo_code)}\n\n` +
        `This deletes only the unusable manta_sizes row and records the old row in the audit ledger.`
    );
    if (!confirmed) {
      setMessage("Size delete canceled.");
      return;
    }

    setDeletingSizeId(sizeId);
    setMessage(null);
    try {
      const currentRow = await loadSingleRow("manta_sizes", "pk_manta_size_id", sizeId);
      if (!currentRow) {
        setSizeRows((current) => current.filter((candidate) => numericId(candidate.pk_manta_size_id) !== sizeId));
        if (rowFindings.length) onFindingsResolved(rowFindings);
        setMessage(`Size measurement ${sizeId} was already deleted.`);
        return;
      }

      await logDataChange({
        action: "delete",
        tableName: "manta_sizes",
        primaryKey: sizeId,
        recordLabel: `manta size ${sizeId}`,
        reason,
        oldData: currentRow,
        newData: {},
        changedFields: Object.keys(currentRow),
        metadata: {
          qc_action: "delete_unusable_size_measurement_from_qc",
          manta_id: mantaId,
          size_id: sizeId,
          scale_px: scalePx(currentRow),
          dl_m: dlM(currentRow),
          dw_m: dwM(currentRow),
          related_qc_findings: rowFindings.map(findingKey),
        },
      });

      const { error } = await supabase.from("manta_sizes").delete().eq("pk_manta_size_id", sizeId);
      if (error) throw error;
      setSizeRows((current) => current.filter((candidate) => numericId(candidate.pk_manta_size_id) !== sizeId));
      if (rowFindings.length) onFindingsResolved(rowFindings);
      setMessage(`Unusable size measurement ${sizeId} deleted and audited. Run QC again to refresh stored mean warnings.`);
    } catch (error) {
      setMessage(formatUnknownError(error, `Could not delete size measurement ${sizeId}.`));
    } finally {
      setDeletingSizeId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Manta {mantaId ?? ""} Size QC</DialogTitle>
          <DialogDescription>
            Review independent size measurements linked to this manta encounter.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-sm text-slate-600">Loading size measurements...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 rounded border bg-slate-50 p-3 text-sm sm:grid-cols-6">
              <DetailMini label="Manta mean DW" value={formatMeters(finiteNumber(manta?.size_m), 3)} />
              <DetailMini label="Independent mean DW" value={formatMeters(calculatedMeanDw, 3)} />
              <DetailMini label="Sizes used" value={includedSizeCount} />
              <DetailMini label="Min DW used" value={formatMeters(minIncludedDw, 3)} />
              <DetailMini label="Max DW used" value={formatMeters(maxIncludedDw, 3)} />
              <DetailMini label="Manta name" value={manta?.name ?? "—"} />
            </div>

            {storedMeanFindings.length > 0 ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {storedMeanFindings.map((finding, index) => (
                  <div key={`${findingKey(finding)}-${index}`}>{finding.message}</div>
                ))}
              </div>
            ) : null}
            {message ? <div className="rounded border bg-slate-50 p-3 text-sm text-slate-700">{message}</div> : null}
            {hiddenDuplicateCount > 0 ? (
              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                {hiddenDuplicateImportCount > 0
                  ? `${hiddenDuplicateImportCount} duplicate app row${hiddenDuplicateImportCount === 1 ? "" : "s"} matched to an already-shown legacy Size ID and are hidden. `
                  : ""}
                {hiddenNotInExportCount > 0
                  ? `${hiddenNotInExportCount} app row${hiddenNotInExportCount === 1 ? "" : "s"} did not match Sizes_Exported.xlsx and are hidden. `
                  : ""}
                Hidden rows are excluded from the QC mean.
              </div>
            ) : null}

            {visibleSizeRows.length === 0 ? (
              <div className="text-sm text-slate-600">No independent size measurements are linked to this manta.</div>
            ) : (
              <div className="max-h-[65vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Size ID</th>
                      <th className="px-3 py-2">App Row</th>
                      <th className="px-3 py-2">Shot</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Scale Pixels</th>
                      <th className="px-3 py-2">Scale corr px</th>
                      <th className="px-3 py-2">DL px</th>
                      <th className="px-3 py-2">DW px</th>
                      <th className="px-3 py-2">DL m</th>
                      <th className="px-3 py-2">DW m</th>
                      <th className="px-3 py-2">Mean</th>
                      <th className="px-3 py-2">Photo Code</th>
                      <th className="px-3 py-2">QC Finding</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSizeRows.map((row) => {
                      const sizeId = numericId(row.pk_manta_size_id);
                      const rowFindings = sizeId ? directSizeFindingsById.get(sizeId) ?? [] : [];
                      const hasIssue = rowFindings.length > 0;
                      const imported = hasLegacySizeExport(row);
                      return (
                        <tr
                          key={String(row.pk_manta_size_id)}
                          className={`border-b align-top ${hasIssue ? "bg-red-50 text-red-800" : ""}`}
                        >
                          <td className="px-3 py-2 font-medium">{formatPlainValue(legacySizeId(row))}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{formatPlainValue(row.pk_manta_size_id)}</td>
                          <td className="px-3 py-2">{formatPlainValue(legacyShotType(row))}</td>
                          <td className="px-3 py-2">{imported ? sizeMeasurementLabel(row) : "Not in export"}</td>
                          <td className="px-3 py-2">{formatPx(scalePx(row))}</td>
                          <td className="px-3 py-2">{formatPx(scaleCorrectedPx(row))}</td>
                          <td className="px-3 py-2">{formatPx(dlPx(row))}</td>
                          <td className="px-3 py-2">{formatPx(dwPx(row))}</td>
                          <td className="px-3 py-2">{formatMeters(dlM(row), 3)}</td>
                          <td className="px-3 py-2">{formatMeters(dwM(row), 3)}</td>
                          <td className="px-3 py-2">{sizeMeasurementIncludedInMean(row) && dwM(row) != null ? "yes" : "no"}</td>
                          <td className="px-3 py-2">{formatPlainValue(row.photo_code)}</td>
                          <td className="px-3 py-2 text-xs">
                            {rowFindings.length ? rowFindings.map((finding) => finding.message).join(" ") : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {hasIssue ? (
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded text-red-600 hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                                onClick={() => deleteSizeRow(row)}
                                disabled={!sizeId || deletingSizeId === sizeId}
                                title={`Delete size measurement ${formatPlainValue(row.pk_manta_size_id)}`}
                                aria-label={`Delete size measurement ${formatPlainValue(row.pk_manta_size_id)}`}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function QcRecordModal({
  target,
  onOpenChange,
  onOpenRecord,
  qcFindings,
  onMantaNoVentralUpdated,
  onPhotoDeleted,
}: {
  target: RecordTarget | null;
  onOpenChange: (open: boolean) => void;
  onOpenRecord: (target: RecordTarget) => void;
  qcFindings: QcFinding[];
  onMantaNoVentralUpdated?: (mantaId: number) => void;
  onPhotoDeleted?: (photoId: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [linkedMantas, setLinkedMantas] = useState<Array<Record<string, unknown>>>([]);
  const [linkedPhotos, setLinkedPhotos] = useState<Array<Record<string, unknown>>>([]);
  const [linkedSizes, setLinkedSizes] = useState<Array<Record<string, unknown>>>([]);
  const [linkedSizePhotos, setLinkedSizePhotos] = useState<Map<number, Record<string, unknown>>>(new Map());
  const [linkedBiopsies, setLinkedBiopsies] = useState<Array<Record<string, unknown>>>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Record<string, unknown> | null>(null);
  const [matchingPhoto, setMatchingPhoto] = useState<Record<string, unknown> | null>(null);
  const [matchingPhotoId, setMatchingPhotoId] = useState<number | null>(null);
  const [repairingPhotoId, setRepairingPhotoId] = useState<number | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<number | null>(null);
  const [movingMantaLink, setMovingMantaLink] = useState<"sighting" | "catalog" | "no-ventral" | null>(null);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mantaSizeFindings = useMemo(() => {
    const mantaId = target?.type === "manta" ? target.id : null;
    if (!mantaId) return [] as QcFinding[];
    return qcFindings.filter((finding) => finding.domain === "sizes" && numericId(finding.related_manta_id) === mantaId);
  }, [qcFindings, target]);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!target) return;
      setLoading(true);
      setError(null);
      setRow(null);
      setLinkedMantas([]);
      setLinkedPhotos([]);
      setLinkedSizes([]);
      setLinkedSizePhotos(new Map());
      setLinkedBiopsies([]);
      setSelectedPhoto(null);
      setMatchingPhoto(null);
      setMatchingPhotoId(null);
      setRepairingPhotoId(null);
      setDeletingPhotoId(null);
      setMovingMantaLink(null);
      setRepairMessage(null);

      try {
        if (target.type === "sighting") {
          const { data, error: sightingError } = await supabase
            .from("sightings")
            .select("pk_sighting_id,sighting_date,start_time,end_time,is_mprf,population,island,sitelocation,location,latitude,longitude,photographer,organization,total_mantas,total_manta_ids,list_manta_ids,list_manta_ids_2,list_catalog_ids,notes,behavior")
            .eq("pk_sighting_id", target.id)
            .maybeSingle();
          if (sightingError) throw sightingError;
          const { data: mantas, error: mantaError } = await supabase
            .from("mantas")
            .select("pk_manta_id,fk_catalog_id,name,gender,age_class,no_ventral_photos")
            .eq("fk_sighting_id", target.id)
            .order("pk_manta_id", { ascending: true });
          if (mantaError) throw mantaError;
          if (alive) {
            setRow((data ?? null) as Record<string, unknown> | null);
            setLinkedMantas((mantas ?? []) as Array<Record<string, unknown>>);
          }
        } else if (target.type === "manta") {
          const { data, error: mantaError } = await supabase
            .from("mantas")
            .select("pk_manta_id,fk_catalog_id,fk_sighting_id,name,gender,age_class,is_mprf,photographer,no_ventral_photos")
            .eq("pk_manta_id", target.id)
            .maybeSingle();
          if (mantaError) throw mantaError;
          const [
            { data: photos, error: photoError },
            { data: sizes, error: sizeError },
            { data: biopsies, error: biopsyError },
          ] = await Promise.all([
            supabase
              .from("photos")
              .select(
                "pk_photo_id,fk_manta_id,fk_catalog_id,fk_sighting_id,photo_view,thumbnail_url,storage_path," +
                  "is_best_manta_ventral_photo,is_best_manta_dorsal_photo,is_best_catalog_ventral_photo,is_best_catalog_dorsal_photo"
              )
              .eq("fk_manta_id", target.id)
              .order("photo_view", { ascending: true })
              .order("pk_photo_id", { ascending: true }),
            supabase.from("manta_sizes").select("*").eq("fk_manta_id", target.id).order("pk_manta_size_id", { ascending: true }),
            supabase.from("biopsies").select("*").eq("fk_manta_id", target.id).order("pk_biopsy_id", { ascending: true }),
          ]);
          if (photoError) throw photoError;
          if (sizeError) throw sizeError;
          if (biopsyError) throw biopsyError;
          if (alive) {
            setRow((data ?? null) as Record<string, unknown> | null);
            setLinkedPhotos((photos ?? []) as Array<Record<string, unknown>>);
            const nextSizes = (sizes ?? []) as Array<Record<string, unknown>>;
            setLinkedSizes(nextSizes);
            setLinkedBiopsies((biopsies ?? []) as Array<Record<string, unknown>>);
            const photoIds = Array.from(new Set(nextSizes.map(photoCodeId).filter((id): id is number => id != null)));
            if (photoIds.length) {
              const { data: sizePhotos } = await supabase
                .from("photos")
                .select("pk_photo_id,file_name2,storage_path,thumbnail_url,photo_view")
                .in("pk_photo_id", photoIds);
              if (alive) setLinkedSizePhotos(new Map(((sizePhotos ?? []) as Array<Record<string, unknown>>).map((photo) => [Number(photo.pk_photo_id), photo])));
            }
          }
        } else if (target.type === "catalog") {
          const catalog = await loadSingleRow("catalog", "pk_catalog_id", target.id);
          if (alive) setRow(catalog);
        } else if (target.type === "photo") {
          const { data, error: photoError } = await supabase
            .from("photos")
            .select(
              "pk_photo_id,fk_manta_id,fk_catalog_id,fk_sighting_id,photo_view,thumbnail_url,storage_path," +
                "is_best_manta_ventral_photo,is_best_manta_dorsal_photo,is_best_catalog_ventral_photo,is_best_catalog_dorsal_photo"
            )
            .eq("pk_photo_id", target.id)
            .maybeSingle();
          if (photoError) throw photoError;
          if (alive) {
            setRow((data ?? null) as Record<string, unknown> | null);
            setLinkedPhotos(data ? [data as Record<string, unknown>] : []);
          }
        } else if (target.type === "size") {
          const { data, error: sizeError } = await supabase
            .from("manta_sizes")
            .select("*")
            .eq("pk_manta_size_id", target.id)
            .maybeSingle();
          if (sizeError) throw sizeError;
          if (alive) setRow((data ?? null) as Record<string, unknown> | null);
        } else {
          const { data, error: biopsyError } = await supabase
            .from("biopsies")
            .select("*")
            .eq("pk_biopsy_id", target.id)
            .maybeSingle();
          if (biopsyError) throw biopsyError;
          if (alive) setRow((data ?? null) as Record<string, unknown> | null);
        }
      } catch (err) {
        if (alive) setError(formatUnknownError(err, "Could not load record."));
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    return () => {
      alive = false;
    };
  }, [target]);

  async function repairPhotoSightingLink(photo: Record<string, unknown>, sightingId: number) {
    const photoId = numericId(photo.pk_photo_id);
    const mantaId = numericId(photo.fk_manta_id);
    if (!photoId || !mantaId) return;

    const reason = `Repaired missing photo sighting link: photo ${photoId} is linked to manta ${mantaId}, and that manta is linked to sighting ${sightingId}.`;
    const patch = { fk_sighting_id: sightingId };

    setRepairingPhotoId(photoId);
    setRepairMessage(null);
    try {
      await logDataChange({
        action: "update",
        tableName: "photos",
        primaryKey: photoId,
        recordLabel: `photo ${photoId}`,
        reason,
        oldData: pickChangedOldData(photo, patch),
        newData: patch,
        changedFields: Object.keys(patch),
        metadata: {
          qc_action: "repair_photo_sighting_link_from_manta",
          photo_id: photoId,
          manta_id: mantaId,
          inferred_sighting_id: sightingId,
        },
      });
      const { data, error: updateError } = await supabase
        .from("photos")
        .update(patch)
        .eq("pk_photo_id", photoId)
        .select(
          "pk_photo_id,fk_manta_id,fk_catalog_id,fk_sighting_id,photo_view,thumbnail_url,storage_path," +
            "is_best_manta_ventral_photo,is_best_manta_dorsal_photo,is_best_catalog_ventral_photo,is_best_catalog_dorsal_photo"
        )
        .single();
      if (updateError) throw updateError;
      setLinkedPhotos((current) =>
        current.map((row) => (numericId(row.pk_photo_id) === photoId ? (data as Record<string, unknown>) : row))
      );
      setRepairMessage(`Photo ${photoId} now points to sighting ${sightingId}.`);
    } catch (repairError) {
      setRepairMessage(formatUnknownError(repairError, `Could not repair photo ${photoId}.`));
    } finally {
      setRepairingPhotoId(null);
    }
  }

  async function deletePhotoRow(photo: Record<string, unknown>) {
    const photoId = numericId(photo.pk_photo_id);
    if (!photoId) return;

    const reason = window.prompt(
      `Reason for deleting photo ${photoId}?\n\nThis will be written to the audit ledger.`
    )?.trim();
    if (!reason) {
      setRepairMessage("Photo delete canceled: an audit reason is required.");
      return;
    }

    const bestFlags = [
      photo.is_best_manta_ventral_photo ? "best manta ventral" : null,
      photo.is_best_manta_dorsal_photo ? "best manta dorsal" : null,
      photo.is_best_catalog_ventral_photo ? "best catalog ventral" : null,
      photo.is_best_catalog_dorsal_photo ? "best catalog dorsal" : null,
    ].filter(Boolean);
    const confirmed = window.confirm(
      `Delete photo row ${photoId}?\n\n` +
        `Only continue if you have confirmed this image is a duplicate or otherwise intentionally removable. ` +
        `This confirmation will be recorded in the audit metadata.\n\n` +
        `Manta: ${formatPlainValue(photo.fk_manta_id)}\n` +
        `Catalog: ${formatPlainValue(photo.fk_catalog_id)}\n` +
        `Sighting: ${formatPlainValue(photo.fk_sighting_id)}\n` +
        `View: ${formatPlainValue(photo.photo_view)}\n` +
        `Flags: ${bestFlags.length ? bestFlags.join(", ") : "none"}\n` +
        `Storage path: ${formatPlainValue(photo.storage_path)}\n\n` +
        `This deletes only the database photo row and does not delete the image file from storage.`
    );
    if (!confirmed) {
      setRepairMessage("Photo delete canceled.");
      return;
    }

    setDeletingPhotoId(photoId);
    setRepairMessage(null);
    try {
      const currentPhoto = await loadSingleRow("photos", "pk_photo_id", photoId);
      if (!currentPhoto) {
        setLinkedPhotos((current) => current.filter((row) => numericId(row.pk_photo_id) !== photoId));
        setSelectedPhoto((current) => (numericId(current?.pk_photo_id) === photoId ? null : current));
        setRepairMessage(`Photo ${photoId} was already deleted. Refresh QC when ready.`);
        if (target?.type === "photo") setRow(null);
        return;
      }

      await logDataChange({
        action: "delete",
        tableName: "photos",
        primaryKey: photoId,
        recordLabel: `photo ${photoId}`,
        reason,
        oldData: currentPhoto,
        newData: {},
        changedFields: Object.keys(currentPhoto),
        metadata: {
          qc_action: "delete_photo_row_from_qc_modal",
          photo_id: photoId,
          manta_id: numericId(currentPhoto.fk_manta_id),
          catalog_id: numericId(currentPhoto.fk_catalog_id),
          sighting_id: numericId(currentPhoto.fk_sighting_id),
          storage_path: currentPhoto.storage_path ?? null,
          storage_file_deleted: false,
          admin_confirmed_duplicate_or_removable: true,
        },
      });

      const { error: deleteError } = await supabase.from("photos").delete().eq("pk_photo_id", photoId);
      if (deleteError) throw deleteError;

      setLinkedPhotos((current) => current.filter((row) => numericId(row.pk_photo_id) !== photoId));
      setSelectedPhoto((current) => (numericId(current?.pk_photo_id) === photoId ? null : current));
      if (target?.type === "photo") setRow(null);
      onPhotoDeleted?.(photoId);
      setRepairMessage(`Photo ${photoId} deleted and audited. The storage file was not deleted.`);
    } catch (deleteError) {
      setRepairMessage(formatUnknownError(deleteError, `Could not delete photo ${photoId}.`));
    } finally {
      setDeletingPhotoId(null);
    }
  }

  async function moveMantaSightingLink() {
    if (!row || target?.type !== "manta") return;
    const mantaId = numericId(row.pk_manta_id);
    const oldSightingId = numericId(row.fk_sighting_id);
    if (!mantaId) return;

    const requestedId = window.prompt(
      `Move manta ${mantaId} to which sighting ID?\n\nCurrent sighting: ${oldSightingId ?? "none"}`
    )?.trim();
    if (!requestedId) {
      setRepairMessage("Manta sighting move canceled.");
      return;
    }
    const newSightingId = Number(requestedId);
    if (!Number.isInteger(newSightingId) || newSightingId <= 0) {
      setRepairMessage("Manta sighting move canceled: enter a valid sighting ID.");
      return;
    }
    if (newSightingId === oldSightingId) {
      setRepairMessage(`Manta ${mantaId} already points to sighting ${newSightingId}.`);
      return;
    }

    const reason = window.prompt(
      `Reason for moving manta ${mantaId} to sighting ${newSightingId}?\n\nThis will be written to the audit ledger.`
    )?.trim();
    if (!reason) {
      setRepairMessage("Manta sighting move canceled: an audit reason is required.");
      return;
    }

    setMovingMantaLink("sighting");
    setRepairMessage(null);
    try {
      const [currentManta, newSighting] = await Promise.all([
        loadSingleRow("mantas", "pk_manta_id", mantaId),
        loadSingleRow("sightings", "pk_sighting_id", newSightingId),
      ]);
      if (!currentManta) throw new Error(`Manta ${mantaId} was not found.`);
      if (!newSighting) throw new Error(`Sighting ${newSightingId} was not found.`);
      const currentOldSightingId = numericId(currentManta.fk_sighting_id);

      const childPhotos = currentOldSightingId
        ? await loadRowsByColumnsOr("photos", [
            { key: "fk_manta_id", value: mantaId },
            { key: "fk_sighting_id", value: currentOldSightingId },
          ])
        : await loadRowsByColumn("photos", "fk_manta_id", mantaId);
      const childBiopsies = currentOldSightingId
        ? await loadRowsByColumnsOr("biopsies", [
            { key: "fk_manta_id", value: mantaId },
            { key: "fk_sighting_id", value: currentOldSightingId },
          ])
        : await loadRowsByColumn("biopsies", "fk_manta_id", mantaId);
      const scopedPhotos = childPhotos.filter(
        (photo) => numericId(photo.fk_manta_id) === mantaId && numericId(photo.fk_sighting_id) === currentOldSightingId
      );
      const scopedBiopsies = childBiopsies.filter(
        (biopsy) => numericId(biopsy.fk_manta_id) === mantaId && numericId(biopsy.fk_sighting_id) === currentOldSightingId
      );

      const confirmed = window.confirm(
        `Move manta ${mantaId} from sighting ${currentOldSightingId ?? "none"} to sighting ${newSightingId}?\n\n` +
          `This will audit the manta update, move ${scopedPhotos.length} photo sighting link(s) and ` +
          `${scopedBiopsies.length} biopsy sighting link(s) when they currently point to the old sighting, ` +
          `and then sync summary fields for both sightings.`
      );
      if (!confirmed) {
        setRepairMessage("Manta sighting move canceled.");
        return;
      }

      const mantaPatch = { fk_sighting_id: newSightingId };
      await logDataChange({
        action: "update",
        tableName: "mantas",
        primaryKey: mantaId,
        recordLabel: `manta ${mantaId}`,
        reason,
        oldData: pickChangedOldData(currentManta, mantaPatch),
        newData: mantaPatch,
        changedFields: Object.keys(mantaPatch),
        metadata: {
          qc_action: "move_manta_sighting_link",
          manta_id: mantaId,
          old_sighting_id: currentOldSightingId,
          new_sighting_id: newSightingId,
        },
      });
      const { error: mantaUpdateError } = await supabase
        .from("mantas")
        .update(mantaPatch)
        .eq("pk_manta_id", mantaId);
      if (mantaUpdateError) throw mantaUpdateError;

      for (const photo of scopedPhotos) {
        const photoId = numericId(photo.pk_photo_id);
        if (!photoId) continue;
        const patch = { fk_sighting_id: newSightingId };
        await logDataChange({
          action: "update",
          tableName: "photos",
          primaryKey: photoId,
          recordLabel: `photo ${photoId}`,
          reason,
          oldData: pickChangedOldData(photo, patch),
          newData: patch,
          changedFields: Object.keys(patch),
          metadata: {
            qc_action: "move_manta_sighting_link",
            qc_step: "move_child_photo_sighting_link",
            manta_id: mantaId,
            old_sighting_id: currentOldSightingId,
            new_sighting_id: newSightingId,
          },
        });
        const { error: photoUpdateError } = await supabase
          .from("photos")
          .update(patch)
          .eq("pk_photo_id", photoId);
        if (photoUpdateError) throw photoUpdateError;
      }

      for (const biopsy of scopedBiopsies) {
        const biopsyKey = biopsy.pk_biopsy_id ? "pk_biopsy_id" : "id";
        const biopsyId = biopsy[biopsyKey];
        const patch = { fk_sighting_id: newSightingId };
        await logDataChange({
          action: "update",
          tableName: "biopsies",
          primaryKey: String(biopsyId),
          recordLabel: `biopsy ${biopsyId}`,
          reason,
          oldData: pickChangedOldData(biopsy, patch),
          newData: patch,
          changedFields: Object.keys(patch),
          metadata: {
            qc_action: "move_manta_sighting_link",
            qc_step: "move_child_biopsy_sighting_link",
            manta_id: mantaId,
            old_sighting_id: currentOldSightingId,
            new_sighting_id: newSightingId,
          },
        });
        const { error: biopsyUpdateError } = await supabase
          .from("biopsies")
          .update(patch)
          .eq(biopsyKey, biopsyId);
        if (biopsyUpdateError) throw biopsyUpdateError;
      }

      if (currentOldSightingId) {
        await syncSightingSummaryWithLinkedMantas(currentOldSightingId, reason, {
          qc_action: "move_manta_sighting_link",
          qc_step: "sync_old_sighting_summary",
          manta_id: mantaId,
          old_sighting_id: currentOldSightingId,
          new_sighting_id: newSightingId,
        });
      }
      await syncSightingSummaryWithLinkedMantas(newSightingId, reason, {
        qc_action: "move_manta_sighting_link",
        qc_step: "sync_new_sighting_summary",
        manta_id: mantaId,
        old_sighting_id: currentOldSightingId,
        new_sighting_id: newSightingId,
      });

      setRow({ ...currentManta, ...mantaPatch });
      setLinkedPhotos((current) =>
        current.map((photo) =>
          numericId(photo.fk_manta_id) === mantaId && numericId(photo.fk_sighting_id) === currentOldSightingId
            ? { ...photo, fk_sighting_id: newSightingId }
            : photo
        )
      );
      setLinkedBiopsies((current) =>
        current.map((biopsy) =>
          numericId(biopsy.fk_manta_id) === mantaId && numericId(biopsy.fk_sighting_id) === currentOldSightingId
            ? { ...biopsy, fk_sighting_id: newSightingId }
            : biopsy
        )
      );
      setRepairMessage(
        `Manta ${mantaId} now points to sighting ${newSightingId}. Synced old and new sighting summaries.`
      );
    } catch (moveError) {
      setRepairMessage(formatUnknownError(moveError, `Could not move manta ${mantaId}.`));
    } finally {
      setMovingMantaLink(null);
    }
  }

  async function updateMantaCatalogLink() {
    if (!row || target?.type !== "manta") return;
    const mantaId = numericId(row.pk_manta_id);
    const oldCatalogId = numericId(row.fk_catalog_id);
    const sightingId = numericId(row.fk_sighting_id);
    if (!mantaId) return;

    const requestedId = window.prompt(
      `Set FK Catalog ID for manta ${mantaId}.\n\nCurrent catalog: ${oldCatalogId ?? "none"}\nEnter a catalog ID, or type "none" to clear it.`
    )?.trim();
    if (!requestedId) {
      setRepairMessage("Manta catalog update canceled.");
      return;
    }
    const newCatalogId = /^none|null|clear$/i.test(requestedId) ? null : Number(requestedId);
    if (newCatalogId !== null && (!Number.isInteger(newCatalogId) || newCatalogId <= 0)) {
      setRepairMessage("Manta catalog update canceled: enter a valid catalog ID.");
      return;
    }
    if (newCatalogId === oldCatalogId) {
      setRepairMessage(`Manta ${mantaId} already has that catalog link.`);
      return;
    }

    const reason = window.prompt(
      `Reason for updating manta ${mantaId}'s catalog link?\n\nThis will be written to the audit ledger.`
    )?.trim();
    if (!reason) {
      setRepairMessage("Manta catalog update canceled: an audit reason is required.");
      return;
    }

    setMovingMantaLink("catalog");
    setRepairMessage(null);
    try {
      const [currentManta, newCatalog] = await Promise.all([
        loadSingleRow("mantas", "pk_manta_id", mantaId),
        newCatalogId == null ? Promise.resolve(null) : loadSingleRow("catalog", "pk_catalog_id", newCatalogId),
      ]);
      if (!currentManta) throw new Error(`Manta ${mantaId} was not found.`);
      if (newCatalogId != null && !newCatalog) throw new Error(`Catalog ${newCatalogId} was not found.`);
      const currentOldCatalogId = numericId(currentManta.fk_catalog_id);

      const [childPhotos, childSizes, childBiopsies] = await Promise.all([
        loadRowsByColumn("photos", "fk_manta_id", mantaId),
        loadRowsByColumn("manta_sizes", "fk_manta_id", mantaId),
        loadRowsByColumn("biopsies", "fk_manta_id", mantaId),
      ]);
      const shouldFollowCatalog = (child: Record<string, unknown>) =>
        "fk_catalog_id" in child &&
        (numericId(child.fk_catalog_id) == null || numericId(child.fk_catalog_id) === currentOldCatalogId);
      const scopedPhotos = childPhotos.filter(shouldFollowCatalog);
      const scopedSizes = childSizes.filter(shouldFollowCatalog);
      const scopedBiopsies = childBiopsies.filter(shouldFollowCatalog);

      const confirmed = window.confirm(
        `Update manta ${mantaId}'s FK Catalog ID from ${currentOldCatalogId ?? "none"} to ${newCatalogId ?? "none"}?\n\n` +
          `This will audit the manta update and also update ${scopedPhotos.length} photo, ${scopedSizes.length} size, ` +
          `and ${scopedBiopsies.length} biopsy child link(s) that are blank or still match the old catalog.`
      );
      if (!confirmed) {
        setRepairMessage("Manta catalog update canceled.");
        return;
      }

      const mantaPatch = { fk_catalog_id: newCatalogId };
      await logDataChange({
        action: "update",
        tableName: "mantas",
        primaryKey: mantaId,
        recordLabel: `manta ${mantaId}`,
        reason,
        oldData: pickChangedOldData(currentManta, mantaPatch),
        newData: mantaPatch,
        changedFields: Object.keys(mantaPatch),
        metadata: {
          qc_action: "update_manta_catalog_link",
          manta_id: mantaId,
          old_catalog_id: currentOldCatalogId,
          new_catalog_id: newCatalogId,
        },
      });
      const { error: mantaUpdateError } = await supabase
        .from("mantas")
        .update(mantaPatch)
        .eq("pk_manta_id", mantaId);
      if (mantaUpdateError) throw mantaUpdateError;

      for (const photo of scopedPhotos) {
        const photoId = numericId(photo.pk_photo_id);
        if (!photoId) continue;
        const patch = { fk_catalog_id: newCatalogId };
        await logDataChange({
          action: "update",
          tableName: "photos",
          primaryKey: photoId,
          recordLabel: `photo ${photoId}`,
          reason,
          oldData: pickChangedOldData(photo, patch),
          newData: patch,
          changedFields: Object.keys(patch),
          metadata: {
            qc_action: "update_manta_catalog_link",
            qc_step: "sync_child_photo_catalog_link",
            manta_id: mantaId,
            old_catalog_id: currentOldCatalogId,
            new_catalog_id: newCatalogId,
          },
        });
        const { error: photoUpdateError } = await supabase
          .from("photos")
          .update(patch)
          .eq("pk_photo_id", photoId);
        if (photoUpdateError) throw photoUpdateError;
      }

      for (const sizeRow of scopedSizes) {
        const sizeKey = sizeRow.pk_manta_size_id ? "pk_manta_size_id" : sizeRow.pk_size_id ? "pk_size_id" : "id";
        const sizeId = sizeRow[sizeKey];
        const patch = { fk_catalog_id: newCatalogId };
        await logDataChange({
          action: "update",
          tableName: "manta_sizes",
          primaryKey: String(sizeId),
          recordLabel: `manta size ${sizeId}`,
          reason,
          oldData: pickChangedOldData(sizeRow, patch),
          newData: patch,
          changedFields: Object.keys(patch),
          metadata: {
            qc_action: "update_manta_catalog_link",
            qc_step: "sync_child_size_catalog_link",
            manta_id: mantaId,
            old_catalog_id: currentOldCatalogId,
            new_catalog_id: newCatalogId,
          },
        });
        const { error: sizeUpdateError } = await supabase
          .from("manta_sizes")
          .update(patch)
          .eq(sizeKey, sizeId);
        if (sizeUpdateError) throw sizeUpdateError;
      }

      for (const biopsy of scopedBiopsies) {
        const biopsyKey = biopsy.pk_biopsy_id ? "pk_biopsy_id" : "id";
        const biopsyId = biopsy[biopsyKey];
        const patch = { fk_catalog_id: newCatalogId };
        await logDataChange({
          action: "update",
          tableName: "biopsies",
          primaryKey: String(biopsyId),
          recordLabel: `biopsy ${biopsyId}`,
          reason,
          oldData: pickChangedOldData(biopsy, patch),
          newData: patch,
          changedFields: Object.keys(patch),
          metadata: {
            qc_action: "update_manta_catalog_link",
            qc_step: "sync_child_biopsy_catalog_link",
            manta_id: mantaId,
            old_catalog_id: currentOldCatalogId,
            new_catalog_id: newCatalogId,
          },
        });
        const { error: biopsyUpdateError } = await supabase
          .from("biopsies")
          .update(patch)
          .eq(biopsyKey, biopsyId);
        if (biopsyUpdateError) throw biopsyUpdateError;
      }

      if (sightingId) {
        await syncSightingSummaryWithLinkedMantas(sightingId, reason, {
          qc_action: "update_manta_catalog_link",
          qc_step: "sync_sighting_summary",
          manta_id: mantaId,
          sighting_id: sightingId,
          old_catalog_id: currentOldCatalogId,
          new_catalog_id: newCatalogId,
        });
      }

      setRow({ ...currentManta, ...mantaPatch });
      setLinkedPhotos((current) =>
        current.map((photo) => (scopedPhotos.some((item) => numericId(item.pk_photo_id) === numericId(photo.pk_photo_id)) ? { ...photo, fk_catalog_id: newCatalogId } : photo))
      );
      setLinkedSizes((current) =>
        current.map((sizeRow) => (scopedSizes.some((item) => numericId(item.pk_manta_size_id) === numericId(sizeRow.pk_manta_size_id)) ? { ...sizeRow, fk_catalog_id: newCatalogId } : sizeRow))
      );
      setLinkedBiopsies((current) =>
        current.map((biopsy) => (scopedBiopsies.some((item) => numericId(item.pk_biopsy_id) === numericId(biopsy.pk_biopsy_id)) ? { ...biopsy, fk_catalog_id: newCatalogId } : biopsy))
      );
      setRepairMessage(`Manta ${mantaId} catalog link updated to ${newCatalogId ?? "none"}.`);
    } catch (catalogError) {
      setRepairMessage(formatUnknownError(catalogError, `Could not update manta ${mantaId}'s catalog link.`));
    } finally {
      setMovingMantaLink(null);
    }
  }

  async function updateMantaNoVentralFlag(nextValue: boolean) {
    if (!row || target?.type !== "manta") return;
    const mantaId = numericId(row.pk_manta_id);
    if (!mantaId) return;

    const currentValue = Boolean(row.no_ventral_photos);
    if (nextValue === currentValue) return;

    const hasLinkedVentralPhoto = linkedPhotos.some(
      (photo) => String(photo.photo_view ?? "").trim().toLowerCase() === "ventral"
    );

    if (nextValue && hasLinkedVentralPhoto) {
      const confirmed = window.confirm(
        `Manta ${mantaId} has at least one linked ventral photo. Mark it as No Ventral IDs anyway?`
      );
      if (!confirmed) {
        setRepairMessage("No Ventral IDs update canceled.");
        return;
      }
    }

    const reason = window.prompt(
      `${nextValue ? "Mark" : "Clear"} No Ventral IDs for manta ${mantaId}?\n\nThis will be written to the audit ledger.`
    )?.trim();
    if (!reason) {
      setRepairMessage("No Ventral IDs update canceled: an audit reason is required.");
      return;
    }

    setMovingMantaLink("no-ventral");
    setRepairMessage(null);
    try {
      const currentManta = await loadSingleRow("mantas", "pk_manta_id", mantaId);
      if (!currentManta) throw new Error(`Manta ${mantaId} was not found.`);

      const patch = { no_ventral_photos: nextValue };
      await logDataChange({
        action: "update",
        tableName: "mantas",
        primaryKey: mantaId,
        recordLabel: `manta ${mantaId}`,
        reason,
        oldData: pickChangedOldData(currentManta, patch),
        newData: patch,
        changedFields: Object.keys(patch),
        metadata: {
          qc_action: "update_manta_no_ventral_photos",
          manta_id: mantaId,
          old_no_ventral_photos: Boolean(currentManta.no_ventral_photos),
          new_no_ventral_photos: nextValue,
          linked_photo_ids: linkedPhotos.map((photo) => photo.pk_photo_id).filter((value) => value != null),
          has_linked_ventral_photo: hasLinkedVentralPhoto,
        },
      });

      const { error: updateError } = await supabase.from("mantas").update(patch).eq("pk_manta_id", mantaId);
      if (updateError) throw updateError;

      setRow({ ...currentManta, ...patch });
      if (nextValue) {
        onMantaNoVentralUpdated?.(mantaId);
      }
      setRepairMessage(
        `Manta ${mantaId} ${
          nextValue
            ? "marked as No Ventral IDs and related photo QC rows were removed locally"
            : "cleared from No Ventral IDs"
        }. Run QC again to refresh counts.`
      );
    } catch (noVentralError) {
      setRepairMessage(formatUnknownError(noVentralError, `Could not update No Ventral IDs for manta ${mantaId}.`));
    } finally {
      setMovingMantaLink(null);
    }
  }

  async function applyPhotoCatalogMatch(photo: Record<string, unknown>, catalogId: number) {
    const photoId = numericId(photo.pk_photo_id);
    if (!photoId) return;

    const reason = window.prompt(
      `Reason for linking photo ${photoId} to catalog ${catalogId}?\n\nThis will be written to the audit ledger.`
    )?.trim();
    if (!reason) {
      setRepairMessage("Photo catalog match canceled: an audit reason is required.");
      return;
    }

    setMatchingPhotoId(photoId);
    setRepairMessage(null);
    try {
      const [currentPhoto, matchedCatalog] = await Promise.all([
        loadSingleRow("photos", "pk_photo_id", photoId),
        loadSingleRow("catalog", "pk_catalog_id", catalogId),
      ]);
      if (!currentPhoto) throw new Error(`Photo ${photoId} was not found.`);
      if (!matchedCatalog) throw new Error(`Catalog ${catalogId} was not found.`);

      const mantaId = numericId(currentPhoto.fk_manta_id);
      const currentManta = mantaId ? await loadSingleRow("mantas", "pk_manta_id", mantaId) : null;
      const sightingId = numericId(currentManta?.fk_sighting_id) ?? numericId(currentPhoto.fk_sighting_id);
      const oldCatalogIds = new Set<number>();
      const photoOldCatalogId = numericId(currentPhoto.fk_catalog_id);
      const mantaOldCatalogId = numericId(currentManta?.fk_catalog_id);
      if (photoOldCatalogId != null) oldCatalogIds.add(photoOldCatalogId);
      if (mantaOldCatalogId != null) oldCatalogIds.add(mantaOldCatalogId);

      const shouldFollowCatalog = (child: Record<string, unknown>) =>
        "fk_catalog_id" in child &&
        (numericId(child.fk_catalog_id) == null || oldCatalogIds.has(numericId(child.fk_catalog_id)!));

      let childPhotos: Array<Record<string, unknown>> = [];
      let childSizes: Array<Record<string, unknown>> = [];
      let childBiopsies: Array<Record<string, unknown>> = [];
      if (mantaId) {
        [childPhotos, childSizes, childBiopsies] = await Promise.all([
          loadRowsByColumn("photos", "fk_manta_id", mantaId),
          loadRowsByColumn("manta_sizes", "fk_manta_id", mantaId),
          loadRowsByColumn("biopsies", "fk_manta_id", mantaId),
        ]);
      }

      const scopedPhotos = mantaId
        ? childPhotos.filter((item) => numericId(item.pk_photo_id) === photoId || shouldFollowCatalog(item))
        : [currentPhoto];
      const scopedSizes = childSizes.filter(shouldFollowCatalog);
      const scopedBiopsies = childBiopsies.filter(shouldFollowCatalog);
      const shouldUpdateManta = Boolean(currentManta && numericId(currentManta.fk_catalog_id) !== catalogId);
      const photoUpdates = scopedPhotos.filter((item) => numericId(item.fk_catalog_id) !== catalogId);
      const sizeUpdates = scopedSizes.filter((item) => numericId(item.fk_catalog_id) !== catalogId);
      const biopsyUpdates = scopedBiopsies.filter((item) => numericId(item.fk_catalog_id) !== catalogId);

      if (!shouldUpdateManta && photoUpdates.length === 0 && sizeUpdates.length === 0 && biopsyUpdates.length === 0) {
        setRepairMessage(`Photo ${photoId} and its linked manta data already point to catalog ${catalogId}.`);
        return;
      }

      const confirmed = window.confirm(
        `Apply catalog match ${catalogId} to photo ${photoId}?\n\n` +
          `This will audit ${shouldUpdateManta ? "1 manta" : "0 manta"} update(s), ` +
          `${photoUpdates.length} photo update(s), ${sizeUpdates.length} size update(s), and ` +
          `${biopsyUpdates.length} biopsy update(s).`
      );
      if (!confirmed) {
        setRepairMessage("Photo catalog match canceled.");
        return;
      }

      if (shouldUpdateManta && currentManta && mantaId) {
        const mantaPatch = { fk_catalog_id: catalogId };
        await logDataChange({
          action: "update",
          tableName: "mantas",
          primaryKey: mantaId,
          recordLabel: `manta ${mantaId}`,
          reason,
          oldData: pickChangedOldData(currentManta, mantaPatch),
          newData: mantaPatch,
          changedFields: Object.keys(mantaPatch),
          metadata: {
            qc_action: "apply_photo_catalog_match",
            qc_step: "sync_manta_catalog_link",
            photo_id: photoId,
            manta_id: mantaId,
            old_catalog_id: mantaOldCatalogId,
            new_catalog_id: catalogId,
          },
        });
        const { error: mantaUpdateError } = await supabase
          .from("mantas")
          .update(mantaPatch)
          .eq("pk_manta_id", mantaId);
        if (mantaUpdateError) throw mantaUpdateError;
      }

      const updatedPhotoIds = new Set<number>();
      for (const photoRow of photoUpdates) {
        const linkedPhotoId = numericId(photoRow.pk_photo_id);
        if (!linkedPhotoId) continue;
        const patch = { fk_catalog_id: catalogId };
        await logDataChange({
          action: "update",
          tableName: "photos",
          primaryKey: linkedPhotoId,
          recordLabel: `photo ${linkedPhotoId}`,
          reason,
          oldData: pickChangedOldData(photoRow, patch),
          newData: patch,
          changedFields: Object.keys(patch),
          metadata: {
            qc_action: "apply_photo_catalog_match",
            qc_step: "sync_photo_catalog_link",
            query_photo_id: photoId,
            manta_id: mantaId,
            old_catalog_id: numericId(photoRow.fk_catalog_id),
            new_catalog_id: catalogId,
          },
        });
        const { error: photoUpdateError } = await supabase
          .from("photos")
          .update(patch)
          .eq("pk_photo_id", linkedPhotoId);
        if (photoUpdateError) throw photoUpdateError;
        updatedPhotoIds.add(linkedPhotoId);
      }

      const updatedSizeIds = new Set<string>();
      for (const sizeRow of sizeUpdates) {
        const sizeKey = sizeRow.pk_manta_size_id ? "pk_manta_size_id" : sizeRow.pk_size_id ? "pk_size_id" : "id";
        const sizeId = sizeRow[sizeKey];
        const patch = { fk_catalog_id: catalogId };
        await logDataChange({
          action: "update",
          tableName: "manta_sizes",
          primaryKey: String(sizeId),
          recordLabel: `manta size ${sizeId}`,
          reason,
          oldData: pickChangedOldData(sizeRow, patch),
          newData: patch,
          changedFields: Object.keys(patch),
          metadata: {
            qc_action: "apply_photo_catalog_match",
            qc_step: "sync_size_catalog_link",
            query_photo_id: photoId,
            manta_id: mantaId,
            old_catalog_id: numericId(sizeRow.fk_catalog_id),
            new_catalog_id: catalogId,
          },
        });
        const { error: sizeUpdateError } = await supabase
          .from("manta_sizes")
          .update(patch)
          .eq(sizeKey, sizeId);
        if (sizeUpdateError) throw sizeUpdateError;
        updatedSizeIds.add(String(sizeId));
      }

      const updatedBiopsyIds = new Set<string>();
      for (const biopsy of biopsyUpdates) {
        const biopsyKey = biopsy.pk_biopsy_id ? "pk_biopsy_id" : "id";
        const biopsyId = biopsy[biopsyKey];
        const patch = { fk_catalog_id: catalogId };
        await logDataChange({
          action: "update",
          tableName: "biopsies",
          primaryKey: String(biopsyId),
          recordLabel: `biopsy ${biopsyId}`,
          reason,
          oldData: pickChangedOldData(biopsy, patch),
          newData: patch,
          changedFields: Object.keys(patch),
          metadata: {
            qc_action: "apply_photo_catalog_match",
            qc_step: "sync_biopsy_catalog_link",
            query_photo_id: photoId,
            manta_id: mantaId,
            old_catalog_id: numericId(biopsy.fk_catalog_id),
            new_catalog_id: catalogId,
          },
        });
        const { error: biopsyUpdateError } = await supabase
          .from("biopsies")
          .update(patch)
          .eq(biopsyKey, biopsyId);
        if (biopsyUpdateError) throw biopsyUpdateError;
        updatedBiopsyIds.add(String(biopsyId));
      }

      if (sightingId) {
        await syncSightingSummaryWithLinkedMantas(sightingId, reason, {
          qc_action: "apply_photo_catalog_match",
          qc_step: "sync_sighting_summary",
          photo_id: photoId,
          manta_id: mantaId,
          sighting_id: sightingId,
          new_catalog_id: catalogId,
        });
      }

      if (currentManta && target?.type === "manta" && numericId(row?.pk_manta_id) === mantaId) {
        setRow({ ...currentManta, fk_catalog_id: catalogId });
      }
      if (target?.type === "photo" && numericId(row?.pk_photo_id) === photoId) {
        setRow({ ...currentPhoto, fk_catalog_id: catalogId });
      }
      setLinkedPhotos((current) =>
        current.map((item) =>
          updatedPhotoIds.has(numericId(item.pk_photo_id) ?? -1) ? { ...item, fk_catalog_id: catalogId } : item
        )
      );
      setLinkedSizes((current) =>
        current.map((item) =>
          updatedSizeIds.has(String(item.pk_manta_size_id ?? item.pk_size_id ?? item.id))
            ? { ...item, fk_catalog_id: catalogId }
            : item
        )
      );
      setLinkedBiopsies((current) =>
        current.map((item) =>
          updatedBiopsyIds.has(String(item.pk_biopsy_id ?? item.id)) ? { ...item, fk_catalog_id: catalogId } : item
        )
      );
      setRepairMessage(`Photo ${photoId} matched to catalog ${catalogId}${mantaId ? `; linked manta ${mantaId} synced` : ""}.`);
    } catch (matchError) {
      setRepairMessage(formatUnknownError(matchError, `Could not apply catalog match for photo ${photoId}.`));
    } finally {
      setMatchingPhotoId(null);
    }
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{target ? `${titleCase(target.type)} ${target.id}` : "Record"}</DialogTitle>
          <DialogDescription className="sr-only">
            Review the selected QC record without leaving the current QC results list.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="text-sm text-slate-600">Loading record...</div>
        ) : error ? (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : row ? (
          <div className="max-h-[72vh] overflow-auto space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(row).map(([key, value]) => (
                <div key={key} className="rounded border bg-slate-50 p-3 text-sm">
                  <div className="text-xs font-medium uppercase text-slate-500">{humanizeKey(key)}</div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-slate-900">{formatPlainValue(value)}</div>
                </div>
              ))}
            </div>
            {target?.type === "manta" ? (
              <div className="rounded border border-blue-100 bg-blue-50 p-3">
                <div className="mb-2 text-sm font-semibold text-blue-950">Manta Link Repair</div>
                <div className="grid gap-2 text-xs text-blue-950 sm:grid-cols-2">
                  <RecordLinkLine label="Current sighting" type="sighting" value={row.fk_sighting_id} onOpenRecord={onOpenRecord} />
                  <RecordLinkLine label="Current catalog" type="catalog" value={row.fk_catalog_id} onOpenRecord={onOpenRecord} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={moveMantaSightingLink}
                    disabled={movingMantaLink != null}
                  >
                    {movingMantaLink === "sighting" ? "Moving..." : "Move Sighting Link"}
                  </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={updateMantaCatalogLink}
                disabled={movingMantaLink != null}
              >
                {movingMantaLink === "catalog" ? "Updating..." : "Update Catalog Link"}
              </Button>
            </div>
            <div className="mt-3 rounded border border-blue-200 bg-white/70 p-3 text-sm text-blue-950">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={Boolean(row.no_ventral_photos)}
                  disabled={movingMantaLink != null}
                  onChange={(event) => void updateMantaNoVentralFlag(event.currentTarget.checked)}
                />
                <span>
                  <span className="font-semibold">No Ventral IDs</span>
                  <span className="block text-xs text-blue-900">
                    Use when this encounter has dorsal/other photos only and no ventral ID photo is available.
                    QC will not require a catalog ID unless a ventral photo is later linked.
                  </span>
                </span>
              </label>
              {movingMantaLink === "no-ventral" ? (
                <div className="mt-2 text-xs text-blue-900">Updating No Ventral IDs...</div>
              ) : null}
            </div>
            <div className="mt-2 text-xs text-blue-900">
              These repairs require an audit reason and sync related sighting summary fields when needed.
            </div>
          </div>
        ) : null}
            {target?.type === "sighting" ? (
              <div className="rounded border bg-white p-3">
                <div className="mb-2 text-sm font-semibold">Linked Mantas</div>
                {linkedMantas.length === 0 ? (
                  <div className="text-sm text-slate-600">No manta rows link to this sighting.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="px-2 py-2">Manta</th>
                        <th className="px-2 py-2">Catalog</th>
                        <th className="px-2 py-2">Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedMantas.map((manta) => (
                        <tr key={String(manta.pk_manta_id)} className="border-b last:border-0">
                          <td className="px-2 py-2">
                            {numericId(manta.pk_manta_id) ? (
                              <button
                                type="button"
                                className="text-blue-700 underline hover:text-blue-800"
                                onClick={() => onOpenRecord({ type: "manta", id: numericId(manta.pk_manta_id)! })}
                              >
                                {formatPlainValue(manta.pk_manta_id)}
                              </button>
                            ) : (
                              formatPlainValue(manta.pk_manta_id)
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {numericId(manta.fk_catalog_id) ? (
                              <button
                                type="button"
                                className="text-blue-700 underline hover:text-blue-800"
                                onClick={() => onOpenRecord({ type: "catalog", id: numericId(manta.fk_catalog_id)! })}
                              >
                                {formatPlainValue(manta.fk_catalog_id)}
                              </button>
                            ) : (
                              formatPlainValue(manta.fk_catalog_id)
                            )}
                          </td>
                          <td className="px-2 py-2">{formatPlainValue(manta.name)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : null}
            {target?.type === "manta" || target?.type === "photo" ? (
              <RecordPhotosPanel
                photos={linkedPhotos}
                inferredSightingId={target.type === "manta" ? numericId(row.fk_sighting_id) : null}
                repairingPhotoId={repairingPhotoId}
                deletingPhotoId={deletingPhotoId}
                matchingPhotoId={matchingPhotoId}
                repairMessage={repairMessage}
                onOpenPhoto={(photo) => setSelectedPhoto(photo)}
                onFindCatalogMatch={(photo) => setMatchingPhoto(photo)}
                onOpenRecord={onOpenRecord}
                onRepairSightingLink={repairPhotoSightingLink}
                onDeletePhoto={deletePhotoRow}
              />
            ) : null}
            {target?.type === "manta" ? (
              <>
                <LinkedChildRowsPanel
                  title="Linked Sizes"
                  rows={linkedSizes}
                  countLabel="size row"
                  primaryKey="pk_manta_size_id"
                  targetType="size"
                  emptyMessage="No size rows link to this manta."
                  findings={mantaSizeFindings}
                  photoMap={linkedSizePhotos}
                  onOpenRecord={onOpenRecord}
                />
                <LinkedChildRowsPanel
                  title="Linked Biopsies"
                  rows={linkedBiopsies}
                  countLabel="biopsy"
                  primaryKey="pk_biopsy_id"
                  targetType="biopsy"
                  emptyMessage="No biopsy rows link to this manta."
                  onOpenRecord={onOpenRecord}
                />
              </>
            ) : null}
            {selectedPhoto ? (
              <PhotoViewerOverlay photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
            ) : null}
            {matchingPhoto ? (
              <MatchModal
                open={Boolean(matchingPhoto)}
                onClose={() => setMatchingPhoto(null)}
                tempUrl={resolvePhotoUrl(matchingPhoto, "manta-images")}
                aMeta={{
                  name: target?.type === "manta" && row?.name != null ? String(row.name) : null,
                  gender: target?.type === "manta" && row?.gender != null ? String(row.gender) : null,
                  ageClass: target?.type === "manta" && row?.age_class != null ? String(row.age_class) : null,
                }}
                onChoose={(catalogId) => {
                  const photoForMatch = matchingPhoto;
                  setMatchingPhoto(null);
                  if (photoForMatch) void applyPhotoCatalogMatch(photoForMatch, catalogId);
                }}
                onNoMatch={() => {
                  const photoForMatch = matchingPhoto;
                  const photoId = numericId(photoForMatch?.pk_photo_id);
                  setMatchingPhoto(null);
                  setRepairMessage(
                    photoId
                      ? `No catalog match selected for photo ${photoId}. Leave it for later review or create a new manta/catalog record if this is a new individual.`
                      : "No catalog match selected."
                  );
                }}
              />
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-slate-600">
            {target ? `${titleCase(target.type)} ${target.id} was not found.` : "No record found."}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecordPhotosPanel({
  photos,
  inferredSightingId,
  repairingPhotoId,
  deletingPhotoId,
  matchingPhotoId,
  repairMessage,
  onOpenPhoto,
  onFindCatalogMatch,
  onOpenRecord,
  onRepairSightingLink,
  onDeletePhoto,
}: {
  photos: Array<Record<string, unknown>>;
  inferredSightingId: number | null;
  repairingPhotoId: number | null;
  deletingPhotoId: number | null;
  matchingPhotoId: number | null;
  repairMessage: string | null;
  onOpenPhoto: (photo: Record<string, unknown>) => void;
  onFindCatalogMatch: (photo: Record<string, unknown>) => void;
  onOpenRecord: (target: RecordTarget) => void;
  onRepairSightingLink: (photo: Record<string, unknown>, sightingId: number) => void;
  onDeletePhoto: (photo: Record<string, unknown>) => void;
}) {
  return (
    <div className="rounded border bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">Linked Photos</div>
        <div className="text-xs text-slate-500">{photos.length} photo{photos.length === 1 ? "" : "s"}</div>
      </div>
      {photos.length === 0 ? (
        <div className="text-sm text-slate-600">No photo rows link to this record.</div>
      ) : (
        <>
          {repairMessage ? <div className="mb-3 rounded border bg-slate-50 p-2 text-xs text-slate-700">{repairMessage}</div> : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((photo) => {
              const photoId = numericId(photo.pk_photo_id);
              const imageUrl = resolvePhotoUrl(photo, "manta-images");
              const canRepairSighting = !numericId(photo.fk_sighting_id) && inferredSightingId != null;
              const canMatchCatalog = Boolean(imageUrl);
              return (
                <div key={String(photo.pk_photo_id)} className="rounded border bg-slate-50 p-2 text-sm">
                  <PhotoPreviewButton photo={photo} imageUrl={imageUrl} onOpenPhoto={onOpenPhoto} />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="font-medium text-blue-700 underline hover:text-blue-800"
                      onClick={() => photoId && onOpenRecord({ type: "photo", id: photoId })}
                      disabled={!photoId}
                    >
                      photo {formatPlainValue(photo.pk_photo_id)}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-red-600 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => onDeletePhoto(photo)}
                      disabled={!photoId || deletingPhotoId === photoId}
                      title={`Delete photo row ${formatPlainValue(photo.pk_photo_id)}`}
                      aria-label={`Delete photo row ${formatPlainValue(photo.pk_photo_id)}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <PhotoFlagPill>{formatPlainValue(photo.photo_view)}</PhotoFlagPill>
                    {photo.is_best_manta_ventral_photo ? <PhotoFlagPill tone="amber">best manta ventral</PhotoFlagPill> : null}
                    {photo.is_best_manta_dorsal_photo ? <PhotoFlagPill tone="amber">best manta dorsal</PhotoFlagPill> : null}
                    {photo.is_best_catalog_ventral_photo ? <PhotoFlagPill tone="blue">best catalog ventral</PhotoFlagPill> : null}
                    {photo.is_best_catalog_dorsal_photo ? <PhotoFlagPill tone="blue">best catalog dorsal</PhotoFlagPill> : null}
                  </div>
                  <div className="mt-2 grid gap-1 text-xs text-slate-600">
                    <RecordLinkLine label="Manta" type="manta" value={photo.fk_manta_id} onOpenRecord={onOpenRecord} />
                    <RecordLinkLine label="Catalog" type="catalog" value={photo.fk_catalog_id} onOpenRecord={onOpenRecord} />
                    <RecordLinkLine label="Sighting" type="sighting" value={photo.fk_sighting_id} onOpenRecord={onOpenRecord} />
                    {!numericId(photo.fk_sighting_id) ? (
                      <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                        Linked by manta only; this photo row has no sighting link.
                      </div>
                    ) : null}
                    {canRepairSighting ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-1 h-8 justify-self-start text-xs"
                        onClick={() => onRepairSightingLink(photo, inferredSightingId)}
                        disabled={repairingPhotoId === photoId}
                      >
                        {repairingPhotoId === photoId ? "Repairing..." : `Repair sighting link to ${inferredSightingId}`}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-1 h-8 justify-self-start text-xs"
                      onClick={() => onFindCatalogMatch(photo)}
                      disabled={!photoId || !canMatchCatalog || matchingPhotoId === photoId}
                    >
                      {matchingPhotoId === photoId ? "Matching..." : "Find Catalog Match"}
                    </Button>
                    {photo.storage_path ? (
                      <div className="break-all text-slate-500">Storage: {String(photo.storage_path)}</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function LinkedChildRowsPanel({
  title,
  rows,
  countLabel,
  primaryKey,
  targetType,
  emptyMessage,
  findings = [],
  photoMap = new Map(),
  onOpenRecord,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  countLabel: string;
  primaryKey: string;
  targetType: RecordTarget["type"];
  emptyMessage: string;
  findings?: QcFinding[];
  photoMap?: Map<number, Record<string, unknown>>;
  onOpenRecord: (target: RecordTarget) => void;
}) {
  const storedMeanFindings = primaryKey === "pk_manta_size_id"
    ? findings.filter((finding) => finding.table_name === "mantas")
    : [];

  return (
    <div className="rounded border bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-slate-500">
          {rows.length} {countLabel}
          {rows.length === 1 ? "" : "s"}
        </div>
      </div>
      {storedMeanFindings.length > 0 ? (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          {storedMeanFindings.map((finding, index) => (
            <div key={`${finding.check_name}-${index}`}>{finding.message}</div>
          ))}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <div className="text-sm text-slate-600">{emptyMessage}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((row) => {
            const rowId = numericId(row[primaryKey]);
            const photo = primaryKey === "pk_manta_size_id" ? photoMap.get(photoCodeId(row) ?? -1) : null;
            const rowFindings = findings.filter((finding) => {
              if (finding.table_name !== "manta_sizes") return false;
              return numericId(finding.primary_key) === rowId;
            });
            const hasIssue = rowFindings.length > 0;
            const displayEntries = Object.entries(row).filter(
              ([key]) => ![primaryKey, "fk_manta_id", "fk_catalog_id", "fk_sighting_id"].includes(key)
            );
            return (
              <div
                key={`${primaryKey}-${String(row[primaryKey])}`}
                className={`rounded border p-3 text-sm ${hasIssue ? "border-red-300 bg-red-50" : "bg-slate-50"}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={`font-medium underline hover:text-blue-800 disabled:text-slate-500 disabled:no-underline ${hasIssue ? "text-red-700" : "text-blue-700"}`}
                    onClick={() => rowId && onOpenRecord({ type: targetType, id: rowId })}
                    disabled={!rowId}
                  >
                    {humanizeKey(primaryKey)} {formatPlainValue(row[primaryKey])}
                  </button>
                  {primaryKey === "pk_manta_size_id" ? <PhotoFlagPill tone={hasIssue ? "red" : "slate"}>{sizeRowMeasurementLabel(row)}</PhotoFlagPill> : null}
                </div>
                {rowFindings.length > 0 ? (
                  <div className="mb-2 rounded border border-red-200 bg-white p-2 text-xs text-red-800">
                    {rowFindings.map((finding, index) => (
                      <div key={`${finding.check_name}-${index}`}>{finding.message}</div>
                    ))}
                  </div>
                ) : null}
                <div className="mb-2 grid gap-1 text-xs text-slate-600">
                  <RecordLinkLine label="Manta" type="manta" value={row.fk_manta_id} onOpenRecord={onOpenRecord} />
                  <RecordLinkLine label="Catalog" type="catalog" value={row.fk_catalog_id} onOpenRecord={onOpenRecord} />
                  <RecordLinkLine label="Sighting" type="sighting" value={row.fk_sighting_id} onOpenRecord={onOpenRecord} />
                </div>
                {primaryKey === "pk_manta_size_id" ? (
                  <div className="grid gap-2 text-xs">
                    {photo?.thumbnail_url ? (
                      <img src={String(photo.thumbnail_url)} alt={`photo ${photo.pk_photo_id}`} className="h-32 w-full rounded border bg-white object-contain" />
                    ) : null}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <DetailMini label="Scale px" value={formatPx(scalePx(row))} />
                      <DetailMini label="DL px" value={formatPx(dlPx(row))} />
                      <DetailMini label="DW px" value={formatPx(dwPx(row))} />
                      <DetailMini label="DL m" value={formatMeters(dlM(row))} />
                      <DetailMini label="DW m" value={formatMeters(dwM(row))} />
                      <DetailMini label="DW/DL ratio" value={formatRatio(dwDlRatio(row))} />
                      <DetailMini label="Photo code" value={row.photo_code} />
                      <DetailMini label="Photo file" value={photo?.file_name2 ?? photo?.storage_path ?? "—"} />
                    </div>
                    <div className="break-words text-slate-700">
                      <span className="text-slate-500">Calibration:</span> {formatCalibration(row.calibration_params)}
                    </div>
                  </div>
                ) : (
                  <dl className="grid gap-1 text-xs">
                    {displayEntries.slice(0, 12).map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[9rem_1fr] gap-2">
                        <dt className="text-slate-500">{humanizeKey(key)}</dt>
                        <dd className="break-words text-slate-800">{formatPlainValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailMini({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <span className="text-slate-500">{label}:</span> <span className="text-slate-800">{formatPlainValue(value)}</span>
    </div>
  );
}

function sizeRowMeasurementLabel(row: Record<string, unknown>) {
  return sizeMeasurementLabel(row);
}

function PhotoPreviewButton({
  photo,
  imageUrl,
  onOpenPhoto,
}: {
  photo: Record<string, unknown>;
  imageUrl: string;
  onOpenPhoto: (photo: Record<string, unknown>) => void;
}) {
  const [failed, setFailed] = useState(false);
  const photoId = numericId(photo.pk_photo_id);

  return (
    <button
      type="button"
      className="block w-full overflow-hidden rounded border bg-white"
      onClick={() => imageUrl && !failed && onOpenPhoto(photo)}
      disabled={!imageUrl || failed}
      title={imageUrl && !failed ? `View photo ${photoId ?? ""}` : "Image file could not be loaded"}
    >
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt={`Photo ${photoId ?? ""}`}
          className="h-40 w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-40 items-center justify-center bg-amber-50 px-3 text-center text-xs text-amber-800">
          Image file could not be loaded from storage.
        </div>
      )}
    </button>
  );
}

function RecordLinkLine({
  label,
  type,
  value,
  onOpenRecord,
}: {
  label: string;
  type: RecordTarget["type"];
  value: unknown;
  onOpenRecord: (target: RecordTarget) => void;
}) {
  const id = numericId(value);
  return (
    <div>
      {label}:{" "}
      {id ? (
        <button
          type="button"
          className="text-blue-700 underline hover:text-blue-800"
          onClick={() => onOpenRecord({ type, id })}
        >
          {id}
        </button>
      ) : (
        "—"
      )}
    </div>
  );
}

function PhotoFlagPill({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "amber" | "blue" | "red";
}) {
  const classes =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : tone === "blue"
        ? "border-blue-200 bg-blue-50 text-blue-800"
        : tone === "red"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-slate-200 bg-white text-slate-700";
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${classes}`}>{children}</span>;
}

function PhotoViewerOverlay({
  photo,
  onClose,
}: {
  photo: Record<string, unknown>;
  onClose: () => void;
}) {
  const imageUrl = resolvePhotoUrl(photo, "manta-images");
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <div className="font-semibold">Photo {formatPlainValue(photo.pk_photo_id)}</div>
            <div className="text-xs text-slate-600">
              {formatPlainValue(photo.photo_view)}
              {photo.is_best_manta_ventral_photo ? " · best manta ventral" : ""}
              {photo.is_best_manta_dorsal_photo ? " · best manta dorsal" : ""}
              {photo.is_best_catalog_ventral_photo ? " · best catalog ventral" : ""}
              {photo.is_best_catalog_dorsal_photo ? " · best catalog dorsal" : ""}
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-950 p-4">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`Photo ${formatPlainValue(photo.pk_photo_id)}`}
              className="mx-auto max-h-[78vh] max-w-full object-contain"
            />
          ) : (
            <div className="flex h-80 items-center justify-center text-sm text-white">No image URL available.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatPlainValue(value: unknown) {
  if (value == null || value === "") return "—";
  return String(value);
}

function getStatus(summary: SummaryDomain | null) {
  if (!summary) {
    return {
      label: "Not Checked",
      heroLabel: "Not checked",
      description: "QC has not produced a result for this browser page yet.",
      icon: Clock3,
      iconClass: "text-slate-600",
      badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
      borderClass: "border-slate-200",
    };
  }
  if (summary.findings.errors > 0) {
    return {
      label: "Needs Maintenance",
      heroLabel: "Needs attention",
      description: "Errors were found. These are likely broken links, missing records, or records that need admin review.",
      icon: XCircle,
      iconClass: "text-red-600",
      badgeClass: "border-red-200 bg-red-100 text-red-700",
      borderClass: "border-red-200",
    };
  }
  if (summary.findings.warnings > 0) {
    return {
      label: "Review",
      heroLabel: "Minor issues",
      description: "Warnings were found. These usually mean review is needed, but the page is not necessarily broken.",
      icon: AlertTriangle,
      iconClass: "text-amber-600",
      badgeClass: "border-amber-200 bg-amber-100 text-amber-800",
      borderClass: "border-amber-200",
    };
  }
  return {
    label: "Clean",
    heroLabel: "All good",
    description: "No errors or warnings were found. Info items, if present, are not maintenance blockers.",
    icon: CheckCircle2,
    iconClass: "text-emerald-600",
    badgeClass: "border-emerald-200 bg-emerald-100 text-emerald-700",
    borderClass: "border-emerald-200",
  };
}

function makeOverallSummary(summary: SummarySnapshot | null): SummaryDomain | null {
  if (!summary) return null;
  return {
    domain: "overall",
    summary: {},
    findings: summary.totals,
  };
}

function findingKey(finding: QcFinding) {
  return [
    finding.domain,
    finding.check_name,
    finding.table_name ?? "",
    finding.primary_key ?? "",
    finding.related_manta_id ?? "",
    finding.related_sighting_id ?? "",
    finding.message,
  ].join("|");
}

function adjustSummaryCounts(
  summary: SummarySnapshot,
  domain: string,
  severity: Severity,
  delta: number
): SummarySnapshot {
  const countKey = severity === "error" ? "errors" : severity === "warning" ? "warnings" : "info";
  const adjustCounts = (counts: SummaryDomain["findings"]) => ({
    ...counts,
    total: Math.max(0, counts.total + delta),
    [countKey]: Math.max(0, counts[countKey] + delta),
  });

  return {
    ...summary,
    domains: summary.domains.map((row) =>
      row.domain === domain ? { ...row, findings: adjustCounts(row.findings) } : row
    ),
    totals: adjustCounts(summary.totals),
  };
}

function CountTile({
  label,
  value,
  tone,
  explanation,
}: {
  label: string;
  value: number;
  tone: "error" | "warning" | "info";
  explanation?: string;
}) {
  const isZero = value === 0;
  const className = isZero
    ? "text-emerald-700"
    : tone === "error"
      ? "text-red-700"
      : tone === "warning"
        ? "text-amber-700"
        : "text-slate-700";
  const title = explanation ?? countExplanation(tone, value);
  return (
    <div className="rounded-lg border bg-white p-3" title={title}>
      <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${className}`}>{value}</div>
    </div>
  );
}

function countExplanation(tone: "error" | "warning" | "info", value: number) {
  if (value === 0) return "Zero means this category is clear in the latest QC run.";
  if (tone === "error") return "Errors usually mean a broken link, missing record, or consistency problem that needs attention.";
  if (tone === "warning") return "Warnings usually mean a record should be reviewed, but may not be wrong.";
  return "Info items are visibility notes. They do not make the page need maintenance by themselves.";
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function CommandPill({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);
  async function copyCommand() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-slate-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-medium text-slate-900">
          <Terminal className="h-4 w-4 text-slate-600" />
          {label}
        </div>
        <code className="mt-1 block overflow-x-auto whitespace-nowrap text-xs text-slate-700">{command}</code>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={copyCommand} className="shrink-0">
        <Copy className="mr-2 h-4 w-4" />
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function RunCommands({
  commands,
  loading,
  onRefresh,
}: {
  commands: SummarySnapshot["rerun_commands"];
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
          <h2 className="text-lg font-semibold">Run QC Again</h2>
            <p className="text-sm text-slate-600">
              The browser shows the latest saved QC snapshot. After fixing database records, run the local QC command in Terminal, then refresh the displayed results here.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh Displayed Results
          </Button>
        </div>
        <div className="grid gap-2">
          <CommandPill label="Run database QC" command={commands?.local ?? DEFAULT_COMMANDS.local} />
          <CommandPill label="Run database + storage QC" command={commands?.with_storage_probe ?? DEFAULT_COMMANDS.with_storage_probe} />
          <CommandPill label="Inspect schema" command={commands?.schema ?? DEFAULT_COMMANDS.schema} />
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const className =
    severity === "error"
      ? "border-red-200 bg-red-100 text-red-700"
      : severity === "warning"
        ? "border-amber-200 bg-amber-100 text-amber-800"
        : "border-slate-200 bg-slate-100 text-slate-700";

  const Icon = severity === "info" ? Info : severity === "warning" ? AlertTriangle : XCircle;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      <Icon className="h-3.5 w-3.5" />
      {severity}
    </span>
  );
}

function rowsCheckedLabel(summary?: Record<string, unknown>) {
  if (!summary) return "Not checked";
  const entries = Object.entries(summary).filter(([key]) => /rows|manifest|photos_loaded/i.test(key));
  if (entries.length === 0) return "See summary";
  return entries
    .slice(0, 2)
    .map(([key, value]) => `${humanizeKey(key)}: ${String(value)}`)
    .join(" / ");
}

function recordLabel(finding: QcFinding) {
  if (finding.related_photo_id) return `photo ${finding.related_photo_id}`;
  if (finding.related_catalog_id) return `catalog ${finding.related_catalog_id}`;
  if (finding.related_manta_id) return `manta ${finding.related_manta_id}`;
  if (finding.related_sighting_id) return `sighting ${finding.related_sighting_id}`;
  if (finding.primary_key) return String(finding.primary_key);
  return finding.table_name ?? "record";
}

function humanizeKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
