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
  sighting_date: string | null;
  start_time: string | null;
  end_time: string | null;
  is_mprf: boolean | null;
  island: string | null;
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

type LinkCheck = {
  table: string;
  column: string;
  count: number | null;
  error: string;
};

const APPLY = process.argv.includes("--apply");
const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/fix_duplicate_mantas_and_sightings_20260518");

const DUPLICATE_MANTAS = [
  {
    duplicate_manta_id: 14929,
    canonical_manta_id: 3657,
    reason: "Duplicate MPRF manta in sighting 9923 has the same name as canonical manta 3657.",
  },
];

const SIGHTING_PATCHES = [
  {
    pk_sighting_id: 9923,
    patch: {
      total_mantas: 2,
      total_manta_ids: 2,
    },
    reason: "Sighting has two unique linked mantas after removing duplicate manta 14929.",
  },
  {
    pk_sighting_id: 9924,
    patch: {
      list_manta_ids_2: "36298",
    },
    reason: "Replace stale listed manta 14929 with the actual child manta row 36298 for this later survey.",
  },
];

const DELETE_SIGHTINGS = [
  {
    duplicate_sighting_id: 5713,
    reason: "User-confirmed duplicate sighting; remove duplicate sighting and its duplicate manta child links.",
  },
  {
    duplicate_sighting_id: 5714,
    reason: "User-confirmed duplicate sighting; remove duplicate sighting and its duplicate manta child links.",
  },
  {
    duplicate_sighting_id: 5715,
    reason: "User-confirmed duplicate sighting; remove duplicate sighting and its duplicate manta child links.",
  },
  {
    duplicate_sighting_id: 5717,
    reason: "User-confirmed duplicate sighting; remove duplicate sighting and its duplicate manta child links.",
  },
  {
    duplicate_sighting_id: 5718,
    reason: "User-confirmed duplicate sighting; remove duplicate sighting and its duplicate manta child links.",
  },
];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function dependencySummary(checks: LinkCheck[]) {
  return checks
    .map((check) => `${check.table}.${check.column}:${check.count == null ? `unknown (${check.error})` : check.count}`)
    .join("; ");
}

async function loadOne<T>(table: string, columns: string, key: string, value: number) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");
  const { data, error } = await supabase.from(table).select(columns).eq(key, value).maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as T | null;
}

async function loadRows<T>(table: string, columns: string, key: string, value: number) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");
  const { data, error } = await supabase.from(table).select(columns).eq(key, value);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as T[];
}

async function countLinks(table: string, column: string, id: number): Promise<LinkCheck> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");
  const { count, error } = await supabase.from(table).select(column, { count: "exact", head: true }).eq(column, id);
  if (error && /does not exist|schema cache|Could not find/i.test(error.message)) {
    return { table, column, count: 0, error: error.message };
  }
  return { table, column, count: error ? null : count ?? 0, error: error?.message ?? "" };
}

async function loadMprfMantaMapRows(mantaId: number) {
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

async function loadMprfSightingMapRows(sightingId: number) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");
  const { data, error } = await supabase
    .from("mprf_sighting_map")
    .select("pk_mprf_sighting_id,pk_sighting_id,created_at")
    .eq("pk_sighting_id", sightingId);
  if (error && /does not exist|schema cache|Could not find/i.test(error.message)) return [];
  if (error) throw new Error(`mprf_sighting_map: ${error.message}`);
  return data ?? [];
}

async function mantaDependencyChecks(mantaId: number) {
  return Promise.all([
    countLinks("photos", "fk_manta_id", mantaId),
    countLinks("manta_sizes", "fk_manta_id", mantaId),
    countLinks("sizes", "fk_manta_id", mantaId),
    countLinks("biopsies", "fk_manta_id", mantaId),
  ]);
}

async function sightingDependencyChecks(sightingId: number) {
  return Promise.all([
    countLinks("photos", "fk_sighting_id", sightingId),
    countLinks("sizes", "fk_sighting_id", sightingId),
    countLinks("biopsies", "fk_sighting_id", sightingId),
  ]);
}

async function main() {
  ensureOutputDir(OUT_DIR);
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const changedAt = new Date().toISOString();
  const mantaLedger: Record<string, unknown>[] = [];
  const sightingPatchLedger: Record<string, unknown>[] = [];
  const sightingDeleteLedger: Record<string, unknown>[] = [];
  const childMantaLedger: Record<string, unknown>[] = [];
  const sourceMapLedger: Record<string, unknown>[] = [];

  for (const pair of DUPLICATE_MANTAS) {
    const duplicate = await loadOne<MantaRow>("mantas", "*", "pk_manta_id", pair.duplicate_manta_id);
    const canonical = await loadOne<MantaRow>("mantas", "*", "pk_manta_id", pair.canonical_manta_id);
    const dependencies = await mantaDependencyChecks(pair.duplicate_manta_id);
    const mprfMapRows = await loadMprfMantaMapRows(pair.duplicate_manta_id);
    const identityMatches =
      Boolean(duplicate && canonical) &&
      clean(duplicate?.name) !== "" &&
      clean(duplicate?.name) === clean(canonical?.name);
    const safe = Boolean(duplicate && canonical) && identityMatches && dependencies.every((check) => check.count === 0);

    for (const mapRow of mprfMapRows) {
      sourceMapLedger.push({
        changed_at: changedAt,
        apply: APPLY,
        map_type: "mprf_manta_map",
        primary_key: mapRow.pk_mprf_manta_id,
        old_id: pair.duplicate_manta_id,
        new_id: pair.canonical_manta_id,
        reason: `Preserve source map before deleting duplicate manta ${pair.duplicate_manta_id}.`,
      });
    }

    const base = {
      changed_at: changedAt,
      apply: APPLY,
      duplicate_manta_id: pair.duplicate_manta_id,
      canonical_manta_id: pair.canonical_manta_id,
      duplicate_exists: Boolean(duplicate),
      canonical_exists: Boolean(canonical),
      duplicate_name: duplicate?.name ?? "",
      canonical_name: canonical?.name ?? "",
      duplicate_fk_catalog_id: duplicate?.fk_catalog_id ?? "",
      canonical_fk_catalog_id: canonical?.fk_catalog_id ?? "",
      duplicate_fk_sighting_id: duplicate?.fk_sighting_id ?? "",
      canonical_fk_sighting_id: canonical?.fk_sighting_id ?? "",
      dependency_counts: dependencySummary(dependencies),
      mprf_manta_map_rows: mprfMapRows.map((row: any) => row.pk_mprf_manta_id).join("|"),
      reason: pair.reason,
    };

    if (!safe) {
      mantaLedger.push({ ...base, status: "blocked", message: "Safety checks failed; no delete attempted." });
      continue;
    }

    if (!APPLY) {
      mantaLedger.push({ ...base, status: "dry_run_ready", message: "Ready to move source maps and delete duplicate manta." });
      continue;
    }

    if (mprfMapRows.length > 0) {
      const { error } = await supabase
        .from("mprf_manta_map")
        .update({ pk_manta_id: pair.canonical_manta_id })
        .eq("pk_manta_id", pair.duplicate_manta_id);
      if (error) {
        mantaLedger.push({ ...base, status: "blocked", message: `Could not move MPRF map rows: ${error.message}` });
        continue;
      }
    }

    const { error } = await supabase.from("mantas").delete().eq("pk_manta_id", pair.duplicate_manta_id);
    mantaLedger.push({
      ...base,
      status: error ? "blocked" : "deleted",
      message: error?.message ?? "Deleted duplicate manta row.",
    });
  }

  for (const change of SIGHTING_PATCHES) {
    const before = await loadOne<SightingRow>(
      "sightings",
      "pk_sighting_id,total_mantas,total_manta_ids,list_manta_ids,list_manta_ids_2,list_catalog_ids",
      "pk_sighting_id",
      change.pk_sighting_id,
    );
    const base = {
      changed_at: changedAt,
      apply: APPLY,
      pk_sighting_id: change.pk_sighting_id,
      old_total_mantas: before?.total_mantas ?? "",
      old_total_manta_ids: before?.total_manta_ids ?? "",
      old_list_manta_ids: before?.list_manta_ids ?? "",
      old_list_manta_ids_2: before?.list_manta_ids_2 ?? "",
      old_list_catalog_ids: before?.list_catalog_ids ?? "",
      new_total_mantas: change.patch.total_mantas ?? before?.total_mantas ?? "",
      new_total_manta_ids: change.patch.total_manta_ids ?? before?.total_manta_ids ?? "",
      new_list_manta_ids_2: change.patch.list_manta_ids_2 ?? before?.list_manta_ids_2 ?? "",
      reason: change.reason,
    };

    if (!before) {
      sightingPatchLedger.push({ ...base, status: "blocked", message: "Sighting row not found." });
      continue;
    }
    if (!APPLY) {
      sightingPatchLedger.push({ ...base, status: "dry_run_ready", message: "Ready to update sighting metadata." });
      continue;
    }
    const { error } = await supabase.from("sightings").update(change.patch).eq("pk_sighting_id", change.pk_sighting_id);
    sightingPatchLedger.push({
      ...base,
      status: error ? "blocked" : "updated",
      message: error?.message ?? "Updated sighting metadata.",
    });
  }

  for (const target of DELETE_SIGHTINGS) {
    const sighting = await loadOne<SightingRow>("sightings", "*", "pk_sighting_id", target.duplicate_sighting_id);
    const childMantas = await loadRows<MantaRow>("mantas", "*", "fk_sighting_id", target.duplicate_sighting_id);
    const sightingDependencies = await sightingDependencyChecks(target.duplicate_sighting_id);
    const mprfSightingMaps = await loadMprfSightingMapRows(target.duplicate_sighting_id);
    const childDependencyResults = await Promise.all(
      childMantas.map(async (manta) => ({
        manta,
        dependencies: await mantaDependencyChecks(manta.pk_manta_id),
        mprfMaps: await loadMprfMantaMapRows(manta.pk_manta_id),
      })),
    );
    const sightingLinksClear = sightingDependencies.every((check) => check.count === 0);
    const childLinksClear = childDependencyResults.every(
      (result) => result.dependencies.every((check) => check.count === 0) && result.mprfMaps.length === 0,
    );
    const safe = Boolean(sighting) && sightingLinksClear && childLinksClear && mprfSightingMaps.length === 0;

    const base = {
      changed_at: changedAt,
      apply: APPLY,
      duplicate_sighting_id: target.duplicate_sighting_id,
      sighting_exists: Boolean(sighting),
      sighting_date: sighting?.sighting_date ?? "",
      start_time: sighting?.start_time ?? "",
      end_time: sighting?.end_time ?? "",
      photographer: sighting?.photographer ?? "",
      location: sighting?.sitelocation ?? sighting?.location ?? "",
      total_mantas: sighting?.total_mantas ?? sighting?.total_manta_ids ?? "",
      list_manta_ids: sighting?.list_manta_ids ?? "",
      list_manta_ids_2: sighting?.list_manta_ids_2 ?? "",
      list_catalog_ids: sighting?.list_catalog_ids ?? "",
      child_manta_ids: childMantas.map((manta) => manta.pk_manta_id).join("|"),
      child_catalog_ids: childMantas.map((manta) => manta.fk_catalog_id ?? "").join("|"),
      child_names: childMantas.map((manta) => manta.name ?? "").join("|"),
      sighting_dependency_counts: dependencySummary(sightingDependencies),
      child_dependency_counts: childDependencyResults
        .map((result) => `${result.manta.pk_manta_id}=[${dependencySummary(result.dependencies)}; mprf_manta_map:${result.mprfMaps.length}]`)
        .join(" | "),
      mprf_sighting_map_rows: mprfSightingMaps.map((row: any) => row.pk_mprf_sighting_id).join("|"),
      notes: sighting?.notes ?? "",
      behavior: sighting?.behavior ?? "",
      reason: target.reason,
    };

    for (const result of childDependencyResults) {
      childMantaLedger.push({
        changed_at: changedAt,
        apply: APPLY,
        duplicate_sighting_id: target.duplicate_sighting_id,
        manta_id: result.manta.pk_manta_id,
        fk_catalog_id: result.manta.fk_catalog_id ?? "",
        name: result.manta.name ?? "",
        dependency_counts: dependencySummary(result.dependencies),
        mprf_manta_map_rows: result.mprfMaps.map((row: any) => row.pk_mprf_manta_id).join("|"),
        status: safe ? (APPLY ? "deleted" : "dry_run_ready") : "blocked",
        reason: target.reason,
      });
    }

    if (!safe) {
      sightingDeleteLedger.push({ ...base, status: "blocked", message: "Safety checks failed; no deletion attempted." });
      continue;
    }

    if (!APPLY) {
      sightingDeleteLedger.push({ ...base, status: "dry_run_ready", message: "Ready to delete child manta rows, then sighting row." });
      continue;
    }

    for (const manta of childMantas) {
      const { error } = await supabase.from("mantas").delete().eq("pk_manta_id", manta.pk_manta_id);
      if (error) {
        sightingDeleteLedger.push({
          ...base,
          status: "blocked",
          message: `Could not delete child manta ${manta.pk_manta_id}: ${error.message}`,
        });
        continue;
      }
    }

    const { error } = await supabase.from("sightings").delete().eq("pk_sighting_id", target.duplicate_sighting_id);
    sightingDeleteLedger.push({
      ...base,
      status: error ? "blocked" : "deleted",
      message: error?.message ?? "Deleted child manta rows and duplicate sighting row.",
    });
  }

  const summary = {
    checked_at: changedAt,
    apply: APPLY,
    duplicate_mantas: DUPLICATE_MANTAS.map((pair) => pair.duplicate_manta_id),
    target_duplicate_sightings: DELETE_SIGHTINGS.map((target) => target.duplicate_sighting_id),
    deleted_duplicate_mantas: mantaLedger.filter((row) => row.status === "deleted").length,
    updated_sightings: sightingPatchLedger.filter((row) => row.status === "updated").length,
    deleted_sightings: sightingDeleteLedger.filter((row) => row.status === "deleted").length,
    deleted_child_mantas: childMantaLedger.filter((row) => row.status === "deleted").length,
    dry_run_ready: [...mantaLedger, ...sightingPatchLedger, ...sightingDeleteLedger].filter((row) => row.status === "dry_run_ready").length,
    blocked: [...mantaLedger, ...sightingPatchLedger, ...sightingDeleteLedger].filter((row) => row.status === "blocked").length,
  };

  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "manta_ledger.json"), JSON.stringify(mantaLedger, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "sighting_patch_ledger.json"), JSON.stringify(sightingPatchLedger, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "sighting_delete_ledger.json"), JSON.stringify(sightingDeleteLedger, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "child_manta_delete_ledger.json"), JSON.stringify(childMantaLedger, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "source_map_ledger.json"), JSON.stringify(sourceMapLedger, null, 2));
  writeCsv(path.join(OUT_DIR, "manta_ledger.csv"), mantaLedger);
  writeCsv(path.join(OUT_DIR, "sighting_patch_ledger.csv"), sightingPatchLedger);
  writeCsv(path.join(OUT_DIR, "sighting_delete_ledger.csv"), sightingDeleteLedger);
  writeCsv(path.join(OUT_DIR, "child_manta_delete_ledger.csv"), childMantaLedger);
  writeCsv(path.join(OUT_DIR, "source_map_ledger.csv"), sourceMapLedger);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
