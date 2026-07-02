import { supabase } from "@/lib/supabase";

function isLoadableUrl(value: string) {
  return /^(https?:|data:)/i.test(value);
}

function isBlobUrl(value: string) {
  return /^blob:/i.test(value);
}

function publicUrlFromStoragePath(value: string, fallbackBucket = "temp-images") {
  const raw = value.trim();
  if (!raw) return "";
  if (isLoadableUrl(raw)) return raw;

  const normalized = raw.replace(/^\/+/, "");
  const bucketMatch = normalized.match(/^([^/]+)\/(.+)$/);
  const knownBuckets = new Set(["temp-images", "manta-images", "contractor-docs"]);

  if (bucketMatch && knownBuckets.has(bucketMatch[1])) {
    return supabase.storage.from(bucketMatch[1]).getPublicUrl(bucketMatch[2]).data.publicUrl;
  }

  return supabase.storage.from(fallbackBucket).getPublicUrl(normalized).data.publicUrl;
}

export function resolvePhotoUrl(photo: any, fallbackBucket = "temp-images") {
  const durableCandidates = [
    photo?.url,
    photo?.public_url,
    photo?.storage_url,
    photo?.thumbnail_url,
    photo?.storage_path,
    photo?.path,
  ];

  for (const candidate of durableCandidates) {
    if (typeof candidate !== "string") continue;
    const resolved = publicUrlFromStoragePath(candidate, fallbackBucket);
    if (resolved) return resolved;
  }

  const blobCandidates = [photo?.previewUrl, photo?.preview_url];
  for (const candidate of blobCandidates) {
    if (typeof candidate === "string" && isBlobUrl(candidate.trim())) return candidate.trim();
  }

  return "";
}
