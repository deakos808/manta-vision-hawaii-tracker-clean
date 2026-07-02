import fs from "fs";
import path from "path";
import { ensureOutputDir, getSupabaseClient, writeCsv } from "./qc_common";

type CsvRow = Record<string, string>;
type ApplyRow = {
  changed_at: string;
  pk_manta_id: number;
  manta_name: string;
  fk_sighting_id: number | string;
  old_fk_catalog_id: number | string;
  proposed_fk_catalog_id: number;
  proposed_catalog_name: string;
  source_csv_path: string;
  reviewer_decision: string;
  reviewer_note: string;
  reviewer_updated_at: string;
  reason: string;
  status: string;
  message: string;
};

const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/manta_catalog_link_apply");

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const prefix = `${name}=`;
    const inline = args.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : "";
  };
  return {
    csvPath: get("--csv") || "/Users/littlemac/Downloads/manta_catalog_link_review_2026-05-13.csv",
    apply: args.includes("--apply"),
  };
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function readCsv(filePath: string): CsvRow[] {
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function boolValue(value: string) {
  return ["true", "1", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function normalizeName(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function main() {
  ensureOutputDir(OUT_DIR);
  const { csvPath, apply } = parseArgs();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");

  const rows = readCsv(csvPath);
  const approved = rows
    .filter((row) => row.reviewer_decision === "approve_link")
    .map((row) => ({
      raw: row,
      pk_manta_id: numberValue(row.pk_manta_id),
      proposed_fk_catalog_id: numberValue(row.proposed_fk_catalog_id),
    }))
    .filter((row): row is { raw: CsvRow; pk_manta_id: number; proposed_fk_catalog_id: number } =>
      row.pk_manta_id != null && row.proposed_fk_catalog_id != null,
    );

  const results: ApplyRow[] = [];
  const changedAt = new Date().toISOString();

  for (const row of approved) {
    const { data: manta, error: mantaError } = await supabase
      .from("mantas")
      .select("pk_manta_id,fk_catalog_id,fk_sighting_id,name,is_mprf")
      .eq("pk_manta_id", row.pk_manta_id)
      .maybeSingle();

    if (mantaError || !manta) {
      results.push({
        changed_at: changedAt,
        pk_manta_id: row.pk_manta_id,
        manta_name: row.raw.manta_name ?? "",
        fk_sighting_id: row.raw.fk_sighting_id ?? "",
        old_fk_catalog_id: "",
        proposed_fk_catalog_id: row.proposed_fk_catalog_id,
        proposed_catalog_name: row.raw.proposed_catalog_name ?? "",
        source_csv_path: csvPath,
        reviewer_decision: "approve_link",
        reviewer_note: row.raw.reviewer_note ?? "",
        reviewer_updated_at: row.raw.reviewer_updated_at ?? "",
        reason: "Reviewer approved catalog backfill from linked photo catalog ID.",
        status: "blocked",
        message: mantaError?.message ?? "Manta row was not found.",
      });
      continue;
    }

    if (manta.fk_catalog_id != null && Number(manta.fk_catalog_id) !== row.proposed_fk_catalog_id) {
      results.push({
        changed_at: changedAt,
        pk_manta_id: row.pk_manta_id,
        manta_name: String(manta.name ?? row.raw.manta_name ?? ""),
        fk_sighting_id: Number(manta.fk_sighting_id ?? row.raw.fk_sighting_id) || row.raw.fk_sighting_id || "",
        old_fk_catalog_id: Number(manta.fk_catalog_id),
        proposed_fk_catalog_id: row.proposed_fk_catalog_id,
        proposed_catalog_name: row.raw.proposed_catalog_name ?? "",
        source_csv_path: csvPath,
        reviewer_decision: "approve_link",
        reviewer_note: row.raw.reviewer_note ?? "",
        reviewer_updated_at: row.raw.reviewer_updated_at ?? "",
        reason: "Reviewer approved catalog backfill from linked photo catalog ID.",
        status: "blocked",
        message: `Manta already has fk_catalog_id ${manta.fk_catalog_id}.`,
      });
      continue;
    }

    const { data: catalog, error: catalogError } = await supabase
      .from("catalog")
      .select("pk_catalog_id,name")
      .eq("pk_catalog_id", row.proposed_fk_catalog_id)
      .maybeSingle();

    if (catalogError || !catalog) {
      results.push({
        changed_at: changedAt,
        pk_manta_id: row.pk_manta_id,
        manta_name: String(manta.name ?? row.raw.manta_name ?? ""),
        fk_sighting_id: Number(manta.fk_sighting_id ?? row.raw.fk_sighting_id) || row.raw.fk_sighting_id || "",
        old_fk_catalog_id: manta.fk_catalog_id == null ? "" : Number(manta.fk_catalog_id),
        proposed_fk_catalog_id: row.proposed_fk_catalog_id,
        proposed_catalog_name: row.raw.proposed_catalog_name ?? "",
        source_csv_path: csvPath,
        reviewer_decision: "approve_link",
        reviewer_note: row.raw.reviewer_note ?? "",
        reviewer_updated_at: row.raw.reviewer_updated_at ?? "",
        reason: "Reviewer approved catalog backfill from linked photo catalog ID.",
        status: "blocked",
        message: catalogError?.message ?? "Proposed catalog row was not found.",
      });
      continue;
    }

    const { data: photos, error: photosError } = await supabase
      .from("photos")
      .select("pk_photo_id,fk_catalog_id")
      .eq("fk_manta_id", row.pk_manta_id);

    if (photosError) {
      results.push({
        changed_at: changedAt,
        pk_manta_id: row.pk_manta_id,
        manta_name: String(manta.name ?? row.raw.manta_name ?? ""),
        fk_sighting_id: Number(manta.fk_sighting_id ?? row.raw.fk_sighting_id) || row.raw.fk_sighting_id || "",
        old_fk_catalog_id: manta.fk_catalog_id == null ? "" : Number(manta.fk_catalog_id),
        proposed_fk_catalog_id: row.proposed_fk_catalog_id,
        proposed_catalog_name: String(catalog.name ?? row.raw.proposed_catalog_name ?? ""),
        source_csv_path: csvPath,
        reviewer_decision: "approve_link",
        reviewer_note: row.raw.reviewer_note ?? "",
        reviewer_updated_at: row.raw.reviewer_updated_at ?? "",
        reason: "Reviewer approved catalog backfill from linked photo catalog ID.",
        status: "blocked",
        message: photosError.message,
      });
      continue;
    }

    const photoCatalogIds = Array.from(
      new Set((photos ?? []).map((photo) => photo.fk_catalog_id).filter((value) => value != null).map(Number)),
    );
    const noLinkedPhotos = (photos ?? []).length === 0;
    const isMprfNoPhotoNameCandidate =
      noLinkedPhotos &&
      manta.is_mprf === true &&
      boolValue(row.raw.is_mprf) &&
      Number(row.raw.photo_count || 0) === 0 &&
      normalizeName(manta.name) !== "" &&
      normalizeName(manta.name) === normalizeName(catalog.name);

    if (!isMprfNoPhotoNameCandidate && (photoCatalogIds.length !== 1 || photoCatalogIds[0] !== row.proposed_fk_catalog_id)) {
      results.push({
        changed_at: changedAt,
        pk_manta_id: row.pk_manta_id,
        manta_name: String(manta.name ?? row.raw.manta_name ?? ""),
        fk_sighting_id: Number(manta.fk_sighting_id ?? row.raw.fk_sighting_id) || row.raw.fk_sighting_id || "",
        old_fk_catalog_id: manta.fk_catalog_id == null ? "" : Number(manta.fk_catalog_id),
        proposed_fk_catalog_id: row.proposed_fk_catalog_id,
        proposed_catalog_name: String(catalog.name ?? row.raw.proposed_catalog_name ?? ""),
        source_csv_path: csvPath,
        reviewer_decision: "approve_link",
        reviewer_note: row.raw.reviewer_note ?? "",
        reviewer_updated_at: row.raw.reviewer_updated_at ?? "",
        reason: "Reviewer approved catalog backfill from linked photo catalog ID.",
        status: "blocked",
        message: `Linked photos do not agree on proposed catalog. Photo catalog IDs: ${photoCatalogIds.join("|") || "none"}.`,
      });
      continue;
    }

    const reason = isMprfNoPhotoNameCandidate
      ? "Reviewer approved catalog backfill from same-name MPRF import row with zero linked photos."
      : "Reviewer approved catalog backfill from linked photo catalog ID.";
    const readyMessage = isMprfNoPhotoNameCandidate
      ? "Ready to set mantas.fk_catalog_id from same-name MPRF catalog candidate with zero linked photos."
      : "Ready to set mantas.fk_catalog_id from linked photo catalog ID.";
    const updatedMessage = isMprfNoPhotoNameCandidate
      ? "Updated mantas.fk_catalog_id from same-name MPRF catalog candidate."
      : "Updated mantas.fk_catalog_id.";

    if (!apply) {
      results.push({
        changed_at: changedAt,
        pk_manta_id: row.pk_manta_id,
        manta_name: String(manta.name ?? row.raw.manta_name ?? ""),
        fk_sighting_id: Number(manta.fk_sighting_id ?? row.raw.fk_sighting_id) || row.raw.fk_sighting_id || "",
        old_fk_catalog_id: manta.fk_catalog_id == null ? "" : Number(manta.fk_catalog_id),
        proposed_fk_catalog_id: row.proposed_fk_catalog_id,
        proposed_catalog_name: String(catalog.name ?? row.raw.proposed_catalog_name ?? ""),
        source_csv_path: csvPath,
        reviewer_decision: "approve_link",
        reviewer_note: row.raw.reviewer_note ?? "",
        reviewer_updated_at: row.raw.reviewer_updated_at ?? "",
        reason,
        status: "dry_run_ready",
        message: readyMessage,
      });
      continue;
    }

    const { error: updateError } = await supabase
      .from("mantas")
      .update({ fk_catalog_id: row.proposed_fk_catalog_id })
      .eq("pk_manta_id", row.pk_manta_id)
      .is("fk_catalog_id", null);

    results.push({
      changed_at: changedAt,
      pk_manta_id: row.pk_manta_id,
      manta_name: String(manta.name ?? row.raw.manta_name ?? ""),
      fk_sighting_id: Number(manta.fk_sighting_id ?? row.raw.fk_sighting_id) || row.raw.fk_sighting_id || "",
      old_fk_catalog_id: manta.fk_catalog_id == null ? "" : Number(manta.fk_catalog_id),
      proposed_fk_catalog_id: row.proposed_fk_catalog_id,
      proposed_catalog_name: String(catalog.name ?? row.raw.proposed_catalog_name ?? ""),
      source_csv_path: csvPath,
      reviewer_decision: "approve_link",
      reviewer_note: row.raw.reviewer_note ?? "",
      reviewer_updated_at: row.raw.reviewer_updated_at ?? "",
      reason,
      status: updateError ? "blocked" : "updated",
      message: updateError?.message ?? updatedMessage,
    });
  }

  const summary = {
    checked_at: new Date().toISOString(),
    csv_path: csvPath,
    apply,
    csv_rows: rows.length,
    approved_rows: approved.length,
    ready_or_updated: results.filter((row) => row.status === "dry_run_ready" || row.status === "updated").length,
    blocked: results.filter((row) => row.status === "blocked").length,
    skipped_non_approved: rows.filter((row) => row.reviewer_decision !== "approve_link").length,
  };

  fs.writeFileSync(path.join(OUT_DIR, "apply_manta_catalog_link_review_summary.json"), JSON.stringify(summary, null, 2));
  writeCsv(path.join(OUT_DIR, "apply_manta_catalog_link_review_results.csv"), results);
  fs.writeFileSync(
    path.join(OUT_DIR, "apply_manta_catalog_link_review_change_ledger.json"),
    JSON.stringify(results, null, 2),
  );
  writeCsv(path.join(OUT_DIR, "apply_manta_catalog_link_review_change_ledger.csv"), results);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
