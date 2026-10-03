import assert from "node:assert/strict";
import test from "node:test";
import {
  hasOrganicBiopsies,
  newOrganicBiopsy,
  validateOrganicBiopsy,
} from "./organicBiopsy";

test("a sighting remains unchanged when no biopsy is selected", () => {
  assert.equal(hasOrganicBiopsies([{ biopsy: null }, {}]), false);
  assert.equal(validateOrganicBiopsy(null), null);
});

test("supported biopsy fields validate without legacy-only columns", () => {
  const biopsy = {
    ...newOrganicBiopsy("2026-10-01"),
    sampleTime: "09:30",
    collector: "Synthetic Collector",
    method: "remote biopsy",
    tissueType: "skin",
    sampleId: "SYNTHETIC-1",
    labId: "LAB-SYNTHETIC-1",
    notes: "Fabricated test record",
  };
  assert.equal(validateOrganicBiopsy(biopsy), null);
  assert.equal(hasOrganicBiopsies([{ biopsy }, {}]), true);
  for (const legacyField of [
    "sample_time_utc",
    "latitude",
    "longitude",
    "storage_vial_id",
    "lab_tracking_id",
  ]) {
    assert.equal(Object.hasOwn(biopsy, legacyField), false);
  }
});

test("required scientific fields fail closed", () => {
  const base = newOrganicBiopsy("2026-10-01");
  assert.equal(validateOrganicBiopsy(base), "Collector is required.");
  assert.equal(
    validateOrganicBiopsy({ ...base, collector: "A", method: "B", tissueType: "C", sampleDate: "" }),
    "Sample date is required.",
  );
});
