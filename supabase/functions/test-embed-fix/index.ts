// supabase/functions/test-embed-fix/index.ts
// Validate embeddings from the local container and (optionally) compare two images.
//
// Body:
//   {
//     "storage_path": "photos/2/2.jpg",
//     "other_storage_path": "photos/3/1.jpg"   // optional
//   }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.4";

type Json = Record<string, unknown>;
const env = (k: string, f = "") => (Deno.env.get(k)?.trim() || f);

const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

const cors = () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
  });

const toPublic = (apiUrl: string, path: string) =>
  `${apiUrl}/storage/v1/object/public/manta-images/${path}`;

function l2(v: number[]) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}
function dot(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}
function cosine(a: number[], b: number[]) {
  const na = l2(a);
  const nb = l2(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

async function tryEmbed(url: string, imageUrl: string) {
  const started = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl }),
    });
    const elapsed_ms = Date.now() - started;
    const text = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* ignore */ }
    if (!r.ok) {
      return { ok: false, status: r.status, elapsed_ms, parsed, raw: text };
    }
    const emb = parsed?.embedding;
    if (!Array.isArray(emb)) {
      return { ok: false, status: r.status, elapsed_ms, parsed, raw: text };
    }
    return { ok: true, status: r.status, elapsed_ms, embedding: emb as number[], parsed };
  } catch (e: any) {
    return { ok: false, status: 0, elapsed_ms: Date.now() - started, raw: String(e ?? "unknown error") };
  }
}

function macHostFallbacks(primary: string): string[] {
  const list = [primary];
  try {
    const u = new URL(primary);
    if (u.hostname === "host.docker.internal") {
      list.push(primary.replace("host.docker.internal", "docker.for.mac.host.internal"));
    }
  } catch { /* ignore */ }
  const envFallback = env("LOCAL_EMBED_FALLBACK_URL");
  if (envFallback) list.push(envFallback);
  return Array.from(new Set(list));
}

function zeroBump(D: number) {
  const v = new Array(D).fill(0);
  if (D > 0) v[0] = 1e-6;
  return v;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return cors();
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  // Prefer cloud URL
  const API_URL = env("VITE_SUPABASE_URL") || env("SUPABASE_URL");
  const SERVICE_ROLE = env("SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  const LOCAL_URL = env("LOCAL_EMBEDDING_SERVER_URL");
  const PGVECTOR_DIM = Number(env("PGVECTOR_DIM", "1024")) || 1024;

  if (!API_URL || !SERVICE_ROLE) return json({ error: "Missing API URL or service role key" }, 500);

  const supabase = createClient(API_URL, SERVICE_ROLE);

  const body = await req.json().catch(() => ({} as Json));
  const storage_path = String((body as any)?.storage_path || "");
  const other_path = (body as any)?.other_storage_path ? String((body as any).other_storage_path) : null;

  if (!storage_path) return json({ error: "Provide storage_path" }, 400);

  const imageUrlA = toPublic(API_URL, storage_path);
  const imageUrlB = other_path ? toPublic(API_URL, other_path) : null;

  const diagnostics: any = {
    api_url_used: API_URL,
    candidate_url: LOCAL_URL || null,
  };

  async function getEmbedding(imageUrl: string) {
    const attempts: any[] = [];
    let embedding: number[] | null = null;
    let candidateUsed: string | null = null;
    let status = 0;

    if (LOCAL_URL) {
      for (const candidate of macHostFallbacks(LOCAL_URL)) {
        const res = await tryEmbed(candidate, imageUrl);
        attempts.push({
          candidate,
          status: res.status,
          ok: res.ok,
          elapsed_ms: res.elapsed_ms,
          sample: (res as any).embedding?.slice?.(0, 6) ?? null,
        });
        if (res.ok && Array.isArray((res as any).embedding)) {
          embedding = (res as any).embedding as number[];
          candidateUsed = candidate;
          status = res.status;
          break;
        }
      }
    }
    if (!embedding) {
      // fallback only for smoke test
      embedding = zeroBump(PGVECTOR_DIM);
      candidateUsed = "fallback-zero";
      status = 0;
    }
    return { embedding, attempts, candidateUsed, status };
  }

  const a = await getEmbedding(imageUrlA);
  const dimA = a.embedding.length;
  const normA = Number(l2(a.embedding).toFixed(6));
  const realA = a.status === 200 && dimA === PGVECTOR_DIM && normA > 0.9;

  let compare: any = null;
  if (imageUrlB) {
    const b = await getEmbedding(imageUrlB);
    const dimB = b.embedding.length;
    const normB = Number(l2(b.embedding).toFixed(6));
    const realB = b.status === 200 && dimB === PGVECTOR_DIM && normB > 0.9;
    const cos = Number(cosine(a.embedding, b.embedding).toFixed(6));

    compare = {
      other_storage_path: other_path,
      candidate_used: b.candidateUsed,
      attempts: b.attempts,
      dim: dimB,
      norm: normB,
      real: realB,
      cosine_with_first: cos,
      first_values: b.embedding.slice(0, 8),
    };
  }

  return json({
    status: "ok",
    dim: dimA,
    norm: normA,
    real: realA,
    candidate_used: a.candidateUsed,
    attempts: a.attempts,
    storage_path,
    first_values: a.embedding.slice(0, 8),
    compare,
    hint: "real=true means HTTP 200 from embed server, dim==PGVECTOR_DIM and norm>0.9",
  });
});
