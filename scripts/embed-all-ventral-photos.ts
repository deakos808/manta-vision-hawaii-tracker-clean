// scripts/embed-all-ventral-photos.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.4";
import * as fs from "https://deno.land/std@0.224.0/fs/mod.ts";

const SUPABASE_URL = "https://apweteosdbgsolmvcmhn.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY =
  "JWT_REDACTED";
const EMBED_ENDPOINT = "http://localhost:5050/embed";
const BUCKET_BASE = `${SUPABASE_URL}/storage/v1/object/public/manta-images/`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Prepare logging
const logPath = "./logs/embed_photos_ventral.csv";
await fs.ensureFile(logPath);
const logFile = await Deno.open(logPath, { append: true, create: true });

function log(msg: string) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  logFile.write(new TextEncoder().encode(line + "\n"));
  console.log(line);
}

async function hashVector(v: number[]): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(v.join(","));
  const buffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function l2Norm(v: number[]): number {
  return Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
}

async function embedImageFromUrl(url: string): Promise<number[] | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      log(`❌ Failed to fetch: ${url}`);
      return null;
    }

    const buffer = await res.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

    const embedRes = await fetch(EMBED_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: base64 }),
    });

    if (!embedRes.ok) {
      log(`❌ Embed failed: ${await embedRes.text()}`);
      return null;
    }

    const json = await embedRes.json();
    return json.embedding;
  } catch (err) {
    log(`❌ Error during embedding: ${err.message}`);
    return null;
  }
}

const seenHashes = new Set<string>();

async function main() {
  const pageSize = 1000;
  let from = 0;
  let totalInserted = 0;

  while (true) {
    const { data: batch, error } = await supabase
      .from("photos")
      .select("pk_photo_id, pk_photo_uuid, storage_path")
      .eq("photo_view", "ventral")
      .not("storage_path", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!batch || batch.length === 0) break;

    log(`📸 Processing ${batch.length} photos (offset ${from})...`);

    for (const photo of batch) {
      const { pk_photo_id, pk_photo_uuid, storage_path } = photo;
      const imageUrl = `${BUCKET_BASE}${storage_path}`;

      if (!pk_photo_id || !pk_photo_uuid || !storage_path) {
        log(`⚠️ Skipping photo ${pk_photo_id} — missing data`);
        continue;
      }

      log(`\n📥 Embedding photo ${pk_photo_id}`);
      const vector = await embedImageFromUrl(imageUrl);

      if (!vector || vector.length !== 768) {
        log(`⚠️ Skipping ${pk_photo_id} — invalid vector`);
        continue;
      }

      const norm = l2Norm(vector);
      const hash = await hashVector(vector);

      if (Math.abs(norm - 1.0) < 1e-6) {
        log(`⚠️ Norm = 1.0000 — skipping ${pk_photo_id} as possible junk`);
        continue;
      }

      if (seenHashes.has(hash)) {
        log(`⚠️ Duplicate hash — skipping ${pk_photo_id}`);
        continue;
      }

      seenHashes.add(hash);
      log(`✅ Norm: ${norm.toFixed(4)} | Hash: ${hash}`);

      const { error: updateErr } = await supabase
        .from("photos")
        .update({ embedding: vector })
        .eq("pk_photo_id", pk_photo_id);

      if (updateErr) {
        log(`❌ Update failed for ${pk_photo_id}: ${updateErr.message}`);
        continue;
      }

      log(`✅ Saved → photos.embedding`);
      totalInserted++;
      await new Promise((res) => setTimeout(res, 50));
    }

    from += pageSize;
  }

  log(`\n🏁 All done. Total embeddings inserted: ${totalInserted}`);
  logFile.close();
}

main();
