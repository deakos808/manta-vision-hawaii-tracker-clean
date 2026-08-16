import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseAction, parseManagedRole, requireActiveAdmin } from "../_shared/user-management-policy.ts";

type Json = Record<string, unknown>;

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error("Server configuration is incomplete.");
  return value;
}

function cors(origin: string | null): HeadersInit {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return {
    ...(origin && allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

function reply(origin: string | null, status: number, body: Json) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

function requiredReason(value: unknown): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length < 3 || result.length > 500) throw new Error("A reason between 3 and 500 characters is required.");
  return result;
}

function approvedRedirect(): string {
  const parsed = new URL(env("PASSWORD_REDIRECT_URL"));
  const secure = parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname));
  const allowed = (Deno.env.get("ALLOWED_REDIRECT_ORIGINS") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!secure || parsed.pathname !== "/set-password" || !allowed.includes(parsed.origin)) {
    throw new Error("Password redirect configuration is not approved.");
  }
  return parsed.toString();
}

serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== "POST") return reply(origin, 405, { error: "Method not allowed." });

  let admin: ReturnType<typeof createClient> | null = null;
  let caller: ReturnType<typeof createClient> | null = null;
  let actorId: string | null = null;
  let action = "unknown";
  let targetId: string | null = null;

  const audit = async (eventType: string, outcome: "attempted" | "success" | "failure", auditReason: string, details: Json = {}) => {
    if (!admin) return null;
    const result = await admin.from("user_access_audit").insert({ event_type: eventType, actor_user_id: actorId, target_user_id: targetId, outcome, reason: auditReason, details }).select("id").single();
    return result.error ? null : result.data.id as number;
  };
  const finishAudit = async (id: number | null, outcome: "success" | "failure", classification?: string) => {
    if (admin && id != null) await admin.from("user_access_audit").update({ outcome, details: classification ? { classification } : {} }).eq("id", id);
  };

  try {
    const supabaseUrl = env("SUPABASE_URL");
    const anonKey = env("SUPABASE_ANON_KEY");
    admin = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return reply(origin, 401, { error: "Authentication required." });

    caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user) return reply(origin, 401, { error: "Authentication failed." });
    actorId = authData.user.id;

    const { data: actorProfile, error: actorError } = await admin.from("profiles").select("id,role,is_active").eq("id", actorId).maybeSingle();
    if (actorError) {
      await audit("privileged_action_failure", "failure", "Actor profile lookup failed.", { classification: "actor_profile_error" });
      return reply(origin, 500, { error: "Unable to verify administrator access." });
    }
    try { requireActiveAdmin(actorProfile); }
    catch {
      await audit("privileged_action_failure", "failure", "Administrator authorization rejected.", { classification: actorProfile ? "inactive_or_non_admin" : "missing_profile" });
      return reply(origin, 403, { error: "Active administrator access is required." });
    }

    let body: Json;
    try { body = await request.json(); } catch { return reply(origin, 400, { error: "Invalid JSON request." }); }
    action = parseAction(body.action);
    targetId = typeof body.target_id === "string" ? body.target_id : null;

    if (action === "list") {
      const [{ data: authUsers, error: usersError }, { data: profiles, error: profilesError }] = await Promise.all([
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        admin.from("profiles").select("id,role,is_active,created_at"),
      ]);
      if (usersError || profilesError) throw new Error("User inventory could not be loaded.");
      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      const users = authUsers.users.map((user) => {
        const profile = profileById.get(user.id);
        const bannedUntil = user.banned_until ? Date.parse(user.banned_until) : 0;
        const metadata = user.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
        return {
          id: user.id,
          email: user.email ?? "",
          display_name: typeof metadata.display_name === "string" ? metadata.display_name : typeof metadata.name === "string" ? metadata.name : null,
          auth_status: bannedUntil > Date.now() ? "banned" : user.email_confirmed_at ? "confirmed" : "pending",
          application_role: profile?.role === "admin" || profile?.role === "user" ? profile.role : null,
          application_active: profile?.is_active ?? null,
          needs_reconciliation: !profile,
          created_at: user.created_at ?? profile?.created_at ?? null,
        };
      });
      return reply(origin, 200, { users });
    }

    if (action === "invite") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("A valid email is required.");
      if (body.role != null && body.role !== "user") throw new Error("Invitations must start with the user role.");
      const displayName = typeof body.display_name === "string" ? body.display_name.trim().slice(0, 120) : "";
      const auditReason = requiredReason(body.reason);
      const auditId = await audit("invitation", "attempted", auditReason, { requested_role: "user" });
      if (auditId == null) throw new Error("The invitation was not started because its audit entry could not be recorded.");
      const invited = await admin.auth.admin.inviteUserByEmail(email, { data: { display_name: displayName }, redirectTo: approvedRedirect() });
      targetId = invited.data.user?.id ?? null;
      await admin.from("user_access_audit").update({
        target_user_id: targetId,
        outcome: invited.error || !targetId ? "failure" : "success",
        details: invited.error ? { classification: "invite_delivery_rejected" } : { requested_role: "user" },
      }).eq("id", auditId);
      if (invited.error || !targetId) return reply(origin, 409, { error: "Invitation could not be sent. Use recovery for an existing account." });
      return reply(origin, 200, { ok: true });
    }

    if (!targetId) throw new Error("A target user is required.");
    if (action === "send_recovery") {
      const auditReason = requiredReason(body.reason);
      const auditId = await audit("recovery", "attempted", auditReason);
      if (auditId == null) throw new Error("Recovery was not started because its audit entry could not be recorded.");
      const userResult = await admin.auth.admin.getUserById(targetId);
      const email = userResult.data.user?.email;
      if (userResult.error || !email) {
        await finishAudit(auditId, "failure", "target_not_found");
        return reply(origin, 404, { error: "The Auth account could not be found." });
      }
      const mailer = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const sent = await mailer.auth.resetPasswordForEmail(email, { redirectTo: approvedRedirect() });
      await finishAudit(auditId, sent.error ? "failure" : "success", sent.error ? "recovery_delivery_rejected" : undefined);
      if (sent.error) return reply(origin, 502, { error: "Recovery email could not be sent." });
      return reply(origin, 200, { ok: true });
    }

    const requestedRole = parseManagedRole(body.role);
    if (typeof body.is_active !== "boolean") throw new Error("Active status must be true or false.");
    const result = await caller.rpc("admin_set_profile_access", {
      target_user_id: targetId,
      requested_role: requestedRole,
      requested_is_active: body.is_active,
      change_reason: requiredReason(body.reason),
    });
    if (result.error) {
      await audit("privileged_action_failure", "failure", "Profile access change rejected.", { action, classification: "database_policy_rejected" });
      const known = [
        "Administrators cannot demote or suspend themselves",
        "At least two active administrators must remain",
        "Target application profile does not exist",
        "Invalid application role",
      ].find((message) => result.error.message.includes(message));
      return reply(origin, 409, { error: known ?? "The access change was rejected." });
    }
    return reply(origin, 200, { ok: true });
  } catch (error) {
    await audit("privileged_action_failure", "failure", "Privileged user-management action failed.", { action, classification: "request_rejected" });
    return reply(origin, 400, { error: error instanceof Error ? error.message : "Request failed." });
  }
});
