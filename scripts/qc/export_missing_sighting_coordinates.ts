import fs from "fs";
import path from "path";
import { ensureOutputDir, getSupabaseClient, writeCsv } from "./qc_common";

type SightingRow = {
  pk_sighting_id: number;
  is_mprf?: boolean | null;
  sighting_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  island?: string | null;
  population?: string | null;
  location?: string | null;
  sitelocation?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  photographer?: string | null;
  organization?: string | null;
  total_mantas?: number | string | null;
  total_manta_ids?: number | string | null;
  list_manta_ids?: string | null;
  list_manta_ids_2?: string | null;
  location_unknown?: boolean | null;
};

type LocationDefaultRow = {
  name: string | null;
  island: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/missing_sighting_coordinates");
const PAGE_SIZE = 1000;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasCoordinate(value: unknown) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

function preferredLocation(row: SightingRow) {
  return clean(row.sitelocation) || clean(row.location);
}

function locationKey(row: Pick<SightingRow, "island" | "population" | "location" | "sitelocation">) {
  return [normalize(row.island), normalize(row.population), normalize(preferredLocation(row as SightingRow))].join("|");
}

function levenshtein(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  return maxLen ? 1 - levenshtein(a, b) / maxLen : 0;
}

async function loadAll<T>(table: string, select: string): Promise<T[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials are not available.");

  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadLocationDefaults() {
  try {
    return await loadAll<LocationDefaultRow>("location_defaults", "name,island,latitude,longitude");
  } catch (error) {
    console.warn(`location_defaults could not be read: ${error instanceof Error ? error.message : String(error)}`);
    return [] as LocationDefaultRow[];
  }
}

async function loadSightings() {
  const selectWithLocationUnknown = [
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
    "location_unknown",
  ].join(",");

  try {
    return await loadAll<SightingRow>("sightings", selectWithLocationUnknown);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/location_unknown/i.test(message)) throw error;
  }

  const selectWithoutLocationUnknown = [
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
  ].join(",");

  return await loadAll<SightingRow>("sightings", selectWithoutLocationUnknown);
}

function findLocationDefault(
  row: SightingRow,
  defaults: LocationDefaultRow[],
): { matchType: string; match: LocationDefaultRow | null; score: number } {
  const location = normalize(preferredLocation(row));
  const island = normalize(row.island);
  if (!location) return { matchType: "no_location_on_sighting", match: null, score: 0 };

  const sameIsland = defaults.filter((item) => normalize(item.island) === island);
  const exact = sameIsland.find((item) => normalize(item.name) === location);
  if (exact) return { matchType: "exact_location_default_match", match: exact, score: 1 };

  let best: LocationDefaultRow | null = null;
  let bestScore = 0;
  for (const item of sameIsland) {
    const score = similarity(location, normalize(item.name));
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  if (best && bestScore >= 0.82) return { matchType: "possible_spelling_match", match: best, score: bestScore };
  return { matchType: "no_location_default_match", match: best, score: bestScore };
}

async function main() {
  ensureOutputDir(OUT_DIR);

  const sightings = await loadSightings();
  const defaults = await loadLocationDefaults();

  const missingCoordinateRows = sightings
    .filter((row) => !hasCoordinate(row.latitude) || !hasCoordinate(row.longitude))
    .filter((row) => preferredLocation(row))
    .sort((a, b) => Number(a.pk_sighting_id) - Number(b.pk_sighting_id));

  const rowExports = missingCoordinateRows.map((row) => {
    const match = findLocationDefault(row, defaults);
    return {
      pk_sighting_id: row.pk_sighting_id,
      source: row.is_mprf ? "MPRF" : "HAMER",
      sighting_date: row.sighting_date ?? "",
      start_time: row.start_time ?? "",
      end_time: row.end_time ?? "",
      island: clean(row.island),
      population: clean(row.population),
      sitelocation: clean(row.sitelocation),
      legacy_location: clean(row.location),
      location_unknown: row.location_unknown ? "true" : "false",
      current_latitude: row.latitude ?? "",
      current_longitude: row.longitude ?? "",
      photographer: clean(row.photographer),
      organization: clean(row.organization),
      total_mantas: row.total_mantas ?? row.total_manta_ids ?? "",
      list_manta_ids: clean(row.list_manta_ids),
      list_manta_ids_2: clean(row.list_manta_ids_2),
      location_default_match_type: match.matchType,
      matched_location_default_name: clean(match.match?.name),
      matched_location_default_latitude: match.match?.latitude ?? "",
      matched_location_default_longitude: match.match?.longitude ?? "",
      matched_location_default_score: match.score ? match.score.toFixed(3) : "",
      reviewer_new_location_name: "",
      reviewer_new_latitude: "",
      reviewer_new_longitude: "",
      reviewer_notes: "",
    };
  });

  const grouped = new Map<string, typeof rowExports[number][]>();
  for (const row of rowExports) {
    const key = [
      normalize(row.island),
      normalize(row.population),
      normalize(row.sitelocation || row.legacy_location),
      row.location_default_match_type,
      normalize(row.matched_location_default_name),
    ].join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  const uniqueExports = Array.from(grouped.values())
    .map((rows) => {
      const first = rows[0];
      const ids = rows.map((row) => Number(row.pk_sighting_id)).sort((a, b) => a - b);
      const dates = rows.map((row) => clean(row.sighting_date)).filter(Boolean).sort();
      return {
        island: first.island,
        population: first.population,
        sitelocation: first.sitelocation,
        legacy_location: first.legacy_location,
        sighting_count: rows.length,
        first_sighting_date: dates[0] ?? "",
        last_sighting_date: dates[dates.length - 1] ?? "",
        sighting_ids: ids.join(" "),
        source_mix: Array.from(new Set(rows.map((row) => row.source))).sort().join(" / "),
        location_default_match_type: first.location_default_match_type,
        matched_location_default_name: first.matched_location_default_name,
        matched_location_default_latitude: first.matched_location_default_latitude,
        matched_location_default_longitude: first.matched_location_default_longitude,
        matched_location_default_score: first.matched_location_default_score,
        reviewer_new_location_name: "",
        reviewer_new_latitude: "",
        reviewer_new_longitude: "",
        reviewer_notes: "",
      };
    })
    .sort((a, b) => String(a.island).localeCompare(String(b.island)) || String(a.sitelocation).localeCompare(String(b.sitelocation)));

  const summary = {
    exported_at: new Date().toISOString(),
    sightings_checked: sightings.length,
    location_defaults_checked: defaults.length,
    missing_coordinate_sightings_with_location: rowExports.length,
    unique_missing_coordinate_locations: uniqueExports.length,
    exact_location_default_matches: rowExports.filter((row) => row.location_default_match_type === "exact_location_default_match").length,
    possible_spelling_matches: rowExports.filter((row) => row.location_default_match_type === "possible_spelling_match").length,
    no_location_default_matches: rowExports.filter((row) => row.location_default_match_type === "no_location_default_match").length,
    output_files: {
      rows: "scripts/qc/output/missing_sighting_coordinates/missing_sighting_coordinates.csv",
      unique_locations: "scripts/qc/output/missing_sighting_coordinates/missing_sighting_locations_unique.csv",
      summary: "scripts/qc/output/missing_sighting_coordinates/summary.json",
    },
  };

  writeCsv(path.join(OUT_DIR, "missing_sighting_coordinates.csv"), rowExports);
  writeCsv(path.join(OUT_DIR, "missing_sighting_locations_unique.csv"), uniqueExports);
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
