export type CaptureTime = { captureDate?: string; captureTime?: string };
export type SurveyType = "Yes" | "No" | null;

export function captureWallClock(value: unknown): CaptureTime {
  if (typeof value !== "string") return {};
  const match = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:$|[.Z+-])/.exec(value.trim());
  if (!match) return {};
  const [, y, m, d, h, min, sec] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59) return {};
  return { captureDate: `${y}-${m}-${d}`, captureTime: `${h}:${min}:${sec}` };
}

export function photoTimeBounds(mantas: { photos?: CaptureTime[] }[]) {
  const stamps = mantas.flatMap(manta => (manta.photos ?? []).flatMap(photo => {
    const capture = captureWallClock(`${photo.captureDate} ${photo.captureTime}`);
    return capture.captureDate ? [`${capture.captureDate}T${capture.captureTime}`] : [];
  })).sort();
  if (!stamps.length) return null;
  const start = stamps[0], stop = stamps[stamps.length - 1];
  return { date: start.slice(0, 10), start: start.slice(11), stop: stop.slice(11),
    first: start, last: stop, multipleDates: start.slice(0, 10) !== stop.slice(0, 10) };
}

export function readSurveyType(value: unknown): SurveyType {
  return value === "Yes" || value === "No" ? value : null;
}

// Manual edits and systematic/unspecified surveys always retain effort times.
export function photoTimeUpdate(surveyType: SurveyType, manuallyEdited: boolean, bounds: ReturnType<typeof photoTimeBounds>) {
  if (surveyType !== "No" || manuallyEdited || bounds?.multipleDates) return null;
  return bounds ? { date: bounds.date, start: bounds.start, stop: bounds.stop } : { date: "", start: "", stop: "" };
}
