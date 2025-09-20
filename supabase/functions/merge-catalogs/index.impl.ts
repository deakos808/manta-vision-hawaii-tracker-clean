// Deno Deploy (Supabase Edge Function)
// Endpoint: /functions/v1/merge-catalogs
//
// Actions:
//  - POST { action:"merge", primary_pk_catalog_id:number, secondary_pk_catalog_id:number, delete_secondary_if_detached?:boolean }
//  - POST { action:"set_best_catalog_ventral", pk_catalog_id:number, pk_photo_id:number|null }
//
// Behavior:
//  - Always merges into the smaller pk_catalog_id (server reorders).
//  - Pre-clears *secondary* best flags in BOTH tables (catalog + photos) before moving.
//  - Moves photos + mantas; best-effort normalize embeddings (catalog_embeddings).
//  - Optional delete(secondary) only if detached (photos=0 & mantas=0). Default OFF.
//  - JSON errors, CORS-safe OPTIONS.

// using platform server via Deno.serve (no std import)

// NOTE: direct Postgres driver disabled on Edge for boot safety in Phase 0.
// import { Client, Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";


type Json = Record<string, unknown>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-requested-with",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function badRequest(msg: string) {
  return json(400, { ok: false, error: msg });
}

function parseIntId(v: unknown, name: string): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (!s || s === "undefined" || s === "null") return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
  }
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
  return null;
}

const DATABASE_URL =
  Deno.env.get("DATABASE_URL") ?? Deno.env.get("SUPABASE_DB_URL");

// Phase 0 transport: disable direct Postgres pool to ensure the function boots on Edge.
// We’ll move the transaction into a SQL RPC in Phase 1.
const pool: null = null;

async function withTx<T>(_fn: (client: unknown) => Promise<T>): Promise<T> {
  throw new Error(
    "Direct Postgres driver is disabled on Edge; use a SQL RPC via supabase-js instead (Phase 1).",
  );
}


Deno.serve(async (req: Request) => {

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const action = String(payload?.action ?? "");

  if (action === "set_best_catalog_ventral") {
    const catId = parseIntId(payload?.pk_catalog_id, "pk_catalog_id");
    const photoVal = payload?.pk_photo_id;
    const photoId =
      photoVal === null ? null : parseIntId(photoVal, "pk_photo_id");

    if (!catId) {
      return badRequest(
        `Invalid payload: pk_catalog_id=${payload?.pk_catalog_id}`,
      );
    }
    if (photoVal !== null && !photoId) {
      return badRequest(
        `Invalid payload: pk_photo_id=${payload?.pk_photo_id}`,
      );
    }

    try {
      const result = await withTx(async (db) => {
        // DEBUG pre-counts (same DB/session)
const prePhotosSec = await db.queryObject<{ count: string }>`
  SELECT COUNT(*) AS count FROM photos WHERE fk_catalog_id = ${secondary};
`;
const preMantasSec = await db.queryObject<{ count: string }>`
  SELECT COUNT(*) AS count FROM mantas WHERE fk_catalog_id = ${secondary};
`;
const prePhotosViaSec = await db.queryObject<{ count: string }>`
  SELECT COUNT(*) AS count
  FROM photos p
  JOIN mantas m ON m.pk_manta_id = p.fk_manta_id
  WHERE m.fk_catalog_id = ${secondary};
`;

        // Clear → Set pattern for ventral
        await db.queryArray`
          UPDATE catalog
          SET best_cat_ventral_id = NULL
          WHERE pk_catalog_id = ${catId};
        `;
        await db.queryArray`
          UPDATE photos
          SET is_best_catalog_ventral_photo = FALSE
          WHERE fk_catalog_id = ${catId};
        `;

        if (photoId !== null) {
          // Ensure the photo belongs to the catalog before setting.
          const updatePhoto = await db.queryArray`
            UPDATE photos
            SET is_best_catalog_ventral_photo = TRUE
            WHERE pk_photo_id = ${photoId} AND fk_catalog_id = ${catId};
          `;
          const affected = (updatePhoto.rowCount ?? 0) as number;
          if (affected === 0) {
            throw new Error(
              `Photo ${photoId} does not belong to catalog ${catId}`,
            );
          }
          await db.queryArray`
            UPDATE catalog
            SET best_cat_ventral_id = ${photoId}
            WHERE pk_catalog_id = ${catId};
          `;
        }

        // Best-effort logging (skip if table/columns missing)
        try {
          await db.queryArray`
            INSERT INTO catalog_merge_log
              (primary_pk_catalog_id, secondary_pk_catalog_id, photos_moved, mantas_moved, secondary_deleted, note, created_at)
            VALUES (${catId}, NULL, NULL, NULL, NULL, 'set_best_catalog_ventral', NOW());
          `;
        } catch {
          // ignore if table/columns absent
        }

        return { ok: true, pk_catalog_id: catId, best_cat_ventral_id: photoId };
      });

      return json(200, result);
    } catch (e) {
      return json(400, {
        ok: false,
        error: "Failed to set best catalog ventral",
        details: `${e}`,
      });
    }
  }

  if (action === "merge") {
    const a = parseIntId(payload?.primary_pk_catalog_id, "primary_pk_catalog_id");
    const b = parseIntId(
      payload?.secondary_pk_catalog_id,
      "secondary_pk_catalog_id",
    );
    if (!a || !b) {
      return badRequest(
        `Invalid catalog IDs: primary=${payload?.primary_pk_catalog_id} secondary=${payload?.secondary_pk_catalog_id}. Both must be integers.`,
      );
    }
    if (a === b) {
      return badRequest("primary and secondary must be different IDs");
    }

    // Always merge into the smaller ID
    const primary = Math.min(a, b);
    const secondary = Math.max(a, b);
    const deleteSecondaryIfDetached =
      Boolean(payload?.delete_secondary_if_detached) || false;

    try {
      const result = await withTx(async (db) => {
        // Pre-clear best flags on the *secondary* to avoid unique collisions
        await db.queryArray`
          UPDATE catalog
          SET best_cat_ventral_id = NULL, best_cat_dorsal_id = NULL
          WHERE pk_catalog_id = ${secondary};
        `;
        await db.queryArray`
          UPDATE photos
          SET is_best_catalog_ventral_photo = FALSE,
              is_best_catalog_dorsal_photo  = FALSE
          WHERE fk_catalog_id = ${secondary};
        `;

       // Move photos (direct ties)
const movePhotos = await db.queryArray`
  UPDATE photos
  SET fk_catalog_id = ${primary}
  WHERE fk_catalog_id = ${secondary};
`;
const photos_moved_direct = (movePhotos.rowCount ?? 0) as number;

        // Move mantas
        const moveMantas = await db.queryArray`
          UPDATE mantas SET fk_catalog_id = ${primary} WHERE fk_catalog_id = ${secondary};
        `;
        const mantas_moved = (moveMantas.rowCount ?? 0) as number;


// Backfill photos via manta linkage (covers photos that never set fk_catalog_id)
// Only update rows that aren't already primary, to keep counts accurate.
// Backfill photos that point to the moved mantas (covers photos without fk_catalog_id)
const backfillPhotos = await db.queryArray`
  UPDATE photos p
  SET fk_catalog_id = ${primary}
  WHERE p.fk_manta_id IN (
    SELECT m.pk_manta_id
    FROM mantas m
    WHERE m.fk_catalog_id = ${primary}
  )
  AND (p.fk_catalog_id IS DISTINCT FROM ${primary});
`;
const photos_moved_via_mantas = (backfillPhotos.rowCount ?? 0) as number;

// Total photos moved = direct + via mantas
const photos_moved = photos_moved_direct + photos_moved_via_mantas;



// Total photos moved = direct + via manta linkage
const photos_moved = photos_moved_direct + photos_moved_via_mantas;

        // Best-effort embedding normalization (catalog_embeddings)
        // If table or constraint missing, just skip.
        let embeddings_moved: number | undefined = undefined;
        try {
          const upEmb = await db.queryArray`
            UPDATE catalog_embeddings
            SET pk_catalog_id = ${primary}
            WHERE pk_catalog_id = ${secondary};
          `;
          embeddings_moved = (upEmb.rowCount ?? 0) as number;
        } catch (e) {
          // unique_violation → primary already has a row; drop the secondary row
          const msg = String(e?.message ?? "");
          const code = (e as any)?.code;
          if (code === "23505" || /unique/i.test(msg)) {
            try {
              const delEmb = await db.queryArray`
                DELETE FROM catalog_embeddings WHERE pk_catalog_id = ${secondary};
              `;
              embeddings_moved = embeddings_moved ?? 0;
            } catch {
              // ignore
            }
          }
          // undefined_table/column → ignore
        }
// Recompute primary catalog summary fields (safe, wrapped)
try {
  const stats = await db.queryObject<{ first: string | null; last: string | null; total: string }>`
    SELECT
      MIN(s.sighting_date) AS first,
      MAX(s.sighting_date) AS last,
      COUNT(DISTINCT m.fk_sighting_id) AS total
    FROM mantas m
    LEFT JOIN sightings s ON s.pk_sighting_id = m.fk_sighting_id
    WHERE m.fk_catalog_id = ${primary};
  `;
  const first = stats.rows?.[0]?.first ?? null;
  const last  = stats.rows?.[0]?.last  ?? null;
  const total = Number(stats.rows?.[0]?.total ?? "0");

  // If these columns exist on catalog, update them
  try {
    await db.queryArray`
      UPDATE catalog
      SET first_sighting = ${first},
          last_sighting  = ${last},
          total_sightings = ${total}
      WHERE pk_catalog_id = ${primary};
    `;
  } catch { /* ignore if those columns aren't present */ }

  // If your 'catalog_with_photo_view' is a *materialized* view, refresh it (ignored if not)
  try {
    await db.queryArray`REFRESH MATERIALIZED VIEW catalog_with_photo_view;`;
  } catch { /* ignore if not a matview */ }
} catch { /* ignore any summary recompute errors */ }

        // Check if secondary is fully detached
        const photosLeft = await db.queryObject<{ count: string }>`
          SELECT COUNT(*) AS count FROM photos WHERE fk_catalog_id = ${secondary};
        `;
        const mantasLeft = await db.queryObject<{ count: string }>`
          SELECT COUNT(*) AS count FROM mantas WHERE fk_catalog_id = ${secondary};
        `;
        const pLeft = Number(photosLeft.rows?.[0]?.count ?? "0");
        const mLeft = Number(mantasLeft.rows?.[0]?.count ?? "0");

        let secondary_deleted = false;
        if (deleteSecondaryIfDetached && pLeft === 0 && mLeft === 0) {
          const del = await db.queryArray`
            DELETE FROM catalog WHERE pk_catalog_id = ${secondary};
          `;
          secondary_deleted = (del.rowCount ?? 0) > 0;
        }

        // Best-effort logging (skip if absent)
        try {
          await db.queryArray`
            INSERT INTO catalog_merge_log
              (primary_pk_catalog_id, secondary_pk_catalog_id, photos_moved, mantas_moved, secondary_deleted, note, created_at)
            VALUES (${primary}, ${secondary}, ${photos_moved}, ${mantas_moved}, ${secondary_deleted}, 'merge', NOW());
          `;
        } catch {
          // ignore
        }
// DEBUG post-counts + connection info
const postPhotosSec = await db.queryObject<{ count: string }>`
  SELECT COUNT(*) AS count FROM photos WHERE fk_catalog_id = ${secondary};
`;
const postMantasSec = await db.queryObject<{ count: string }>`
  SELECT COUNT(*) AS count FROM mantas WHERE fk_catalog_id = ${secondary};
`;
const postPhotosViaSec = await db.queryObject<{ count: string }>`
  SELECT COUNT(*) AS count
  FROM photos p
  JOIN mantas m ON m.pk_manta_id = p.fk_manta_id
  WHERE m.fk_catalog_id = ${secondary};
`;
const who = await db.queryObject<{ db: string; usr: string }>`
  SELECT current_database() AS db, current_user AS usr;
`;

        return {
          debug: {
  pre: {
    photos_sec: Number(prePhotosSec.rows?.[0]?.count ?? "0"),
    mantas_sec: Number(preMantasSec.rows?.[0]?.count ?? "0"),
    photos_via_mantas_sec: Number(prePhotosViaSec.rows?.[0]?.count ?? "0"),
  },
  post: {
    photos_sec: Number(postPhotosSec.rows?.[0]?.count ?? "0"),
    mantas_sec: Number(postMantasSec.rows?.[0]?.count ?? "0"),
    photos_via_mantas_sec: Number(postPhotosViaSec.rows?.[0]?.count ?? "0"),
  },
  db: who.rows?.[0]?.db ?? null,
  user: who.rows?.[0]?.usr ?? null,
},

            ok: true,
          summary: {
            primary_pk_catalog_id: primary,
            secondary_pk_catalog_id: secondary,
            photos_moved,
            mantas_moved,
            embeddings_moved,
            secondary_deleted,
            photos_moved_via_mantas,
          },
        };
      });

      return json(200, result);
    } catch (e) {
      return json(400, {
        ok: false,
        error: "Merge failed",
        details: `${e}`,
      });
    }
  }

  return badRequest(`Unknown action "${action}"`);
});
