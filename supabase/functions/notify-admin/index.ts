import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.4";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (status: number, error?: string) => new Response(JSON.stringify(error ? { error } : { success: true }), { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escapeHtml = (value: unknown) => String(value ?? "—").slice(0, 500).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply(405, "POST required");
  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!/^Bearer \S+$/i.test(authorization)) return reply(401, "Authentication required");
    let body;
    try { body = await req.json(); } catch { return reply(400, "Invalid request"); }
    if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.submissionId !== "string" || !uuid.test(body.submissionId)) return reply(400, "Only a valid submissionId is accepted");
    const submissionId = body.submissionId.toLowerCase();
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return reply(401, "Authentication required");
    const { data: profile, error: profileError } = await client.from("profiles").select("role,is_active").eq("id", auth.user.id).maybeSingle();
    if (profileError || !profile?.is_active || !["user", "admin"].includes(profile.role)) return reply(403, "Active profile required");
    const { data: row, error } = await client.from("sighting_submissions").select("id,submitted_by,status,submitted_at,sighting_date,manta_count,photo_count,payload").eq("id", submissionId).maybeSingle();
    if (error || !row) return reply(404, "Submission unavailable");
    if (row.status !== "pending") return reply(403, "Pending submission required");
    if (profile.role !== "admin") {
      const age = Date.now() - Date.parse(row.submitted_at);
      if (row.submitted_by !== auth.user.id || !Number.isFinite(age) || age < 0 || age > 60 * 60 * 1000) return reply(403, "Own recent submission required");
    }
    const key = Deno.env.get("RESEND_API_KEY");
    const to = Deno.env.get("ADMIN_NOTIFICATION_EMAIL");
    const from = Deno.env.get("NOTIFICATION_FROM_EMAIL");
    const base = Deno.env.get("APP_BASE_URL");
    if (!key || !to || !from || !base) return reply(503, "Notification configuration unavailable");
    const origin = new URL(base);
    if (origin.protocol !== "https:" || origin.username || origin.password) return reply(503, "Notification configuration unavailable");
    const review = new URL("/sightings/add", origin);
    review.searchParams.set("review", submissionId);
    review.searchParams.set("return", "/admin/review");
    const p = row.payload || {};
    const fields = [
      ["Submitted", row.submitted_at], ["Sighting date", row.sighting_date], ["Photographer", p.photographer],
      ["Mantas", row.manta_count], ["Photos", row.photo_count],
      ["Location", p.location_unknown === true ? "Unknown" : [p.island, p.locationName || p.sitelocation].filter(Boolean).join(" / ") || "—"],
      ["Submission ID", submissionId],
    ];
    const subject = "New MantaTracker sighting submitted";
    const html = `<h2>${subject}</h2>${fields.map(([label, value]) => `<p>${label}: ${escapeHtml(value)}</p>`).join("")}<p><a href="${escapeHtml(review.href)}">Review submission</a></p>`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `manta-sighting-submitted/${submissionId}` },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!response.ok) { console.warn("notify-admin: provider rejected", response.status); return reply(502, "Notification delivery failed"); }
    return reply(200);
  } catch {
    console.warn("notify-admin: request failed");
    return reply(500, "Notification unavailable");
  }
});
