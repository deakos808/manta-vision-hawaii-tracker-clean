import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const APPLY = process.argv.includes("--apply");
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing Supabase credentials.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

type SightingRow = {
  pk_sighting_id: number;
  island: string | null;
  population: string | null;
};

function norm(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

const ISLAND_TO_POPULATION: Record<string, string> = {
  "big island": "Big Island",
  maui: "Maui Nui",
  molokai: "Maui Nui",
  kahoolawe: "Maui Nui",
  lanai: "Maui Nui",
  oahu: "Oahu",
  kauai: "Kauai",
  niihau: "Kauai",
};

function expectedPopulationForIsland(value: unknown) {
  return ISLAND_TO_POPULATION[norm(value)];
}

async function loadSightings() {
  const rows: SightingRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("sightings")
      .select("pk_sighting_id,island,population")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as SightingRow[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function updateRows(ids: number[], patch: Partial<SightingRow>, label: string) {
  if (ids.length === 0) {
    console.log(`${label}: no updates needed.`);
    return;
  }

  const { data, error } = await supabase
    .from("sightings")
    .update(patch)
    .in("pk_sighting_id", ids)
    .select("pk_sighting_id,island,population");

  if (error) throw error;
  console.log(`${label}: updated ${data?.length ?? 0} sightings.`);
  console.table(data);
}

async function main() {
  const rows = await loadSightings();
  const hawaiiRows = rows.filter((row) => norm(row.island) === "hawaii");
  const populationRows = rows.filter((row) => {
    const expected = expectedPopulationForIsland(row.island);
    return Boolean(expected) && norm(row.population) !== norm(expected);
  });

  console.log(`Hawaii island -> Big Island updates: ${hawaiiRows.length}`);
  console.table(hawaiiRows.slice(0, 50));
  console.log(`Island -> population mapping updates: ${populationRows.length}`);
  console.table(populationRows.slice(0, 50).map((row) => ({
    ...row,
    expected_population: expectedPopulationForIsland(row.island),
  })));

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to update sightings.");
    return;
  }

  await updateRows(
    hawaiiRows.map((row) => row.pk_sighting_id),
    { island: "Big Island" },
    "Hawaii -> Big Island",
  );
  for (const population of Array.from(new Set(populationRows.map((row) => expectedPopulationForIsland(row.island)).filter(Boolean)))) {
    const rowsForPopulation = populationRows.filter((row) => expectedPopulationForIsland(row.island) === population);
    await updateRows(
      rowsForPopulation.map((row) => row.pk_sighting_id),
      { population },
      `Island population -> ${population}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
