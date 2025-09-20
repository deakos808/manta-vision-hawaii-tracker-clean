// File: supabase/functions/embeddings-manta/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.4";

const SUPABASE_STORAGE_BASE = "https://apweteosdbgsolmvcmhn.supabase.co";
const EMBED_ENDPOINT = "https://68770e47f6e5.ngrok-free.app/embed"; // ← your ngrok endpoint
const BUCKET = "manta-images";
const PAGE_SIZE = 10;

const supabase = createClient(
  SUPABASE_STORAGE_BASE,
  Deno.env.get("SUPABASE_ANON_KEY")!
);

function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
  return vec.map((x) => x / norm);
}

serve(async (req) => {
  const encoder = new TextEncoder();
  const { searchParams } = new URL(req.url);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const stream = new ReadableStream({
    async start(controller) {
      const log = (msg: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
      };

      log({ log: `▶️ Starting manta embedding job from offset ${offset}...` });

      try {
        const { data: rows, error } = await supabase
          .from("mantas_with_photo_view")
          .select("pk_manta_id, best_manta_ventral_photo_id, best_manta_ventral_photo_url")
          .not("best_manta_ventral_photo_url", "is", null)
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        if (!rows || rows.length === 0) {
          log({ log: "✅ No more mantas to process", done: true });
          controller.close();
          return;
        }

        let embedded = 0;
        const failed: any[] = [];

        for (const row of rows) {
          const { pk_manta_id, best_manta_ventral_photo_id, best_manta_ventral_photo_url } = row;

          const photo_id = best_manta_ventral_photo_id;
          const url = best_manta_ventral_photo_url;

          // ✅ Helpful log to confirm the URL
          log({ log: "📷 Using image URL", pk_manta_id, photo_id, url });

          try {
            const buffer = await fetch(url).then((res) => {
              if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
              return res.arrayBuffer();
            });

            const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

            const embedRes = await fetch(EMBED_ENDPOINT, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image_base64: base64 }),
            });

            if (!embedRes.ok) {
              failed.push({ pk_manta_id, photo_id, url, status: embedRes.status });
              log({ log: `❌ Embed failed`, pk_manta_id, photo_id, url, status: embedRes.status });
              continue;
            }

            const { embedding } = await embedRes.json();
            if (!Array.isArray(embedding) || embedding.length !== 768) {
              failed.push({ pk_manta_id, photo_id, url, error: "Invalid embedding shape" });
              log({ log: `❌ Invalid embedding format`, pk_manta_id, photo_id, url });
              continue;
            }

            const { error: upsertErr } = await supabase
              .from("manta_embeddings")
              .upsert({
                fk_manta_id: pk_manta_id,
                photo_id,
                embedding: normalize(embedding),
                updated_at: new Date().toISOString(),
              }, { onConflict: "fk_manta_id" });

            if (upsertErr) {
              failed.push({ pk_manta_id, photo_id, url, error: upsertErr.message });
              log({ log: `❌ Upsert failed`, pk_manta_id, photo_id, error: upsertErr.message });
              continue;
            }

            embedded++;
            log({
              log: `✅ Embedded ${pk_manta_id}`,
              progress: Math.round((embedded / rows.length) * 100),
              count: embedded,
            });

          } catch (err) {
            failed.push({ pk_manta_id, photo_id, url, error: String(err) });
            log({ log: `❌ Error embedding`, pk_manta_id, photo_id, url, error: String(err) });
          }
        }

        log({
          log: `🏁 Batch complete`,
          embedded,
          failed: failed.length,
          offset,
          done: true,
        });

      } catch (err) {
        log({ error: err instanceof Error ? err.message : String(err), done: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
