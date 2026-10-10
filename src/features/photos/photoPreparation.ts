// Adapted from PhotoEditModal (ceddcf4) and the ROI pilot's canvas-pixel geometry.
export type Crop = { x: number; y: number; width: number; height: number };
export type EditTransform = {
  version: "rotate-crop-v1";
  // Clockwise degrees after EXIF orientation is normalized by the image decoder.
  rotationDegrees: number;
  // Dimensions of the EXIF-normalized source, before the user's rotation.
  originalWidth: number;
  originalHeight: number;
  exifOrientation: number;
  rotatedWidth: number;
  rotatedHeight: number;
  // Integer expanded-canvas pixels; display Fit is never part of this contract.
  crop: Crop;
  outputWidth: number;
  outputHeight: number;
};
export type CropHandle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
export const wrapAngle = (degrees: number) => ((degrees + 180) % 360 + 360) % 360 - 180;

export function rotatedSize(width: number, height: number, degrees: number) {
  const angle = degrees * Math.PI / 180;
  const sin = Math.abs(Math.sin(angle)), cos = Math.abs(Math.cos(angle));
  // Avoid an extra pixel at exact quarter turns from floating-point trig noise.
  return { width: Math.ceil(width * cos + height * sin - 1e-9), height: Math.ceil(width * sin + height * cos - 1e-9) };
}

export function dragCrop(crop: Crop, handle: CropHandle, dx: number, dy: number, width: number, height: number): Crop {
  dx = Math.round(dx); dy = Math.round(dy);
  if (handle === "move") return { ...crop, x: clamp(crop.x + dx, 0, width - crop.width), y: clamp(crop.y + dy, 0, height - crop.height) };
  let left = crop.x, top = crop.y, right = left + crop.width, bottom = top + crop.height;
  if (handle.includes("w")) left = clamp(left + dx, 0, right - 1);
  if (handle.includes("e")) right = clamp(right + dx, left + 1, width);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - 1);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + 1, height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

// Minimal injectable Storage surface: tests use memory-only fakes, never Supabase.
type PhotoBucket = {
  upload: (path: string, body: Blob, options: { upsert: false; contentType?: string; cacheControl: string }) => PromiseLike<{ error: unknown }>;
};
export async function uploadPreparedPair(bucket: PhotoBucket, input: {
  uploaderId: string; sightingId: string; mantaId: string; photoId: string; editId: string;
  original: File; prepared: Blob; editTransform: EditTransform;
}) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (![input.uploaderId, input.sightingId, input.mantaId, input.photoId, input.editId].every(id => uuid.test(id))) {
    throw new Error("A signed-in user and valid sighting, manta, and photo identities are required. No files were uploaded.");
  }
  const extension = input.original.name.split(".").pop()?.toLowerCase();
  if (!extension || !/^(jpg|jpeg|png|webp|heic|heif)$/.test(extension)) {
    throw new Error("Use a photo with a .jpg, .jpeg, .png, .webp, .heic or .heif extension. No files were uploaded.");
  }
  const base = `submissions/${input.uploaderId}/${input.sightingId}/${input.mantaId}/${input.photoId}`;
  const originalPath = `${base}/original.${extension}`;
  const path = `${base}/prepared-${input.editId}.jpg`;
  try {
    const source = await bucket.upload(originalPath, input.original, { upsert: false, cacheControl: "3600", contentType: input.original.type || undefined });
    if (source.error) throw new Error("Original upload failed");
    const derivative = await bucket.upload(path, input.prepared, { upsert: false, cacheControl: "3600", contentType: "image/jpeg" });
    if (derivative.error) throw new Error("Prepared upload failed");
  } catch {
    // A network failure may arrive after Storage accepted a file. Never overwrite/retry
    // this pair or delete objects here; reselecting creates a fresh logical photo UUID.
    throw new Error("Photo upload did not complete. No photo was added. One or both files may remain in Storage. Cancel this photo and choose it again to retry.");
  }
  return {
    id: input.photoId, name: input.original.name, path,
    view: "other" as const, storageBucket: "manta-images" as const,
    originalPath, editTransform: input.editTransform,
  };
}

// Measurement results are centimetres; the existing manta size field is metres.
export function meanDiscWidthMeters(photos: { measure?: { dwCm?: number } }[]): number | null {
  const values = photos.map(photo => photo.measure?.dwCm)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length / 100 : null;
}

export async function uploadReeditedPhoto<T extends {
  id: string; originalPath?: string; storageBucket?: string;
}>(bucket: PhotoBucket, photo: T, prepared: Blob, editTransform: EditTransform, editId: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const segments = photo.originalPath?.split("/") ?? [];
  if (photo.storageBucket !== "manta-images" || segments.length !== 6 || segments[0] !== "submissions"
      || !segments.slice(1, 5).every(value => uuid.test(value)) || segments[4] !== photo.id
      || !/^original\.(jpg|jpeg|png|webp|heic|heif)$/.test(segments[5]) || !uuid.test(editId)) {
    throw new Error("This photo has no supported original source path. No files were uploaded.");
  }
  const path = `${segments.slice(0, -1).join("/")}/prepared-${editId}.jpg`;
  try {
    const result = await bucket.upload(path, prepared, { upsert: false, cacheControl: "3600", contentType: "image/jpeg" });
    if (result.error) throw new Error("Upload failed");
  } catch {
    throw new Error("The new prepared photo could not be saved. The existing photo is unchanged. A new derivative may remain in Storage; cancel and reopen Edit Crop to retry.");
  }
  // Preserve identity, source, view, best flags, and measurement. Never delete the
  // superseded derivative: reference-aware cleanup belongs to a later task.
  return { ...photo, path, editTransform };
}
