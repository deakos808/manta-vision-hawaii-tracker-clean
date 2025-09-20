// FILE: scripts/embed-single-catalog-photo.ts

import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";
import crypto from "crypto";

// ✅ Embedded config
const SUPABASE_URL = "https://apweteosdbgsolmvcmhn.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwd2V0ZW9zZGJnc29sbXZjbWhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Njk4NzgyOSwiZXhwIjoyMDYyNTYzODI5fQ.z0CMeV4Sqyzpan-Sj3hVSr6xIXg380T7LXV70JMuFcs";
const EMBED_ENDPOINT = "http://localhost:5050/embed";

const TEST_CATALOG_ID = 835;
const TEST_IMAGE_PATH = "photos/6085/6085.jpg";
const PUBLIC_URL = `${SUPABASE_URL}/storage/v1/object/public/manta-images/${TEST_IMAGE_PATH}`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function hashVector(v: number[]): string {
  return crypto.createHash("sha1").update(v.join(",")).digest("hex");
}

async function main() {
  try {
    console.log(`📥 Downloading image: ${PUBLIC_URL}`);
    const res = await fetch(PUBLIC_URL);
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
    const hash = hashVector(embedding);

    if (sum === 0) {
      console.warn("⚠️ All-zero embedding");
      return;
    }

    console.log("✅ Embedding validated");
    console.log("🧮 L1 Norm:", sum.toFixed(2));
    console.log("🔑 Hash:", hash);
    console.log("📤 Writing to catalog_embeddings...");

    const { error } = await supabase.from("catalog_embeddings").upsert([
      {
        pk_catalog_id: TEST_CATALOG_ID,
        catalog_id: TEST_CATALOG_ID,
        embedding,
      },
    ]);

    if (error) {
      console.error("❌ DB insert failed:", error.message);
    } else {
      console.log(`✅ Vector saved to catalog_embeddings for ID ${TEST_CATALOG_ID}`);
    }
  } catch (err) {
    console.error("❌ Unexpected error:", err);
  }
}

main();
