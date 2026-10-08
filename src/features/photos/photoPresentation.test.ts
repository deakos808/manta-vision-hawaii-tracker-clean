import { test } from "node:test";
import assert from "node:assert/strict";
import { photoDisplaySource, formatMantaSize } from "./photoPresentation";

test("hydrated photos prefer durable evidence over stale serialized blob previews", () => {
  const photo = { previewUrl: "blob:http://old-session/123", url: "https://example.com/photos/prepared.jpg" };
  assert.equal(photoDisplaySource(photo), photo.url);
  assert.equal(photo.previewUrl, "blob:http://old-session/123");
});
test("fresh local-only photos retain their preview", () => {
  assert.equal(photoDisplaySource({ previewUrl: "blob:http://current-session/123" }), "blob:http://current-session/123");
  assert.equal(photoDisplaySource({ url: "https://example.com/photo.jpg" }), "https://example.com/photo.jpg");
  assert.equal(photoDisplaySource({}), undefined);
});
test("missing or nonpositive sizes display a dash without changing data", () => {
  for (const value of [null, undefined, "", " ", 0, "0", -1, NaN, Infinity, "invalid"]) {
    assert.equal(formatMantaSize(value), "—");
  }
});
test("positive sizes retain existing formatting and unit convention", () => {
  assert.equal(formatMantaSize(5.86), "5.86 m");
  assert.equal(formatMantaSize("5.9"), "5.90 m");
  assert.equal(formatMantaSize(586), "5.86 m");
});
