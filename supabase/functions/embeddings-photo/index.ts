// supabase/functions/embeddings-photo/index.ts
// Streams ventral photo embeddings into photo_embeddings.
// Same connectivity approach as catalog embedding; service-role client.
// SSE output for progress (unchanged UX).
//
// Body: { limit?: number } is ignored; we stream all ventral photos.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.4";

const env = (k: string, f = "") => (Deno.env.get(k)?.trim() || f);
const pub = (api: string, bucket: string, path: string) => `${api}/storage/v1/object/public/${bucket}/${path}`;
const zero = (D: number) => { const a = new Array(D).fill(0); if (D > 0) a[0] = 1e-6; return a; };

async function tryEmbed(url: string, imageUrl: string) {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_url: imageUrl }) });
    const text = await r.text();
    const j = JSON.parse(text);
    if (!r.ok) return null;
    return Array.isArray(j?.embedding) ? (j.embedding as number[]) : null;
  } catch { return null; }
}
function macHostFallbacks(primary?: string): string[] {
  const list: string[] = [];
  if (primary) list.push(primary);
  try {
    const u = primary ? new URL(primary) : null;
    if (u && u.hostname === "host.docker.internal") list.push(primary!.replace("host.docker.internal", "docker.for.mac.host.internal"));
  } catch {}
  const lan = env("LOCAL_EMBED_FALLBACK_URL");
  if (lan) list.push(lan);
  return Array.from(new Set(list));
}

serve(() => {
  const API_URL = env("VITE_SUPABASE_URL") || env("SUPABASE_URL");
  const SERVICE_ROLE = env("SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  const EMBED_URL = env("LOCAL_EMBEDDING_SERVER_URL");
  const PGVECTOR_DIM = Number(env("PGVECTOR_DIM", "1024")) || 1024;
  const BUCKET = env("EMBED_BUCKET", "manta-images");

  const supabase = createClient(API_URL, SERVICE_ROLE);
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const log = (obj: any) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const ping = setInterval(() => controller.enqueue(enc.encode(":\n\n")), 10000);
      try {
        log({ log: "▶️ start", progress: 0 });

        // fetch ventral photos
        const PAGE = 1000;
        const attempts = macHostFallbacks(EMBED_URL);
        let from = 0;
        let total = 0;
        let done = 0;

        // Count
        {
          const { count } = await supabase
            .from("photos")
            .select("id", { count: "exact", head: true })
            .eq("photo_view", "ventral")
            .not("id", "is", null)
            .not("storage_path", "is", null);
          total = count ?? 0;
        }

        while (true) {
          const { data, error } = await supabase
            .from("photos")
            .select("id, storage_path")
            .eq("photo_view", "ventral")
            .not("id", "is", null)
            .not("storage_path", "is", null)
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data?.length) break;

          const batch: any[] = [];
          for (const p of data as Array<{ id: string; storage_path: string }>) {
            const imageUrl = pub(API_URL, BUCKET, p.storage_path);
            let emb: number[] | null = null;
            for (const cand of attempts) {
              emb = await tryEmbed(cand, imageUrl);
              if (emb) break;
            }
            if (!emb) emb = zero(PGVECTOR_DIM);

            batch.push({
              photo_id: p.id,
              embedding: emb,
              created_at: new Date().toISOString(),
              side: "ventral",
              source_photo_path: p.storage_path,
            });

            done++;
            if (done % 50 === 0) log({ log: `✅ ${done}/${total}`, progress: Math.round((done / Math.max(1, total)) * 100) });
          }

          if (batch.length) {
            const up = await supabase.from("photo_embeddings").upsert(batch, { onConflict: "photo_id" });
            if (up.error) throw up.error;
          }

          from += PAGE;
        }

        log({ log: "🎉 complete", progress: 100, done: true });
      } catch (e: any) {
        log({ error: e?.message ?? String(e), done: true });
      } finally {
        clearInterval(ping);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
