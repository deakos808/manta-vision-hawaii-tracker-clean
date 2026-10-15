import type { MeasureResult } from "./measurement";

export type InAppMeasurement = Omit<MeasureResult, "points"> & { points?: MeasureResult["points"]; source?: "in_app" };
export type ExternalMeasurement = {
  source: "external";
  metric: "dw" | "dl";
  valueMeters: number | null; // null is an unfinished local entry, never persisted as evidence
  units: "m";
};
export type PhotoMeasurement = InAppMeasurement | ExternalMeasurement;
export type MeasuredPhoto = { measure?: PhotoMeasurement };
export function isExternal(measure?: PhotoMeasurement): measure is ExternalMeasurement {
  return measure?.source === "external";
}
export function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
export function photoMeasurementMeters(photo: MeasuredPhoto) {
  const m = photo.measure;
  if (!m) return {} as { dw?: number; dl?: number };
  if (isExternal(m)) return positive(m.valueMeters) && m.units === "m"
    ? { [m.metric]: m.valueMeters } as { dw?: number; dl?: number } : {};
  return { dw: positive(m.dwCm) ? m.dwCm / 100 : undefined, dl: positive(m.dlCm) ? m.dlCm / 100 : undefined };
}
export function measurementSummary(photos: MeasuredPhoto[]) {
  const values = photos.map(photoMeasurementMeters);
  const aggregate = (metric: "dw" | "dl") => {
    const valid = values.map(v => v[metric]).filter(positive);
    return { mean: valid.length ? valid.reduce((sum, v) => sum + v, 0) / valid.length : null, n: valid.length };
  };
  return { dw: aggregate("dw"), dl: aggregate("dl") };
}
// New payloads keep estimates independent. Legacy size is retained only as unknown-source history.
export function sizeSourcesForPayload(photos: MeasuredPhoto[], estimatedSize: string | null, legacySize: string | null) {
  return { estimatedSize, size: legacySize };
}
export function invalidExternalMeasurement(photo: MeasuredPhoto) {
  return isExternal(photo.measure) && photo.measure.valueMeters !== null && !positive(photo.measure.valueMeters);
}
// Blank external entry is not evidence. Preserve the independent designation.
export function measuredPhotoForPayload<T extends MeasuredPhoto>(photo: T): T {
  if (isExternal(photo.measure) && photo.measure.valueMeters === null) {
    const copy = { ...photo }; delete copy.measure; return copy;
  }
  return photo;
}
