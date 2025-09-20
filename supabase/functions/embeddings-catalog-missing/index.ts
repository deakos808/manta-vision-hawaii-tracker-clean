import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.4";

const SUPABASE_URL = "https://apweteosdbgsolmvcmhn.supabase.co";
const SUPABASE_ANON_KEY = "JWT_REDACTED";
const BUCKET = "manta-images";
const EMBED_ENDPOINT = "http://192.168.1.15:5050/embed";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const missingCatalogs = [
  { id: "d0d304a5-e68f-4261-8552-0fc2b65f4af2", path: "photos/4847/4847.jpg" },
  { id: "878976a1-1f14-4e84-bf30-4cffa8bc261d", path: "photos/4890/4890.jpg" },
  { id: "66126a73-ab20-466a-890f-997cbd306cff", path: "photos/6206/6206.jpg" },
  { id: "4b30af24-56ce-47a3-a76d-2b010f7330ea", path: "photos/6997/6997.jpg" },
  { id: "8c8cb383-21c4-4010-9acc-011088a5717a", path: "photos/7009/7009.jpg" },
  { id: "43a76d57-f6c5-4721-bb69-d3c8725f2556", path: "photos/7090/7090.jpg" },
  { id: "b9d72b92-0204-41e6-9a9d-0d22b3822b5e", path: "photos/7152/7152.jpg" },
  { id: "4a9dce4a-ff46-4f9c-9171-c91f9b00f943", path: "photos/7163/7163.jpg" },
  { id: "ec88692a-e4b4-4e6a-85b3-b1ce2280d650", path: "photos/7250/7250.jpg" },
  { id: "3a4649a4-2928-4a16-95e4-1549b94f7c3a", path: "photos/7336/7336.jpg" },
  { id: "cc3b28f6-b2f5-4a4e-83fa-453a9e7878f0", path: "photos/7363/7363.jpg" },
  { id: "4c2657e1-efb4-4193-9510-62dc3d796b01", path: "photos/7386/7386.jpg" },
  { id: "1c46c10f-2381-493a-b688-0a7693283343", path: "photos/7393/7393.jpg" }
];

async function fetchImageAsBase64(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  const buffer = await data.arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

async function embedImage(base64: string): Promise<number[] | null> {
  try {
    const res = await fetch(EMBED_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: base64 })
    });
    const json = await res.json();
    return json.embedding ?? null;
  } catch {
    return null;
  }
}

serve(async (_req) => {
  console.log("🚀 Starting embedding process for 13 missing catalog UUIDs...");
  const results = [];

  for (const { id, path } of missingCatalogs) {
    console.log(`🔍 Processing ${id} → ${path}`);

    // Check if already embedded
    const { data: exists } = await supabase
      .from("catalog_embeddings")
      .select("catalog_id")
      .eq("catalog_id", id)
      .limit(1);
    if (exists?.length) {
      console.log(`⏭️ Skipping ${id} (already exists)`);
      results.push({ id, status: "already exists" });
      continue;
    }

    // Fetch image
    const base64 = await fetchImageAsBase64(path);
    if (!base64) {
      console.log(`❌ Failed to fetch image for ${id}`);
      results.push({ id, status: "fetch failed" });
      continue;
    }

    // Embed
    const embedding = await embedImage(base64);
    if (!embedding) {
      console.log(`❌ Embedding failed for ${id}`);
      results.push({ id, status: "embedding failed" });
      continue;
    }

    // Save
    const { error: upsertError } = await supabase
      .from("catalog_embeddings")
      .upsert([{ catalog_id: id, embedding, updated_at: new Date().toISOString() }]);

    if (upsertError) {
      console.log(`❌ Failed to insert for ${id}: ${upsertError.message}`);
      results.push({ id, status: `insert error` });
    } else {
      console.log(`✅ Embedded ${id}`);
      results.push({ id, status: "success" });
    }
  }

  console.log("📦 Embedding Results:", JSON.stringify(results, null, 2));

  return new Response(JSON.stringify({ completed: results }), {
    headers: { "Content-Type": "application/json" }
  });
});
