import fs from "fs";
import path from "path";
import { ensureOutputDir, getSupabaseClient, writeCsv } from "./qc_common";

type SightingRow = {
  pk_sighting_id: number;
  is_mprf: boolean | null;
  sighting_date: string | null;
  start_time: string | null;
  end_time: string | null;
  island: string | null;
  population: string | null;
  location: string | null;
  sitelocation: string | null;
  latitude: number | null;
  longitude: number | null;
  photographer: string | null;
  organization: string | null;
  total_mantas: number | null;
  total_manta_ids: number | null;
  list_manta_ids: string | null;
  list_manta_ids_2: string | null;
  list_catalog_ids: string | null;
  notes: string | null;
  behavior: string | null;
};

type MprfMapRow = {
  pk_mprf_sighting_id: string;
  pk_sighting_id: number;
  created_at: string | null;
};

type LinkCheck = {
  table: string;
  column: string;
  count: number | null;
  error: string;
};

const APPLY = process.argv.includes("--apply");
const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/delete_target_duplicate_mprf_sightings");

const TARGETS = [
  {
    duplicate_sighting_id: 10566,
    kept_sighting_id: 10565,
    reason: "Duplicate MPRF sighting row has no linked manta records; mapped manta encounter is preserved on sighting 10565.",
  },
  {
    duplicate_sighting_id: 10752,
    kept_sighting_id: 10751,
    reason: "Duplicate MPRF sighting row has no linked manta records; mapped manta encounter is preserved on sighting 10751.",
  },
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function norm(value: unknown) {
  return clean(value).replace(/\s+/g, " ").toLowerCase();
}

function sameCoordinate(a: unknown, b: unknown, tolerance = 0.00001) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) && !Number.isFinite(right)) return true;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= tolerance;
}

async function countLinks(table: string, column: string, sightingId: number): Promise<LinkCheck> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const { count, error } = await supabase
    .from(table)
    .select(column, { count: "exact", head: true })
    .eq(column, sightingId);

  if (error && /does not exist|Could not find|schema cache/i.test(error.message)) {
    return { table, column, count: 0, error: error.message };
  }
  return { table, column, count: error ? null : count ?? 0, error: error?.message ?? "" };
}

async function loadSightings(ids: number[]) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const { data, error } = await supabase
    .from("sightings")
    .select(
      [
        "pk_sighting_id",
        "is_mprf",
        "sighting_date",
        "start_time",
        "end_time",
        "island",
        "population",
        "location",
        "sitelocation",
        "latitude",
        "longitude",
        "photographer",
        "organization",
        "total_mantas",
        "total_manta_ids",
        "list_manta_ids",
        "list_manta_ids_2",
        "list_catalog_ids",
        "notes",
        "behavior",
      ].join(","),
    )
    .in("pk_sighting_id", ids);
  if (error) throw new Error(`sightings: ${error.message}`);
  return new Map(((data ?? []) as SightingRow[]).map((row) => [row.pk_sighting_id, row]));
}

async function loadMprfMapRows(sightingId: number) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const { data, error } = await supabase
    .from("mprf_sighting_map")
    .select("pk_mprf_sighting_id,pk_sighting_id,created_at")
    .eq("pk_sighting_id", sightingId)
    .order("pk_mprf_sighting_id", { ascending: true });
  if (error) throw new Error(`mprf_sighting_map: ${error.message}`);
  return (data ?? []) as MprfMapRow[];
}

function duplicateLooksLikeKept(duplicate: SightingRow, kept: SightingRow) {
  return (
    duplicate.is_mprf === true &&
    kept.is_mprf === true &&
    norm(duplicate.sighting_date) === norm(kept.sighting_date) &&
    norm(duplicate.photographer) === norm(kept.photographer) &&
    norm(duplicate.location ?? duplicate.sitelocation) === norm(kept.location ?? kept.sitelocation) &&
    sameCoordinate(duplicate.latitude, kept.latitude) &&
    sameCoordinate(duplicate.longitude, kept.longitude) &&
    norm(duplicate.notes) === "" &&
    norm(duplicate.behavior) === "" &&
    norm(duplicate.organization) === norm(kept.organization)
  );
}

function dependencySummary(checks: LinkCheck[]) {
  return checks
    .map((check) => `${check.table}.${check.column}:${check.count == null ? `unknown (${check.error})` : check.count}`)
    .join("; ");
}

async function main() {
  ensureOutputDir(OUT_DIR);
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const changedAt = new Date().toISOString();
  const ids = Array.from(new Set(TARGETS.flatMap((target) => [target.duplicate_sighting_id, target.kept_sighting_id])));
  const sightingById = await loadSightings(ids);
  const auditRows: Record<string, unknown>[] = [];
  const mapRowsBefore: Record<string, unknown>[] = [];

  for (const target of TARGETS) {
    const duplicate = sightingById.get(target.duplicate_sighting_id);
    const kept = sightingById.get(target.kept_sighting_id);
    const checks = await Promise.all([
      countLinks("mantas", "fk_sighting_id", target.duplicate_sighting_id),
      countLinks("photos", "fk_sighting_id", target.duplicate_sighting_id),
      countLinks("sizes", "fk_sighting_id", target.duplicate_sighting_id),
      countLinks("biopsies", "fk_sighting_id", target.duplicate_sighting_id),
    ]);
    const mprfMapRows = await loadMprfMapRows(target.duplicate_sighting_id);
    mapRowsBefore.push(...mprfMapRows.map((row) => ({
      changed_at: changedAt,
      apply: APPLY,
      duplicate_sighting_id: target.duplicate_sighting_id,
      ...row,
    })));

    const linksClear = checks.every((check) => check.count === 0);
    const duplicateTotal = Number(duplicate?.total_mantas ?? duplicate?.total_manta_ids ?? 0);
    const keptTotal = Number(kept?.total_mantas ?? kept?.total_manta_ids ?? 0);
    const safe =
      Boolean(duplicate && kept) &&
      duplicateLooksLikeKept(duplicate!, kept!) &&
      linksClear &&
      duplicateTotal === 0 &&
      keptTotal > 0;

    const base = {
      changed_at: changedAt,
      apply: APPLY,
      duplicate_sighting_id: target.duplicate_sighting_id,
      kept_sighting_id: target.kept_sighting_id,
      duplicate_exists: Boolean(duplicate),
      kept_exists: Boolean(kept),
      duplicate_date: duplicate?.sighting_date ?? "",
      kept_date: kept?.sighting_date ?? "",
      duplicate_time: [duplicate?.start_time, duplicate?.end_time].map(clean).filter(Boolean).join(" - "),
      kept_time: [kept?.start_time, kept?.end_time].map(clean).filter(Boolean).join(" - "),
      duplicate_photographer: duplicate?.photographer ?? "",
      kept_photographer: kept?.photographer ?? "",
      duplicate_location: duplicate?.sitelocation ?? duplicate?.location ?? "",
      kept_location: kept?.sitelocation ?? kept?.location ?? "",
      duplicate_total_mantas: duplicate?.total_mantas ?? duplicate?.total_manta_ids ?? "",
      kept_total_mantas: kept?.total_mantas ?? kept?.total_manta_ids ?? "",
      duplicate_listed_mantas: duplicate?.list_manta_ids_2 ?? duplicate?.list_manta_ids ?? "",
      dependency_counts: dependencySummary(checks),
      mprf_sighting_map_rows: mprfMapRows.map((row) => row.pk_mprf_sighting_id).join("|"),
      time_fields_match: norm(duplicate?.start_time) === norm(kept?.start_time) && norm(duplicate?.end_time) === norm(kept?.end_time),
      reason: target.reason,
    };

    if (!safe) {
      auditRows.push({
        ...base,
        status: "blocked",
        message: "Safety checks failed; no deletion attempted.",
      });
      continue;
    }

    if (!APPLY) {
      auditRows.push({
        ...base,
        status: "dry_run_ready",
        message: "Ready to delete duplicate sighting after deleting its mprf_sighting_map rows.",
      });
      continue;
    }

    const mapDelete = await supabase
      .from("mprf_sighting_map")
      .delete()
      .eq("pk_sighting_id", target.duplicate_sighting_id);

    if (mapDelete.error) {
      auditRows.push({
        ...base,
        status: "blocked",
        message: `Could not delete mprf_sighting_map rows: ${mapDelete.error.message}`,
      });
      continue;
    }

    const sightingDelete = await supabase
      .from("sightings")
      .delete()
      .eq("pk_sighting_id", target.duplicate_sighting_id);

    auditRows.push({
      ...base,
      status: sightingDelete.error ? "blocked" : "deleted",
      message: sightingDelete.error?.message ?? "Deleted mprf_sighting_map rows and duplicate sighting row.",
    });
  }

  const summary = {
    checked_at: changedAt,
    apply: APPLY,
    target_duplicates: TARGETS.map((target) => target.duplicate_sighting_id),
    dry_run_ready: auditRows.filter((row) => row.status === "dry_run_ready").length,
    deleted: auditRows.filter((row) => row.status === "deleted").length,
    blocked: auditRows.filter((row) => row.status === "blocked").length,
  };

  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "audit_ledger.json"), JSON.stringify(auditRows, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "mprf_sighting_map_rows_before.json"), JSON.stringify(mapRowsBefore, null, 2));
  writeCsv(path.join(OUT_DIR, "audit_ledger.csv"), auditRows);
  writeCsv(path.join(OUT_DIR, "mprf_sighting_map_rows_before.csv"), mapRowsBefore);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
