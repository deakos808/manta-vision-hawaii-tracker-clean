// supabase/functions/catalog_selfmatch/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.4";

type Row = { id: string; pk_catalog_id: number; best_catalog_ventral_path: string };

const env = (k: string, f = "") => (Deno.env.get(k)?.trim() || f);
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
const cors = () =>
  new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST,OPTIONS" } });

const pubUrl = (api: string, bucket: string, path: string) => `${api}/storage/v1/object/public/${bucket}/${path}`;

async function embedViaLocal(localUrl: string, imageUrl: string): Promise<number[] | null> {
  const r = await fetch(localUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imageUrl }),
  }).catch(() => null);
  if (!r || !r.ok) return null;
  const j = await r.json().catch(() => null) as any;
  return Array.isArray(j?.embedding) ? (j.embedding as number[]) : null;
}

const zeroVec = (D: number) => { const a = new Array(D).fill(0); if (D > 0) a[0] = 1e-6; return a; };

serve(async (req) => {
  if (req.method === "OPTIONS") return cors();
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  const API_URL = env("VITE_SUPABASE_URL") || env("SUPABASE_URL");
  const SERVICE_ROLE = env("SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  const LOCAL_EMBED_URL = env("LOCAL_EMBEDDING_SERVER_URL"); // http://manta-embed:5050/embed
  const PGVECTOR_DIM = Number(env("PGVECTOR_DIM", "1024")) || 1024;

  if (!API_URL || !SERVICE_ROLE) return json({ error: "Missing API URL or service role key" }, 500);
  const supabase = createClient(API_URL, SERVICE_ROLE);

  const body = await req.json().catch(() => ({} as any));
  if (body?.ping) return json({ status: "ok", pong: true, api_url_used: API_URL, embed_url: LOCAL_EMBED_URL || null });

  const limit = Number.isFinite(body?.limit) ? Math.max(1, Math.min(1000, body.limit)) : 50;
  const matchCount = Number.isFinite(body?.matchCount) ? Math.max(1, Math.min(200, body.matchCount)) : 10;
  const matchThreshold = Number.isFinite(body?.threshold) ? body.threshold : 1.0;
  const truncate = body?.truncate === true;
  const startAfterPk = Number.isFinite(body?.startAfterPk) ? body.startAfterPk : null;

  try {
    if (truncate) {
      const del = await supabase.from("embedding_selfmatch_results").delete().neq("pk_catalog_id", -1);
      if (del.error) throw del.error;
    }

    let q = supabase
      .from("catalog_with_photo_view")
      .select("id, pk_catalog_id, best_catalog_ventral_path")
      .not("best_catalog_ventral_path", "is", null)
      .order("pk_catalog_id", { ascending: true })
      .limit(limit);
    if (startAfterPk !== null) q = q.gt("pk_catalog_id", startAfterPk);

    const { data: rows, error: qErr } = await q;
    if (qErr) throw qErr;
    if (!rows?.length) return json({ status: "ok", processed: 0, api_url_used: API_URL, note: "no rows" });

    let processed = 0;
    const buffer: any[] = [];

    for (const r of rows as Row[]) {
      processed++;
      const imageUrl = pubUrl(API_URL, "manta-images", r.best_catalog_ventral_path);

      const emb = LOCAL_EMBED_URL
        ? (await embedViaLocal(LOCAL_EMBED_URL, imageUrl)) ?? zeroVec(PGVECTOR_DIM)
        : zeroVec(PGVECTOR_DIM);

      // ✅ Call the unambiguous wrapper
      const { data: matches, error: mErr } = await supabase.rpc("match_catalog_embeddings_resolved", {
        query_embedding: emb,
        match_count: matchCount,
        match_threshold: matchThreshold,
      });
      if (mErr) throw mErr;

      (matches ?? []).forEach((m: any, i: number) => {
        buffer.push({
          catalog_uuid: r.id,
          pk_catalog_id: r.pk_catalog_id,
          matched_pk_catalog_id: m.pk_catalog_id,
          match_rank: i + 1,
          similarity: m.score,
          photo_path: r.best_catalog_ventral_path,
          is_correct_top_match: m.pk_catalog_id === r.pk_catalog_id && i === 0,
        });
      });

      if (processed % 25 === 0 && buffer.length) {
        const up = await supabase.from("embedding_selfmatch_results").upsert(buffer);
        if (up.error) throw up.error;
        buffer.length = 0;
      }
    }

    if (buffer.length) {
      const up = await supabase.from("embedding_selfmatch_results").upsert(buffer);
      if (up.error) throw up.error;
    }

    return json({ status: "ok", processed, api_url_used: API_URL, embed_url: LOCAL_EMBED_URL || null });
  } catch (e: any) {
    console.error("❌ catalog_selfmatch error:", e?.message ?? e);
    return json({ error: e?.message ?? String(e), api_url_used: API_URL }, 500);
  }
});
