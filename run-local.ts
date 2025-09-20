// 📁 File: supabase/functions/catalog-selfmatch/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.4";

const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(
  "https://apweteosdbgsolmvcmhn.supabase.co",
  supabaseKey
);

const STORAGE_URL = "https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/manta-images/";
const EMBED_ENDPOINT = Deno.env.get("EMBED_ENDPOINT") || "https://6b63432b51d1.ngrok-free.app/embed";

async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  const buffer = await res.arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

async function embedImage(url: string): Promise<number[]> {
  const image_base64 = await fetchImageAsBase64(url);
  const res = await fetch(EMBED_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64 }),
  });
  if (!res.ok) throw new Error(`Embed error: ${await res.text()}`);
  const json = await res.json();
  return json.embedding;
}

serve(async (req) => {
    // ✅ Always treat local requests as valid
  console.log("🔓 AUTH BYPASS ENABLED");

  // ✅ Skip any Authorization validation entirely
  req.headers.set("authorization", "Bearer test-token");
  
  // 🔓 Auth bypass for local testing — always skip auth
  console.log("🔓 Skipping auth check (dev mode)");

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    console.log("▶️ Starting catalog self-match...");

    const { data: catalogs, error } = await supabase
      .from("catalog_with_photo_view")
      .select("id, pk_catalog_id, best_catalog_ventral_path")
      .not("best_catalog_ventral_path", "is", null);

    if (error) throw error;
    if (!catalogs || catalogs.length === 0) {
      return new Response("No catalog images found.", { status: 400 });
    }

    const results: any[] = [];

    for (const entry of catalogs) {
      const catalog_uuid = entry.id;
      const pk_catalog_id = entry.pk_catalog_id;
      const path = entry.best_catalog_ventral_path;
      const imageUrl = `${STORAGE_URL}${path}`;

      try {
        const embedding = await embedImage(imageUrl);

        const { data: matches, error: matchError } = await supabase.rpc("match_catalog_embeddings", {
          query_embedding: embedding,
          match_count: 10,
          match_threshold: 1.0,
        });

        if (matchError) {
          console.warn(`⚠️ Match error for catalog ${catalog_uuid}:`, matchError.message);
          continue;
        }

        matches.forEach((match: any, i: number) => {
          results.push({
            catalog_uuid,
            pk_catalog_id,
            matched_pk_catalog_id: match.pk_catalog_id,
            match_rank: i + 1,
            similarity: match.score,
            is_correct_top_match: match.pk_catalog_id === pk_catalog_id,
            photo_url: imageUrl,
          });
        });
      } catch (err) {
        console.warn(`⚠️ Embedding failed for ${catalog_uuid}: ${err.message}`);
      }
    }

    if (results.length > 0) {
      await supabase.from("embedding_selfmatch_results").delete().neq("catalog_uuid", "");
      const chunks = Array.from({ length: Math.ceil(results.length / 500) }, (_, i) =>
        results.slice(i * 500, i * 500 + 500)
      );
      for (const chunk of chunks) {
        const { error: upsertError } = await supabase.from("embedding_selfmatch_results").upsert(chunk);
        if (upsertError) throw upsertError;
      }
    }

    console.log(`🎉 Self-match complete (${results.length} matches written)`);
    return new Response(JSON.stringify({ status: "ok", count: results.length }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    console.error("❌ Self-match error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
