export const DW_FROM_DL_RATIO = 2.3;
export const LASER_SCALE_M = 0.6;
export const LEGACY_DW_FROM_DL_SLOPE = 1.9038;
export const LEGACY_DW_FROM_DL_INTERCEPT_M = 0.5324;

export type SizeMeasurementLike = Record<string, unknown> & {
  measurement_type?: string | null;
  size_m?: number | string | null;
  calibration_params?: unknown;
  photo_code?: string | number | null;
};

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function parseCalibrationParams(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
  return Array.isArray(value) ? null : value as Record<string, unknown>;
}

function calibrationNumber(row: SizeMeasurementLike, keys: string[]) {
  const params = parseCalibrationParams(row.calibration_params);
  if (!params) return null;
  for (const key of keys) {
    const value = params[key];
    const n = asNumber(value);
    if (n != null) return n;
  }
  return null;
}

export function legacySizeExport(row: SizeMeasurementLike) {
  const params = parseCalibrationParams(row.calibration_params);
  const legacy = params?.legacy_size_export;
  return legacy && typeof legacy === "object" && !Array.isArray(legacy) ? legacy as Record<string, unknown> : null;
}

export function hasLegacySizeExport(row: SizeMeasurementLike) {
  return legacySizeExport(row) != null;
}

export function isDuplicateLegacyImport(row: SizeMeasurementLike) {
  return parseCalibrationParams(row.calibration_params)?.duplicate_legacy_import === true;
}

export function legacySizeId(row: SizeMeasurementLike) {
  return asNumber(legacySizeExport(row)?.pk_size_id);
}

export function legacyShotType(row: SizeMeasurementLike) {
  const value = legacySizeExport(row)?.shot_type;
  return value == null || value === "" ? null : String(value);
}

export function normalizedShotType(row: SizeMeasurementLike) {
  const shot = String(legacyShotType(row) ?? "").trim().toLowerCase();
  if (["d", "dorsal"].includes(shot)) return "dorsal";
  if (["v", "ventral", "vert"].includes(shot)) return "ventral";
  if (["length", "l", "dl", "lv", "vl"].includes(shot)) return "length";
  if (["width", "w", "dw"].includes(shot)) return "width";
  return shot || null;
}

export function scaleCorrectedPx(row: SizeMeasurementLike) {
  return calibrationNumber(row, ["scale_corrected_px", "scaleCorrectedPx"]);
}

export function dlCorrectedPx(row: SizeMeasurementLike) {
  return calibrationNumber(row, ["dl_corrected_px", "dlCorrectedPx"]);
}

export function dwCorrectedPx(row: SizeMeasurementLike) {
  return calibrationNumber(row, ["dw_corrected_px", "dwCorrectedPx"]);
}

export function sizeMeasurementLabel(row: SizeMeasurementLike) {
  const basis = String(parseCalibrationParams(row.calibration_params)?.measurement_basis ?? "").trim().toLowerCase();
  if (basis === "dl") return "Independent DL";
  if (basis === "dw") return "Independent DW";
  const type = String(row.measurement_type ?? normalizedShotType(row) ?? "").trim().toLowerCase();
  if (["dw", "disc_width", "disc width", "width"].includes(type)) return "Independent DW";
  if (["dl", "disc_length", "disc length", "length"].includes(type)) return "Independent DL";
  return "Independent size";
}

export function isDiscLengthMeasurement(row: SizeMeasurementLike) {
  const type = String(row.measurement_type ?? "").trim().toLowerCase();
  return ["dl", "disc_length", "disc length", "length"].includes(type);
}

export function isDiscWidthMeasurement(row: SizeMeasurementLike) {
  const type = String(row.measurement_type ?? "").trim().toLowerCase();
  return ["dw", "disc_width", "disc width", "width"].includes(type);
}

export function scalePx(row: SizeMeasurementLike) {
  return calibrationNumber(row, ["scalePx", "scale_px", "scalePixels", "scale_pixels", "laserPx", "laser_px"]);
}

export function dlPx(row: SizeMeasurementLike) {
  return calibrationNumber(row, ["dlPx", "dl_px", "discPx", "disc_px", "discLengthPx", "disc_length_px", "objectPx", "object_px"]);
}

export function dwPx(row: SizeMeasurementLike) {
  return calibrationNumber(row, ["dwPx", "dw_px", "discWidthPx", "disc_width_px"]);
}

export function calculatedDlMFromPixels(row: SizeMeasurementLike) {
  const scale = scaleCorrectedPx(row) ?? scalePx(row);
  const length = dlCorrectedPx(row) ?? dlPx(row);
  return scale && length ? (length / scale) * LASER_SCALE_M : null;
}

export function calculatedDwMFromPixels(row: SizeMeasurementLike) {
  const scale = scaleCorrectedPx(row) ?? scalePx(row);
  const width = dwCorrectedPx(row) ?? dwPx(row);
  return scale && width ? (width / scale) * LASER_SCALE_M : null;
}

export function legacyDwFromDlM(dlMeters: number | null | undefined) {
  return dlMeters == null ? null : LEGACY_DW_FROM_DL_SLOPE * dlMeters + LEGACY_DW_FROM_DL_INTERCEPT_M;
}

export function calculatedDwFromDlM(row: SizeMeasurementLike) {
  return legacyDwFromDlM(calculatedDlMFromPixels(row));
}

export function dlM(row: SizeMeasurementLike) {
  const explicit = calibrationNumber(row, ["dlM", "dl_m", "discLengthM", "disc_length_m"]);
  if (explicit != null) return explicit;
  const params = parseCalibrationParams(row.calibration_params);
  if (params?.legacy_size_export || params?.usable === false) return null;
  const size = asNumber(row.size_m);
  if (size == null) return null;
  if (isDiscWidthMeasurement(row)) return size / DW_FROM_DL_RATIO;
  return size;
}

export function dwM(row: SizeMeasurementLike) {
  const params = parseCalibrationParams(row.calibration_params);
  const basis = String(params?.measurement_basis ?? "").trim().toLowerCase();
  const explicit =
    basis === "dl"
      ? calibrationNumber(row, ["dwFromDlM", "dw_from_dl_m", "dwM", "dw_m", "discWidthM", "disc_width_m"])
      : calibrationNumber(row, ["dwM", "dw_m", "dwFromDlM", "dw_from_dl_m", "discWidthM", "disc_width_m"]);
  if (explicit != null) return explicit;
  if (params?.legacy_size_export || params?.usable === false) return null;
  const size = asNumber(row.size_m);
  if (size == null) return null;
  if (isDiscWidthMeasurement(row)) return size;
  return size * DW_FROM_DL_RATIO;
}

export function dwDlRatio(row: SizeMeasurementLike) {
  const dl = dlM(row);
  const dw = dwM(row);
  return dl && dw ? dw / dl : null;
}

export function formatRatio(value: number | null | undefined, digits = 3) {
  return value == null ? "—" : value.toFixed(digits);
}

export function sizeMeasurementUsable(row: SizeMeasurementLike) {
  const params = parseCalibrationParams(row.calibration_params);
  if (!params || !("usable" in params)) return true;
  return params.usable !== false;
}

export function sizeMeasurementIncludedInMean(row: SizeMeasurementLike) {
  const params = parseCalibrationParams(row.calibration_params);
  if (!params?.legacy_size_export) return false;
  if (params?.usable === false) return false;
  if (params?.include_in_mean === false) return false;
  return true;
}

export function photoCodeId(row: SizeMeasurementLike) {
  const id = asNumber(row.photo_code);
  return id && id > 0 ? id : null;
}

export function formatPx(value: number | null | undefined) {
  return value == null ? "—" : value.toFixed(1);
}

export function formatMeters(value: number | null | undefined, digits = 3) {
  return value == null ? "—" : `${value.toFixed(digits)} m`;
}

export function formatCalibration(value: unknown) {
  if (value == null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replace(/\u000b/g, " ");
}
