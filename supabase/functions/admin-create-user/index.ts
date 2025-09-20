import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getEnv(name: string, fallback?: string) {
  return Deno.env.get(name) ?? fallback ?? null;
}
function allowedOrigins(): string[] {
  const raw = getEnv("ALLOWED_ORIGINS", "") ?? "";
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}
function pickOrigin(origin: string | null): string {
  const allow = allowedOrigins();
  if (!origin) return "*";
  return allow.includes(origin) || allow.includes("*") ? origin : "*";
}
function corsHeaders(origin: string | null) {
  const o = pickOrigin(origin);
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "authorization,content-type",
    "Vary": "Origin",
  };
}
function jsonHeaders(origin: string | null, status = 200) {
  return { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), jsonHeaders(origin, 405));

  const supabaseUrl = getEnv("SB_URL") ?? getEnv("SUPABASE_URL");
  const anonKey = getEnv("SB_ANON_KEY") ?? getEnv("SUPABASE_ANON_KEY");
  const serviceKey = getEnv("SB_SERVICE_ROLE_KEY") ?? getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const redirectBase = getEnv("REDIRECT_BASE") ?? "http://localhost:8080";
  if (!supabaseUrl || !anonKey || !serviceKey) return new Response(JSON.stringify({ error: "Missing server env" }), jsonHeaders(origin, 500));

  const authHeader = req.headers.get("authorization") ?? "";
  const authed = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: authData, error: authErr } = await authed.auth.getUser();
  if (authErr || !authData?.user) return new Response(JSON.stringify({ error: "Unauthorized" }), jsonHeaders(origin, 401));

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: meProfile, error: meErr } = await admin.from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  if (meErr || !meProfile || meProfile.role !== "admin") return new Response(JSON.stringify({ error: "Forbidden" }), jsonHeaders(origin, 403));

  let body: { email?: string; role?: string; sendEmail?: boolean; name?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), jsonHeaders(origin, 400)); }

  const submittedEmail = (body.email ?? "").trim().toLowerCase();
  const role = (body.role ?? "user").trim();
  const sendEmail = Boolean(body.sendEmail ?? false);
  const name = (body.name ?? "").trim();
  if (!submittedEmail || !/^\S+@\S+\.\S+$/.test(submittedEmail)) return new Response(JSON.stringify({ error: "Valid email required" }), jsonHeaders(origin, 400));
  if (!["user", "admin"].includes(role)) return new Response(JSON.stringify({ error: "Invalid role" }), jsonHeaders(origin, 400));

  const adminAuth = admin.auth.admin;

  // Create if missing; ignore "already registered"
  const createRes = await adminAuth.createUser({ email: submittedEmail, email_confirm: false, user_metadata: { role, name } });
  if (createRes.error && !/already/i.test(createRes.error.message ?? "")) {
    return new Response(JSON.stringify({ error: "createUser failed", detail: createRes.error.message }), jsonHeaders(origin, 400));
  }

  const already = !!(createRes.error && /already/i.test(createRes.error.message ?? ""));
  const linkType = already ? "recovery" : "invite";
  const linkRes = await adminAuth.generateLink({
    type: linkType as any,
    email: submittedEmail,
    options: { redirectTo: `${redirectBase.replace(/\/$/, "")}/set-password` }
  });
  if (linkRes.error) return new Response(JSON.stringify({ error: "generateLink failed", detail: linkRes.error.message }), jsonHeaders(origin, 400));

  const finalUserId = createRes.data?.user?.id ?? (linkRes.data as any)?.user?.id ?? null;
  const actionLink = (linkRes.data as any)?.action_link || (linkRes.data as any)?.properties?.action_link || null;
  if (!finalUserId) return new Response(JSON.stringify({ error: "No user id returned" }), jsonHeaders(origin, 500));

  // Resolve email from Auth (satisfy NOT NULL)
  let profileEmail = submittedEmail;
  try {
    const got = await adminAuth.getUserById(finalUserId);
    const authEmail = got.data?.user?.email?.trim().toLowerCase();
    if (authEmail) profileEmail = authEmail;
  } catch {}

  const upsertRes = await admin.from("profiles")
    .upsert({ id: finalUserId, email: profileEmail, role, is_active: true })
    .select("id").maybeSingle();
  if (upsertRes.error) return new Response(JSON.stringify({ error: "profiles upsert failed", detail: upsertRes.error.message }), jsonHeaders(origin, 400));

  const resendKey = getEnv("RESEND_API_KEY") ?? "";
  const resendFrom = getEnv("RESEND_FROM") ?? "";
  if (sendEmail && actionLink && resendKey && resendFrom) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: resendFrom,
        to: profileEmail,
        subject: already ? "Reset your Hawaii Manta Tracker password" : "Your Hawaii Manta Tracker admin invite",
        html: `<p>Aloha${name ? " " + name : ""},</p><p>${already ? "Use the link below to set or reset your password." : "You have been invited to the Hawaii Manta Tracker admin portal."}</p><p><a href="${actionLink}">${already ? "Set / Reset password" : "Accept your invite"}</a></p>`
      })
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return new Response(JSON.stringify({ warning: "Link created but email send failed", action_link: actionLink, mode: linkType, detail: txt }), jsonHeaders(origin, 207));
    }
  }

  return new Response(JSON.stringify({ user_id: finalUserId, email: profileEmail, action_link: actionLink, role, mode: linkType }), jsonHeaders(origin, 200));
});
