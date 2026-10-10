import { mantaPhotoSource } from "./authenticatedPhotoUrl";
// Durable uploaded evidence must outrank browser-local previews from older sessions.
export function photoDisplaySource(photo: Parameters<typeof mantaPhotoSource>[0]): string | undefined {
  const durableUrl = mantaPhotoSource(photo)?.trim();
  if (durableUrl && !durableUrl.startsWith("blob:")) return durableUrl;
  return photo.previewUrl || photo.url || undefined;
}

export function formatMantaSize(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const meters = n >= 10 ? n / 100 : n; // Preserve the existing summary unit convention.
  return meters.toFixed(2) + " m";
}

export function photoForPayload<T extends { url?: string | null; previewUrl?: string | null }>(photo: T): Omit<T, 'previewUrl'> {
  const { previewUrl: _preview, ...durable } = photo;
  if (durable.url?.startsWith('blob:') || durable.url?.includes('/storage/v1/object/sign/')) delete durable.url;
  return durable;
}
