import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function env(k: string, fb?: string) { return Deno.env.get(k) ?? fb ?? ""; }

serve(async (req) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type,x-bootstrap-secret",
    "Vary": "Origin",
    "Content-Type": "application/json"
  };
  if (req.method === "OPTIONS") return new Response(null, { headers });

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

  let body: { email?: string, role?: "admin" | "user" };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers }); }

  const email = (body.email ?? "").trim().toLowerCase();
  const role = (body.role ?? "admin") as "admin" | "user";
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return new Response(JSON.stringify({ error: "Valid email required" }), { status: 400, headers });
  }

  const admin = createClient(SB_URL, SB_SERVICE);

  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error && !/already/i.test(created.error.message ?? "")) {
    return new Response(JSON.stringify({ error: "createUser failed", detail: created.error.message }), { status: 400, headers });
  }

  const linkRes = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: (Deno.env.get("REDIRECT_BASE") ?? "http://localhost:8080") + "/set-password" } });
  if (linkRes.error) {
    return new Response(JSON.stringify({ error: "generateLink failed", detail: linkRes.error.message }), { status: 400, headers });
  }

  const userId = (linkRes.data as any)?.user?.id ?? created.data?.user?.id ?? null;
  const actionLink = (linkRes.data as any)?.action_link || (linkRes.data as any)?.properties?.action_link || null;
  if (!userId) return new Response(JSON.stringify({ error: "No user id returned" }), { status: 500, headers });

  const up = await admin.from("profiles").upsert({ id: userId, email, role, is_active: true }).select("id").maybeSingle();
  if (up.error) return new Response(JSON.stringify({ error: "profiles upsert failed", detail: up.error.message }), { status: 400, headers });

  return new Response(JSON.stringify({ user_id: userId, email, role, action_link: actionLink }), { status: 200, headers });
});
