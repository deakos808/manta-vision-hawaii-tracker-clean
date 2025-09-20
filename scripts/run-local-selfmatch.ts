// FILE: scripts/run-local-selfmatch.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.4";

const SUPABASE_URL = "https://apweteosdbgsolmvcmhn.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwd2V0ZW9zZGJnc29sbXZjbWhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Njk4NzgyOSwiZXhwIjoyMDYyNTYzODI5fQ.z0CMeV4Sqyzpan-Sj3hVSr6xIXg380T7LXV70JMuFcs";
const EMBED_ENDPOINT = "http://localhost:5050/embed";
const STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/manta-images/`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ✅ Deno-compatible async SHA-1 hash
async function hashVector(v: number[]): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(v.join(","));
  const buffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

console.log("▶️ Starting local catalog self-match in batches...");

const batchSize = 25;
let offset = 0;
let totalProcessed = 0;
let allCorrect = 0;
let allTested = 0;

while (true) {
  const { data: existing, error: existingError } = await supabase
    .from("embedding_selfmatch_results")
    .select("pk_catalog_id");

  if (existingError) throw existingError;
  const skipIds = existing.map((r) => r.pk_catalog_id);

  const { data: catalogs, error } = await supabase
    .from("catalog_with_photo_view")
    .select("id, pk_catalog_id, best_catalog_ventral_path")
    .not("best_catalog_ventral_path", "is", null)
    .order("pk_catalog_id", { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) throw error;
  if (!catalogs || catalogs.length === 0) break;

  const results: any[] = [];

  for (const entry of catalogs) {
    const catalog_uuid = entry.id;
    const pk_catalog_id = entry.pk_catalog_id;
    const path = entry.best_catalog_ventral_path;
    const imageUrl = `${STORAGE_URL}${path}`;

    if (skipIds.includes(pk_catalog_id)) {
      console.log(`⏭️ Skipping already processed catalog ${pk_catalog_id}`);
      continue;
    }

    try {
      const embedding = await embedImage(imageUrl);
      const hash = await hashVector(embedding);
      console.log(`📷 Catalog ${pk_catalog_id} | SHA-1 Hash: ${hash}`);

      const { data: matches, error: matchError } = await supabase.rpc("match_catalog_embeddings", {
        query_embedding: embedding,
        match_count: 10,
        match_threshold: 1.0,
      });

      if (matchError) {
        console.warn(`⚠️ Match error for catalog ${catalog_uuid}:`, matchError.message);
        continue;
      }

      if (!matches || matches.length === 0) {
        console.warn(`⚠️ No matches returned for catalog ${pk_catalog_id}`);
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

      const topMatch = matches[0];
      if (topMatch?.pk_catalog_id === pk_catalog_id) {
        allCorrect++;
      }
      allTested++;
    } catch (err) {
      console.warn(`⚠️ Embedding failed for ${catalog_uuid}: ${err.message}`);
    }
  }

  if (results.length > 0) {
    const { error: upsertError } = await supabase.from("embedding_selfmatch_results").upsert(results);
    if (upsertError) throw upsertError;

    const topRanked = results.filter((r) => r.match_rank === 1);
    const correct = topRanked.filter((r) => r.is_correct_top_match).length;
    const total = topRanked.length;
    console.log(`📊 Batch Accuracy: ${correct} / ${total} correct top matches (${((correct / total) * 100).toFixed(1)}%)`);
  }

  totalProcessed += catalogs.length;
  console.log(`🧭 Processed ${totalProcessed} rows so far. Resuming next batch...`);
  offset += batchSize;
}

console.log(`✅ All catalog self-matching complete.`);
if (allTested > 0) {
  console.log(`🎯 Overall Top-1 Accuracy: ${allCorrect} / ${allTested} = ${(allCorrect / allTested * 100).toFixed(1)}%`);
} else {
  console.log("⚠️ No valid catalogs processed. Check embedding and match setup.");
}
