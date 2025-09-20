import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import crypto from "crypto";

// Supabase config
const SUPABASE_URL = "https://apweteosdbgsolmvcmhn.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  "JWT_REDACTED";
const EMBED_ENDPOINT = "http://localhost:5050/embed";
const PUBLIC_BUCKET_URL = `${SUPABASE_URL}/storage/v1/object/public/manta-images`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function hashVector(v: number[]): string {
  return crypto.createHash("sha1").update(v.join(",")).digest("hex");
}

async function fetchCatalogPhotos() {
  const { data, error } = await supabase
    .from("photos")
    .select("pk_photo_id, fk_catalog_id, fk_catalog_uuid, pk_photo_uuid, storage_path")
    .eq("photo_view", "ventral")
    .eq("is_best_catalog_ventral_photo", true)
    .not("storage_path", "is", null);

  if (error) {
    throw new Error("❌ Failed to fetch photos: " + error.message);
  }

  return data;
}

async function embedImage(publicUrl: string): Promise<number[] | null> {
  const res = await fetch(publicUrl);
  if (!res.ok) {
    console.error(`❌ Fetch failed (${res.status}): ${publicUrl}`);
    return null;
  }

  const buffer = await res.arrayBuffer();
  if (buffer.byteLength === 0) {
    console.warn(`⚠️ Zero-byte image: ${publicUrl}`);
    return null;
  }

  const base64 = Buffer.from(buffer).toString("base64");

  const embedRes = await fetch(EMBED_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: base64 }),
  });

  if (!embedRes.ok) {
    console.error(`❌ Embedding error for ${publicUrl}:`, await embedRes.text());
    return null;
  }

  const { embedding } = await embedRes.json();
  if (!Array.isArray(embedding) || embedding.length !== 768) {
    console.warn(`⚠️ Invalid embedding shape: ${publicUrl}`);
    return null;
  }

  const sum = embedding.reduce((acc, v) => acc + Math.abs(v), 0);
  if (sum === 0) {
    console.warn(`⚠️ All-zero embedding: ${publicUrl}`);
    return null;
  }

  return embedding;
}

async function main() {
  const photos = await fetchCatalogPhotos();
  console.log(`📸 Found ${photos.length} best catalog ventral photos`);

  let inserted = 0;

  for (const [i, photo] of photos.entries()) {
    const {
      pk_photo_id,
      fk_catalog_id,
      fk_catalog_uuid,
      pk_photo_uuid,
      storage_path,
    } = photo;

    const publicUrl = `${PUBLIC_BUCKET_URL}/${storage_path}`;

    if (!fk_catalog_uuid) {
      console.warn(`⚠️ Skipping photo ${pk_photo_id} — missing catalog UUID`);
      continue;
    }

    console.log(`\n🔄 [${i + 1}/${photos.length}] Embedding photo ${pk_photo_id} → catalog ${fk_catalog_id}`);

    const embedding = await embedImage(publicUrl);
    if (!embedding) continue;

    const norm = embedding.reduce((a, b) => a + Math.abs(b), 0).toFixed(2);
    const hash = hashVector(embedding);
    console.log(`✅ Norm: ${norm} | SHA-1: ${hash}`);

    const { error } = await supabase.from("catalog_embeddings").upsert([
      {
        catalog_id: fk_catalog_uuid,
        pk_catalog_id: fk_catalog_id,
        photo_id: pk_photo_uuid,
        embedding,
      },
    ]);

    if (error) {
      console.error(`❌ DB insert failed for photo ${pk_photo_id}:`, error.message);
    } else {
      console.log(`✅ Saved embedding for catalog ID ${fk_catalog_id}`);
      inserted++;
    }

    await new Promise((res) => setTimeout(res, 200)); // throttle
  }

  console.log(`\n🏁 Finished: ${inserted} embeddings saved to catalog_embeddings`);
}

main();
