// supabase/functions/db_check/index.ts
// Cloud-first URL + "which-key-am-I-using" diagnostics (no secrets leaked).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.4";

const env = (k: string, f = "") => (Deno.env.get(k)?.trim() || f);
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
const cors = () =>
  new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST,OPTIONS" } });

// Safe fingerprint of the service key (first 8 hex chars of SHA-256)
async function fingerprint(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Try to decode JWT payload to show {ref, role} only (no secret)
function decodeRefRole(jwt: string) {
  try {
    const [, payload] = jwt.split(".");
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (payload.length % 4)) % 4);
    const str = atob(b64);
    const j = JSON.parse(str);
    return { ref: j?.ref ?? null, role: j?.role ?? null };
  } catch {
    return { ref: null, role: null };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return cors();
  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  // Prefer cloud URL to avoid 'kong' hijack during local serve
  const API_URL = env("VITE_SUPABASE_URL") || env("SUPABASE_URL");

  // Decide which service key var is actually being used
  const SRK_ENV = Deno.env.get("SERVICE_ROLE_KEY") ? "SERVICE_ROLE_KEY"
                : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ? "SUPABASE_SERVICE_ROLE_KEY"
                : "";

  const SRK = env(SRK_ENV);
  const snap: Record<string, unknown> = {
    API_URL_used: API_URL,
    VITE_SUPABASE_URL: env("VITE_SUPABASE_URL"),
    SUPABASE_URL: env("SUPABASE_URL"),
    SERVICE_ROLE_KEY_present: !!SRK,
    SERVICE_ROLE_SOURCE: SRK_ENV || null,
  };

  if (!API_URL || !SRK) {
    return json({ ok: false, reason: "Missing API URL or service key", env_snapshot: snap });
  }

  // Add safe identity info about the key so you can compare with your shell's $SRK
  const { ref, role } = decodeRefRole(SRK);
  snap.SERVICE_ROLE_FINGERPRINT = await fingerprint(SRK); // compare across runs
  snap.SERVICE_ROLE_LENGTH = SRK.length;
  snap.JWT_ref = ref;    // should equal 'apweteosdbgsolmvcmhn'
  snap.JWT_role = role;  // should equal 'service_role'

  // Try both: (1) PostgREST ping and (2) supabase-js select on your view
  try {
    // 1) Direct REST ping (catalog table)
    const restRes = await fetch(`${API_URL}/rest/v1/catalog?select=pk_catalog_id&limit=1`, {
      headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
    });
    snap.rest_probe_status = restRes.status;

    // 2) supabase-js call to the view
    const supabase = createClient(API_URL, SRK);
    const { data, error } = await supabase.from("catalog_with_photo_view").select("pk_catalog_id").limit(1);

    if (error) throw error;

    return json({ ok: true, api_url_used: API_URL, view_visible: true, env_snapshot: snap, sample: data ?? [] });
  } catch (e: any) {
    return json({ ok: false, api_url_used: API_URL, view_visible: false, error: e?.message ?? String(e), env_snapshot: snap });
  }
});
