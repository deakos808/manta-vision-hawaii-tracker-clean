import assert from "node:assert/strict";
import { test } from "node:test";
import { File } from "node:buffer";
import { dragCrop, rotatedSize, uploadPreparedPair, uploadReeditedPhoto, meanDiscWidthMeters, type EditTransform } from "./photoPreparation";

test("expanded canvas contains all four corners, including quarter turns", () => {
  assert.deepEqual(rotatedSize(4032, 3024, 90), { width: 3024, height: 4032 });
  assert.deepEqual(rotatedSize(4032, 3024, 0), { width: 4032, height: 3024 });
  for (const degrees of [-179.3, -90, -32.7, 0, 57.3, 90, 180]) {
    const size = rotatedSize(4032, 3024, degrees), r = degrees * Math.PI / 180;
    for (const x of [-2016, 2016]) for (const y of [-1512, 1512]) {
      assert.ok(Math.abs(x * Math.cos(r) - y * Math.sin(r)) <= size.width / 2 + 1e-8);
      assert.ok(Math.abs(x * Math.sin(r) + y * Math.cos(r)) <= size.height / 2 + 1e-8);
    }
  }
});

test("crop resize/move stays integral, nonempty and bounded at every edge", () => {
  const crop = { x: 100, y: 200, width: 2000, height: 1600 };
  for (const handle of ["move", "n", "ne", "e", "se", "s", "sw", "w", "nw"] as const) {
    for (const delta of [-9999.8, -4.4, 0, 9.8, 9999.8]) {
      const box = dragCrop(crop, handle, delta, delta, 4000, 3000);
      assert.ok(Object.values(box).every(Number.isInteger));
      assert.ok(box.x >= 0 && box.y >= 0 && box.width >= 1 && box.height >= 1);
      assert.ok(box.x + box.width <= 4000 && box.y + box.height <= 3000);
    }
  }
});

test("display scaling changes pointer distances, never saved crop geometry", () => {
  const crop = { x: 100, y: 200, width: 2000, height: 1600 };
  const resized = [0.125, 0.25, 0.8, 1].map(fit => dragCrop(crop, "se", (80 * fit) / fit, (40 * fit) / fit, 4000, 3000));
  for (const actual of resized) assert.deepEqual(actual, { ...crop, width: 2080, height: 1640 });
});

const ids = Array.from({ length: 5 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`);
const editTransform: EditTransform = {
  version: "rotate-crop-v1", rotationDegrees: 0, originalWidth: 100, originalHeight: 100,
  exifOrientation: 1, rotatedWidth: 100, rotatedHeight: 100,
  crop: { x: 10, y: 10, width: 80, height: 80 }, outputWidth: 80, outputHeight: 80,
};
function fixture(failAt = 0) {
  const calls: { path: string; body: Blob; upsert: boolean }[] = [];
  const original = new File([new Uint8Array([1, 5, 8, 255])], "original.JPG", { type: "image/jpeg" });
  const input = { uploaderId: ids[0], sightingId: ids[1], mantaId: ids[2], photoId: ids[3], editId: ids[4], original: original as unknown as globalThis.File, prepared: new Blob(["derivative"]), editTransform };
  const bucket = {
    async upload(path: string, body: Blob, options: { upsert: false }) {
      calls.push({ path, body, upsert: options.upsert });
      return { error: calls.length === failAt ? new Error("Synthetic failure") : null };
    },
    getPublicUrl(path: string) { return { data: { publicUrl: `https://example.invalid/${path}` } }; },
  };
  return { calls, input, bucket };
}

test("one photo identity; untouched original first, prepared derivative second, immutable paths", async () => {
  const { calls, input, bucket } = fixture();
  const before = new Uint8Array(await input.original.arrayBuffer());
  const photo = await uploadPreparedPair(bucket, input);
  const base = `submissions/${ids.slice(0, 4).join("/")}`;
  assert.equal(calls.length, 2);
  assert.equal(calls[0].path, `${base}/original.jpg`);
  assert.equal(calls[1].path, `${base}/prepared-${ids[4]}.jpg`);
  assert.equal(calls[0].body, input.original);
  assert.equal(calls[1].body, input.prepared);
  assert.ok(calls.every(call => call.upsert === false));
  assert.deepEqual(new Uint8Array(await input.original.arrayBuffer()), before);
  assert.equal(photo.id, input.photoId);
  assert.equal(photo.storageBucket, "manta-images");
  assert.equal(photo.originalPath, calls[0].path);
  assert.equal(photo.path, calls[1].path);
  assert.equal(photo.editTransform, editTransform);
  assert.equal(photo.view, "other");
});

for (const failAt of [1, 2]) test(`upload ${failAt} failure returns no photo and reports possible orphan`, async () => {
  const { calls, input, bucket } = fixture(failAt);
  await assert.rejects(uploadPreparedPair(bucket, input), /No photo was added.*may remain in Storage/);
  assert.equal(calls.length, failAt);
});

test("missing authenticated identity fails before any Storage call", async () => {
  const { calls, input, bucket } = fixture();
  await assert.rejects(uploadPreparedPair(bucket, { ...input, uploaderId: "" }), /No files were uploaded/);
  assert.equal(calls.length, 0);
});


test("mean size uses valid DW from every view in metres, not DL", () => {
  const photos = [
    { view: "ventral", measure: { dlCm: 160, dwCm: 367 } },
    { view: "dorsal", measure: { dlCm: 100, dwCm: 233 } },
    { view: "other", measure: { dlCm: 200, dwCm: 450 } },
  ];
  assert.equal(meanDiscWidthMeters([photos[0]]), 3.67);
  assert.equal(meanDiscWidthMeters(photos), 3.5);
  assert.equal(meanDiscWidthMeters([{ measure: { dwCm: NaN } }, { measure: { dwCm: Infinity } }, { measure: { dwCm: 0 } }, { measure: { dwCm: -10 } }, {}]), null);
  assert.equal(meanDiscWidthMeters([...photos, { measure: { dwCm: NaN } }]), 3.5);
});

test("re-edit uploads only a fresh derivative and preserves source, UUID, flags and measurement", async () => {
  const { input, bucket, calls } = fixture();
  const original = await uploadPreparedPair(bucket, input);
  calls.length = 0;
  const photo = { ...original, view: "ventral", isBestVentral: true, isBestDorsal: false, measure: { dlCm: 160, dwCm: 367 } };
  const saved = structuredClone(photo);
  const newEdit = "22222222-2222-4222-8222-222222222222";
  const transform = { ...editTransform, rotationDegrees: 90 };
  const updated = await uploadReeditedPhoto(bucket, photo, input.prepared, transform, newEdit);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, photo.originalPath.replace(/original\.jpg$/, `prepared-${newEdit}.jpg`));
  assert.equal(calls[0].upsert, false);
  for (const field of ["id", "originalPath", "storageBucket", "view", "isBestVentral", "isBestDorsal", "measure"] as const) assert.deepEqual(updated[field], photo[field]);
  assert.notEqual(updated.path, photo.path);
  assert.equal(updated.editTransform, transform);
  assert.deepEqual(photo, saved);
});

test("re-edit legacy photo fails without inventing an original or uploading", async () => {
  const { input, bucket, calls } = fixture();
  await assert.rejects(uploadReeditedPhoto(bucket, { id: ids[3] }, input.prepared, editTransform, ids[4]), /No files were uploaded/);
  assert.equal(calls.length, 0);
});

test("failed derivative re-edit leaves existing photo intact", async () => {
  const { input, bucket } = fixture();
  const photo = await uploadPreparedPair(bucket, input);
  const saved = structuredClone(photo);
  const failed = fixture(1);
  await assert.rejects(uploadReeditedPhoto(failed.bucket, photo, input.prepared, editTransform, ids[4]), /existing photo is unchanged/);
  assert.deepEqual(photo, saved);
});
