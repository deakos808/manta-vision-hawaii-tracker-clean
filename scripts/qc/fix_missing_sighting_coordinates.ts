import fs from "fs";
import path from "path";
import { ensureOutputDir, getSupabaseClient, writeCsv } from "./qc_common";

type SightingRow = {
  pk_sighting_id: number;
  island: string | null;
  population: string | null;
  sitelocation: string | null;
  location: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

type LocationDefaultRow = {
  name: string | null;
  island: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
};

type SightingPatch = {
  reason: string;
  filter: (row: SightingRow) => boolean;
  patch: {
    sitelocation: string;
    location: string;
    latitude: number;
    longitude: number;
  };
};

const APPLY = process.argv.includes("--apply");
const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/fix_missing_sighting_coordinates");

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function norm(value: unknown) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
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

function findLocationDefault(
  defaults: LocationDefaultRow[],
  island: string,
  name: string,
) {
  return defaults.find((row) => norm(row.island) === norm(island) && norm(row.name) === norm(name)) ?? null;
}

async function ensureLocationDefault(
  defaults: LocationDefaultRow[],
  island: string,
  name: string,
  latitude: number,
  longitude: number,
  reason: string,
) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const existing = findLocationDefault(defaults, island, name);
  const ledgerBase = {
    changed_at: new Date().toISOString(),
    table_name: "location_defaults",
    record: `${island} / ${name}`,
    old_name: existing?.name ?? "",
    old_island: existing?.island ?? "",
    old_latitude: existing?.latitude ?? "",
    old_longitude: existing?.longitude ?? "",
    new_name: name,
    new_island: island,
    new_latitude: latitude,
    new_longitude: longitude,
    reason,
  };

  if (!APPLY) {
    return {
      ...ledgerBase,
      status: existing ? "dry_run_update_ready" : "dry_run_insert_ready",
      message: existing ? "Ready to update existing location_defaults row." : "Ready to insert location_defaults row.",
    };
  }

  if (existing) {
    const { error } = await supabase
      .from("location_defaults")
      .update({ latitude, longitude })
      .eq("island", existing.island)
      .eq("name", existing.name);
    return {
      ...ledgerBase,
      status: error ? "blocked" : "updated",
      message: error?.message ?? "Updated existing location_defaults row.",
    };
  }

  const { error } = await supabase
    .from("location_defaults")
    .insert({ island, name, latitude, longitude });
  return {
    ...ledgerBase,
    status: error ? "blocked" : "inserted",
    message: error?.message ?? "Inserted location_defaults row.",
  };
}

async function main() {
  ensureOutputDir(OUT_DIR);
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const sightings = await loadAll<SightingRow>(
    "sightings",
    "pk_sighting_id,island,population,sitelocation,location,latitude,longitude",
  );
  const defaults = await loadAll<LocationDefaultRow>(
    "location_defaults",
    "name,island,latitude,longitude",
  );

  const ukumehame = findLocationDefault(defaults, "Maui", "Ukumehame");
  if (!ukumehame?.latitude || !ukumehame?.longitude) {
    throw new Error("Could not find usable Maui / Ukumehame coordinates in location_defaults.");
  }

  const kameole = findLocationDefault(defaults, "Maui", "Kameole Beach");
  const kameoleLat = kameole?.latitude != null && kameole?.latitude !== "" ? Number(kameole.latitude) : 20.722343;
  const kameoleLon = kameole?.longitude != null && kameole?.longitude !== "" ? Number(kameole.longitude) : -156.449883;

  const locationDefaultLedger = [
    await ensureLocationDefault(
      defaults,
      "Maui",
      "Makena Reef",
      20.630353,
      -156.448376,
      "Add/repair source-of-truth coordinates for sightings currently labeled Makena Reef.",
    ),
    await ensureLocationDefault(
      defaults,
      "Maui",
      "Kameole Beach",
      kameoleLat,
      kameoleLon,
      "Add/repair source-of-truth coordinates for sightings labeled Kam Beach, Kam1, or Kihei sighting 5358.",
    ),
    await ensureLocationDefault(
      defaults,
      "Kauai",
      "Stone House",
      21.877686,
      -159.471286,
      "Add source-of-truth coordinates for Kauai Stone House sightings.",
    ),
  ];

  const patches: SightingPatch[] = [
    {
      reason: "Set Makena Reef sightings to verified coordinates.",
      filter: (row) => norm(row.island) === "maui" && norm(row.sitelocation || row.location) === "makena reef",
      patch: {
        sitelocation: "Makena Reef",
        location: "Makena Reef",
        latitude: 20.630353,
        longitude: -156.448376,
      },
    },
    {
      reason: "Normalize Kam Beach and Kam1 to Kameole Beach with verified coordinates.",
      filter: (row) => norm(row.island) === "maui" && ["kam beach", "kam1"].includes(norm(row.sitelocation || row.location)),
      patch: {
        sitelocation: "Kameole Beach",
        location: "Kameole Beach",
        latitude: kameoleLat,
        longitude: kameoleLon,
      },
    },
    {
      reason: "Normalize pk_sighting_id 5358 from Kihei to Kameole Beach with verified coordinates.",
      filter: (row) => Number(row.pk_sighting_id) === 5358,
      patch: {
        sitelocation: "Kameole Beach",
        location: "Kameole Beach",
        latitude: kameoleLat,
        longitude: kameoleLon,
      },
    },
    {
      reason: "Normalize Maui West Side sightings to Ukumehame using source-of-truth location_defaults coordinates.",
      filter: (row) => norm(row.island) === "maui" && norm(row.sitelocation || row.location) === "maui west side",
      patch: {
        sitelocation: "Ukumehame",
        location: "Ukumehame",
        latitude: Number(ukumehame.latitude),
        longitude: Number(ukumehame.longitude),
      },
    },
    {
      reason: "Set Kauai Stone House sighting to verified coordinates.",
      filter: (row) => norm(row.island) === "kauai" && norm(row.sitelocation || row.location) === "stone house",
      patch: {
        sitelocation: "Stone House",
        location: "Stone House",
        latitude: 21.877686,
        longitude: -159.471286,
      },
    },
  ];

  const changedAt = new Date().toISOString();
  const sightingLedger: Record<string, unknown>[] = [];
  const updatedIds = new Set<number>();

  for (const change of patches) {
    const targets = sightings.filter((row) => change.filter(row));
    for (const row of targets) {
      if (updatedIds.has(Number(row.pk_sighting_id))) continue;
      updatedIds.add(Number(row.pk_sighting_id));
      const ledgerBase = {
        changed_at: changedAt,
        table_name: "sightings",
        pk_sighting_id: row.pk_sighting_id,
        old_island: row.island ?? "",
        old_population: row.population ?? "",
        old_sitelocation: row.sitelocation ?? "",
        old_location: row.location ?? "",
        old_latitude: row.latitude ?? "",
        old_longitude: row.longitude ?? "",
        new_sitelocation: change.patch.sitelocation,
        new_location: change.patch.location,
        new_latitude: change.patch.latitude,
        new_longitude: change.patch.longitude,
        reason: change.reason,
      };

      if (!APPLY) {
        sightingLedger.push({
          ...ledgerBase,
          status: "dry_run_ready",
          message: "Ready to update sighting location/coordinates.",
        });
        continue;
      }

      const { error } = await supabase
        .from("sightings")
        .update(change.patch)
        .eq("pk_sighting_id", row.pk_sighting_id);

      sightingLedger.push({
        ...ledgerBase,
        status: error ? "blocked" : "updated",
        message: error?.message ?? "Updated sighting location/coordinates.",
      });
    }
  }

  const summary = {
    checked_at: new Date().toISOString(),
    apply: APPLY,
    location_defaults_changes: locationDefaultLedger.length,
    sighting_changes: sightingLedger.length,
    updated_or_ready_sightings: sightingLedger.filter((row) => row.status === "updated" || row.status === "dry_run_ready").length,
    blocked_sightings: sightingLedger.filter((row) => row.status === "blocked").length,
  };

  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "location_defaults_ledger.json"), JSON.stringify(locationDefaultLedger, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "sightings_ledger.json"), JSON.stringify(sightingLedger, null, 2));
  writeCsv(path.join(OUT_DIR, "location_defaults_ledger.csv"), locationDefaultLedger);
  writeCsv(path.join(OUT_DIR, "sightings_ledger.csv"), sightingLedger);

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
