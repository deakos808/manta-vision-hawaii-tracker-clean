import fs from "fs";
import path from "path";
import { ensureOutputDir, getSupabaseClient, writeCsv } from "./qc_common";

type SightingRow = {
  pk_sighting_id: number;
  is_mprf: boolean | null;
  sighting_date: string | null;
  island: string | null;
  population: string | null;
  location: string | null;
  sitelocation: string | null;
  latitude: number | null;
  longitude: number | null;
  start_time: string | null;
  end_time: string | null;
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

type MantaRow = {
  pk_manta_id: number;
  fk_sighting_id: number | null;
};

type LedgerRow = {
  changed_at: string;
  apply: boolean;
  duplicate_sighting_id: number;
  kept_sighting_id: number | string;
  source: string;
  sighting_date: string;
  photographer: string;
  listed_manta_ids: string;
  dependency_counts: string;
  status: string;
  message: string;
};

const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/delete_duplicate_empty_sightings");

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    apply: args.includes("--apply"),
  };
}

function clean(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function parseMantaIdList(value: unknown) {
  return Array.from(String(value ?? "").matchAll(/\d+/g))
    .map((match) => Number(match[0]))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function sourceLabel(row: SightingRow) {
  return row.is_mprf ? "MPRF" : "HAMER";
}

function sameText(a: unknown, b: unknown) {
  return clean(a) === clean(b);
}

function sameNumber(a: unknown, b: unknown, tolerance = 0.00001) {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) && !Number.isFinite(right)) return true;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= tolerance;
}

function zeroMantaCount(row: SightingRow) {
  return Number(row.total_mantas ?? row.total_manta_ids ?? 0) === 0;
}

function sameSightingContext(duplicate: SightingRow, kept: SightingRow | undefined) {
  if (!kept) return false;
  return (
    duplicate.is_mprf === kept.is_mprf &&
    sameText(duplicate.sighting_date, kept.sighting_date) &&
    sameText(duplicate.photographer, kept.photographer) &&
    sameText(duplicate.location, kept.location) &&
    sameText(duplicate.sitelocation, kept.sitelocation) &&
    sameNumber(duplicate.latitude, kept.latitude) &&
    sameNumber(duplicate.longitude, kept.longitude)
  );
}

function noAddedInformation(duplicate: SightingRow, kept: SightingRow | undefined) {
  if (!kept) return false;
  const fields: Array<keyof SightingRow> = [
    "notes",
    "behavior",
    "organization",
    "start_time",
    "end_time",
    "island",
    "population",
  ];
  return fields.every((field) => clean(duplicate[field]) === "" || sameText(duplicate[field], kept[field]));
}

async function loadAll<T extends Record<string, unknown>>(table: string, columns: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function countLinks(table: string, column: string, sightingId: number) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const { count, error } = await supabase
    .from(table)
    .select(column, { count: "exact", head: true })
    .eq(column, sightingId);

  if (error) return { table, column, count: null, error: error.message };
  return { table, column, count: count ?? 0, error: "" };
}

async function dependencyCounts(sightingId: number) {
  const checks = [
    ["mantas", "fk_sighting_id"],
    ["photos", "fk_sighting_id"],
    ["sizes", "fk_sighting_id"],
    ["biopsies", "fk_sighting_id"],
  ] as const;
  const results = [];
  for (const [table, column] of checks) {
    results.push(await countLinks(table, column, sightingId));
  }
  return results;
}

function dependencySummary(deps: Awaited<ReturnType<typeof dependencyCounts>>) {
  return deps
    .map((dep) => `${dep.table}.${dep.column}:${dep.count == null ? `unknown (${dep.error})` : dep.count}`)
    .join("; ");
}

function dependenciesAreClear(deps: Awaited<ReturnType<typeof dependencyCounts>>) {
  return deps.every((dep) => dep.count === 0);
}

async function main() {
  ensureOutputDir(OUT_DIR);
  const { apply } = parseArgs();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const [sightings, mantas] = await Promise.all([
    loadAll<SightingRow>(
      "sightings",
      "pk_sighting_id,is_mprf,sighting_date,island,population,location,sitelocation,latitude,longitude,start_time,end_time,photographer,organization,total_mantas,total_manta_ids,list_manta_ids,list_manta_ids_2,list_catalog_ids,notes,behavior",
    ),
    loadAll<MantaRow>("mantas", "pk_manta_id,fk_sighting_id"),
  ]);

  const mantaById = new Map(mantas.map((manta) => [manta.pk_manta_id, manta]));
  const sightingById = new Map(sightings.map((sighting) => [sighting.pk_sighting_id, sighting]));
  const changedAt = new Date().toISOString();
  const ledger: LedgerRow[] = [];

  for (const sighting of sightings) {
    const listedMantaIds = parseMantaIdList(sighting.list_manta_ids_2);
    if (!zeroMantaCount(sighting) || listedMantaIds.length === 0) continue;

    const pointedSightingIds = Array.from(
      new Set(
        listedMantaIds
          .map((mantaId) => mantaById.get(mantaId)?.fk_sighting_id)
          .filter((id): id is number => id != null && Number.isFinite(id)),
      ),
    ).sort((a, b) => a - b);

    const allListedMantasExist = listedMantaIds.every((mantaId) => mantaById.has(mantaId));
    const allPointAway = listedMantaIds.every((mantaId) => {
      const manta = mantaById.get(mantaId);
      return manta && String(manta.fk_sighting_id ?? "") !== String(sighting.pk_sighting_id);
    });

    if (!allListedMantasExist || !allPointAway || pointedSightingIds.length !== 1) continue;

    const keptSighting = sightingById.get(pointedSightingIds[0]);
    const deps = await dependencyCounts(sighting.pk_sighting_id);
    const isDeleteSafe =
      sameSightingContext(sighting, keptSighting) &&
      noAddedInformation(sighting, keptSighting) &&
      dependenciesAreClear(deps);

    if (!isDeleteSafe) continue;

    const base: LedgerRow = {
      changed_at: changedAt,
      apply,
      duplicate_sighting_id: sighting.pk_sighting_id,
      kept_sighting_id: pointedSightingIds[0],
      source: sourceLabel(sighting),
      sighting_date: sighting.sighting_date ?? "",
      photographer: sighting.photographer ?? "",
      listed_manta_ids: listedMantaIds.join("|"),
      dependency_counts: dependencySummary(deps),
      status: apply ? "pending" : "dry_run_ready",
      message: apply
        ? "Ready to delete duplicate empty sighting."
        : "Dry run passed. Re-run with --apply to delete this duplicate empty sighting.",
    };

    if (!apply) {
      ledger.push(base);
      continue;
    }

    const { error } = await supabase
      .from("sightings")
      .delete()
      .eq("pk_sighting_id", sighting.pk_sighting_id)
      .eq("list_manta_ids_2", sighting.list_manta_ids_2);

    ledger.push({
      ...base,
      status: error ? "blocked" : "deleted",
      message: error?.message ?? "Deleted duplicate empty sighting after live dependency checks passed.",
    });
  }

  const summary = {
    checked_at: changedAt,
    apply,
    delete_safe_duplicate_sightings: ledger.length,
    deleted: ledger.filter((row) => row.status === "deleted").length,
    blocked: ledger.filter((row) => row.status === "blocked").length,
    duplicate_sighting_ids: ledger.map((row) => row.duplicate_sighting_id),
  };

  fs.writeFileSync(path.join(OUT_DIR, "delete_duplicate_empty_sightings_summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "delete_duplicate_empty_sightings_ledger.json"), JSON.stringify(ledger, null, 2));
  writeCsv(path.join(OUT_DIR, "delete_duplicate_empty_sightings_ledger.csv"), ledger);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
