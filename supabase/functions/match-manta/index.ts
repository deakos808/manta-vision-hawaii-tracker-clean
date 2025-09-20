// match-manta/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.4";

const supabase = createClient(
  "https://apweteosdbgsolmvcmhn.supabase.co",
  "YOUR_SUPABASE_SERVICE_ROLE_KEY"
);

const STORAGE_URL = "https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/manta-images/";

serve(async (req) => {
  try {
    const { embedding, match_threshold = 0.2, match_count = 20 } = await req.json();

    if (!embedding || embedding.length !== 768) {
      return new Response(JSON.stringify({ error: "Invalid embedding" }), { status: 400 });
    }

    // 1. Query matches from catalog_embeddings using pgvector <-> operator
    const { data: matches, error } = await supabase.rpc("match_catalog_embeddings", {
      query_embedding: embedding,
      match_threshold,
      match_count
    });

    if (error) throw error;

    // 2. Fetch catalog names and thumbnail paths
    const catalogIds = matches.map((m: any) => m.catalog_id);
    const { data: catalogData, error: joinError } = await supabase
      .from("catalog")
      .select("catalog_uuid, name, best_cat_ventral_id")
      .in("catalog_uuid", catalogIds);

    if (joinError) throw joinError;

    const { data: photosData, error: photosError } = await supabase
      .from("photos")
      .select("pk_photo_id, storage_path")
      .in("pk_photo_id", catalogData.map(c => c.best_cat_ventral_id));

    if (photosError) throw photosError;

    // 3. Join the data
    const merged = matches.map((match: any) => {
      const catalog = catalogData.find(c => c.catalog_uuid === match.catalog_id);
      const photo = photosData.find(p => p.pk_photo_id === catalog?.best_cat_ventral_id);
      return {
        catalog_id: match.catalog_id,
        score: match.score,
        name: catalog?.name || null,
        thumb_url: photo?.storage_path ? `${STORAGE_URL}${photo.storage_path}` : null,
      };
    });

    return new Response(JSON.stringify({ matches: merged }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err: any) {
    console.error("Match error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), { status: 500 });
  }
});
