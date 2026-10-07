import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatLocationPoint, initialLocationPoint, locationPoint, locationChanged, mapLocationNames } from "./locationSelection";

test("existing coordinates win over named-location defaults, including zero", () => {
  const defaults = { latitude: 20.8, longitude: -156.6 };
  assert.deepEqual(initialLocationPoint("20.87055", "-156.68169", defaults), { lat: 20.87055, lon: -156.68169 });
  assert.deepEqual(initialLocationPoint("0", "0", defaults), { lat: 0, lon: 0 });
});
test("empty or invalid coordinates fall back to location defaults, otherwise no pin", () => {
  const defaults = { latitude: 20.8, longitude: -156.6 };
  assert.deepEqual(initialLocationPoint("", "", defaults), { lat: 20.8, lon: -156.6 });
  assert.deepEqual(initialLocationPoint("91", "-156", defaults), { lat: 20.8, lon: -156.6 });
  for (const pair of [["", ""], [null, null], ["NaN", "1"], ["20foo", "1"], [1, 181]]) {
    assert.equal(locationPoint(...pair as [unknown, unknown]), null);
  }
  assert.equal(initialLocationPoint("", ""), null);
});
test("save precision matches the existing five-decimal form", () => {
  assert.deepEqual(formatLocationPoint({ lat: 20.870554, lon: -156.681696 }), { lat: "20.87055", lng: "-156.68170" });
});
test("map draft changes do not commit; only Save calls the parent, Cancel and Close discard", () => {
  const modal = readFileSync(new URL("./LocationPickerModal.tsx", import.meta.url), "utf8");
  const pick = modal.slice(modal.indexOf("const pick ="), modal.indexOf("const formatted"));
  assert.match(pick, /setSelected\(point\)/);
  assert.doesNotMatch(pick, /onSave|onCancel/);
  assert.equal((modal.match(/onSave\(selected, mapLocationNames/g) || []).length, 1);
  assert.match(modal, /onClick=\{onCancel\}>Cancel/);
  assert.match(modal, /aria-label="Close"[^\n]*onClick=\{onCancel\}/);
  assert.match(modal, /disabled=\{!selected\}/);
  assert.ok(modal.includes("useRef({ ...initialLocation, point: initialPoint })"));
});
test("both map engines use aerial imagery, click and draggable markers without parent pan feedback", () => {
  const map = readFileSync(new URL("./TempSightingMap.tsx", import.meta.url), "utf8");
  assert.match(map, /World_Imagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}/);
  assert.match(map, /new maplibregl.Marker\(\{ color: "#1d4ed8", draggable: true \}\)/);
  assert.match(map, /marker.on\("drag"/);
  assert.match(map, /lfMarker.current.on\("drag"/);
  assert.equal((map.match(/map.on\("click"/g) || []).length, 2);
  assert.match(map, /style.cursor = "crosshair"/);
  assert.doesNotMatch(map, /easeTo|panTo/);
});
test("Save updates existing form state and source while named-location default paths remain", () => {
  const page = readFileSync(new URL("../../pages/AddSightingPage.tsx", import.meta.url), "utf8");
  const modal = page.slice(page.indexOf("{/* Map modal:"), page.indexOf("<Dialog", page.indexOf("{/* Map modal:")));
  assert.match(modal, /onCancel=\{\(\) => setMapOpen\(false\)\}/);
  assert.match(modal, /setLat\(saved.lat\)/);
  assert.match(modal, /setLng\(saved.lng\)/);
  assert.match(modal, /setCoordSource\("map picker"\)/);
  assert.match(page, /Location saved from map/);
  assert.match(page, /"location defaults"/);
  assert.match(page, /"earliest sighting"/);
});

test("unchanged and returned pins preserve the named location at five-decimal precision", () => {
  const start = { point: { lat: 21, lon: -156 }, locationId: "Honolua Bay", locationName: "Honolua Bay", coordSource: "location defaults" };
  assert.equal(locationChanged(start.point, { lat: 21.000001, lon: -156.000001 }), false);
  assert.deepEqual(mapLocationNames(start, { lat: 21, lon: -156 }), { locationId: "Honolua Bay", locationName: "Honolua Bay" });
  assert.equal(locationChanged(start.point, { lat: 21.001, lon: -156 }), true);
});

test("confirmed moved pins clear named location only; Custom remains unnamed", () => {
  const start = { point: { lat: 21, lon: -156 }, locationId: "Honolua Bay", locationName: "Honolua Bay", coordSource: "location defaults" };
  const before = structuredClone(start);
  const moved = { lat: 21.00956, lon: -156.65304 };
  assert.deepEqual(mapLocationNames(start, moved), { locationId: "", locationName: "" });
  assert.deepEqual(mapLocationNames({ ...start, locationId: "", locationName: "" }, moved), { locationId: "", locationName: "" });
  assert.deepEqual(start, before);
});

test("changed point waits for confirmation; Keep Editing and X never commit", () => {
  const modal = readFileSync(new URL("./LocationPickerModal.tsx", import.meta.url), "utf8");
  assert.ok(modal.includes("locationChanged(start.point, selected)) setConfirming(true); else commit()"));
  assert.match(modal, /onClick=\{\(\) => setConfirming\(false\)\}>Keep Editing/);
  assert.match(modal, /onClick=\{commit\}/);
  assert.match(modal, /onClick=\{onCancel\}/);
  assert.match(modal, /<div hidden=\{confirming\}>/);
});

test("Custom is a display-only option; save retains island and named choices still use defaults", () => {
  const page = readFileSync(new URL("../../pages/AddSightingPage.tsx", import.meta.url), "utf8");
  assert.ok(page.includes('value="__custom_coordinates__" disabled>Custom'));
  assert.ok(page.includes("setLocationId(names.locationId)"));
  assert.ok(page.includes("setLocationName(names.locationName)"));
  const save = page.slice(page.indexOf("onSave={(point, names)"), page.indexOf("<Dialog", page.indexOf("onSave={(point, names)")));
  assert.doesNotMatch(save, /setIsland|insert|update/);
  assert.match(page, /onChange=\{\(e\)=>\{ preserveLocationCoordinates.current = false; setLocationId\(e.target.value\); \}\}/);
  assert.match(page, /if\(preserveLocationCoordinates.current \|\| !locationId\) return/);
  assert.match(page, /if\(!cancelled && res\)/);
});
