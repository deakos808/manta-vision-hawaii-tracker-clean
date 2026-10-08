// Existing measurement representation: normalized image coordinates, two pairs.
export type MeasurementPoint = { x: number; y: number };
export type MeasurementStage = "scale" | "dl" | "complete";
export type MeasureResult = {
  scalePx: number; discPx: number; dlCm: number; dwCm: number;
  scaleCm: number; points: MeasurementPoint[];
};
export function measurementValues(points: MeasurementPoint[], width: number, height: number, scaleCm: number) {
  const distance = (a: MeasurementPoint, b: MeasurementPoint) => Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
  const scalePx = points.length >= 2 ? distance(points[0], points[1]) : 0;
  const discPx = points.length >= 4 ? distance(points[2], points[3]) : 0;
  return valuesFromDistances(scalePx, discPx, scaleCm);
}
export function valuesFromDistances(scalePx: number, discPx: number, scaleCm: number) {
  const cmPerPx = scalePx > 0 ? scaleCm / scalePx : 0;
  const dlCm = discPx > 0 ? discPx * cmPerPx : 0;
  return { scalePx, discPx, dlCm, dwCm: dlCm > 0 ? dlCm * 2.3 : 0 };
}
export function initialMeasurement(initial?: Partial<MeasureResult>) {
  const points = initial?.points?.map(point => ({ ...point })) ?? [];
  const hasSavedValues = (initial?.scalePx ?? 0) > 0 && (initial?.discPx ?? 0) > 0;
  return { points, scaleCm: initial?.scaleCm ?? 60, stage: (points.length === 4 || hasSavedValues ? "complete" : "scale") as MeasurementStage };
}
export function commitMeasurementStage(stage: MeasurementStage, points: MeasurementPoint[], scaleCm: number): MeasurementStage {
  const pair = stage === "scale" ? points.slice(0, 2) : points.slice(2, 4);
  const valid = Number.isFinite(scaleCm) && scaleCm > 0 && pair.length === 2
    && (pair[0].x !== pair[1].x || pair[0].y !== pair[1].y);
  if (!valid) return stage;
  return stage === "scale" ? "dl" : "complete";
}
// Reset has always cleared points while retaining the chosen reference size.
export function resetMeasurement(scaleCm: number) {
  return { points: [] as MeasurementPoint[], scaleCm, stage: "scale" as MeasurementStage };
}
