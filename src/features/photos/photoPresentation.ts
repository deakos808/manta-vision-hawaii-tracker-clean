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

export type InjuryModifier = "predation" | "entanglement";
export function invalidPhotoInjury(photo: { isInjury?: boolean | null; injuryModifiers?: unknown }) {
  const modifiers = photo.injuryModifiers;
  return modifiers != null && (!Array.isArray(modifiers)
    || modifiers.some(value => value !== "predation" && value !== "entanglement")
    || (photo.isInjury === false && modifiers.length > 0));
}

// Anatomical view and explicit Best designation are both required. Never substitute a first photo.
export function designatedBestPhoto<T extends { view?: string; photo_view?: string; photoView?: string; view_label?: string;
  isBestVentral?: boolean; isBestDorsal?: boolean; is_best_manta_ventral_photo?: boolean; is_best_manta_dorsal_photo?: boolean }>(photos: readonly T[] | undefined, view: "ventral" | "dorsal"): T | undefined {
  return photos?.find(photo => (photo.view ?? photo.photo_view ?? photo.photoView ?? photo.view_label) === view
    && (view === "ventral" ? photo.isBestVentral ?? photo.is_best_manta_ventral_photo : photo.isBestDorsal ?? photo.is_best_manta_dorsal_photo) === true);
}
