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
  pk_sighting_id: number;
  source: string;
  sighting_date: string;
  photographer: string;
  total_mantas: number | string;
  total_manta_ids: number | string;
  old_list_manta_ids_2: string;
  new_list_manta_ids_2: string;
  listed_manta_ids: string;
  manta_points_to_sighting_ids: string;
  mapped_to_tables: string;
  same_as_pointed_sighting: boolean;
  duplicate_delete_candidate: boolean;
  duplicate_blocker: string;
  proposed_action: string;
  reason: string;
  status: string;
  message: string;
};

const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/stale_sighting_manta_lists");

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    apply: args.includes("--apply"),
  };
}

function parseMantaIdList(value: unknown) {
  return Array.from(String(value ?? "").matchAll(/\d+/g))
    .map((match) => Number(match[0]))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function zeroMantaCount(row: SightingRow) {
  return Number(row.total_mantas ?? row.total_manta_ids ?? 0) === 0;
}

function sourceLabel(row: SightingRow) {
  return row.is_mprf ? "MPRF" : "HAMER";
}

function clean(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
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

function noExtraInformation(stale: SightingRow, pointed: SightingRow | undefined) {
  if (!pointed) return false;
  const fields: Array<keyof SightingRow> = [
    "notes",
    "behavior",
    "organization",
    "start_time",
    "end_time",
    "island",
    "population",
  ];
  return fields.every((field) => {
    const staleValue = stale[field];
    return clean(staleValue) === "" || sameText(staleValue, pointed[field]);
  });
}

function sameSightingContext(stale: SightingRow, pointed: SightingRow | undefined) {
  if (!pointed) return false;
  return (
    stale.is_mprf === pointed.is_mprf &&
    sameText(stale.sighting_date, pointed.sighting_date) &&
    sameText(stale.photographer, pointed.photographer) &&
    sameText(stale.location, pointed.location) &&
    sameText(stale.sitelocation, pointed.sitelocation) &&
    sameNumber(stale.latitude, pointed.latitude) &&
    sameNumber(stale.longitude, pointed.longitude)
  );
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
  if (error) return null;
  return count ?? 0;
}

async function dependencyCounts(sightingId: number) {
  const checks = [
    ["mantas", "fk_sighting_id"],
    ["photos", "fk_sighting_id"],
    ["biopsies", "fk_sighting_id"],
  ] as const;
  const entries: string[] = [];
  for (const [table, column] of checks) {
    const count = await countLinks(table, column, sightingId);
    if (count == null) entries.push(`${table}.${column}:unknown`);
    else if (count > 0) entries.push(`${table}.${column}:${count}`);
  }
  return entries;
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
  const candidates = sightings
    .map((sighting) => {
      const listedMantaIds = parseMantaIdList(sighting.list_manta_ids_2);
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

      return {
        sighting,
        listedMantaIds,
        pointedSightingIds,
        allListedMantasExist,
        allPointAway,
      };
    })
    .filter((row) =>
      zeroMantaCount(row.sighting) &&
      row.listedMantaIds.length > 0 &&
      row.allListedMantasExist &&
      row.allPointAway,
    );

  const ledger: LedgerRow[] = [];
  for (const candidate of candidates) {
    const { sighting, listedMantaIds, pointedSightingIds } = candidate;
    const pointedSighting = pointedSightingIds.length === 1 ? sightingById.get(pointedSightingIds[0]) : undefined;
    const deps = await dependencyCounts(sighting.pk_sighting_id);
    const sameAsPointed = sameSightingContext(sighting, pointedSighting);
    const duplicateDeleteCandidate = sameAsPointed && noExtraInformation(sighting, pointedSighting) && deps.length === 0;
    const duplicateBlockers = [
      pointedSightingIds.length === 1 ? "" : "manta IDs point to multiple sightings",
      sameAsPointed ? "" : "date/location/photographer do not exactly match pointed sighting",
      noExtraInformation(sighting, pointedSighting) ? "" : "stale sighting contains additional information",
      deps.length === 0 ? "" : `stale sighting has child links: ${deps.join("; ")}`,
    ].filter(Boolean);
    const proposedAction = duplicateDeleteCandidate
      ? "review_duplicate_delete_candidate"
      : "clear_stale_list_manta_ids_2";
    const base = {
      changed_at: changedAt,
      pk_sighting_id: sighting.pk_sighting_id,
      source: sourceLabel(sighting),
      sighting_date: sighting.sighting_date ?? "",
      photographer: sighting.photographer ?? "",
      total_mantas: sighting.total_mantas ?? "",
      total_manta_ids: sighting.total_manta_ids ?? "",
      old_list_manta_ids_2: sighting.list_manta_ids_2 ?? "",
      new_list_manta_ids_2: "",
      listed_manta_ids: listedMantaIds.join("|"),
      manta_points_to_sighting_ids: pointedSightingIds.join("|"),
      mapped_to_tables: deps.join("; "),
      same_as_pointed_sighting: sameAsPointed,
      duplicate_delete_candidate: duplicateDeleteCandidate,
      duplicate_blocker: duplicateBlockers.join("; "),
      proposed_action: proposedAction,
      reason: duplicateDeleteCandidate
        ? "Sighting appears to be an empty duplicate of the pointed sighting and has no detected child table links. Deletion still requires explicit review before any apply step."
        : "Sighting has zero mantas recorded, but list_manta_ids_2 contains manta IDs whose manta rows point to other sightings. Manta fk_sighting_id is treated as correct; clear stale sighting list only.",
    };

    if (!apply) {
      ledger.push({
        ...base,
        status: "dry_run_ready",
        message: duplicateDeleteCandidate
          ? "Duplicate delete candidate only. No delete is performed by this script."
          : "Ready to clear sightings.list_manta_ids_2.",
      });
      continue;
    }

    if (duplicateDeleteCandidate) {
      ledger.push({
        ...base,
        status: "blocked",
        message: "Refusing to delete sighting rows automatically. Review duplicate candidate and use a dedicated deletion script after approval.",
      });
      continue;
    }

    const { error } = await supabase
      .from("sightings")
      .update({ list_manta_ids_2: null })
      .eq("pk_sighting_id", sighting.pk_sighting_id)
      .eq("list_manta_ids_2", sighting.list_manta_ids_2);

    ledger.push({
      ...base,
      status: error ? "blocked" : "updated",
      message: error?.message ?? "Cleared sightings.list_manta_ids_2.",
    });
  }

  const summary = {
    checked_at: new Date().toISOString(),
    apply,
    candidate_sightings: candidates.length,
    candidate_listed_manta_ids: candidates.reduce((sum, row) => sum + row.listedMantaIds.length, 0),
    duplicate_delete_candidates: ledger.filter((row) => row.duplicate_delete_candidate).length,
    clear_stale_list_candidates: ledger.filter((row) => row.proposed_action === "clear_stale_list_manta_ids_2").length,
    ready_or_updated: ledger.filter((row) => row.status === "dry_run_ready" || row.status === "updated").length,
    blocked: ledger.filter((row) => row.status === "blocked").length,
  };

  fs.writeFileSync(path.join(OUT_DIR, "fix_stale_sighting_manta_lists_summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "fix_stale_sighting_manta_lists_change_ledger.json"), JSON.stringify(ledger, null, 2));
  writeCsv(path.join(OUT_DIR, "fix_stale_sighting_manta_lists_change_ledger.csv"), ledger);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
