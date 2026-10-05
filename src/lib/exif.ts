import * as exifr from 'exifr';

export type BasicExif = {
  takenAt?: Date;
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
      translateValues: false,
    });

    if (!meta) return {};

    const takenAt =
      (meta as any).DateTimeOriginal instanceof Date
        ? (meta as any).DateTimeOriginal as Date
        : (meta as any).CreateDate instanceof Date
          ? (meta as any).CreateDate as Date
          : undefined;

    const lat = typeof (meta as any).latitude === 'number' ? (meta as any).latitude : undefined;
    const lon = typeof (meta as any).longitude === 'number' ? (meta as any).longitude : undefined;

    const orientation = Number.isInteger(meta.Orientation) && meta.Orientation >= 1 && meta.Orientation <= 8
      ? meta.Orientation as number : undefined;
    return { takenAt, lat, lon, orientation };
  } catch {
    return {};
  }
}
