import fs from "fs";
import path from "path";
import { ensureOutputDir, getSupabaseClient, writeCsv } from "./qc_common";

type MantaRow = Record<string, unknown> & {
  pk_manta_id: number;
  fk_catalog_id: number | null;
  fk_sighting_id: number | null;
  name: string | null;
};

type SightingRow = Record<string, unknown> & {
  pk_sighting_id: number;
  total_mantas: number | null;
  list_manta_ids: string | null;
  list_manta_ids_2: string | null;
  list_catalog_ids: string | null;
};

const APPLY = process.argv.includes("--apply");
const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/fix_duplicate_mantas_8667_8668");

const DUPLICATE_PAIRS = [
  {
    duplicate_manta_id: 25439,
    canonical_manta_id: 3702,
    sighting_id: 8667,
    reason: "Duplicate MPRF manta in sighting 8667 has same name as canonical manta 3702.",
  },
  {
    duplicate_manta_id: 31823,
    canonical_manta_id: 25436,
    sighting_id: 8668,
    reason: "Duplicate manta in sighting 8668 has same catalog ID as canonical manta 25436.",
  },
];

const SIGHTING_PATCHES = [
  {
    pk_sighting_id: 8667,
    patch: {
      total_mantas: 1,
      total_manta_ids: 1,
    },
    reason: "Sighting has one unique linked manta after removing duplicate manta 25439.",
  },
  {
    pk_sighting_id: 8668,
    patch: {
      total_mantas: 1,
      total_manta_ids: 1,
      list_manta_ids_2: "25436",
    },
    reason: "Sighting has one unique listed/linked manta after removing duplicate manta 31823 and stale listed manta 25439.",
  },
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function loadOne<T>(table: string, columns: string, key: string, value: number) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");
  const { data, error } = await supabase.from(table).select(columns).eq(key, value).maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as T | null;
}

async function countLinks(table: string, column: string, id: number) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");
  const { count, error } = await supabase
    .from(table)
    .select(column, { count: "exact", head: true })
    .eq(column, id);
  if (error && /does not exist|schema cache|Could not find/i.test(error.message)) {
    return { table, column, count: 0, error: error.message };
  }
  return { table, column, count: error ? null : count ?? 0, error: error?.message ?? "" };
}

async function loadMprfMapRows(mantaId: number) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");
  const { data, error } = await supabase
    .from("mprf_manta_map")
    .select("pk_mprf_manta_id,pk_manta_id,created_at")
    .eq("pk_manta_id", mantaId);
  if (error && /does not exist|schema cache|Could not find/i.test(error.message)) return [];
  if (error) throw new Error(`mprf_manta_map: ${error.message}`);
  return data ?? [];
}

function dependencySummary(checks: Array<{ table: string; column: string; count: number | null; error: string }>) {
  return checks
    .map((check) => `${check.table}.${check.column}:${check.count == null ? `unknown (${check.error})` : check.count}`)
    .join("; ");
}

async function main() {
  ensureOutputDir(OUT_DIR);
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");
  const changedAt = new Date().toISOString();

  const mantaLedger: Record<string, unknown>[] = [];
  const sightingLedger: Record<string, unknown>[] = [];
  const mprfMapLedger: Record<string, unknown>[] = [];

  for (const pair of DUPLICATE_PAIRS) {
    const duplicate = await loadOne<MantaRow>("mantas", "*", "pk_manta_id", pair.duplicate_manta_id);
    const canonical = await loadOne<MantaRow>("mantas", "*", "pk_manta_id", pair.canonical_manta_id);
    const dependencyChecks = await Promise.all([
      countLinks("photos", "fk_manta_id", pair.duplicate_manta_id),
      countLinks("manta_sizes", "fk_manta_id", pair.duplicate_manta_id),
      countLinks("sizes", "fk_manta_id", pair.duplicate_manta_id),
      countLinks("biopsies", "fk_manta_id", pair.duplicate_manta_id),
    ]);
    const mprfMapRows = await loadMprfMapRows(pair.duplicate_manta_id);
    const linksClear = dependencyChecks.every((check) => check.count === 0);
    const identityMatches =
      Boolean(duplicate && canonical) &&
      (clean(duplicate?.name) !== "" && clean(duplicate?.name) === clean(canonical?.name) ||
        duplicate?.fk_catalog_id != null && String(duplicate.fk_catalog_id) === String(canonical?.fk_catalog_id));
    const safe = Boolean(duplicate && canonical) && linksClear && identityMatches;

    for (const mapRow of mprfMapRows) {
      mprfMapLedger.push({
        changed_at: changedAt,
        apply: APPLY,
        pk_mprf_manta_id: mapRow.pk_mprf_manta_id,
        old_pk_manta_id: pair.duplicate_manta_id,
        new_pk_manta_id: pair.canonical_manta_id,
        reason: `Preserve MPRF source-map row before deleting duplicate manta ${pair.duplicate_manta_id}.`,
      });
    }

    const base = {
      changed_at: changedAt,
      apply: APPLY,
      duplicate_manta_id: pair.duplicate_manta_id,
      canonical_manta_id: pair.canonical_manta_id,
      sighting_id: pair.sighting_id,
      duplicate_exists: Boolean(duplicate),
      canonical_exists: Boolean(canonical),
      duplicate_name: duplicate?.name ?? "",
      canonical_name: canonical?.name ?? "",
      duplicate_fk_catalog_id: duplicate?.fk_catalog_id ?? "",
      canonical_fk_catalog_id: canonical?.fk_catalog_id ?? "",
      duplicate_fk_sighting_id: duplicate?.fk_sighting_id ?? "",
      canonical_fk_sighting_id: canonical?.fk_sighting_id ?? "",
      dependency_counts: dependencySummary(dependencyChecks),
      mprf_manta_map_rows: mprfMapRows.map((row: any) => row.pk_mprf_manta_id).join("|"),
      reason: pair.reason,
    };

    if (!safe) {
      mantaLedger.push({
        ...base,
        status: "blocked",
        message: "Safety checks failed; no delete attempted.",
      });
      continue;
    }

    if (!APPLY) {
      mantaLedger.push({
        ...base,
        status: "dry_run_ready",
        message: "Ready to preserve MPRF map rows, then delete duplicate manta row.",
      });
      continue;
    }

    if (mprfMapRows.length > 0) {
      const { error: mapError } = await supabase
        .from("mprf_manta_map")
        .update({ pk_manta_id: pair.canonical_manta_id })
        .eq("pk_manta_id", pair.duplicate_manta_id);
      if (mapError) {
        mantaLedger.push({
          ...base,
          status: "blocked",
          message: `Could not move mprf_manta_map row(s): ${mapError.message}`,
        });
        continue;
      }
    }

    const { error: deleteError } = await supabase
      .from("mantas")
      .delete()
      .eq("pk_manta_id", pair.duplicate_manta_id);

    mantaLedger.push({
      ...base,
      status: deleteError ? "blocked" : "deleted",
      message: deleteError?.message ?? "Deleted duplicate manta row.",
    });
  }

  for (const change of SIGHTING_PATCHES) {
    const before = await loadOne<SightingRow>("sightings", "pk_sighting_id,total_mantas,total_manta_ids,list_manta_ids,list_manta_ids_2,list_catalog_ids", "pk_sighting_id", change.pk_sighting_id);
    const base = {
      changed_at: changedAt,
      apply: APPLY,
      pk_sighting_id: change.pk_sighting_id,
      old_total_mantas: before?.total_mantas ?? "",
      old_total_manta_ids: before?.total_manta_ids ?? "",
      old_list_manta_ids: before?.list_manta_ids ?? "",
      old_list_manta_ids_2: before?.list_manta_ids_2 ?? "",
      old_list_catalog_ids: before?.list_catalog_ids ?? "",
      new_total_mantas: change.patch.total_mantas ?? "",
      new_total_manta_ids: change.patch.total_manta_ids ?? "",
      new_list_manta_ids_2: change.patch.list_manta_ids_2 ?? before?.list_manta_ids_2 ?? "",
      reason: change.reason,
    };

    if (!before) {
      sightingLedger.push({ ...base, status: "blocked", message: "Sighting row not found." });
      continue;
    }
    if (!APPLY) {
      sightingLedger.push({ ...base, status: "dry_run_ready", message: "Ready to update sighting totals/list fields." });
      continue;
    }

    const { error } = await supabase
      .from("sightings")
      .update(change.patch)
      .eq("pk_sighting_id", change.pk_sighting_id);
    sightingLedger.push({
      ...base,
      status: error ? "blocked" : "updated",
      message: error?.message ?? "Updated sighting totals/list fields.",
    });
  }

  const summary = {
    checked_at: changedAt,
    apply: APPLY,
    duplicate_mantas: DUPLICATE_PAIRS.map((pair) => pair.duplicate_manta_id),
    deleted_mantas: mantaLedger.filter((row) => row.status === "deleted").length,
    updated_sightings: sightingLedger.filter((row) => row.status === "updated").length,
    blocked: [...mantaLedger, ...sightingLedger].filter((row) => row.status === "blocked").length,
  };

  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "manta_ledger.json"), JSON.stringify(mantaLedger, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "sighting_ledger.json"), JSON.stringify(sightingLedger, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "mprf_manta_map_ledger.json"), JSON.stringify(mprfMapLedger, null, 2));
  writeCsv(path.join(OUT_DIR, "manta_ledger.csv"), mantaLedger);
  writeCsv(path.join(OUT_DIR, "sighting_ledger.csv"), sightingLedger);
  writeCsv(path.join(OUT_DIR, "mprf_manta_map_ledger.csv"), mprfMapLedger);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
