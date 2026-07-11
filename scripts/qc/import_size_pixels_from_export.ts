import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { ensureOutputDir, getSupabaseClient, writeCsv } from "./qc_common";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

type SizeRow = {
  pk_manta_size_id: number;
  fk_manta_id: number | null;
  measurement_type: string | null;
  size_m: number | null;
  measured_on: string | null;
  photo_code: string | null;
  quality_note: string | null;
  calibration_params: unknown;
  src_file: string | null;
};

type LegacySizeRow = Record<string, unknown>;

type MatchLedgerRow = {
  pk_manta_size_id: number | string;
  fk_manta_id: number | string;
  photo_code: string;
  legacy_pk_size_id: number | string;
  status: string;
  usable: boolean | string;
  scale_px: number | string;
  dl_px: number | string;
  dw_px: number | string;
  dl_m: number | string;
  dw_m: number | string;
  measurement_basis: string;
  include_in_mean: boolean | string;
  message: string;
};

const OUT_DIR = path.resolve(process.cwd(), "scripts/qc/output/import_size_pixels_from_export");
const SCRIPT_NAME = "import_size_pixels_from_export";
const DEFAULT_FILE = "/Users/littlemac/Dropbox/Mac (2)/Downloads/Sizes_Exported.xlsx";
const LASER_SCALE_M = 0.6;
const LEGACY_DW_FROM_DL_SLOPE = 1.9038;
const LEGACY_DW_FROM_DL_INTERCEPT_M = 0.5324;

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
    force: args.includes("--force"),
    file: valueFor("--file") ?? DEFAULT_FILE,
    reason: valueFor("--reason") ?? "",
  };
}

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && value.trim() === "?") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stringOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  return text ? text : null;
}

function integerKey(value: unknown) {
  const n = numberOrNull(value);
  if (n == null) return null;
  return String(Math.round(n));
}

function joinKey(mantaId: unknown, frame: unknown) {
  const manta = integerKey(mantaId);
  const photo = integerKey(frame);
  return manta && photo ? `${manta}|${photo}` : null;
}

function parseExistingCalibration(value: unknown) {
  if (value == null || value === "") return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      } catch {
        // Preserve the raw value below.
      }
    }
    return { calibration_formula: value.replace(/\u000b/g, "\n") };
  }
  return { calibration_raw: value };
}

function calculatedMeters(measuredPx: number | null, scalePx: number | null) {
  return measuredPx != null && scalePx != null ? (measuredPx / scalePx) * LASER_SCALE_M : null;
}

function buildCalibrationPayload(current: SizeRow, legacy: LegacySizeRow) {
  const scalePx = numberOrNull(legacy["Scale Pixels"]);
  const dlPx = numberOrNull(legacy["DL pixels"]);
  const dwPx = numberOrNull(legacy["DW pixels"]);
  const scaleCorrectedPx = numberOrNull(legacy["Scale Corrected"]);
  const dlCorrectedPx = numberOrNull(legacy["DL Corrected"]);
  const dwCorrectedPx = numberOrNull(legacy["DW Corrected"]);
  const dlM = numberOrNull(legacy["DL Measured"]);
  const dwM = numberOrNull(legacy["DW Measured"]);
  const dwFromDl = numberOrNull(legacy["DW from DL"]);
  const calculatedDlM = calculatedMeters(dlCorrectedPx ?? dlPx, scaleCorrectedPx ?? scalePx);
  const calculatedDwM = calculatedMeters(dwCorrectedPx ?? dwPx, scaleCorrectedPx ?? scalePx);
  const calculatedDwFromDlM =
    calculatedDlM == null ? null : LEGACY_DW_FROM_DL_SLOPE * calculatedDlM + LEGACY_DW_FROM_DL_INTERCEPT_M;
  const hasDlDerivedMeasurement = scalePx != null && dlPx != null && (dlM != null || dwFromDl != null);
  const hasDirectDwMeasurement = scalePx != null && dwPx != null && dwM != null;
  const measurementBasis = hasDlDerivedMeasurement ? "dl" : hasDirectDwMeasurement ? "dw" : null;
  const usable = measurementBasis != null;
  const formula =
    stringOrNull(legacy["Lens Correction Equation"]) ??
    stringOrNull(legacy["D Sizes 2::Lens Correction Equation"]) ??
    null;

  return {
    ...parseExistingCalibration(current.calibration_params),
    calibration_formula: formula ?? parseExistingCalibration(current.calibration_params).calibration_formula ?? null,
    scale_distance_m: LASER_SCALE_M,
    dw_from_dl_formula: `DW = ${LEGACY_DW_FROM_DL_SLOPE} * DL + ${LEGACY_DW_FROM_DL_INTERCEPT_M}`,
    scale_px: scalePx,
    dl_px: dlPx,
    dw_px: dwPx,
    scale_corrected_px: scaleCorrectedPx,
    dl_corrected_px: dlCorrectedPx,
    dw_corrected_px: dwCorrectedPx,
    dl_m: dlM,
    dw_m: dwM,
    dw_from_dl_m: dwFromDl,
    calculated_dl_m: calculatedDlM,
    calculated_dw_m: calculatedDwM,
    calculated_dw_from_dl_m: calculatedDwFromDlM,
    dw_to_dl_ratio: numberOrNull(legacy["DW to DL Ratio"]),
    measurement_basis: measurementBasis,
    include_in_mean: usable,
    mean_exclusion_reason: null,
    usable,
    unusable_reason: usable
      ? null
      : "Required scale pixels plus a measured DL-derived or direct-DW output were not available in Sizes_Exported.xlsx.",
    legacy_size_export: {
      pk_size_id: numberOrNull(legacy["__pkSizeID"]),
      fk_size_id: numberOrNull(legacy["_fkSizeID"]),
      fk_catalog_id: numberOrNull(legacy["_fkCatalogID"]),
      fk_manta_id: numberOrNull(legacy["_fkMantaID"]),
      frame: numberOrNull(legacy["Frame"]),
      shot_type: stringOrNull(legacy["Shot Type"]),
      survey_date_raw: legacy["l_SurveyDate"] ?? null,
      imported_from: path.basename(DEFAULT_FILE),
    },
  };
}

function readLegacyRows(filePath: string) {
  const workbook = XLSX.readFile(filePath);
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error(`No sheets found in ${filePath}`);
  return XLSX.utils.sheet_to_json<LegacySizeRow>(workbook.Sheets[firstSheet], { defval: null });
}

async function main() {
  ensureOutputDir(OUT_DIR);
  const { apply, force, file, reason } = parseArgs();
  if (apply && !reason.trim()) throw new Error("--reason is required with --apply.");

  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase credentials were not available.");
  if (!fs.existsSync(file)) throw new Error(`Spreadsheet not found: ${file}`);

  const legacyRows = readLegacyRows(file);
  const legacyByKey = new Map<string, LegacySizeRow[]>();
  for (const row of legacyRows) {
    const key = joinKey(row["_fkMantaID"], row["Frame"]);
    if (!key) continue;
    legacyByKey.set(key, [...(legacyByKey.get(key) ?? []), row]);
  }

  const currentRows: SizeRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("manta_sizes")
      .select("*")
      .order("pk_manta_size_id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    currentRows.push(...((data ?? []) as SizeRow[]));
    if (!data || data.length < pageSize) break;
  }

  const ledger: MatchLedgerRow[] = [];
  const updates: Array<{ current: SizeRow; legacy: LegacySizeRow; payload: Record<string, unknown> }> = [];

  for (const current of currentRows) {
    const key = joinKey(current.fk_manta_id, current.photo_code);
    if (!key) {
      ledger.push({
        pk_manta_size_id: current.pk_manta_size_id,
        fk_manta_id: current.fk_manta_id ?? "",
        photo_code: current.photo_code ?? "",
        legacy_pk_size_id: "",
        status: "unmatched",
        usable: "",
        scale_px: "",
        dl_px: "",
        dw_px: "",
        dl_m: "",
        dw_m: "",
        measurement_basis: "",
        include_in_mean: "",
        message: "Current row does not have both fk_manta_id and photo_code.",
      });
      continue;
    }
    const matches = legacyByKey.get(key) ?? [];
    if (matches.length !== 1) {
      ledger.push({
        pk_manta_size_id: current.pk_manta_size_id,
        fk_manta_id: current.fk_manta_id ?? "",
        photo_code: current.photo_code ?? "",
        legacy_pk_size_id: matches.map((row) => integerKey(row["__pkSizeID"])).filter(Boolean).join("|"),
        status: matches.length === 0 ? "unmatched" : "ambiguous",
        usable: "",
        scale_px: "",
        dl_px: "",
        dw_px: "",
        dl_m: "",
        dw_m: "",
        measurement_basis: "",
        include_in_mean: "",
        message: matches.length === 0 ? "No spreadsheet row matched fk_manta_id + photo_code/frame." : "Multiple spreadsheet rows matched; skipped.",
      });
      continue;
    }

    const legacy = matches[0];
    const payload = buildCalibrationPayload(current, legacy);
    const existingCalibration = parseExistingCalibration(current.calibration_params);
    if (!force && existingCalibration.legacy_size_export) {
      ledger.push({
        pk_manta_size_id: current.pk_manta_size_id,
        fk_manta_id: current.fk_manta_id ?? "",
        photo_code: current.photo_code ?? "",
        legacy_pk_size_id: integerKey(legacy["__pkSizeID"]) ?? "",
        status: "already_enriched",
        usable: existingCalibration.usable === true,
        scale_px: numberOrNull(existingCalibration.scale_px) ?? "",
        dl_px: numberOrNull(existingCalibration.dl_px) ?? "",
        dw_px: numberOrNull(existingCalibration.dw_px) ?? "",
        dl_m: numberOrNull(existingCalibration.dl_m) ?? "",
        dw_m: numberOrNull(existingCalibration.dw_m) ?? "",
        measurement_basis: String(existingCalibration.measurement_basis ?? ""),
        include_in_mean: existingCalibration.include_in_mean === true,
        message: "Skipped because this existing manta_sizes row already has legacy size export calibration data.",
      });
      continue;
    }
    updates.push({ current, legacy, payload });
  }

  const mantaHasUsableDl = new Set(
    updates
      .filter((update) => update.payload.usable === true && update.payload.measurement_basis === "dl")
      .map((update) => String(update.current.fk_manta_id))
  );

  for (const update of updates) {
    const hasPreferredDl = mantaHasUsableDl.has(String(update.current.fk_manta_id));
    if (update.payload.usable === true && update.payload.measurement_basis === "dw" && hasPreferredDl) {
      update.payload.include_in_mean = false;
      update.payload.mean_exclusion_reason =
        "Direct DW measurement excluded from encounter mean because this manta has usable DL-derived measurements.";
    }
    ledger.push({
      pk_manta_size_id: update.current.pk_manta_size_id,
      fk_manta_id: update.current.fk_manta_id ?? "",
      photo_code: update.current.photo_code ?? "",
      legacy_pk_size_id: integerKey(update.legacy["__pkSizeID"]) ?? "",
      status: apply ? "planned_update" : "matched_dry_run",
      usable: update.payload.usable === true,
      scale_px: numberOrNull(update.legacy["Scale Pixels"]) ?? "",
      dl_px: numberOrNull(update.legacy["DL pixels"]) ?? "",
      dw_px: numberOrNull(update.legacy["DW pixels"]) ?? "",
      dl_m: numberOrNull(update.legacy["DL Measured"]) ?? "",
      dw_m: numberOrNull(update.legacy["DW Measured"]) ?? "",
      measurement_basis: String(update.payload.measurement_basis ?? ""),
      include_in_mean: update.payload.include_in_mean === true,
      message: update.payload.usable
        ? update.payload.mean_exclusion_reason
          ? String(update.payload.mean_exclusion_reason)
          : "Matched and usable."
        : String(update.payload.unusable_reason ?? "Matched but unusable."),
    });
  }

  const changedAt = new Date().toISOString();
  const localLedgerPath = path.join(OUT_DIR, apply ? "apply_ledger.json" : "dry_run_ledger.json");

  if (apply) {
    let appliedCount = 0;
    for (const update of updates) {
      const newCalibration = JSON.stringify(update.payload);
      const { error: auditError } = await supabase.from("data_change_audit").insert({
        changed_by: null,
        changed_by_email: null,
        actor_role: "service_role",
        source: "qc-script",
        action: "update",
        table_name: "manta_sizes",
        primary_key: String(update.current.pk_manta_size_id),
        record_label: `manta size ${update.current.pk_manta_size_id}`,
        reason,
        old_data: update.current,
        new_data: { calibration_params: newCalibration },
        changed_fields: ["calibration_params"],
        metadata: {
          script: SCRIPT_NAME,
          matched_by: "manta_sizes.fk_manta_id + manta_sizes.photo_code = Sizes_Exported._fkMantaID + Sizes_Exported.Frame",
          spreadsheet: file,
          legacy_pk_size_id: update.payload.legacy_size_export,
          usable: update.payload.usable,
        },
        local_ledger_path: localLedgerPath,
      });
      if (auditError) throw new Error(`Audit insert failed for size ${update.current.pk_manta_size_id}: ${auditError.message}`);

      const { error: updateError } = await supabase
        .from("manta_sizes")
        .update({ calibration_params: newCalibration })
        .eq("pk_manta_size_id", update.current.pk_manta_size_id);
      if (updateError) throw new Error(`Update failed for size ${update.current.pk_manta_size_id}: ${updateError.message}`);
      appliedCount += 1;
      if (appliedCount % 100 === 0 || appliedCount === updates.length) {
        console.log(`Applied ${appliedCount}/${updates.length} manta_sizes calibration updates...`);
      }
    }
  }

  const summary = {
    changed_at: changedAt,
    apply,
    force,
    spreadsheet: file,
    current_rows: currentRows.length,
    legacy_rows: legacyRows.length,
    matched_one_to_one: updates.length,
    matched_usable: updates.filter((row) => row.payload.usable).length,
    matched_unusable: updates.filter((row) => !row.payload.usable).length,
    matched_dl_derived: updates.filter((row) => row.payload.measurement_basis === "dl").length,
    matched_direct_dw: updates.filter((row) => row.payload.measurement_basis === "dw").length,
    included_in_mean: updates.filter((row) => row.payload.include_in_mean === true).length,
    excluded_direct_dw_with_dl_available: updates.filter((row) => row.payload.mean_exclusion_reason).length,
    unmatched: ledger.filter((row) => row.status === "unmatched").length,
    ambiguous: ledger.filter((row) => row.status === "ambiguous").length,
    already_enriched: ledger.filter((row) => row.status === "already_enriched").length,
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
