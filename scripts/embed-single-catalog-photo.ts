import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import crypto from "crypto";

// ✅ Supabase config
const SUPABASE_URL = "https://apweteosdbgsolmvcmhn.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  "JWT_REDACTED";
const EMBED_ENDPOINT = "http://localhost:5050/embed";

// ✅ Catalog & photo info
const TEST_PK_CATALOG_ID = 835;
const TEST_CATALOG_UUID = "5cf47af9-dbe0-45e5-a166-b18088ee8667"; // ✅ correct UUID from catalog table
const TEST_IMAGE_PATH = "photos/6085/6085.jpg";
const IMAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/manta-images/${TEST_IMAGE_PATH}`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function hashVector(v: number[]): string {
  return crypto.createHash("sha1").update(v.join(",")).digest("hex");
}

async function main() {
  try {
    console.log(`📥 Downloading image: ${IMAGE_URL}`);
    const res = await fetch(IMAGE_URL);
    if (!res.ok) {
      console.error(`❌ HTTP ${res.status} — Failed to fetch image`);
      return;
    }

    const buffer = await res.arrayBuffer();
    const byteLength = buffer.byteLength;
    if (byteLength === 0) {
      console.warn("⚠️ Zero-byte image");
      return;
    }

    console.log(`📦 Image size: ${byteLength} bytes`);
    const base64 = Buffer.from(buffer).toString("base64");

    const embedRes = await fetch(EMBED_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: base64 }),
    });

    if (!embedRes.ok) {
      console.error("❌ Embedding server error:", await embedRes.text());
      return;
    }

    const { embedding } = await embedRes.json();

    if (!Array.isArray(embedding) || embedding.length !== 768) {
      console.warn("⚠️ Invalid embedding shape");
      return;
    }

    const sum = embedding.reduce((acc, v) => acc + Math.abs(v), 0);
    if (sum === 0) {
      console.warn("⚠️ All-zero embedding");
      return;
    }

    const hash = hashVector(embedding);

    console.log("✅ Embedding validated");
    console.log("🧮 L1 Norm:", sum.toFixed(2));
    console.log("🔑 SHA-1 Hash:", hash);

    const { error } = await supabase.from("catalog_embeddings").upsert([
      {
        catalog_id: TEST_CATALOG_UUID,        // ✅ Correct UUID from catalog table
        pk_catalog_id: TEST_PK_CATALOG_ID,    // ✅ Integer for easy joins
        embedding,
        // photo_id intentionally excluded to avoid FK issue
      },
    ]);

    if (error) {
      console.error("❌ DB insert failed:", error.message);
    } else {
      console.log(`✅ Vector saved to catalog_embeddings for ID ${TEST_PK_CATALOG_ID}`);
    }
  } catch (err) {
    console.error("❌ Unexpected error:", err);
  }
}

main();
