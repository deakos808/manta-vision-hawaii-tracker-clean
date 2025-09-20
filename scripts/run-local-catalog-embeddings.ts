// FILE: scripts/test-single-photo-match.ts

import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

// ✅ Embedded configuration
const SUPABASE_URL = "https://apweteosdbgsolmvcmhn.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  "JWT_REDACTED";
const EMBED_ENDPOINT = "http://localhost:5050/embed";
const TEST_IMAGE_URL =
  "https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/manta-images/photos/6085/6085.jpg";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runSingleMatch() {
  try {
    console.log("📥 Fetching test image...");
    const imageRes = await fetch(TEST_IMAGE_URL);

    if (!imageRes.ok) {
      console.error(`❌ HTTP ${imageRes.status} — failed to fetch image`);
      return;
    }

    const buffer = await imageRes.arrayBuffer();
    const byteLength = buffer.byteLength;
    if (byteLength === 0) {
      console.warn("⚠️ Zero-byte image returned");
      return;
    }

    console.log(`📦 Image size: ${byteLength} bytes`);

    const base64 = Buffer.from(buffer).toString("base64");

    console.log("📡 Sending to embedding server...");
    const embedRes = await fetch(EMBED_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: base64 }),
    });

    if (!embedRes.ok) {
      const errText = await embedRes.text();
      console.error("❌ Embedding failed:", errText);
      return;
    }

    const embedJson = await embedRes.json();
    const embedding = embedJson.embedding;

    if (!Array.isArray(embedding) || embedding.length !== 768) {
      console.error("❌ Invalid embedding shape");
      return;
    }

    console.log("✅ Embedding received. Matching against catalog...");

    const { data: matches, error } = await supabase.rpc(
      "match_catalog_embeddings",
      {
        query_embedding: embedding,
        match_count: 10,
        match_threshold: 1.0,
      }
    );

    if (error) {
      console.error("❌ RPC match error:", error.message);
      return;
    }

    console.log("🎯 Top Matches:");
    matches.forEach((match: any, index: number) => {
      console.log(
        `#${index + 1} → catalog ${match.pk_catalog_id} | score: ${match.score.toFixed(4)}`
      );
    });
  } catch (err) {
    console.error("❌ Unexpected error:", err);
  }
}

runSingleMatch();
