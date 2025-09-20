import fetch from "node-fetch";
import crypto from "crypto";

const EMBED_ENDPOINT = "http://localhost:5050/embed";
const SUPABASE_URL = "https://apweteosdbgsolmvcmhn.supabase.co";

const PHOTO_IDS = [4697, 4700, 4878, 4882];

function imageUrl(photoId: number): string {
  return `${SUPABASE_URL}/storage/v1/object/public/manta-images/photos/${photoId}/${photoId}.jpg`;
}

function hashVector(v: number[]): string {
  return crypto.createHash("sha1").update(v.join(",")).digest("hex");
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (normA * normB);
}

async function embedImage(url: string): Promise<number[] | null> {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`❌ Failed to fetch image (${res.status}): ${url}`);
    return null;
  }

  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  const embedRes = await fetch(EMBED_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: base64 }),
  });

  if (!embedRes.ok) {
    console.error(`❌ Embedding error for ${url}:`, await embedRes.text());
    return null;
  }

  const { embedding } = await embedRes.json();
  if (!Array.isArray(embedding) || embedding.length !== 768) {
    console.error(`❌ Invalid embedding shape for ${url}`);
    return null;
  }

  return embedding;
}

async function main() {
  const vectors: Record<number, number[]> = {};

  for (const photoId of PHOTO_IDS) {
    const url = imageUrl(photoId);
    console.log(`📥 Embedding photo ${photoId}...`);

    const embedding = await embedImage(url);
    if (!embedding) {
      console.warn(`⚠️ Skipping photo ${photoId}`);
      continue;
    }

    const hash = hashVector(embedding);
    const norm = embedding.reduce((acc, v) => acc + Math.abs(v), 0).toFixed(2);

    console.log(`✅ Photo ${photoId}: L1 norm = ${norm}, hash = ${hash}`);
    vectors[photoId] = embedding;
  }

  const anchor = vectors[4697];
  if (!anchor) {
    console.error("❌ Anchor photo 4697 missing — cannot compare");
    return;
  }

  console.log(`\n🎯 Cosine similarity against photo 4697:\n`);

  for (const photoId of PHOTO_IDS) {
    if (photoId === 4697) continue;
    const vec = vectors[photoId];
    if (!vec) continue;

    const cos = cosineSimilarity(anchor, vec).toFixed(6);
    console.log(`🟦 photo ${photoId} vs 4697 → cosine = ${cos}`);
  }
}

main();
