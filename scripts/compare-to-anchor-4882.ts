import fetch from "node-fetch";
import crypto from "crypto";

const EMBED_ENDPOINT = "http://localhost:5050/embed";
const SUPABASE_URL = "https://apweteosdbgsolmvcmhn.supabase.co";

const ANCHOR_ID = 4882;
const COMPARISON_IDS = [4700, 4878];

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
  console.log(`📌 Embedding anchor photo ${ANCHOR_ID}...`);
  const anchorVec = await embedImage(imageUrl(ANCHOR_ID));
  if (!anchorVec) {
    console.error("❌ Failed to embed anchor image");
    return;
  }

  const anchorHash = hashVector(anchorVec);
  const anchorNorm = anchorVec.reduce((a, b) => a + Math.abs(b), 0).toFixed(2);

  console.log(`✅ Anchor ${ANCHOR_ID}: L1 Norm = ${anchorNorm}, SHA-1 = ${anchorHash}`);

  for (const id of COMPARISON_IDS) {
    console.log(`\n📥 Embedding photo ${id}...`);
    const vec = await embedImage(imageUrl(id));
    if (!vec) continue;

    const hash = hashVector(vec);
    const norm = vec.reduce((a, b) => a + Math.abs(b), 0).toFixed(2);
    const cosine = cosineSimilarity(anchorVec, vec).toFixed(6);

    console.log(`✅ Photo ${id}:`);
    console.log(`🧮 L1 Norm = ${norm}`);
    console.log(`🔑 SHA-1 = ${hash}`);
    console.log(`🎯 Cosine similarity vs ${ANCHOR_ID} = ${cosine}`);
  }
}

main();
