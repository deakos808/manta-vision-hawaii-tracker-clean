// supabase/functions/generate-newphoto-embedding/index.ts
// Minimal: accept storage_path or photo_url, call embed server, upsert row.
// No PostgREST query to storage schema.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EMBED_URL = Deno.env.get("EMBED_URL") ?? "http://manta-embed:5050/embed";
const BUCKET = "manta-images";

serve(async (req) => {
  try {
    const { storage_path, photo_url } = await req.json();

    if (!storage_path && !photo_url) {
      return json({ error: "Provide storage_path or photo_url" }, 400);
    }

    // Build the public URL if only storage_path is provided.
    const url =
      photo_url ??
      `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storage_path}`;

    // Sanity check the image is reachable (HEAD is cheap)
    const head = await fetch(url, { method: "HEAD" });
    if (!head.ok) {
      return json(
        { error: `Image not reachable`, url, http: head.status },
        400,
      );
    }

    // Get embedding
    const eresp = await fetch(EMBED_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image_url: url }),
    });
    if (!eresp.ok) {
      return json(
        { error: "embed failed", status: eresp.status, body: await eresp.text() },
        502,
      );
    }
    const ej = await eresp.json();
    const embedding: number[] = ej.embedding;
    const dim: number = ej.dim ?? 0;
    const norm: number = ej.norm ?? 0;

    if (!Array.isArray(embedding) || embedding.length !== 1024) {
      return json({ error: "bad embedding", dim, norm }, 500);
    }

    // Upsert into catalog_embeddings
    // We key by source_photo_path; keep pk_catalog_id/photo_id null unless you want to fill them.
    const up = await fetch(`${SUPABASE_URL}/rest/v1/catalog_embeddings`, {
      method: "POST",
      headers: {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify([{
        source_photo_path: storage_path ??
          new URL(url).pathname.replace(
            /^\/storage\/v1\/object\/public\/manta-images\//,
            "",
          ),
        embedding,          // pgvector column
        embedding_raw: embedding, // if you keep a JSON copy; remove if not needed
        pk_catalog_id: null,
        photo_id: null,
      }]),
    });
    if (!up.ok) {
      return json(
        { error: "upsert failed", status: up.status, body: await up.text() },
        500,
      );
    }

    return json({
      status: "ok",
      dim,
      norm,
      source_photo_path: storage_path ?? "(derived from URL)",
      url,
      embed_url: EMBED_URL,
    });
  } catch (e) {
    return json({ error: e?.message ?? String(e) }, 400);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
