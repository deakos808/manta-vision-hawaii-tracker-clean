import assert from "node:assert/strict";
import { test } from "node:test";
import { initialMeasurement, commitMeasurementStage, measurementValues, resetMeasurement, valuesFromDistances } from "./measurement";

const points = [{ x: .1, y: .1 }, { x: .3, y: .1 }, { x: .5, y: .2 }, { x: .5, y: .8 }];
test("placing both scale points does not advance; explicit commit advances to DL", () => {
  const state = initialMeasurement();
  state.points.push(...points.slice(0, 2));
  assert.equal(state.stage, "scale");
  assert.equal(commitMeasurementStage(state.stage, state.points, state.scaleCm), "dl");
  assert.equal(state.scaleCm, 60);
  assert.deepEqual(state.points, points.slice(0, 2));
});
test("each stage needs a nonzero pair and DL completes only on commit", () => {
  assert.equal(commitMeasurementStage("scale", points.slice(0, 1), 60), "scale");
  assert.equal(commitMeasurementStage("scale", [points[0], points[0]], 60), "scale");
  assert.equal(commitMeasurementStage("scale", points, 0), "scale");
  assert.equal(commitMeasurementStage("dl", points.slice(0, 3), 60), "dl");
  const stage = "dl";
  assert.equal(stage, "dl");
  assert.equal(commitMeasurementStage(stage, points, 60), "complete");
});
test("existing measurements restore normalized points and reference without modifying the input", () => {
  const input = { points, scaleCm: 75, ...measurementValues(points, 1000, 500, 75) };
  const restored = initialMeasurement(input);
  assert.equal(restored.stage, "complete");
  assert.equal(restored.scaleCm, 75);
  assert.deepEqual(restored.points, points);
  restored.points[0].x = .9;
  assert.equal(input.points[0].x, .1);
  const legacy = initialMeasurement({ scalePx: 100, discPx: 200, scaleCm: 60 });
  assert.equal(legacy.stage, "complete");
  assert.deepEqual(legacy.points, []); // never invent lost geometry
});
test("Reset clears both pairs but keeps the chosen reference scale", () => {
  assert.deepEqual(resetMeasurement(75), { points: [], stage: "scale", scaleCm: 75 });
});
test("DL uses disc/reference ratio, DW remains DL times 2.3, display scaling cancels", () => {
  for (const fit of [.25, 1, 2.5]) {
    const result = measurementValues(points, 1000 * fit, 500 * fit, 60);
    assert.ok(Math.abs(result.dlCm - 90) < 1e-10);
    assert.ok(Math.abs(result.dwCm - 207) < 1e-10);
  }
  assert.deepEqual(valuesFromDistances(120, 320, 60), { scalePx: 120, discPx: 320, dlCm: 160, dwCm: 368 });
});
