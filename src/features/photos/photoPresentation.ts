// Durable uploaded evidence must outrank browser-local previews from older sessions.
export function photoDisplaySource(photo: { url?: string | null; previewUrl?: string | null }): string | undefined {
  const durableUrl = photo.url?.trim();
  if (durableUrl && !durableUrl.startsWith("blob:")) return durableUrl;
  return photo.previewUrl || photo.url || undefined;
}

export function formatMantaSize(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const meters = n >= 10 ? n / 100 : n; // Preserve the existing summary unit convention.
  return meters.toFixed(2) + " m";
}
