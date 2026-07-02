import fs from "fs";
import path from "path";
import { ensureOutputDir, getSupabaseClient, writeCsv } from "./qc_common";

type MantaRow = {
  pk_manta_id: number;
  name: string | null;
  fk_catalog_id: number | null;
  fk_sighting_id: number | null;
  catalog_unknown: boolean | null;
};

type LedgerRow = {
  changed_at: string;
  pk_manta_id: number;
  manta_name: string;
  fk_sighting_id: number | string;
  old_fk_catalog_id: number | string;
  new_fk_catalog_id: number | string;
  old_catalog_unknown: boolean | string;
  new_catalog_unknown: boolean;
  reason: string;
  status: string;
  message: string;
};

const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/manta_catalog_reviewed_unknowns_apply");
const SCRIPT_NAME = "apply_manta_catalog_reviewed_unknowns";
const CATALOG_REVIEW = [{ pk_manta_id: 3817, fk_catalog_id: 703 }];
const REVIEWED_UNKNOWN_IDS = [
  6675, 39316, 2582, 2978, 3168, 2451, 3152, 3169, 2924, 2976, 2417, 2432,
  2437, 2438, 2439, 2440, 2441, 2442, 2410, 2888, 2955, 2977, 2450,
];

function parseArgs() {
  const args = process.argv.slice(2);
  const reasonIndex = args.findIndex((arg) => arg === "--reason");
  const reasonEquals = args.find((arg) => arg.startsWith("--reason="));
  return {
    apply: args.includes("--apply"),
    reason: reasonEquals?.slice("--reason=".length) ?? (reasonIndex >= 0 ? args[reasonIndex + 1] : ""),
  };
}

async function fetchManta(pkMantaId: number) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const { data, error } = await supabase
    .from("mantas")
    .select("pk_manta_id,name,fk_catalog_id,fk_sighting_id,catalog_unknown")
    .eq("pk_manta_id", pkMantaId)
    .maybeSingle();

  if (error) {
    if (error.message.includes("catalog_unknown")) {
      throw new Error(
        "mantas.catalog_unknown is not available yet. Run supabase/migrations/20260521_210456_mantas_catalog_unknown.sql, then rerun this script.",
      );
    }
    throw new Error(`mantas ${pkMantaId}: ${error.message}`);
  }

  return data as MantaRow | null;
}

async function auditUpdate(args: {
  oldRow: MantaRow;
  newRow: MantaRow;
  reason: string;
  changedFields: string[];
  localLedgerPath: string;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const { error } = await supabase.from("data_change_audit").insert({
    changed_by: null,
    changed_by_email: null,
    actor_role: "service_role",
    source: "qc-script",
    action: "update",
    table_name: "mantas",
    primary_key: String(args.oldRow.pk_manta_id),
    record_label: `manta ${args.oldRow.pk_manta_id}`,
    reason: args.reason,
    old_data: args.oldRow,
    new_data: args.newRow,
    changed_fields: args.changedFields,
    metadata: {
      script: SCRIPT_NAME,
      reviewed_catalog_assignment: CATALOG_REVIEW,
      reviewed_unknown_ids: REVIEWED_UNKNOWN_IDS,
    },
    local_ledger_path: args.localLedgerPath,
  });

  if (error) throw new Error(`data_change_audit insert failed for manta ${args.oldRow.pk_manta_id}: ${error.message}`);
}

async function verifyCatalog(pkCatalogId: number) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const { data, error } = await supabase
    .from("catalog")
    .select("pk_catalog_id")
    .eq("pk_catalog_id", pkCatalogId)
    .maybeSingle();

  if (error) throw new Error(`catalog ${pkCatalogId}: ${error.message}`);
  if (!data) throw new Error(`Catalog ${pkCatalogId} was not found; refusing to update manta links.`);
}

function ledgerBase(manta: MantaRow, reason: string, changedAt: string) {
  return {
    changed_at: changedAt,
    pk_manta_id: manta.pk_manta_id,
    manta_name: manta.name ?? "",
    fk_sighting_id: manta.fk_sighting_id ?? "",
    old_fk_catalog_id: manta.fk_catalog_id ?? "",
    old_catalog_unknown: manta.catalog_unknown ?? "",
    reason,
  };
}

async function main() {
  ensureOutputDir(OUT_DIR);
  const { apply, reason } = parseArgs();
  if (apply && !reason.trim()) {
    throw new Error("--reason is required with --apply so audit entries explain why raw data changed.");
  }

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  await verifyCatalog(703);
  const changedAt = new Date().toISOString();
  const localLedgerPath = path.join(OUT_DIR, "apply_manta_catalog_reviewed_unknowns_change_ledger.json");
  const ledger: LedgerRow[] = [];

  for (const review of CATALOG_REVIEW) {
    const manta = await fetchManta(review.pk_manta_id);
    if (!manta) {
      ledger.push({
        changed_at: changedAt,
        pk_manta_id: review.pk_manta_id,
        manta_name: "",
        fk_sighting_id: "",
        old_fk_catalog_id: "",
        new_fk_catalog_id: review.fk_catalog_id,
        old_catalog_unknown: "",
        new_catalog_unknown: false,
        reason,
        status: "missing",
        message: "Manta row was not found.",
      });
      continue;
    }

    const next = { ...manta, fk_catalog_id: review.fk_catalog_id, catalog_unknown: false };
    const base = ledgerBase(manta, reason, changedAt);
    if (manta.fk_catalog_id === review.fk_catalog_id && manta.catalog_unknown !== true) {
      ledger.push({
        ...base,
        new_fk_catalog_id: review.fk_catalog_id,
        new_catalog_unknown: false,
        status: "skipped_already_linked",
        message: "Manta already has the reviewed catalog link.",
      });
      continue;
    }

    if (!apply) {
      ledger.push({
        ...base,
        new_fk_catalog_id: review.fk_catalog_id,
        new_catalog_unknown: false,
        status: "dry_run_ready",
        message: "Ready to set reviewed catalog link.",
      });
      continue;
    }

    await auditUpdate({
      oldRow: manta,
      newRow: next,
      reason,
      changedFields: ["fk_catalog_id", "catalog_unknown"],
      localLedgerPath,
    });

    const { error } = await supabase
      .from("mantas")
      .update({ fk_catalog_id: review.fk_catalog_id, catalog_unknown: false })
      .eq("pk_manta_id", review.pk_manta_id);

    ledger.push({
      ...base,
      new_fk_catalog_id: review.fk_catalog_id,
      new_catalog_unknown: false,
      status: error ? "blocked_after_audit" : "updated",
      message: error?.message ?? "Updated reviewed catalog link.",
    });
  }

  for (const pkMantaId of REVIEWED_UNKNOWN_IDS) {
    const manta = await fetchManta(pkMantaId);
    if (!manta) {
      ledger.push({
        changed_at: changedAt,
        pk_manta_id: pkMantaId,
        manta_name: "",
        fk_sighting_id: "",
        old_fk_catalog_id: "",
        new_fk_catalog_id: "",
        old_catalog_unknown: "",
        new_catalog_unknown: true,
        reason,
        status: "missing",
        message: "Manta row was not found.",
      });
      continue;
    }

    const base = ledgerBase(manta, reason, changedAt);
    if (manta.fk_catalog_id != null) {
      ledger.push({
        ...base,
        new_fk_catalog_id: manta.fk_catalog_id,
        new_catalog_unknown: manta.catalog_unknown === true,
        status: "skipped_catalog_present",
        message: "Manta already has a catalog link, so it was not marked unknown.",
      });
      continue;
    }
    if (manta.catalog_unknown === true) {
      ledger.push({
        ...base,
        new_fk_catalog_id: "",
        new_catalog_unknown: true,
        status: "skipped_already_unknown",
        message: "Manta was already marked catalog_unknown.",
      });
      continue;
    }

    const next = { ...manta, catalog_unknown: true };
    if (!apply) {
      ledger.push({
        ...base,
        new_fk_catalog_id: "",
        new_catalog_unknown: true,
        status: "dry_run_ready",
        message: "Ready to mark reviewed catalog unknown.",
      });
      continue;
    }

    await auditUpdate({
      oldRow: manta,
      newRow: next,
      reason,
      changedFields: ["catalog_unknown"],
      localLedgerPath,
    });

    const { error } = await supabase
      .from("mantas")
      .update({ catalog_unknown: true })
      .eq("pk_manta_id", pkMantaId)
      .is("fk_catalog_id", null);

    ledger.push({
      ...base,
      new_fk_catalog_id: "",
      new_catalog_unknown: true,
      status: error ? "blocked_after_audit" : "updated",
      message: error?.message ?? "Marked reviewed catalog unknown.",
    });
  }

  const summary = {
    checked_at: new Date().toISOString(),
    apply,
    reviewed_catalog_assignments: CATALOG_REVIEW.length,
    reviewed_unknowns: REVIEWED_UNKNOWN_IDS.length,
    dry_run_ready: ledger.filter((row) => row.status === "dry_run_ready").length,
    updated: ledger.filter((row) => row.status === "updated").length,
    skipped: ledger.filter((row) => row.status.startsWith("skipped")).length,
    missing: ledger.filter((row) => row.status === "missing").length,
    blocked_after_audit: ledger.filter((row) => row.status === "blocked_after_audit").length,
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "apply_manta_catalog_reviewed_unknowns_summary.json"),
    JSON.stringify(summary, null, 2),
  );
  fs.writeFileSync(localLedgerPath, JSON.stringify(ledger, null, 2));
  writeCsv(path.join(OUT_DIR, "apply_manta_catalog_reviewed_unknowns_change_ledger.csv"), ledger);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
