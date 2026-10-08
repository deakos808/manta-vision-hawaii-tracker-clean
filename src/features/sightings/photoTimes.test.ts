import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { captureWallClock, photoTimeBounds, photoTimeUpdate, readSurveyType } from "./photoTimes";
import { readBasicExif } from "../../lib/exif";

const photo = (time: string, date = "2025-09-20") => ({ captureDate: date, captureTime: time });
test("EXIF wall-clock values preserve seconds without timezone arithmetic", () => {
  assert.deepEqual(captureWallClock("2025:09:20 11:11:31"), photo("11:11:31"));
  assert.deepEqual(captureWallClock("2025-09-20T11:11:31-10:00"), photo("11:11:31"));
  assert.deepEqual(captureWallClock("2025:02:30 11:11:31"), {});
  assert.deepEqual(captureWallClock("2025:09:20 25:11:31"), {});
});
const specimen = "/Users/littlemac/Downloads/MantaTracker_EXIF_Test_Photo_7475.jpg";
test("7475 original bytes yield exact capture date/time and no GPS", { skip: !existsSync(specimen) }, async () => {
  const meta = await readBasicExif(readFileSync(specimen) as unknown as File);
  assert.equal(meta.captureDate, "2025-09-20");
  assert.equal(meta.captureTime, "11:11:31");
  assert.equal(meta.lat, undefined);
  assert.equal(meta.lon, undefined);
  assert.equal(meta.orientation, 1);
});
test("one photo sets equal start/stop; legacy photos with no metadata are ignored", () => {
  const bounds = photoTimeBounds([{ photos: [{}, photo("11:11:31")] }]);
  assert.deepEqual(photoTimeUpdate("No", false, bounds), { date: "2025-09-20", start: "11:11:31", stop: "11:11:31" });
  assert.equal(photoTimeBounds([{ photos: [{}] }, {}]), null);
  assert.equal(readSurveyType(undefined), null);
});
test("all mantas contribute; adding and deleting boundary photos recomputes exact bounds", () => {
  const mantas = [{ photos: [photo("11:11:31"), photo("11:17:02")] }, { photos: [photo("11:42:15")] }];
  assert.equal(photoTimeBounds(mantas)?.stop, "11:42:15");
  mantas.push({ photos: [photo("11:47:05")] });
  assert.equal(photoTimeUpdate("No", false, photoTimeBounds(mantas))?.stop, "11:47:05");
  mantas[0].photos.shift();
  mantas.pop();
  const bounds = photoTimeBounds(mantas);
  assert.equal(bounds?.start, "11:17:02");
  assert.equal(bounds?.stop, "11:42:15");
  assert.deepEqual(photoTimeUpdate("No", false, null), { date: "", start: "", stop: "" });
});
test("reported effort is never overwritten, including deletion and multi-day photos", () => {
  for (const bounds of [null, photoTimeBounds([{ photos: [photo("11:11:31")] }])]) {
    assert.equal(photoTimeUpdate("Yes", false, bounds), null);
    assert.equal(photoTimeUpdate("No", true, bounds), null);
    assert.equal(photoTimeUpdate(null, false, bounds), null);
  }
});
test("multiple dates are flagged and never silently applied as one day", () => {
  const bounds = photoTimeBounds([{ photos: [photo("23:59:00"), photo("00:01:00", "2025-09-21")] }]);
  assert.equal(bounds?.multipleDates, true);
  assert.equal(photoTimeUpdate("No", false, bounds), null);
});
test("manual edits prevent overwrites, payloads retain existing survey type, GPS-less photos do not suggest location", () => {
  const page = readFileSync(new URL("../../pages/AddSightingPage.tsx", import.meta.url), "utf8");
  const edit = page.slice(page.indexOf("const editTime"), page.indexOf("useEffect", page.indexOf("const editTime")));
  assert.match(edit, /setTimesManuallyEdited\(true\)/);
  assert.equal((page.match(/type="time" step="1"/g) || []).length, 2);
  const payloads = [...page.matchAll(/const payload(?::any)? = \{([\s\S]*?)\n    \};/g)];
  for (const [, body] of payloads) assert.match(body, /standardize_survey/);
  assert.match(page, /typeof exif\?\.lat === "number" && typeof exif\?\.lon === "number"/);
  assert.match(page, /setStandardizeSurvey\(readSurveyType\(p.standardize_survey\)\)/);
  assert.match(page, /needsTimeReview/);
  assert.doesNotMatch(page, /timeBasis/);
  assert.match(page, /name="survey-type"/);
});
