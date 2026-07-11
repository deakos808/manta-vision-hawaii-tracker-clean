import path from "path";
import { ensureOutputDir, getSupabaseClient, writeCsv } from "./qc_common";

const MPRF_KONA_URL = "https://www.mantarays.info/mantaraysapp/v1/manta-server.php?p=2&n=0";
const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/mprf_website_first_sightings");

type MprfWebsiteManta = {
  _mantaID?: string | null;
  MPRFWebsiteNumber?: string | null;
  DateAdded?: string | null;
  Name?: string | null;
  Sex?: string | null;
  Species?: string | null;
  BlackMorph?: string | null;
  Deceased?: string | null;
  PupInitially?: string | null;
  lowerRange?: string | null;
  upperRange?: string | null;
  currentMean?: string | null;
};

type CatalogTarget = {
  pk_catalog_id: number;
  pk_mprf_catalog_id: number;
  source: string;
  database_name: string;
};

type CatalogRow = {
  pk_catalog_id: number;
  name: string | null;
  is_mprf?: boolean | null;
  is_mprf_added?: boolean | null;
  MPRF_first_sighted_date: string | null;
  mprf_date_first_sighted: string | null;
  MPRF_total_years_seen: number | null;
  MPRF_age_class_at_first_sighting: string | null;
  mprf_pupinitially: boolean | string | null;
  mprf_size_estimate: number | string | null;
  mprf_blackmorph: boolean | string | null;
  deceased: boolean | string | null;
};

type AuditRow = {
  apply: boolean;
  status: string;
  pk_catalog_id: number | "";
  pk_mprf_catalog_id: number | "";
  database_name: string;
  website_name: string;
  website_first_sighting: string;
  catalog_mprf_first_sighted_date: string;
  catalog_mprf_date_first_sighted: string;
  min_years_since_first_sighting: string;
  website_pup_initially: string;
  website_size_m: string;
  source: string;
  message: string;
};

type WebsiteNameMatch = {
  row: MprfWebsiteManta;
  matchType: string;
};

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    apply: args.includes("--apply"),
  };
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeName(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenCount(value: string) {
  return value ? value.split(" ").filter(Boolean).length : 0;
}

function findWebsiteNameMatch(catalogName: unknown, websiteByName: Map<string, MprfWebsiteManta>): WebsiteNameMatch | null {
  const catalog = normalizeName(catalogName);
  if (!catalog) return null;

  const exact = websiteByName.get(catalog);
  if (exact) return { row: exact, matchType: "catalog.name exact match" };

  const candidates: Array<{ key: string; row: MprfWebsiteManta }> = [];
  for (const [key, row] of websiteByName.entries()) {
    if (key.length < 4 && tokenCount(key) < 2) continue;
    if (catalog === key || catalog.startsWith(`${key} `) || catalog.endsWith(` ${key}`) || catalog.includes(` ${key} `)) {
      candidates.push({ key, row });
    }
  }

  if (candidates.length !== 1) return null;
  return { row: candidates[0].row, matchType: "catalog.name contains MPRF name" };
}

function mprfNumberFromCatalogName(value: unknown) {
  const match = clean(value).match(/\bMP\s*#?\s*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function dateOnly(value: unknown) {
  const text = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function feetToMeters(value: number | null) {
  return value == null ? null : value * 0.3048;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function yearsBetween(startDate: string, endDate: Date) {
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  return (endDate.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function truthy(value: unknown) {
  return ["1", "true", "yes", "y"].includes(clean(value).toLowerCase());
}

function sexLabel(value: unknown) {
  const text = clean(value).toUpperCase();
  if (text === "F") return "Female";
  if (text === "M") return "Male";
  return "Unknown";
}

function firstSizeEstimateM(row: MprfWebsiteManta) {
  const currentMean = numberOrNull(row.currentMean);
  if (currentMean != null) return currentMean;

  const lowerM = feetToMeters(numberOrNull(row.lowerRange));
  const upperM = feetToMeters(numberOrNull(row.upperRange));
  if (lowerM != null && upperM != null) return round((lowerM + upperM) / 2, 2);
  return lowerM ?? upperM;
}

function ageClassAtFirstSighting(row: MprfWebsiteManta) {
  if (truthy(row.PupInitially)) return "Pup";
  return "";
}

async function selectAll<T extends Record<string, unknown>>(table: string, columns: string, orderColumn: string) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials are not configured.");

  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).order(orderColumn, { ascending: true }).range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function loadWebsiteRows() {
  const response = await fetch(MPRF_KONA_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`MPRF feed returned ${response.status}`);
  const payload = await response.json();
  if (payload?.errors?.code !== "0" || !Array.isArray(payload?.data)) {
    throw new Error("MPRF feed did not return the expected data envelope.");
  }
  return payload.data as MprfWebsiteManta[];
}

function addTarget(targetsByCatalog: Map<number, CatalogTarget>, rawCatalogId: unknown, rawMprfId: unknown, source: string, databaseName: unknown) {
  const catalogId = numberOrNull(rawCatalogId);
  const mprfId = numberOrNull(rawMprfId);
  if (catalogId == null || mprfId == null) return;
  if (!targetsByCatalog.has(catalogId)) {
    targetsByCatalog.set(catalogId, {
      pk_catalog_id: catalogId,
      pk_mprf_catalog_id: mprfId,
      source,
      database_name: clean(databaseName),
    });
  }
}

async function main() {
  const { apply } = parseArgs();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials are not configured.");
  ensureOutputDir(OUT_DIR);

  const websiteRows = await loadWebsiteRows();
  const websiteById = new Map(
    websiteRows
      .map((row) => [numberOrNull(row.MPRFWebsiteNumber), row] as const)
      .filter((entry): entry is [number, MprfWebsiteManta] => entry[0] != null && Boolean(dateOnly(entry[1].DateAdded))),
  );
  const websiteByName = new Map<string, MprfWebsiteManta>();
  for (const row of websiteRows) {
    const name = normalizeName(row.Name);
    if (name && dateOnly(row.DateAdded) && !websiteByName.has(name)) websiteByName.set(name, row);
  }

  const [mantaRows, rankRows, allCatalogRows] = await Promise.all([
    selectAll<Record<string, unknown>>("mantas", "fk_catalog_id,pk_mprf_catalog_id,name,is_mprf", "pk_manta_id"),
    selectAll<Record<string, unknown>>("kona_biopsy_age_rank_view_v3", "pk_catalog_id,pk_mprf_catalog_id,hamer_name,mprf_name", "pk_biopsy_id"),
    selectAll<CatalogRow>(
      "catalog",
      "pk_catalog_id,name,is_mprf,is_mprf_added,MPRF_first_sighted_date,mprf_date_first_sighted,MPRF_total_years_seen,MPRF_age_class_at_first_sighting,mprf_pupinitially,mprf_size_estimate,mprf_blackmorph,deceased",
      "pk_catalog_id",
    ),
  ]);

  const targetsByCatalog = new Map<number, CatalogTarget>();
  for (const row of allCatalogRows) {
    if (!row.is_mprf && !row.is_mprf_added) continue;
    const embeddedMprfNumber = mprfNumberFromCatalogName(row.name);
    if (embeddedMprfNumber != null && websiteById.has(embeddedMprfNumber)) {
      addTarget(targetsByCatalog, row.pk_catalog_id, embeddedMprfNumber, "catalog.name embedded MP number", row.name);
      continue;
    }
    const match = findWebsiteNameMatch(row.name, websiteByName);
    if (!match) continue;
    addTarget(targetsByCatalog, row.pk_catalog_id, match.row.MPRFWebsiteNumber, match.matchType, row.name);
  }
  for (const row of rankRows) {
    addTarget(targetsByCatalog, row.pk_catalog_id, row.pk_mprf_catalog_id, "kona_biopsy_age_rank_view_v3.pk_mprf_catalog_id", row.hamer_name ?? row.mprf_name);
  }
  for (const row of mantaRows) {
    addTarget(targetsByCatalog, row.fk_catalog_id, row.pk_mprf_catalog_id, "mantas.pk_mprf_catalog_id", row.name);
  }
  const catalogRows = new Map(allCatalogRows.map((row) => [Number(row.pk_catalog_id), row]));

  const now = new Date();
  const auditRows: AuditRow[] = [];
  let updateCount = 0;

  for (const target of targetsByCatalog.values()) {
    const website = websiteById.get(target.pk_mprf_catalog_id);
    const catalog = catalogRows.get(target.pk_catalog_id);
    if (!website || !catalog) continue;
    if (!catalog.is_mprf && !catalog.is_mprf_added) continue;

    const firstSighting = dateOnly(website.DateAdded);
    const totalYearsSeen = yearsBetween(firstSighting, now);
    const sizeM = firstSizeEstimateM(website);
    const patch: Partial<CatalogRow> = {
      MPRF_first_sighted_date: firstSighting,
      mprf_date_first_sighted: firstSighting,
    };
    const firstAgeClass = ageClassAtFirstSighting(website);
    if (firstAgeClass) patch.MPRF_age_class_at_first_sighting = firstAgeClass;

    const changes = Object.entries(patch).filter(([key, value]) => String(catalog[key as keyof CatalogRow] ?? "") !== String(value ?? ""));
    const status = changes.length ? (apply ? "updated" : "would_update") : "unchanged";

    if (apply && changes.length) {
      const { error } = await supabase.from("catalog").update(patch).eq("pk_catalog_id", target.pk_catalog_id);
      if (error) throw error;
      updateCount += 1;
    }

    auditRows.push({
      apply,
      status,
      pk_catalog_id: target.pk_catalog_id,
      pk_mprf_catalog_id: target.pk_mprf_catalog_id,
      database_name: target.database_name,
      website_name: clean(website.Name),
      website_first_sighting: firstSighting,
      catalog_mprf_first_sighted_date: clean(catalog.MPRF_first_sighted_date),
      catalog_mprf_date_first_sighted: clean(catalog.mprf_date_first_sighted),
      min_years_since_first_sighting: totalYearsSeen == null ? "" : String(round(totalYearsSeen, 2)),
      website_pup_initially: String(truthy(website.PupInitially)),
      website_size_m: sizeM == null ? "" : String(round(sizeM, 2)),
      source: target.source,
      message: changes.length ? changes.map(([key]) => key).join("; ") : "Already aligned with website feed",
    });
  }

  const auditPath = path.join(OUT_DIR, apply ? "applied_updates.csv" : "dry_run_updates.csv");
  writeCsv(auditPath, auditRows);

  console.log(
    JSON.stringify(
      {
        apply,
        websiteRows: websiteRows.length,
        matchedCatalogs: auditRows.length,
        wouldUpdate: auditRows.filter((row) => row.status === "would_update").length,
        updated: updateCount,
        auditPath,
        examples: auditRows
          .filter((row) => ["Lefty", "Big Bertha"].includes(row.website_name))
          .map((row) => ({
            name: row.website_name,
            pk_catalog_id: row.pk_catalog_id,
            pk_mprf_catalog_id: row.pk_mprf_catalog_id,
            first_sighting: row.website_first_sighting,
            status: row.status,
          })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
