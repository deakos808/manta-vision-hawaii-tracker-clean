import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function env(k: string) { return Deno.env.get(k) ?? ""; }

serve(async (req) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type,x-bootstrap-secret",
    "Content-Type": "application/json",
    "Vary": "Origin"
  };

  if (req.method === "OPTIONS") return new Response(null, { headers });

  try {
    const secret = env("BOOTSTRAP_SECRET");
    const provided = req.headers.get("x-bootstrap-secret") ?? "";
    if (!secret || provided !== secret) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers });
    }

    const SB_URL = env("SB_URL") || env("SUPABASE_URL");
    const SB_SERVICE = env("SB_SERVICE_ROLE_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
    if (!SB_URL || !SB_SERVICE) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500, headers });
    }

    const { email, new_password } = await req.json().catch(() => ({}));
    if (!email || !new_password || String(new_password).length < 8) {
      return new Response(JSON.stringify({ error: "Email and new_password (>=8) required" }), { status: 400, headers });
    }

    const admin = createClient(SB_URL, SB_SERVICE);

    // Get user id via profiles (id = auth.users.id)
    const { data: prof, error: profErr } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (profErr || !prof?.id) {
      return new Response(JSON.stringify({ error: "User not found in profiles" }), { status: 404, headers });
    }

    const upd = await admin.auth.admin.updateUserById(prof.id, { password: new_password });
    if (upd.error) {
      return new Response(JSON.stringify({ error: upd.error.message }), { status: 400, headers });
    }

    return new Response(JSON.stringify({ ok: true, user_id: prof.id }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers });
  }
});
