// supabase/functions/embeddings-catalog/index.ts
// Re-embeds best ventral catalog images into catalog_embeddings.
// - Env-driven (no hardcoded URL/keys)
// - Uses local embed server via { image_url } (no base64 spread)
// - Resumable paging with limit/startAfterPk
// - DIM from PGVECTOR_DIM (default 1024)
// Body: { limit?: number, startAfterPk?: number, truncate?: boolean }
//
// Requires tables:
//   catalog_with_photo_view(id uuid, pk_catalog_id int, best_catalog_ventral_path text)
//   catalog_embeddings(catalog_id uuid primary key, embedding vector, updated_at timestamptz, source_photo_path text)
// pgvector dimension of catalog_embeddings.embedding must equal PGVECTOR_DIM

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.4";

type Json = Record<string, unknown>;
const env = (k: string, f = "") => (Deno.env.get(k)?.trim() || f);
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
const cors = () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST,OPTIONS" } });

const pub = (api: string, bucket: string, path: string) => `${api}/storage/v1/object/public/${bucket}/${path}`;
const zero = (D: number) => { const a = new Array(D).fill(0); if (D > 0) a[0] = 1e-6; return a; };

async function tryEmbed(url: string, imageUrl: string) {
  const started = Date.now();
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_url: imageUrl }) });
    const ms = Date.now() - started;
    const text = await r.text();
    try {
      const j = JSON.parse(text);
      if (!r.ok) return { ok: false, status: r.status, ms, text };
      if (Array.isArray(j?.embedding)) return { ok: true, status: r.status, ms, embedding: j.embedding as number[] };
      return { ok: false, status: r.status, ms, text };
    } catch {
      return { ok: false, status: r.status, ms, text };
    }
  } catch (e: any) {
    return { ok: false, status: 0, ms: Date.now() - started, text: String(e ?? "error") };
  }
}
function macHostFallbacks(primary?: string): string[] {
  const list: string[] = [];
  if (primary) list.push(primary);
  try {
    const u = primary ? new URL(primary) : null;
    if (u && u.hostname === "host.docker.internal") list.push(primary!.replace("host.docker.internal", "docker.for.mac.host.internal"));
  } catch { /* ignore */ }
  const lan = env("LOCAL_EMBED_FALLBACK_URL");
  if (lan) list.push(lan);
  return Array.from(new Set(list));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return cors();
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const API_URL = env("VITE_SUPABASE_URL") || env("SUPABASE_URL");
  const SERVICE_ROLE = env("SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  const EMBED_URL = env("LOCAL_EMBEDDING_SERVER_URL"); // e.g., http://host.docker.internal:5050/embed
  const PGVECTOR_DIM = Number(env("PGVECTOR_DIM", "1024")) || 1024;
  const BUCKET = env("EMBED_BUCKET", "manta-images");

  if (!API_URL || !SERVICE_ROLE) return json({ error: "Missing API URL or service role key" }, 500);

  const supabase = createClient(API_URL, SERVICE_ROLE);
  const body = await req.json().catch(() => ({} as Json));
  const limit = Number.isFinite((body as any).limit) ? Math.max(1, Math.min(1000, (body as any).limit)) : 200;
  const startAfterPk = Number.isFinite((body as any).startAfterPk) ? (body as any).startAfterPk : null;
  const truncate = (body as any).truncate === true;

  try {
    if (truncate) {
      const del = await supabase.from("catalog_embeddings").delete().neq("catalog_id", "");
      if (del.error) throw del.error;
    }

    // Load page of rows
    let q = supabase
      .from("catalog_with_photo_view")
      .select("id, pk_catalog_id, best_catalog_ventral_path")
      .not("best_catalog_ventral_path", "is", null)
      .order("pk_catalog_id", { ascending: true })
      .limit(limit);

    if (startAfterPk !== null) q = q.gt("pk_catalog_id", startAfterPk);

    const { data: rows, error: qErr } = await q;
    if (qErr) throw qErr;
    if (!rows?.length) return json({ status: "ok", processed: 0, note: "no rows", api_url_used: API_URL });

    const attempts = macHostFallbacks(EMBED_URL);
    let processed = 0;
    const batch: any[] = [];

    for (const r of rows as Array<{ id: string; pk_catalog_id: number; best_catalog_ventral_path: string }>) {
      const imageUrl = pub(API_URL, BUCKET, r.best_catalog_ventral_path);
      let emb: number[] | null = null;

      for (const candidate of attempts) {
        const res = await tryEmbed(candidate, imageUrl);
        if (res.ok && Array.isArray(res.embedding)) { emb = res.embedding; break; }
      }
      if (!emb) emb = zero(PGVECTOR_DIM);

      batch.push({
        catalog_id: r.id,
        embedding: emb,
        updated_at: new Date().toISOString(),
        source_photo_path: r.best_catalog_ventral_path,
      });

      processed++;
      if (processed % 50 === 0) {
        const up = await supabase.from("catalog_embeddings").upsert(batch, { onConflict: "catalog_id" });
        if (up.error) throw up.error;
        batch.length = 0;
      }
    }

    if (batch.length) {
      const up = await supabase.from("catalog_embeddings").upsert(batch, { onConflict: "catalog_id" });
      if (up.error) throw up.error;
    }

    const lastPk = rows[rows.length - 1].pk_catalog_id;
    return json({ status: "ok", processed, lastPk, api_url_used: API_URL });
  } catch (e: any) {
    console.error("❌ embeddings-catalog error:", e?.message ?? e);
    return json({ error: e?.message ?? String(e), api_url_used: API_URL }, 500);
  }
});
