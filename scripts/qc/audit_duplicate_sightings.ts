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

type LinkCount = {
  mantas: number;
  photos: number;
  sizes: number;
  biopsies: number;
  mprf_sighting_map: number;
};

type AuditRow = {
  changed_at: string;
  apply: boolean;
  duplicate_group: string;
  sighting_id: number;
  source: string;
  date: string;
  start_time: string;
  end_time: string;
  photographer: string;
  location: string;
  total_mantas: number | string;
  listed_manta_ids: string;
  mapped_mantas: number;
  mapped_photos: number;
  mapped_sizes: number;
  mapped_biopsies: number;
  mapped_mprf_sighting_map: number;
  effective_manta_ids: string;
  group_manta_sets_match: boolean;
  notes_present: boolean;
  behavior_present: boolean;
  suggested_status: string;
  suggested_action: string;
  change_status: string;
  change_message: string;
};

const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/duplicate_sightings");

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    apply: args.includes("--apply"),
  };
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return clean(value).replace(/\s+/g, " ").toLowerCase();
}

function roundCoord(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number.toFixed(5);
}

function sourceLabel(row: SightingRow) {
  return row.is_mprf ? "MPRF" : "HAMER";
}

function parseMantaIdList(value: unknown) {
  return Array.from(String(value ?? "").matchAll(/\d+/g))
    .map((match) => Number(match[0]))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function effectiveMantaSet(row: SightingRow, mappedMantaIds: number[]) {
  return Array.from(new Set([
    ...mappedMantaIds,
    ...parseMantaIdList(row.list_manta_ids),
    ...parseMantaIdList(row.list_manta_ids_2),
  ])).sort((a, b) => a - b);
}

function groupKey(row: SightingRow) {
  return [
    sourceLabel(row),
    normalize(row.sighting_date),
    normalize(row.start_time),
    normalize(row.end_time),
    normalize(row.photographer),
    normalize(row.location ?? row.sitelocation),
    roundCoord(row.latitude),
    roundCoord(row.longitude),
  ].join("|");
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

async function loadOptional<T extends Record<string, unknown>>(table: string, columns: string) {
  try {
    return await loadAll<T>(table, columns);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/does not exist|Could not find the table/i.test(message)) return [] as T[];
    throw error;
  }
}

function increment(map: Map<number, number>, id: unknown) {
  const numeric = Number(id);
  if (!Number.isFinite(numeric) || numeric <= 0) return;
  map.set(numeric, (map.get(numeric) ?? 0) + 1);
}

function sameOptionalText(a: unknown, b: unknown) {
  return normalize(a) === normalize(b);
}

function duplicateRowsHaveSameFreeText(rows: SightingRow[]) {
  const first = rows[0];
  return rows.every((row) =>
    sameOptionalText(row.notes, first.notes) &&
    sameOptionalText(row.behavior, first.behavior) &&
    sameOptionalText(row.organization, first.organization),
  );
}

async function main() {
  ensureOutputDir(OUT_DIR);
  const { apply } = parseArgs();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const [sightings, mantas, photos, sizes, biopsies, mprfSightingMap] = await Promise.all([
    loadAll<SightingRow>(
      "sightings",
      "pk_sighting_id,is_mprf,sighting_date,start_time,end_time,island,population,location,sitelocation,latitude,longitude,photographer,organization,total_mantas,total_manta_ids,list_manta_ids,list_manta_ids_2,list_catalog_ids,notes,behavior",
    ),
    loadAll<Record<string, unknown>>("mantas", "pk_manta_id,fk_sighting_id"),
    loadAll<Record<string, unknown>>("photos", "fk_sighting_id"),
    loadOptional<Record<string, unknown>>("sizes", "fk_sighting_id"),
    loadOptional<Record<string, unknown>>("biopsies", "fk_sighting_id"),
    loadOptional<Record<string, unknown>>("mprf_sighting_map", "pk_sighting_id"),
  ]);

  const mantaCounts = new Map<number, number>();
  const mantaIdsBySighting = new Map<number, number[]>();
  const photoCounts = new Map<number, number>();
  const sizeCounts = new Map<number, number>();
  const biopsyCounts = new Map<number, number>();
  const mprfSightingMapCounts = new Map<number, number>();
  for (const row of mantas) {
    increment(mantaCounts, row.fk_sighting_id);
    const sid = Number(row.fk_sighting_id);
    const mantaId = Number(row.pk_manta_id);
    if (Number.isFinite(sid) && sid > 0 && Number.isFinite(mantaId) && mantaId > 0) {
      if (!mantaIdsBySighting.has(sid)) mantaIdsBySighting.set(sid, []);
      mantaIdsBySighting.get(sid)!.push(mantaId);
    }
  }
  for (const row of photos) increment(photoCounts, row.fk_sighting_id);
  for (const row of sizes) increment(sizeCounts, row.fk_sighting_id);
  for (const row of biopsies) increment(biopsyCounts, row.fk_sighting_id);
  for (const row of mprfSightingMap) increment(mprfSightingMapCounts, row.pk_sighting_id);

  const groups = new Map<string, SightingRow[]>();
  for (const row of sightings) {
    const key = groupKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const auditRows: AuditRow[] = [];
  let groupNumber = 0;
  const changedAt = new Date().toISOString();

  for (const [, rows] of groups) {
    if (rows.length < 2) continue;
    groupNumber += 1;
    const duplicateGroup = `duplicate_group_${groupNumber}`;
    const mappedCounts = rows.map((row) => mantaCounts.get(row.pk_sighting_id) ?? 0);
    const maxMapped = Math.max(...mappedCounts);
    const rowsWithMapped = rows.filter((row) => (mantaCounts.get(row.pk_sighting_id) ?? 0) > 0);
    const rowsWithoutMapped = rows.filter((row) => (mantaCounts.get(row.pk_sighting_id) ?? 0) === 0);
    const sameText = duplicateRowsHaveSameFreeText(rows);
    const effectiveSets = rows.map((row) => effectiveMantaSet(row, mantaIdsBySighting.get(row.pk_sighting_id) ?? []));
    const nonEmptySets = effectiveSets.filter((set) => set.length > 0);
    const groupMantaSetsMatch = nonEmptySets.length > 1
      ? nonEmptySets.every((set) => set.join("|") === nonEmptySets[0].join("|"))
      : true;
    const groupSuggestedStatus =
      rowsWithMapped.length === 1 && rowsWithoutMapped.length > 0 && sameText && groupMantaSetsMatch
        ? "safe_delete_unmapped_duplicates_after_review"
      : rowsWithMapped.length > 1
          ? "manual_review_multiple_rows_have_mantas"
          : !groupMantaSetsMatch
            ? "manual_review_manta_sets_differ"
          : sameText
            ? "manual_review_no_row_has_mantas"
            : "manual_review_free_text_differs";

    for (const row of rows.sort((a, b) => a.pk_sighting_id - b.pk_sighting_id)) {
      const effectiveMantaIds = effectiveMantaSet(row, mantaIdsBySighting.get(row.pk_sighting_id) ?? []);
      const counts: LinkCount = {
        mantas: mantaCounts.get(row.pk_sighting_id) ?? 0,
        photos: photoCounts.get(row.pk_sighting_id) ?? 0,
        sizes: sizeCounts.get(row.pk_sighting_id) ?? 0,
        biopsies: biopsyCounts.get(row.pk_sighting_id) ?? 0,
        mprf_sighting_map: mprfSightingMapCounts.get(row.pk_sighting_id) ?? 0,
      };
      const isKeptCandidate = counts.mantas === maxMapped && maxMapped > 0;
      const hasAnyChildLinks = counts.mantas + counts.photos + counts.sizes + counts.biopsies + counts.mprf_sighting_map > 0;
      const isSafeDeleteRow = groupSuggestedStatus === "safe_delete_unmapped_duplicates_after_review" && !isKeptCandidate && !hasAnyChildLinks;
      const suggestedAction =
        isSafeDeleteRow
          ? "Candidate to delete after confirming the kept row is correct."
          : isKeptCandidate
            ? "Preserve this row; it has the mapped manta records for this duplicate group."
            : "Manual review before changing anything.";
      let changeStatus = apply ? "not_changed" : "dry_run";
      let changeMessage = apply ? "No change needed for preserved/manual-review row." : "Dry run only.";

      if (isSafeDeleteRow && apply) {
        const { error } = await supabase
          .from("sightings")
          .delete()
          .eq("pk_sighting_id", row.pk_sighting_id);
        changeStatus = error ? "blocked" : "deleted";
        changeMessage = error?.message ?? "Deleted safe unmapped duplicate sighting after audit checks passed.";
      }

      auditRows.push({
        changed_at: changedAt,
        apply,
        duplicate_group: duplicateGroup,
        sighting_id: row.pk_sighting_id,
        source: sourceLabel(row),
        date: row.sighting_date ?? "",
        start_time: row.start_time ?? "",
        end_time: row.end_time ?? "",
        photographer: row.photographer ?? "",
        location: row.sitelocation ?? row.location ?? "",
        total_mantas: row.total_mantas ?? row.total_manta_ids ?? "",
        listed_manta_ids: Array.from(new Set([
          ...parseMantaIdList(row.list_manta_ids),
          ...parseMantaIdList(row.list_manta_ids_2),
        ])).join("|"),
        mapped_mantas: counts.mantas,
        mapped_photos: counts.photos,
        mapped_sizes: counts.sizes,
        mapped_biopsies: counts.biopsies,
        mapped_mprf_sighting_map: counts.mprf_sighting_map,
        effective_manta_ids: effectiveMantaIds.join("|"),
        group_manta_sets_match: groupMantaSetsMatch,
        notes_present: Boolean(clean(row.notes)),
        behavior_present: Boolean(clean(row.behavior)),
        suggested_status: groupSuggestedStatus,
        suggested_action: suggestedAction,
        change_status: changeStatus,
        change_message: changeMessage,
      });
    }
  }

  const summary = {
    checked_at: changedAt,
    apply,
    duplicate_groups: new Set(auditRows.map((row) => row.duplicate_group)).size,
    duplicate_rows: auditRows.length,
    safe_delete_unmapped_rows: auditRows.filter((row) =>
      row.suggested_status === "safe_delete_unmapped_duplicates_after_review" &&
      row.mapped_mantas === 0 &&
      row.mapped_photos === 0 &&
      row.mapped_sizes === 0 &&
      row.mapped_biopsies === 0 &&
      row.mapped_mprf_sighting_map === 0,
    ).length,
    manual_review_groups: new Set(
      auditRows
        .filter((row) => row.suggested_status !== "safe_delete_unmapped_duplicates_after_review")
        .map((row) => row.duplicate_group),
    ).size,
    deleted: auditRows.filter((row) => row.change_status === "deleted").length,
    blocked: auditRows.filter((row) => row.change_status === "blocked").length,
  };

  fs.writeFileSync(path.join(OUT_DIR, "duplicate_sightings_summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "duplicate_sightings_audit.json"), JSON.stringify(auditRows, null, 2));
  writeCsv(path.join(OUT_DIR, "duplicate_sightings_audit.csv"), auditRows);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
