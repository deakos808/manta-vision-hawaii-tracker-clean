import fs from "fs";
import path from "path";
import { ensureOutputDir, getSupabaseClient, writeCsv } from "./qc_common";

type SizeRow = {
  pk_manta_size_id: number;
  fk_manta_id: number | null;
  photo_code: string | null;
  calibration_params: unknown;
};

type LedgerRow = {
  legacy_pk_size_id: number | string;
  canonical_pk_manta_size_id: number | string;
  duplicate_pk_manta_size_id: number | string;
  fk_manta_id: number | string;
  photo_code: string;
  status: string;
  message: string;
};

const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/dedupe_legacy_size_imports");
const SCRIPT_NAME = "dedupe_legacy_size_imports";

function parseArgs() {
  const args = process.argv.slice(2);
  const valueFor = (flag: string) => {
    const equals = args.find((arg) => arg.startsWith(`${flag}=`));
    if (equals) return equals.slice(flag.length + 1);
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  return {
    apply: args.includes("--apply"),
    reason: valueFor("--reason") ?? "",
  };
}

function parseCalibration(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function legacyPk(calibration: Record<string, unknown> | null) {
  const legacy = calibration?.legacy_size_export;
  if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) return null;
  const n = Number((legacy as Record<string, unknown>).pk_size_id);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  ensureOutputDir(OUT_DIR);
  const { apply, reason } = parseArgs();
  if (apply && !reason.trim()) throw new Error("--reason is required with --apply.");

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const rows: SizeRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("manta_sizes")
      .select("pk_manta_size_id,fk_manta_id,photo_code,calibration_params")
      .order("pk_manta_size_id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as SizeRow[]));
    if (!data || data.length < pageSize) break;
  }

  const grouped = new Map<number, Array<{ row: SizeRow; calibration: Record<string, unknown> }>>();
  for (const row of rows) {
    const calibration = parseCalibration(row.calibration_params);
    const pk = legacyPk(calibration);
    if (pk == null || !calibration) continue;
    grouped.set(pk, [...(grouped.get(pk) ?? []), { row, calibration }]);
  }

  const ledger: LedgerRow[] = [];
  const updates: Array<{ row: SizeRow; calibration: Record<string, unknown>; canonical: SizeRow; legacyPk: number }> = [];

  for (const [pk, group] of grouped.entries()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => a.row.pk_manta_size_id - b.row.pk_manta_size_id);
    const canonical = sorted[0].row;
    for (const duplicate of sorted.slice(1)) {
      updates.push({ row: duplicate.row, calibration: duplicate.calibration, canonical, legacyPk: pk });
      ledger.push({
        legacy_pk_size_id: pk,
        canonical_pk_manta_size_id: canonical.pk_manta_size_id,
        duplicate_pk_manta_size_id: duplicate.row.pk_manta_size_id,
        fk_manta_id: duplicate.row.fk_manta_id ?? "",
        photo_code: duplicate.row.photo_code ?? "",
        status: apply ? "planned_update" : "dry_run",
        message: "Duplicate current manta_sizes row points to the same legacy __pkSizeID; excluded from means but raw imported fields are preserved.",
      });
    }
  }

  const changedAt = new Date().toISOString();
  const localLedgerPath = path.join(OUT_DIR, apply ? "apply_ledger.json" : "dry_run_ledger.json");

  if (apply) {
    let applied = 0;
    for (const update of updates) {
      const newCalibration = {
        ...update.calibration,
        include_in_mean: false,
        duplicate_legacy_import: true,
        duplicate_canonical_pk_manta_size_id: update.canonical.pk_manta_size_id,
        mean_exclusion_reason: `Duplicate app row for legacy __pkSizeID ${update.legacyPk}; canonical app row is ${update.canonical.pk_manta_size_id}.`,
      };

      const { error: auditError } = await supabase.from("data_change_audit").insert({
        changed_by: null,
        changed_by_email: null,
        actor_role: "service_role",
        source: "qc-script",
        action: "update",
        table_name: "manta_sizes",
        primary_key: String(update.row.pk_manta_size_id),
        record_label: `manta size ${update.row.pk_manta_size_id}`,
        reason,
        old_data: update.row,
        new_data: { calibration_params: JSON.stringify(newCalibration) },
        changed_fields: ["calibration_params"],
        metadata: {
          script: SCRIPT_NAME,
          legacy_pk_size_id: update.legacyPk,
          canonical_pk_manta_size_id: update.canonical.pk_manta_size_id,
        },
        local_ledger_path: localLedgerPath,
      });
      if (auditError) throw new Error(`Audit insert failed for size ${update.row.pk_manta_size_id}: ${auditError.message}`);

      const { error: updateError } = await supabase
        .from("manta_sizes")
        .update({ calibration_params: JSON.stringify(newCalibration) })
        .eq("pk_manta_size_id", update.row.pk_manta_size_id);
      if (updateError) throw new Error(`Update failed for size ${update.row.pk_manta_size_id}: ${updateError.message}`);

      applied += 1;
      if (applied % 100 === 0 || applied === updates.length) {
        console.log(`Applied ${applied}/${updates.length} duplicate legacy size import exclusions...`);
      }
    }
  }

  const summary = {
    changed_at: changedAt,
    apply,
    legacy_pk_groups: grouped.size,
    duplicate_legacy_pk_groups: [...grouped.values()].filter((group) => group.length > 1).length,
    duplicate_rows_to_exclude: updates.length,
    output_dir: OUT_DIR,
  };

  fs.writeFileSync(localLedgerPath, JSON.stringify({ summary, ledger }, null, 2));
  writeCsv(path.join(OUT_DIR, apply ? "apply_ledger.csv" : "dry_run_ledger.csv"), ledger);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
