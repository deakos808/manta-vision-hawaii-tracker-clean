import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const APPLY = process.argv.includes("--apply");
const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/mprf_link_repair");

type Row = Record<string, any>;

function nums(value: unknown) {
  return Array.from(String(value ?? "").matchAll(/\d+/g))
    .map((match) => Number(match[0]))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function key(value: unknown) {
  return String(value ?? "").trim();
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath: string, rows: Row[]) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const body = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
  fs.writeFileSync(filePath, body + "\n");
}

function duplicateValues(rows: Row[], column: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = key(row[column]);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ column, value, count }));
}

function conflictingStagingSightings(rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const id = key(row.pk_mprf_sighting_id_text);
    if (!id) continue;
    const list = groups.get(id) ?? [];
    list.push(row);
    groups.set(id, list);
  }

  const conflicts: Row[] = [];
  for (const [id, list] of groups.entries()) {
    const signatures = new Set(
      list.map((row) =>
        [
          key(row.catalog_list_text),
          key(row.sighting_date_text),
          key(row.location_text),
          key(row.island_text),
          key(row.region_text),
        ].join("|"),
      ),
    );
    if (signatures.size > 1) {
      conflicts.push({
        table_name: "stg_mprf_sightings",
        column: "pk_mprf_sighting_id_text",
        value: id,
        count: list.length,
        distinct_signatures: signatures.size,
      });
    }
  }
  return conflicts;
}

async function loadAll(supabase: ReturnType<typeof createClient>, table: string, columns: string) {
  const rows: Row[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const apiKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !apiKey) throw new Error("Missing Supabase credentials.");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const supabase = createClient(url, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [sightings, mantas, stgSightings] = await Promise.all([
    loadAll(
      supabase,
      "sightings",
      "pk_sighting_id,pk_mprf_sighting_id,is_mprf,list_manta_ids_2,list_catalog_ids,pk_mprf_catalog_id_list",
    ),
    loadAll(
      supabase,
      "mantas",
      "pk_manta_id,fk_sighting_id,fk_catalog_id,is_mprf,mprf_external_manta_id,pk_mprf_catalog_id",
    ),
    loadAll(
      supabase,
      "stg_mprf_sightings",
      "pk_mprf_sighting_id_text,catalog_list_text,sighting_date_text,location_text,island_text,region_text",
    ),
  ]);

  const mantasByPk = new Map(mantas.map((row) => [key(row.pk_manta_id), row]));
  const stgSightingByMprfId = new Map(stgSightings.map((row) => [key(row.pk_mprf_sighting_id_text), row]));
  const duplicatePrimaryRows = [
    ...duplicateValues(sightings, "pk_sighting_id").map((row) => ({ table_name: "sightings", ...row })),
    ...duplicateValues(mantas, "pk_manta_id").map((row) => ({ table_name: "mantas", ...row })),
  ];
  const conflictingStagingRows = conflictingStagingSightings(stgSightings);

  const catalogCrosswalkCounts = new Map<string, Map<string, number>>();
  for (const manta of mantas) {
    if (!manta.is_mprf || manta.pk_mprf_catalog_id == null || manta.fk_catalog_id == null) continue;
    const mprfCatalogId = key(manta.pk_mprf_catalog_id);
    const hamerCatalogId = key(manta.fk_catalog_id);
    const options = catalogCrosswalkCounts.get(mprfCatalogId) ?? new Map<string, number>();
    options.set(hamerCatalogId, (options.get(hamerCatalogId) ?? 0) + 1);
    catalogCrosswalkCounts.set(mprfCatalogId, options);
  }

  const catalogCrosswalk = new Map<string, number>();
  const ambiguousCatalogs: Row[] = [];
  for (const [mprfCatalogId, options] of catalogCrosswalkCounts.entries()) {
    const sorted = Array.from(options.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 1) {
      catalogCrosswalk.set(mprfCatalogId, Number(sorted[0][0]));
    } else {
      ambiguousCatalogs.push({
        mprf_catalog_id: mprfCatalogId,
        hamer_catalog_options: sorted.map(([id, count]) => `${id}:${count}`).join(";"),
      });
    }
  }

  const proposedByManta = new Map<string, Row[]>();
  const skipped: Row[] = [];

  for (const sighting of sightings) {
    if (!sighting.is_mprf) continue;

    const targetSightingId = Number(sighting.pk_sighting_id);
    const stgSighting = stgSightingByMprfId.get(key(sighting.pk_mprf_sighting_id));
    if (!stgSighting) {
      skipped.push({
        reason: "missing_staging_sighting",
        pk_sighting_id: targetSightingId,
        pk_mprf_sighting_id: sighting.pk_mprf_sighting_id,
      });
      continue;
    }

    const sourceCatalogIds = new Set(nums(stgSighting.catalog_list_text).map(String));
    if (sourceCatalogIds.size === 0) {
      skipped.push({
        reason: "blank_staging_catalog_list",
        pk_sighting_id: targetSightingId,
        pk_mprf_sighting_id: sighting.pk_mprf_sighting_id,
      });
      continue;
    }

    for (const mantaPk of new Set(nums(sighting.list_manta_ids_2))) {
      const manta = mantasByPk.get(key(mantaPk));
      if (!manta) {
        skipped.push({
          reason: "listed_manta_missing",
          pk_sighting_id: targetSightingId,
          pk_manta_id: mantaPk,
        });
        continue;
      }

      if (!manta.is_mprf) {
        skipped.push({
          reason: "listed_manta_not_mprf",
          pk_sighting_id: targetSightingId,
          pk_manta_id: mantaPk,
        });
        continue;
      }

      const mprfCatalogId = key(manta.pk_mprf_catalog_id);
      if (!sourceCatalogIds.has(mprfCatalogId)) {
        skipped.push({
          reason: "manta_catalog_not_in_staging_sighting",
          pk_sighting_id: targetSightingId,
          pk_mprf_sighting_id: sighting.pk_mprf_sighting_id,
          pk_manta_id: mantaPk,
          manta_mprf_catalog_id: mprfCatalogId,
          staging_catalog_list: Array.from(sourceCatalogIds).join(";"),
        });
        continue;
      }

      const expectedCatalogId = catalogCrosswalk.get(mprfCatalogId);
      if (!expectedCatalogId) {
        skipped.push({
          reason: "missing_or_ambiguous_catalog_crosswalk",
          pk_sighting_id: targetSightingId,
          pk_manta_id: mantaPk,
          manta_mprf_catalog_id: mprfCatalogId,
        });
        continue;
      }

      const currentSightingId = Number(manta.fk_sighting_id);
      const currentCatalogId = Number(manta.fk_catalog_id);
      if (currentSightingId === targetSightingId && currentCatalogId === expectedCatalogId) continue;

      const proposal = {
        pk_manta_id: Number(mantaPk),
        pk_sighting_id: targetSightingId,
        pk_mprf_sighting_id: sighting.pk_mprf_sighting_id,
        current_fk_sighting_id: manta.fk_sighting_id ?? "",
        proposed_fk_sighting_id: targetSightingId,
        current_fk_catalog_id: manta.fk_catalog_id ?? "",
        proposed_fk_catalog_id: expectedCatalogId,
        mprf_external_manta_id: manta.mprf_external_manta_id ?? "",
        mprf_catalog_id: mprfCatalogId,
        was_previous_sighting_pattern: currentSightingId === targetSightingId - 1,
      };
      const existing = proposedByManta.get(key(mantaPk)) ?? [];
      existing.push(proposal);
      proposedByManta.set(key(mantaPk), existing);
    }
  }

  const safeUpdates: Row[] = [];
  for (const [mantaPk, proposals] of proposedByManta.entries()) {
    const targets = new Set(proposals.map((proposal) => `${proposal.proposed_fk_sighting_id}:${proposal.proposed_fk_catalog_id}`));
    if (targets.size === 1) {
      safeUpdates.push(proposals[0]);
    } else {
      skipped.push({
        reason: "conflicting_target_assignments",
        pk_manta_id: mantaPk,
        proposed_targets: Array.from(targets).join(";"),
      });
    }
  }

  let applied = 0;
  const applyErrors: Row[] = [];
  if (APPLY) {
    if (duplicatePrimaryRows.length > 0) {
      throw new Error("Refusing to apply because duplicate primary/source IDs were found. Inspect duplicate_primary_keys.csv.");
    }
    if (conflictingStagingRows.length > 0) {
      throw new Error("Refusing to apply because conflicting duplicate MPRF staging sightings were found.");
    }
    if (ambiguousCatalogs.length > 0) {
      throw new Error("Refusing to apply because ambiguous MPRF catalog crosswalk rows were found.");
    }

    for (const update of safeUpdates) {
      const { error } = await supabase
        .from("mantas")
        .update({
          fk_sighting_id: update.proposed_fk_sighting_id,
          fk_catalog_id: update.proposed_fk_catalog_id,
        })
        .eq("pk_manta_id", update.pk_manta_id);

      if (error) {
        applyErrors.push({
          pk_manta_id: update.pk_manta_id,
          message: error.message,
        });
      } else {
        applied += 1;
      }
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    applied: APPLY,
    safe_update_rows: safeUpdates.length,
    safe_previous_pattern_rows: safeUpdates.filter((row) => row.was_previous_sighting_pattern).length,
    safe_other_rows: safeUpdates.filter((row) => !row.was_previous_sighting_pattern).length,
    skipped_rows: skipped.length,
    ambiguous_catalog_crosswalk_rows: ambiguousCatalogs.length,
    duplicate_primary_rows: duplicatePrimaryRows.length,
    conflicting_staging_rows: conflictingStagingRows.length,
    applied_rows: applied,
    apply_error_rows: applyErrors.length,
    output_dir: path.relative(process.cwd(), OUT_DIR),
  };

  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  writeCsv(path.join(OUT_DIR, "safe_updates.csv"), safeUpdates);
  writeCsv(path.join(OUT_DIR, "skipped_rows.csv"), skipped);
  writeCsv(path.join(OUT_DIR, "ambiguous_catalog_crosswalk.csv"), ambiguousCatalogs);
  writeCsv(path.join(OUT_DIR, "duplicate_primary_keys.csv"), duplicatePrimaryRows);
  writeCsv(path.join(OUT_DIR, "conflicting_staging_sightings.csv"), conflictingStagingRows);
  writeCsv(path.join(OUT_DIR, "apply_errors.csv"), applyErrors);

  console.log(JSON.stringify(summary, null, 2));
  console.log(APPLY ? "Applied safe updates." : "Dry run only. Re-run with --apply to update mantas.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
