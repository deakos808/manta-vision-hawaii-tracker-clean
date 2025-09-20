import fetch from "node-fetch";
import crypto from "crypto";

const EMBED_ENDPOINT = "http://localhost:5050/embed";
const IMAGE_URL =
  "https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/manta-images/photos/6085/6085.jpg";

function hashVector(v: number[]): string {
  return crypto.createHash("sha1").update(v.join(",")).digest("hex");
}

function l1Norm(v: number[]): number {
  return v.reduce((acc, val) => acc + Math.abs(val), 0);
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
    console.error(`❌ Embedding server error:`, await embedRes.text());
    return null;
  }

  const { embedding } = await embedRes.json();
  if (!Array.isArray(embedding) || embedding.length !== 768) {
    console.error("❌ Invalid embedding shape");
    return null;
  }

  return embedding;
}

async function main() {
  console.log("📥 Embedding photo 1...");
  const v1 = await embedImage(IMAGE_URL);
  if (!v1) return;

  console.log("📥 Embedding photo 2 (same image)...");
  const v2 = await embedImage(IMAGE_URL);
  if (!v2) return;

  const hash1 = hashVector(v1);
  const hash2 = hashVector(v2);
  const norm1 = l1Norm(v1).toFixed(2);
  const norm2 = l1Norm(v2).toFixed(2);
  const cosSim = cosineSimilarity(v1, v2).toFixed(6);

  console.log("✅ Embedding 1:");
  console.log("🧮 L1 Norm:", norm1);
  console.log("🔑 SHA-1 Hash:", hash1);
  console.log("✅ Embedding 2:");
  console.log("🧮 L1 Norm:", norm2);
  console.log("🔑 SHA-1 Hash:", hash2);
  console.log("🎯 Cosine similarity:", cosSim);
}

main();
