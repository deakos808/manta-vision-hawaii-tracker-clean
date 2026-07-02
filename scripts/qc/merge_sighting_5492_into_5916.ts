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

type LedgerRow = {
  changed_at: string;
  apply: boolean;
  source_sighting_id: number;
  target_sighting_id: number;
  source_photographer: string;
  target_photographer: string;
  source_notes: string;
  target_notes_before: string;
  target_notes_after: string;
  source_dependency_counts: string;
  status: string;
  message: string;
};

const SOURCE_SIGHTING_ID = 5492;
const TARGET_SIGHTING_ID = 5916;
const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/merge_sighting_5492_into_5916");

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    apply: args.includes("--apply"),
  };
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeWhitespace(value: unknown) {
  return clean(value).replace(/\s+/g, " ");
}

function sourceLabel(row: SightingRow) {
  return row.is_mprf ? "MPRF" : "HAMER";
}

function copiedNoteBlock(source: SightingRow) {
  const sourceNotes = clean(source.notes);
  const photographer = clean(source.photographer) || "unknown photographer";
  if (!sourceNotes) return "";
  return [
    "Merged duplicate sighting note from sighting 5492.",
    `Original photographer on duplicate row: ${photographer}.`,
    `Original note: ${sourceNotes}`,
  ].join("\n");
}

function appendNotes(target: SightingRow, source: SightingRow) {
  const existing = clean(target.notes);
  const addition = copiedNoteBlock(source);
  if (!addition) return existing || null;
  if (!existing) return addition;
  if (existing.includes(addition)) return existing;
  return `${existing}\n\n${addition}`;
}

async function fetchSighting(id: number) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const { data, error } = await supabase
    .from("sightings")
    .select(
      [
        "pk_sighting_id",
        "is_mprf",
        "sighting_date",
        "island",
        "population",
        "location",
        "sitelocation",
        "latitude",
        "longitude",
        "start_time",
        "end_time",
        "photographer",
        "organization",
        "total_mantas",
        "total_manta_ids",
        "list_manta_ids",
        "list_manta_ids_2",
        "list_catalog_ids",
        "notes",
        "behavior",
      ].join(","),
    )
    .eq("pk_sighting_id", id)
    .maybeSingle();

  if (error) throw new Error(`sightings ${id}: ${error.message}`);
  return data as SightingRow | null;
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

function blockingReasons(source: SightingRow | null, target: SightingRow | null, deps: Awaited<ReturnType<typeof dependencyCounts>>) {
  const reasons: string[] = [];
  if (!source) reasons.push(`source sighting ${SOURCE_SIGHTING_ID} does not exist`);
  if (!target) reasons.push(`target sighting ${TARGET_SIGHTING_ID} does not exist`);
  if (!source || !target) return reasons;

  if (sourceLabel(source) !== sourceLabel(target)) reasons.push("source and target have different HAMER/MPRF source labels");
  if (clean(source.sighting_date) !== clean(target.sighting_date)) reasons.push("source and target dates differ");
  if (clean(source.sitelocation ?? source.location) !== clean(target.sitelocation ?? target.location)) {
    reasons.push("source and target locations differ");
  }
  if (Number(source.total_mantas ?? source.total_manta_ids ?? 0) !== 0) {
    reasons.push("source sighting is not an empty/zero-manta row");
  }
  if (!clean(source.notes)) reasons.push("source sighting has no notes to copy");

  for (const dep of deps) {
    if (dep.count == null) reasons.push(`could not verify dependency table ${dep.table}: ${dep.error}`);
    else if (dep.count > 0) reasons.push(`source sighting is still referenced by ${dep.table}.${dep.column} (${dep.count})`);
  }

  return reasons;
}

async function main() {
  ensureOutputDir(OUT_DIR);
  const { apply } = parseArgs();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const changedAt = new Date().toISOString();
  const [source, target, deps] = await Promise.all([
    fetchSighting(SOURCE_SIGHTING_ID),
    fetchSighting(TARGET_SIGHTING_ID),
    dependencyCounts(SOURCE_SIGHTING_ID),
  ]);

  const targetNotesAfter = source && target ? appendNotes(target, source) : null;
  const blockers = blockingReasons(source, target, deps);
  const ledger: LedgerRow[] = [
    {
      changed_at: changedAt,
      apply,
      source_sighting_id: SOURCE_SIGHTING_ID,
      target_sighting_id: TARGET_SIGHTING_ID,
      source_photographer: source?.photographer ?? "",
      target_photographer: target?.photographer ?? "",
      source_notes: source?.notes ?? "",
      target_notes_before: target?.notes ?? "",
      target_notes_after: targetNotesAfter ?? "",
      source_dependency_counts: dependencySummary(deps),
      status: apply ? "pending" : "dry_run_ready",
      message: blockers.length
        ? `Blocked: ${blockers.join("; ")}`
        : apply
          ? "Ready to append notes and delete duplicate source sighting."
          : "Dry run passed. Re-run with --apply to append notes to 5916 and delete 5492.",
    },
  ];

  if (blockers.length) {
    ledger[0].status = "blocked";
  } else if (apply && source && target) {
    const { error: updateError } = await supabase
      .from("sightings")
      .update({ notes: targetNotesAfter })
      .eq("pk_sighting_id", TARGET_SIGHTING_ID)
      .eq("notes", target.notes);

    if (updateError) {
      ledger[0].status = "blocked";
      ledger[0].message = `Could not update target notes: ${updateError.message}`;
    } else {
      const { error: deleteError } = await supabase
        .from("sightings")
        .delete()
        .eq("pk_sighting_id", SOURCE_SIGHTING_ID);

      if (deleteError) {
        ledger[0].status = "partial_update_blocked";
        ledger[0].message = `Notes were updated on ${TARGET_SIGHTING_ID}, but source delete failed: ${deleteError.message}`;
      } else {
        ledger[0].status = "updated_and_deleted";
        ledger[0].message = "Appended attributed source notes to 5916 and deleted duplicate empty sighting 5492.";
      }
    }
  }

  const summary = {
    checked_at: changedAt,
    apply,
    source_sighting_id: SOURCE_SIGHTING_ID,
    target_sighting_id: TARGET_SIGHTING_ID,
    source_exists: Boolean(source),
    target_exists: Boolean(target),
    source_dependency_counts: dependencySummary(deps),
    blocked: ledger[0].status === "blocked",
    status: ledger[0].status,
    message: ledger[0].message,
  };

  fs.writeFileSync(path.join(OUT_DIR, "merge_sighting_5492_into_5916_summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "merge_sighting_5492_into_5916_ledger.json"), JSON.stringify(ledger, null, 2));
  writeCsv(path.join(OUT_DIR, "merge_sighting_5492_into_5916_ledger.csv"), ledger);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
