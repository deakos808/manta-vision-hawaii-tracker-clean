import type { SupabaseClient } from '@supabase/supabase-js';

// Display-time reader: never serialize its result into a photo payload.
// Durable identity is bucket + path. Returned signed URLs are display-only:
// never save them in submissions/photos/catalog, and refresh on expiry in the
// consuming query/view. No cache, persistent URL state, or public fallback here.
export const PHOTO_URL_LIFETIME_SECONDS = 300;
export type PhotoStorageReference = { bucket: string; path: string };

export function photoStorageReference(
  reference: Readonly<PhotoStorageReference>, projectUrl: string,
): PhotoStorageReference {
  let { bucket, path } = reference;
  const projectOrigin = new URL(projectUrl).origin;
  if (/^https?:\/\//i.test(path)) {
    const url = new URL(path);
    if (url.origin !== projectOrigin || url.username || url.password) {
      throw new Error('Photo URL is not in the configured Storage project');
    }
    // Only historical public URLs are canonicalizable. Signed URLs must never
    // become metadata. Ignore old public display query strings (e.g. cache bust).
    if (!url.pathname.startsWith('/storage/v1/object/public/')) {
      throw new Error('Photo URL is not a historical public Storage URL');
    }
    path = url.pathname;
  } else if (path.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
    throw new Error('Photo requires a durable Storage reference');
  }
  path = path.replace(/^\//, '').replace(/^browse\//, '');
  const endpoint = path.match(/^storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (endpoint) {
    if (endpoint[1] !== bucket) throw new Error('Photo bucket does not match its reference');
    path = decodeURIComponent(endpoint[2]);
  } else if (path.startsWith('storage/')) {
    throw new Error('Photo requires a public legacy URL or a bucket-relative path');
  } else if (path.startsWith(`${bucket}/`)) {
    path = path.slice(bucket.length + 1);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(bucket) || !path ||
      /[\\?#\x00-\x1f]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) {
    throw new Error('Invalid photo Storage reference');
  }
  return { bucket, path };
}

export async function authenticatedPhotoUrl(
  client: Pick<SupabaseClient, 'auth' | 'storage'>,
  reference: Readonly<PhotoStorageReference>, projectUrl: string,
): Promise<string> {
  const { bucket, path } = photoStorageReference(reference, projectUrl);
  const user = await client.auth.getUser();
  if (user.error || !user.data.user) throw new Error('Sign in to view this photo');
  // The caller session and Storage SELECT RLS authorize signing. This helper is
  // not an authorization boundary; bucket policies must enforce active access.
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, PHOTO_URL_LIFETIME_SECONDS);
  if (error || !data?.signedUrl) throw new Error('Photo is unavailable');
  return data.signedUrl;
}

const PRIVATE_PHOTO_BUCKETS = ['manta-images', 'temp-images', 'drone-photo'];

// Durable render input, resolved only by the image reader. Never a signed URL.
export function mantaPhotoSource(photo: { path?: string | null; storage_path?: string | null; storageBucket?: string | null; storage_bucket?: string | null; url?: string | null; thumbnail_url?: string | null; previewUrl?: string | null }): string | undefined {
  const path = photo.path || photo.storage_path;
  const bucket = photo.storageBucket || photo.storage_bucket;
  if (path && (PRIVATE_PHOTO_BUCKETS.includes(bucket || '') || photo.storage_path || /^(photos|submissions)\//.test(path))) {
    // A legacy full URL carries its own bucket, even when the row's bucket is stale.
    return /^https?:\/\//i.test(path) || PRIVATE_PHOTO_BUCKETS.some(b => path.startsWith(`${b}/`))
      ? path : `${bucket || 'manta-images'}/${path}`;
  }
  return photo.url || photo.thumbnail_url || photo.previewUrl || (path ? `manta-images/${path}` : undefined);
}
export function mantaDisplayReference(src: string | null | undefined, projectUrl: string): PhotoStorageReference | null {
  if (!src || src.startsWith('blob:') || src.startsWith('data:') || src.startsWith('/assets/') || src.endsWith('.svg')) return null;
  const embeddedBucket = src.match(/\/storage\/v1\/object\/public\/([^/]+)\//)?.[1]
    || src.match(/^(?:\/?browse\/)?\/?([^/]+)\//)?.[1];
  const bucket = PRIVATE_PHOTO_BUCKETS.includes(embeddedBucket || '') ? embeddedBucket!
    : /^(?:\/?browse\/)?(?:photos|submissions)\//.test(src) ? 'manta-images' : null;
  if (!bucket) return null;
  return photoStorageReference({bucket, path: src}, projectUrl);
}

// Do not hand a stale cached URL to a newly mounted/lazy image while React Query
// refreshes it. A failed expired request can permanently latch caller fallbacks.
export function freshSignedPhotoUrl(url: string | undefined, updatedAt: number, now = Date.now()): string | undefined {
  return url && now - updatedAt < (PHOTO_URL_LIFETIME_SECONDS - 60) * 1000 ? url : undefined;
}
