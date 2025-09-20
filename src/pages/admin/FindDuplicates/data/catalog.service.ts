// Single source of truth for the Finding Duplicates page.
//
// Exports kept for backward-compat with your UI:
// - getCatalogById
// - searchCatalogsByIdOrName  (alias: searchCatalogsByName)
// - getPhotosByCatalogId      (alias: getCatalogPhotos)
// - getBestCatalogVentralPhoto + getBestCatalogVentralPhotoId
// - getBestMantaVentralPhotosForCatalog
//   (aliases: getBestVentralCandidatesForCatalog, getBestCatalogVentralCandidates)
// - getCatalogIndividualsForSighting
// - getSightingsForCatalog    (alias: listSightingsForCatalog)
// - mergeCatalogs, setBestCatalogVentralPhoto
//
// NOTES:
// • Uses your shared Supabase client (src/lib/supabase.ts) so RLS reads include the session JWT.
// • Public URL is built directly from VITE_SUPABASE_URL + bucket + storage_path (no SDK permission issues).
// • Best-ventral resolver prefers catalog.best → else candidate set (catalog/manta best) → else first photo.
import { supabase } from "@/lib/supabase";

// ---------- Edge helpers ----------
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || "";
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || "";

function edgeBase(): string {
  const edge = (import.meta.env.VITE_SUPABASE_EDGE_URL as string) || "";
  const base = edge ? edge : `${SUPABASE_URL.replace(/\/+$/g, "")}/functions/v1`;
  return base.replace(/\/+$/g, "");
}
function edgeHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}
async function edgePost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${edgeBase()}${path}`, {
    method: "POST",
    headers: edgeHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as any)?.error || res.statusText || "Request failed";
    const details = (data as any)?.details;
    throw new Error(details ? `${err}: ${details}` : err);
  }
  return data as T;
}

// ---------- Public URL builder (robust) ----------
const DEFAULT_BUCKET = "manta-images";
const KNOWN_BUCKETS = new Set(["manta-images", "temp-images"]);

/** Build a public CDN URL from a storage_path. */
function publicUrl(storage_path?: string | null, bucket?: string | null): string | null {
  if (!storage_path) return null;

  // Already a full URL?
  if (/^https?:\/\//i.test(storage_path)) return storage_path;

  const base = SUPABASE_URL.replace(/\/+$/g, "");
  const clean = storage_path.replace(/^\/+/, "");

  // If the first path segment is a known bucket, use it; else use the provided/default bucket.
  const firstSeg = clean.split("/")[0];
  const useBucket = KNOWN_BUCKETS.has(firstSeg) ? firstSeg : (bucket || DEFAULT_BUCKET);
  const key = KNOWN_BUCKETS.has(firstSeg) ? clean.slice(firstSeg.length + 1) : clean;

  return `${base}/storage/v1/object/public/${useBucket}/${key}`;
}

// ===================== Selector/Data Reads =====================

export async function getCatalogById(pk_catalog_id: number) {
  if (!Number.isInteger(pk_catalog_id)) {
    throw new Error(`pk_catalog_id must be an integer; got ${pk_catalog_id}`);
  }
  const { data, error } = await supabase
    .from("catalog")
    .select("*")
    .eq("pk_catalog_id", pk_catalog_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data; // may be null
}

function escapeForIlike(s: string) {
  return s.replace(/[%_]/g, (m) => `\\${m}`);
}

/** Search by numeric ID exact match or name ILIKE %q% */
export async function searchCatalogsByIdOrName(q: string, limit = 20) {
  const query = (q ?? "").trim();
  if (!query) return [];

  if (/^\d+$/.test(query)) {
    const id = Number(query);
    const { data, error } = await supabase
      .from("catalog")
      .select("*")
      .eq("pk_catalog_id", id)
      .limit(1);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  const term = `%${escapeForIlike(query)}%`;
  const { data, error } = await supabase
    .from("catalog")
    .select("*")
    .ilike("name", term)
    .order("name", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
export const searchCatalogsByName = searchCatalogsByIdOrName;

export async function getPhotosByCatalogId(pk_catalog_id: number) {
  if (!Number.isInteger(pk_catalog_id)) {
    throw new Error(`pk_catalog_id must be an integer; got ${pk_catalog_id}`);
  }
  const { data, error } = await supabase
    .from("photos")
    .select(
      "pk_photo_id, fk_catalog_id, storage_path, is_best_catalog_ventral_photo, is_best_catalog_dorsal_photo, is_best_manta_ventral_photo"
    )
    .eq("fk_catalog_id", pk_catalog_id)
    .order("pk_photo_id", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((p: any) => ({
    ...p,
    url: publicUrl(p.storage_path),
  }));
}
export const getCatalogPhotos = getPhotosByCatalogId;

// ---------- Best ventral resolver (explicit best → candidates → first photo) ----------

/** Candidate set used by your modal/button count: catalog-best OR manta-best photos. */
export async function getBestMantaVentralPhotosForCatalog(pk_catalog_id: number) {
  if (!Number.isInteger(pk_catalog_id)) {
    throw new Error(`pk_catalog_id must be an integer; got ${pk_catalog_id}`);
  }

  const { data, error } = await supabase
    .from("photos")
    .select(
      "pk_photo_id, fk_catalog_id, storage_path, is_best_manta_ventral_photo, is_best_catalog_ventral_photo, is_best_catalog_dorsal_photo"
    )
    .eq("fk_catalog_id", pk_catalog_id)
    .or("is_best_manta_ventral_photo.eq.true,is_best_catalog_ventral_photo.eq.true")
    .order("is_best_catalog_ventral_photo", { ascending: false })
    .order("is_best_manta_ventral_photo", { ascending: false })
    .order("pk_photo_id", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((p: any) => ({
    ...p,
    url: publicUrl(p.storage_path),
  }));
}
export const getBestVentralCandidatesForCatalog = getBestMantaVentralPhotosForCatalog;
export const getBestCatalogVentralCandidates = getBestMantaVentralPhotosForCatalog;

/** Best ventral photo object, including a usable .url */
export async function getBestCatalogVentralPhoto(pk_catalog_id: number) {
  if (!Number.isInteger(pk_catalog_id)) {
    throw new Error(`pk_catalog_id must be an integer; got ${pk_catalog_id}`);
  }

  // 1) Prefer explicit catalog best id
  const catalog = await getCatalogById(pk_catalog_id);
  const bestId = (catalog as any)?.best_cat_ventral_id as number | null | undefined;
  if (bestId && Number.isInteger(bestId)) {
    const { data, error } = await supabase
      .from("photos")
      .select(
        "pk_photo_id, fk_catalog_id, storage_path, is_best_catalog_ventral_photo, is_best_catalog_dorsal_photo, is_best_manta_ventral_photo"
      )
      .eq("pk_photo_id", bestId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return { ...data, url: publicUrl(data.storage_path) };
  }

  // 2) Otherwise use your candidate set (catalog-best OR manta-best)
  const candidates = await getBestMantaVentralPhotosForCatalog(pk_catalog_id);
  if (candidates.length > 0) {
    const preferred =
      candidates.find((p: any) => p.is_best_catalog_ventral_photo) ?? candidates[0];
    return preferred; // already has .url
  }

  // 3) Last resort: any photo
  const { data, error } = await supabase
    .from("photos")
    .select(
      "pk_photo_id, fk_catalog_id, storage_path, is_best_catalog_ventral_photo, is_best_catalog_dorsal_photo, is_best_manta_ventral_photo"
    )
    .eq("fk_catalog_id", pk_catalog_id)
    .order("pk_photo_id", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0];
  return row ? { ...row, url: publicUrl(row.storage_path) } : null;
}

export async function getBestCatalogVentralPhotoId(pk_catalog_id: number) {
  const best = await getBestCatalogVentralPhoto(pk_catalog_id);
  return best ? ((best as any).pk_photo_id as number) : null;
}

// ---------- Sightings & mantas helpers (used by the list modal) ----------

export async function getCatalogIndividualsForSighting(
  pk_sighting_id: number,
  opts?: { filterCatalogId?: number | null }
) {
  if (!Number.isInteger(pk_sighting_id)) {
    throw new Error(`pk_sighting_id must be an integer; got ${pk_sighting_id}`);
  }

  const { data, error } = await supabase
    .from("mantas")
    .select("pk_manta_id, fk_sighting_id, fk_catalog_id, catalog:catalog(pk_catalog_id, name)")
    .eq("fk_sighting_id", pk_sighting_id)
    .order("fk_catalog_id", { ascending: true });

  if (error) throw new Error(error.message);

  let rows = (data ?? []) as any[];
  if (opts?.filterCatalogId != null) {
    rows = rows.filter((r) => r.fk_catalog_id === opts.filterCatalogId);
  }
  return rows;
}

export async function getSightingsForCatalog(pk_catalog_id: number) {
  if (!Number.isInteger(pk_catalog_id)) {
    throw new Error(`pk_catalog_id must be an integer; got ${pk_catalog_id}`);
  }

  // 1) Which sightings contain this catalog?
  const { data: mantaRowsForThisCatalog, error: mErr } = await supabase
    .from("mantas")
    .select("fk_sighting_id")
    .eq("fk_catalog_id", pk_catalog_id);
  if (mErr) throw new Error(mErr.message);

  const ids = Array.from(
    new Set((mantaRowsForThisCatalog ?? []).map((r: any) => r.fk_sighting_id).filter(Boolean))
  );
  if (ids.length === 0) return [];

  // 2) Load ALL mantas for those sighting ids (not just this catalog) → reduce counts
  const { data: allMantasInThoseSightings, error: allErr } = await supabase
    .from("mantas")
    .select("fk_sighting_id")
    .in("fk_sighting_id", ids);
  if (allErr) throw new Error(allErr.message);

  const counts: Record<number, number> = {};
  (allMantasInThoseSightings ?? []).forEach((r: any) => {
    const sid = r.fk_sighting_id as number;
    counts[sid] = (counts[sid] ?? 0) + 1;
  });

  // 3) Pull sightings rows
  const { data: sightings, error: sErr } = await supabase
    .from("sightings")
    .select("*")
    .in("pk_sighting_id", ids)
    .order("pk_sighting_id", { ascending: false });
  if (sErr) throw new Error(sErr.message);

  // 4) Map fields that your modal expects
  const pickDate = (row: any) =>
    row?.sighting_date ?? row?.date ?? row?.observed_at ?? row?.created_at ?? null;
  const pickLoc = (row: any) =>
    row?.sitelocation ??
    row?.location ??
    row?.site ??
    row?.place ??
    row?.island_location ??
    row?.island ??
    null;
  const pickNotes = (row: any) =>
    row?.notes ?? row?.note ?? row?.comments ?? row?.comment ?? row?.description ?? null;

  return (sightings ?? []).map((s: any) => ({
    fk_sighting_id: s.pk_sighting_id,
    fk_catalog_id: pk_catalog_id,
    sightings: {
      sighting_date: pickDate(s),
      sitelocation: pickLoc(s),
      total_mantas: counts[s.pk_sighting_id] ?? 0,
      notes: pickNotes(s),
    },
  }));
}


export const listSightingsForCatalog = getSightingsForCatalog;

// ===================== Merge / Set-Best (Edge) =====================

export type MergeSummary = {
  primary_pk_catalog_id: number;
  secondary_pk_catalog_id: number;
  photos_moved: number;
  mantas_moved: number;
  embeddings_moved?: number;
  secondary_deleted: boolean;
};

export type SetBestVentralResponse =
  | { ok: true; pk_catalog_id: number; best_cat_ventral_id: number | null }
  | { ok: false; error: string; details?: string };

/**
 * Merge two catalog IDs. Always merges into the smaller ID on the server.
 * Sends a proper Authorization token and apikey to avoid CORS preflight failures.
 */

/**
 * Uses supabase.functions.invoke to avoid CORS/preflight headaches.
 * Sends the signed-in access token automatically.
 */


export async function mergeCatalogs(params: {

  primary_pk_catalog_id: number;
  secondary_pk_catalog_id: number;
  delete_secondary_if_detached?: boolean;
}): Promise<MergeResponse> {
  const { data, error } = await supabase.functions.invoke("merge-catalogs", {
    body: {
      action: "merge",
      primary_pk_catalog_id: params.primary_pk_catalog_id,
      secondary_pk_catalog_id: params.secondary_pk_catalog_id,
      delete_secondary_if_detached: !!params.delete_secondary_if_detached,
    },
  });

  if (error) {
    const status = (error as any)?.status ?? "";
    const details = (error as any)?.message || (error as any)?.error || String(error);
    throw new Error(`merge-catalogs failed${status ? ` [${status}]` : ""}: ${details}`);
  }

  if (!data) {
    throw new Error("merge-catalogs returned no data");
  }

  return data as MergeResponse;
}

export type MergeResponse = {
  ok?: boolean;
  message?: string;
  primary_pk_catalog_id: number;
  secondary_pk_catalog_id: number;
  photos_moved?: number;
  mantas_moved?: number;
  photos_via_mantas_moved?: number;
  best_flags_cleared?: number;
  embeddings_touched?: number;
  secondary_deleted?: boolean;
  [k: string]: unknown; // allow extra debug keys without breaking
};

/** LEGACY signature (kept for reference). Not exported. */
async function mergeCatalogsLegacy(params: MergeParams): Promise<MergeResponse> {

  const { data, error } = await supabase.functions.invoke("merge-catalogs", {
    body: {
      action: "merge",
      primary_pk_catalog_id: params.primary_pk_catalog_id,
      secondary_pk_catalog_id: params.secondary_pk_catalog_id,
      delete_secondary_if_detached: !!params.delete_secondary_if_detached,
    },
  });

  if (error) {
    // supabase edge returns rich error with status in dev/prod; surface that clearly
    const status = (error as any)?.status ?? "";
    const details = (error as any)?.message || (error as any)?.error || String(error);
    throw new Error(`merge-catalogs failed${status ? ` [${status}]` : ""}: ${details}`);
  }

  if (!data) {
    throw new Error("merge-catalogs returned no data");
  }

  return data as MergeResponse;
}

  
export async function setBestCatalogVentralPhoto(params: {
  pk_catalog_id: number;
  pk_photo_id: number | null; // null = clear
}): Promise<SetBestVentralResponse> {
  return edgePost<SetBestVentralResponse>("/merge-catalogs", {
    action: "set_best_catalog_ventral",
    ...params,
  });
}
// ==== ADD: sightings summary & best-manta helpers ====

// Return sightings that include this catalog, with total mantas per sighting
export async function getSightingsSummaryForCatalog(pk_catalog_id: number) {
  if (!Number.isInteger(pk_catalog_id)) {
    throw new Error(`pk_catalog_id must be an integer; got ${pk_catalog_id}`);
  }

  // 1) Find sighting IDs where this catalog appears
  const { data: mantaRows, error: mErr } = await supabase
    .from("mantas")
    .select("fk_sighting_id")
    .eq("fk_catalog_id", pk_catalog_id);
  if (mErr) throw new Error(mErr.message);

  const ids = Array.from(new Set((mantaRows ?? []).map((r: any) => r.fk_sighting_id).filter(Boolean)));
  if (ids.length === 0) return [];

  // 2) Count ALL mantas for each sighting (not just this catalog)
  const { data: countsRows, error: cErr } = await supabase
    .from("mantas")
    .select("fk_sighting_id, count:pk_manta_id", { count: "exact", head: false })
    .in("fk_sighting_id", ids)
    .group("fk_sighting_id");
  if (cErr) throw new Error(cErr.message);

  const counts: Record<number, number> = {};
  (countsRows ?? []).forEach((r: any) => {
    const sid = r.fk_sighting_id as number;
    // some drivers return count in 'count' or as aggregate; normalize to number
    const n = typeof r.count === "number" ? r.count : Number(r.count ?? 0);
    counts[sid] = n;
  });

  // 3) Pull the sighting rows
  const { data: sightings, error: sErr } = await supabase
    .from("sightings")
    .select("*")
    .in("pk_sighting_id", ids)
    .order("pk_sighting_id", { ascending: false });
  if (sErr) throw new Error(sErr.message);

  // 4) Map fields with safe fallbacks
  function pickDate(row: any) {
    return row?.date ?? row?.sighting_date ?? row?.observed_at ?? row?.created_at ?? null;
  }
  function pickLocation(row: any) {
    return row?.location ?? row?.site ?? row?.place ?? row?.island_location ?? row?.island ?? null;
  }
  function pickNotes(row: any) {
    return row?.notes ?? row?.note ?? row?.comments ?? row?.comment ?? row?.description ?? null;
  }

  return (sightings ?? []).map((s: any) => ({
    pk_sighting_id: s.pk_sighting_id,
    date: pickDate(s),
    location: pickLocation(s),
    notes: pickNotes(s),
    total_mantas: counts[s.pk_sighting_id] ?? 0,
  }));
}

// Best manta-ventral photo ID for a single catalog (or null)
export async function getBestMantaVentralPhotoIdForCatalog(pk_catalog_id: number) {
  if (!Number.isInteger(pk_catalog_id)) {
    throw new Error(`pk_catalog_id must be an integer; got ${pk_catalog_id}`);
  }
  const { data, error } = await supabase
    .from("photos")
    .select("pk_photo_id")
    .eq("fk_catalog_id", pk_catalog_id)
    .eq("is_best_manta_ventral_photo", true)
    .order("pk_photo_id", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  return (data && data[0]?.pk_photo_id) ?? null;
}

// Batch: best manta-ventral photo IDs keyed by catalog id
export async function getBestMantaVentralPhotoIdsForCatalogs(catalogIds: number[]) {
  const ids = Array.from(new Set((catalogIds ?? []).filter((n) => Number.isInteger(n))));
  if (ids.length === 0) return {} as Record<number, number | null>;

  // Only rows flagged best-manta ventral
  const { data, error } = await supabase
    .from("photos")
    .select("pk_photo_id, fk_catalog_id")
    .in("fk_catalog_id", ids)
    .eq("is_best_manta_ventral_photo", true)
    .order("pk_photo_id", { ascending: true }); // deterministic pick if multiple
  if (error) throw new Error(error.message);

  const map: Record<number, number | null> = {};
  ids.forEach((id) => (map[id] = null));
  (data ?? []).forEach((r: any) => {
    const cid = r.fk_catalog_id as number;
    // keep the first (smallest pk) if multiple are flagged
    if (cid != null && map[cid] == null) map[cid] = r.pk_photo_id as number;
  });
  return map;
}

// Return public URLs for a batch of photo IDs (null if not found)
export async function getPublicUrlsForPhotoIds(photoIds: number[]) {
  const ids = Array.from(new Set((photoIds ?? []).filter((n) => Number.isInteger(n))));
  if (ids.length === 0) return {} as Record<number, string | null>;

  const { data, error } = await supabase
    .from("photos")
    .select("pk_photo_id, storage_path")
    .in("pk_photo_id", ids);

  if (error) throw new Error(error.message);

  const map: Record<number, string | null> = {};
  ids.forEach((id) => (map[id] = null));
  (data ?? []).forEach((r: any) => {
    map[r.pk_photo_id] = publicUrl(r.storage_path);
  });
  return map;
}

export async function getCatalogSummaryById(
  pk: number
): Promise<CatalogSummary | null> {
  const { data, error } = await supabase
    .from("catalog_with_photo_view")
    .select(
      [
        "pk_catalog_id",
        "name",
        "species",
        "gender",
        "age_class",
        "first_sighting",
        "last_sighting",
        "best_catalog_ventral_path",
        "best_catalog_dorsal_path",
        "total_sightings",
      ].join(",")
    )
    .eq("pk_catalog_id", pk)
    .single();

  if (error) {
    console.error("[getCatalogSummaryById]", error.message);
    return null;
  }
  return data as CatalogSummary;
}
