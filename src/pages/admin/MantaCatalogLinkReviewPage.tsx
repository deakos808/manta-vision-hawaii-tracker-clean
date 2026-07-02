import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, RefreshCw } from "lucide-react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { buildCatalogImageUrl } from "@/lib/catalogImage";
import { resolvePhotoUrl } from "@/lib/photoUrl";
import { fallbackLogoForRecord } from "@/lib/fallbackLogos";

type AuditRow = {
  pk_manta_id: number;
  name: string;
  is_mprf: boolean;
  fk_sighting_id: number | "";
  proposed_fk_catalog_id: number | "";
  proposed_catalog_name: string;
  decision: string;
  retired_duplicate_keeper_ids?: string;
  exact_name_catalog_ids?: string;
  same_name_manta_catalog_ids?: string;
  photo_fk_catalog_ids?: string;
  embedded_cat_ids?: string;
  photo_count: number;
  same_name_manta_count: number;
  reasons: string;
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

type PhotoRow = {
  pk_photo_id: number;
  fk_manta_id: number | null;
  fk_catalog_id: number | null;
  photo_view?: string | null;
  is_best_manta_ventral_photo?: boolean | null;
  is_best_manta_dorsal_photo?: boolean | null;
  [key: string]: unknown;
};

type Decision = "approve_link" | "different_manta" | "needs_review";

type DecisionRow = {
  decision: Decision;
  note: string;
  updated_at: string;
};

const STORAGE_KEY = "hmt_manta_catalog_link_review_decisions_v1";

export default function MantaCatalogLinkReviewPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [catalogs, setCatalogs] = useState<Map<number, CatalogRow>>(new Map());
  const [photosByManta, setPhotosByManta] = useState<Map<number, PhotoRow[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "review_first" | "hamer_named_photos" | "mprf_named_no_photos" | "no_photos" | "with_photos" | "high_confidence" | "no_candidate" | "decided">("mprf_named_no_photos");
  const [decisions, setDecisions] = useState<Record<string, DecisionRow>>(() => readDecisions());
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/qc/manta-catalog-link-review/manta_catalog_link_audit.json?ts=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("No manta catalog link audit is available. Run npm run qc:audit-manta-catalog-links.");
        const audit = (await res.json()) as { rows: AuditRow[] };
        const nextRows = audit.rows ?? [];
        const catalogIds = nextRows
          .map((row) => Number(row.proposed_fk_catalog_id))
          .filter((value) => Number.isFinite(value) && value > 0);
        const mantaIds = nextRows.map((row) => Number(row.pk_manta_id)).filter((value) => Number.isFinite(value));
        const [catalogMap, photoMap] = await Promise.all([
          loadCatalogs(catalogIds),
          loadPhotos(mantaIds),
        ]);
        if (!alive) return;
        setRows(nextRows);
        setCatalogs(catalogMap);
        setPhotosByManta(photoMap);
      } catch (error) {
        if (alive) setLoadError(error instanceof Error ? error.message : "Failed to load audit.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const visibleRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => rankDecision(a) - rankDecision(b) || a.pk_manta_id - b.pk_manta_id);
    if (filter === "all") return sorted;
    if (filter === "hamer_named_photos") {
      return sorted.filter((row) => !row.is_mprf && Boolean(row.name?.trim()) && Number(row.photo_count ?? 0) > 0 && !decisions[row.pk_manta_id]);
    }
    if (filter === "mprf_named_no_photos") {
      return sorted.filter((row) => row.is_mprf && Boolean(row.name?.trim()) && Number(row.photo_count ?? 0) === 0 && Boolean(Number(row.proposed_fk_catalog_id)) && !decisions[row.pk_manta_id]);
    }
    if (filter === "no_photos") return sorted.filter((row) => Number(row.photo_count ?? 0) === 0);
    if (filter === "with_photos") return sorted.filter((row) => Number(row.photo_count ?? 0) > 0);
    if (filter === "high_confidence") return sorted.filter((row) => row.decision === "high_confidence_name_match");
    if (filter === "no_candidate") return sorted.filter((row) => row.decision === "no_candidate");
    if (filter === "decided") return sorted.filter((row) => decisions[row.pk_manta_id]);
    return sorted.filter((row) => row.decision !== "high_confidence_name_match" && !decisions[row.pk_manta_id]);
  }, [decisions, filter, rows]);

  function saveDecision(row: AuditRow, decision: Decision) {
    const key = String(row.pk_manta_id);
    const next = {
      ...decisions,
      [key]: {
        decision,
        note: noteDrafts[key]?.trim() ?? "",
        updated_at: new Date().toISOString(),
      },
    };
    setDecisions(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function updateNote(row: AuditRow, note: string) {
    setNoteDrafts((current) => ({ ...current, [row.pk_manta_id]: note }));
  }

  function exportCsv() {
    const out = rows.map((row) => {
      const decision = decisions[row.pk_manta_id];
      return {
        pk_manta_id: row.pk_manta_id,
        manta_name: row.name,
        fk_sighting_id: row.fk_sighting_id,
        proposed_fk_catalog_id: row.proposed_fk_catalog_id,
        proposed_catalog_name: row.proposed_catalog_name,
        is_mprf: row.is_mprf,
        photo_count: row.photo_count,
        audit_decision: row.decision,
        reviewer_decision: decision?.decision ?? "",
        reviewer_note: decision?.note ?? "",
        reviewer_updated_at: decision?.updated_at ?? "",
        retired_duplicate_keeper_ids: row.retired_duplicate_keeper_ids ?? "",
        reasons: row.reasons,
      };
    });
    const blob = new Blob([toCsv(out)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `manta_catalog_link_review_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const decidedCount = Object.keys(decisions).length;
  const reviewFirstCount = rows.filter((row) => row.decision !== "high_confidence_name_match").length;
  const noPhotoCount = rows.filter((row) => Number(row.photo_count ?? 0) === 0).length;
  const noPhotoReviewCount = rows.filter((row) => Number(row.photo_count ?? 0) === 0 && row.decision !== "high_confidence_name_match").length;
  const hamerNamedPhotoCount = rows.filter((row) => !row.is_mprf && Boolean(row.name?.trim()) && Number(row.photo_count ?? 0) > 0).length;
  const hamerNamedPhotoPendingCount = rows.filter((row) => !row.is_mprf && Boolean(row.name?.trim()) && Number(row.photo_count ?? 0) > 0 && !decisions[row.pk_manta_id]).length;
  const mprfNamedNoPhotoCount = rows.filter((row) => row.is_mprf && Boolean(row.name?.trim()) && Number(row.photo_count ?? 0) === 0 && Boolean(Number(row.proposed_fk_catalog_id))).length;
  const mprfNamedNoPhotoPendingCount = rows.filter((row) => row.is_mprf && Boolean(row.name?.trim()) && Number(row.photo_count ?? 0) === 0 && Boolean(Number(row.proposed_fk_catalog_id)) && !decisions[row.pk_manta_id]).length;

  return (
    <Layout>
      <div className="w-full bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-8 text-white">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-3xl font-bold">Manta Catalog Link Review</h1>
          <p className="mt-2 text-blue-50">
            Review only the manta rows missing catalog links. No database records are changed here.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        <div>
          <Link to="/admin/qc/mantas" className="text-sm text-blue-700 underline">
            Admin / Data Quality Control / Mantas QC
          </Link>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="text-sm text-slate-700">
              {loading ? "Loading review rows..." : `${rows.length} manta errors · ${mprfNamedNoPhotoPendingCount}/${mprfNamedNoPhotoCount} named MPRF no-photo rows still pending · ${hamerNamedPhotoPendingCount}/${hamerNamedPhotoCount} named HAMER photo rows still pending · ${noPhotoCount} with no photos (${noPhotoReviewCount} review first) · ${reviewFirstCount} total need review first · ${decidedCount} reviewer decisions`}
              {loadError ? <span className="ml-2 text-red-700">{loadError}</span> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterButton label="Review First" active={filter === "review_first"} onClick={() => setFilter("review_first")} />
              <FilterButton label="Named MPRF No Photos" active={filter === "mprf_named_no_photos"} onClick={() => setFilter("mprf_named_no_photos")} />
              <FilterButton label="Named HAMER Photos Pending" active={filter === "hamer_named_photos"} onClick={() => setFilter("hamer_named_photos")} />
              <FilterButton label="No Photos" active={filter === "no_photos"} onClick={() => setFilter("no_photos")} />
              <FilterButton label="With Photos" active={filter === "with_photos"} onClick={() => setFilter("with_photos")} />
              <FilterButton label="High Confidence" active={filter === "high_confidence"} onClick={() => setFilter("high_confidence")} />
              <FilterButton label="No Candidate" active={filter === "no_candidate"} onClick={() => setFilter("no_candidate")} />
              <FilterButton label="Decided" active={filter === "decided"} onClick={() => setFilter("decided")} />
              <FilterButton label="All" active={filter === "all"} onClick={() => setFilter("all")} />
              <Button variant="outline" onClick={() => window.location.reload()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reload
              </Button>
              <Button variant="outline" onClick={exportCsv}>
                <Download className="mr-2 h-4 w-4" />
                Export Review CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {visibleRows.length === 0 ? (
            <Card>
              <CardContent className="p-5 text-sm text-slate-600">
                {loading ? "Loading..." : "No manta rows match this filter."}
              </CardContent>
            </Card>
          ) : (
            visibleRows.map((row) => (
              <ReviewCard
                key={row.pk_manta_id}
                row={row}
                catalog={typeof row.proposed_fk_catalog_id === "number" ? catalogs.get(row.proposed_fk_catalog_id) : undefined}
                photos={photosByManta.get(row.pk_manta_id) ?? []}
                decision={decisions[row.pk_manta_id]}
                noteDraft={noteDrafts[row.pk_manta_id] ?? decisions[row.pk_manta_id]?.note ?? ""}
                onNote={(note) => updateNote(row, note)}
                onDecision={(decision) => saveDecision(row, decision)}
              />
            ))
          )}
        </div>
      </main>
    </Layout>
  );
}

function ReviewCard({
  row,
  catalog,
  photos,
  decision,
  noteDraft,
  onNote,
  onDecision,
}: {
  row: AuditRow;
  catalog?: CatalogRow;
  photos: PhotoRow[];
  decision?: DecisionRow;
  noteDraft: string;
  onNote: (note: string) => void;
  onDecision: (decision: Decision) => void;
}) {
  const proposedId = row.proposed_fk_catalog_id || null;
  const isDuplicateWarning = row.decision === "retired_duplicate_candidate";
  const isNoCandidate = row.decision === "no_candidate";
  const photoCatalogIds = String(row.photo_fk_catalog_ids ?? "").trim();
  const isPhotoCatalogBackfill =
    Boolean(proposedId) && photoCatalogIds !== "" && !photoCatalogIds.includes("|") && photoCatalogIds === String(proposedId);
  const catalogImage = catalog ? buildCatalogImageUrl(catalog, "ventral") : "/hamer-icon.png";

  return (
    <Card className={isDuplicateWarning ? "border-amber-300" : isNoCandidate ? "border-slate-300" : "border-emerald-200"}>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">Manta {row.pk_manta_id}</h2>
              <StatusPill row={row} />
              {decision ? <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">Reviewer: {decisionLabel(decision.decision)}</span> : null}
            </div>
            <div className="mt-1 text-sm text-slate-700">
              <span className="font-medium">{row.name || "No manta name"}</span>
              <span className="mx-2">·</span>
              Sighting {row.fk_sighting_id || "—"}
              <span className="mx-2">·</span>
              {row.is_mprf ? "MPRF" : "HAMER"}
            </div>
            {proposedId ? (
              <p className="mt-2 text-sm text-slate-600">
                This manta row is missing <code>fk_catalog_id</code>.
                {isPhotoCatalogBackfill ? (
                  <>
                    {" "}Its linked photo already has catalog {proposedId}, so this is a parent-row backfill candidate.
                  </>
                ) : (
                  <>
                    {" "}Compare the available manta evidence with candidate catalog {proposedId}; if they are the same animal, choose <span className="font-medium">Approve Link</span>.
                  </>
                )}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/browse/mantas?mantaId=${row.pk_manta_id}`} target="_blank">
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                Open Manta
              </Link>
            </Button>
            {proposedId ? (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/browse/catalog?catalogId=${proposedId}`} target="_blank">
                  <ExternalLink className="mr-1 h-3.5 w-3.5" />
                  Open Catalog
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        {isDuplicateWarning ? (
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Proposed catalog {proposedId} appeared in the old duplicate candidate set as the higher ID.
              {row.retired_duplicate_keeper_ids ? ` Possible older ID: ${row.retired_duplicate_keeper_ids}.` : ""}
              {" "}Only approve if the current catalog row is truly still this manta.
            </div>
          </div>
        ) : null}

        {isPhotoCatalogBackfill ? (
          <div className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              All linked photos for this manta already point to catalog {proposedId}. Approving this row means using that same catalog ID on <code>mantas.fk_catalog_id</code>.
            </div>
          </div>
        ) : null}

        {photos.length === 0 ? (
          <div className="flex gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div>
              No photos are linked to this manta row. For MPRF import rows, use the name, proposed catalog photo, sighting context, sibling manta rows, or import/source data before approving the catalog link.
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Manta Row Photos</h3>
              <span className="text-sm text-slate-500">{photos.length} linked photos</span>
            </div>
            {photos.length === 0 ? (
              <div className="rounded-md border bg-slate-50 p-4 text-sm text-slate-600">
                <img
                  src={fallbackLogoForRecord(row.is_mprf)}
                  alt={row.is_mprf ? "Manta Pacific fallback logo" : "HAMER fallback logo"}
                  className="mb-3 h-48 w-full rounded-md border bg-white object-contain p-2"
                />
                <div>No photos are linked to this manta row.</div>
                {row.is_mprf ? (
                  <div className="mt-1 text-xs text-slate-500">
                    This appears to be an MPRF import-only encounter. Approving will use the same-name catalog candidate after your review.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {photos.map((photo) => (
                  <PhotoTile key={photo.pk_photo_id} photo={photo} isMprf={row.is_mprf} />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-700">Candidate Catalog Photo</div>
                <div className="text-xs text-slate-500">Same-name catalog: {catalog?.name ?? row.proposed_catalog_name ?? "—"}</div>
              </div>
              {proposedId ? (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">Catalog {proposedId}</span>
              ) : null}
            </div>
            <img src={catalogImage} alt={`Catalog ${proposedId ?? "unknown"}`} className="h-80 w-full rounded-md border bg-slate-50 object-contain" />
            <div className="mt-3 space-y-1 text-sm">
              <Info label="Catalog ID" value={proposedId ?? "No candidate"} />
              <Info label="Name" value={catalog?.name ?? row.proposed_catalog_name ?? "—"} />
              <Info label="Species" value={catalog?.species} />
              <Info label="Gender" value={catalog?.gender} />
              <Info label="First" value={catalog?.date_first_sighted} />
              <Info label="Last" value={catalog?.date_last_sighted} />
              <Info label="Audit" value={row.decision} />
            </div>
          </div>
        </div>

        <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
          <div><span className="font-semibold">Signals:</span> {row.reasons || "—"}</div>
          <div className="mt-1">
            Exact name catalog IDs: {row.exact_name_catalog_ids || "—"} · Same-name manta catalog IDs: {row.same_name_manta_catalog_ids || "—"} · Photo catalog IDs: {row.photo_fk_catalog_ids || "—"} · Embedded Cat IDs: {row.embedded_cat_ids || "—"}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Reviewer note</span>
            <textarea
              value={noteDraft}
              onChange={(event) => onNote(event.target.value)}
              className="mt-1 min-h-16 w-full rounded-md border border-slate-300 px-3 py-2"
              placeholder="Optional note before exporting decisions..."
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant={decision?.decision === "approve_link" ? "default" : "outline"} onClick={() => onDecision("approve_link")} disabled={!proposedId}>
              {isPhotoCatalogBackfill ? "Use Photo Catalog ID" : "Approve Link"}
            </Button>
            <Button variant={decision?.decision === "different_manta" ? "default" : "outline"} onClick={() => onDecision("different_manta")}>
              Different Manta
            </Button>
            <Button variant={decision?.decision === "needs_review" ? "default" : "outline"} onClick={() => onDecision("needs_review")}>
              Needs Review
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PhotoTile({ photo, isMprf }: { photo: PhotoRow; isMprf: boolean }) {
  const src = resolvePhotoUrl(photo) || fallbackLogoForRecord(isMprf);
  return (
    <div className="rounded-md border bg-white p-2 text-xs">
      <img src={src} alt={`Photo ${photo.pk_photo_id}`} className="h-64 w-full rounded border bg-slate-50 object-contain" />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span>Photo {photo.pk_photo_id}</span>
        {photo.is_best_manta_ventral_photo ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Best</span> : null}
      </div>
      <div className="text-slate-500">View: {photo.photo_view ?? "—"}</div>
      <div className="text-slate-500">Catalog: {photo.fk_catalog_id ?? "—"}</div>
    </div>
  );
}

function StatusPill({ row }: { row: AuditRow }) {
  if (row.decision === "high_confidence_name_match") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        High Confidence
      </span>
    );
  }
  if (row.decision === "retired_duplicate_candidate") {
    return <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Duplicate ID Warning</span>;
  }
  if (row.decision === "no_candidate") {
    return <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">No Candidate</span>;
  }
  return <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">{row.decision}</span>;
}

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Button variant={active ? "default" : "outline"} onClick={onClick}>
      {label}
    </Button>
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

async function loadCatalogs(ids: number[]) {
  const unique = Array.from(new Set(ids)).sort((a, b) => a - b);
  const rows: CatalogRow[] = [];
  for (let i = 0; i < unique.length; i += 250) {
    const chunk = unique.slice(i, i + 250);
    const { data, error } = await supabase.from("catalog").select("*").in("pk_catalog_id", chunk);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as CatalogRow[]));
  }
  return new Map(rows.map((row) => [Number(row.pk_catalog_id), row]));
}

async function loadPhotos(mantaIds: number[]) {
  const unique = Array.from(new Set(mantaIds)).sort((a, b) => a - b);
  const rows: PhotoRow[] = [];
  for (let i = 0; i < unique.length; i += 250) {
    const chunk = unique.slice(i, i + 250);
    const { data, error } = await supabase
      .from("photos")
      .select("*")
      .in("fk_manta_id", chunk)
      .order("pk_photo_id", { ascending: true });
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as PhotoRow[]));
  }
  const grouped = new Map<number, PhotoRow[]>();
  for (const photo of rows) {
    if (photo.fk_manta_id == null) continue;
    const list = grouped.get(Number(photo.fk_manta_id)) ?? [];
    list.push(photo);
    grouped.set(Number(photo.fk_manta_id), list);
  }
  return grouped;
}

function rankDecision(row: AuditRow) {
  if (row.decision === "retired_duplicate_candidate") return 0;
  if (row.decision === "conflict") return 1;
  if (row.decision === "medium_confidence_relationship_match") return 2;
  if (row.decision === "no_candidate") return 3;
  return 4;
}

function decisionLabel(decision: Decision) {
  if (decision === "approve_link") return "Approve Link";
  if (decision === "different_manta") return "Different Manta";
  return "Needs Review";
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
