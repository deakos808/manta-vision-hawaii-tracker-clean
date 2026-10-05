import exifr from 'exifr';
import { captureWallClock } from '../features/sightings/photoTimes';

export type BasicExif = {
  takenAt?: Date; // Compatibility for existing drone consumers only.
  captureDate?: string;
  captureTime?: string;
  lat?: number;
  lon?: number;
  orientation?: number;
};

// Safe EXIF reader for JPEG/HEIC when supported by the browser.
// - Prefers DateTimeOriginal; falls back to CreateDate.
// - Returns decimal degrees for GPS when present.
// - Never throws; returns {} on failure.
export async function readBasicExif(file: File): Promise<BasicExif> {
  try {
    // exifr.parse accepts Blob/File; gps:true maps latitude/longitude to decimals
    const meta = await exifr.parse(file, {
      gps: true,
      reviveValues: false,
      translateValues: false,
    });

    if (!meta) return {};

    const original = captureWallClock(meta.DateTimeOriginal);
    const capture = original.captureDate ? original : captureWallClock(meta.CreateDate);
    // Add Sighting uses these strings directly, never the compatibility Date.
    const takenAt = capture.captureDate && capture.captureTime
      ? new Date(`${capture.captureDate}T${capture.captureTime}`) : undefined;

    const lat = typeof (meta as any).latitude === 'number' ? (meta as any).latitude : undefined;
    const lon = typeof (meta as any).longitude === 'number' ? (meta as any).longitude : undefined;

    const orientation = Number.isInteger(meta.Orientation) && meta.Orientation >= 1 && meta.Orientation <= 8
      ? meta.Orientation as number : undefined;
    return { takenAt, ...capture, lat, lon, orientation };
  } catch {
    return {};
  }
}
