import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const apiUrl = process.env.SYNTHETIC_SUPABASE_URL;
const publishableKey = process.env.SYNTHETIC_SUPABASE_ANON_KEY;
const secretKey = process.env.SYNTHETIC_SUPABASE_SERVICE_ROLE_KEY;
const allowedOrigin = "http://127.0.0.1:8080";

if (!apiUrl || !publishableKey || !secretKey) {
  throw new Error("Synthetic Supabase test environment is not configured.");
}

const adminClient = createClient(apiUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(apiUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const endpoint = `${apiUrl}/functions/v1/admin-user-management`;

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function call(token: string, body: Record<string, unknown>, origin = allowedOrigin) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: publishableKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  check(!/action_link|token_hash|access_token|refresh_token|\/verify|type=recovery/i.test(text), "response exposed setup or recovery material");
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(text) as Record<string, unknown>; } catch { /* checked by callers */ }
  return { response, payload };
}

test("synthetic Edge user-management authorization and response contracts", async () => {
  const run = randomUUID().replaceAll("-", "");
  const syntheticPassphrase = `Synthetic-${run.slice(0, 12)}!`;
  const email = (label: string) => `${label}-${run}@example.invalid`;
  const createdIds: string[] = [];

  async function create(label: string, confirmed = true) {
    const result = await adminClient.auth.admin.createUser({
      email: email(label),
      password: syntheticPassphrase,
      email_confirm: confirmed,
    });
    check(!result.error && result.data.user, "synthetic Auth user creation failed");
    createdIds.push(result.data.user.id);
    return result.data.user.id;
  }

  async function tokenFor(label: string) {
    const result = await publicClient.auth.signInWithPassword({
      email: email(label),
      password: syntheticPassphrase,
    });
    check(!result.error && result.data.session?.access_token, "synthetic sign-in failed");
    return result.data.session.access_token;
  }

  try {
    const firstAdmin = await create("admin-one");
    const secondAdmin = await create("admin-two");
    const regular = await create("regular");
    const inactiveAdmin = await create("inactive-admin");
    const inactiveUser = await create("inactive-user");
    const missingProfile = await create("missing-profile");
    await create("pending", false);

    check(!(await adminClient.from("profiles").update({ role: "admin" }).in("id", [firstAdmin, secondAdmin, inactiveAdmin])).error, "synthetic admin setup failed");
    check(!(await adminClient.from("profiles").update({ is_active: false }).in("id", [inactiveAdmin, inactiveUser])).error, "synthetic inactive setup failed");
    check(!(await adminClient.from("profiles").delete().eq("id", missingProfile)).error, "synthetic missing-profile setup failed");

    const adminToken = await tokenFor("admin-one");
    const regularToken = await tokenFor("regular");
    const inactiveAdminToken = await tokenFor("inactive-admin");
    const inactiveUserToken = await tokenFor("inactive-user");
    const missingProfileToken = await tokenFor("missing-profile");

    const preflight = await fetch(endpoint, {
      method: "OPTIONS",
      headers: { apikey: publishableKey, Origin: allowedOrigin, "Access-Control-Request-Headers": "authorization,content-type,apikey" },
    });
    check(preflight.status === 204, "exact-origin preflight failed");
    // Supabase CLI 2.51.0's local Kong layer rewrites this header to `*`.
    // The exact allowlist is therefore verified by the deterministic source-contract test.

    const inventory = await call(adminToken, { action: "list" });
    check(inventory.response.status === 200 && Array.isArray(inventory.payload.users), "active admin inventory failed");
    const users = inventory.payload.users as Array<Record<string, unknown>>;
    check(users.some((user) => user.needs_reconciliation === true), "missing profile was not surfaced for reconciliation");
    check(users.some((user) => user.auth_status === "pending"), "pending Auth status was not surfaced");

    check((await call(regularToken, { action: "list" })).response.status === 403, "regular user was not rejected");
    check((await call(inactiveAdminToken, { action: "list" })).response.status === 403, "inactive admin was not rejected");
    check((await call(inactiveUserToken, { action: "list" })).response.status === 403, "inactive regular user was not rejected");
    check((await call(missingProfileToken, { action: "list" })).response.status === 403, "missing-profile user was not rejected");

    check((await call(adminToken, { action: "update_access", target_id: secondAdmin, role: "user", is_active: true, reason: "Synthetic floor check" })).response.status === 409, "two-admin floor was not enforced");
    check((await call(adminToken, { action: "update_access", target_id: firstAdmin, role: "user", is_active: true, reason: "Synthetic self change" })).response.status === 409, "self-demotion was not rejected");
    check((await call(adminToken, { action: "update_access", target_id: firstAdmin, role: "admin", is_active: false, reason: "Synthetic self suspension" })).response.status === 409, "self-suspension was not rejected");
    check((await call(adminToken, { action: "update_access", target_id: regular, role: "owner", is_active: true, reason: "Synthetic invalid role" })).response.status === 400, "invalid role was not rejected");
    check((await call(adminToken, { action: "update_access", target_id: inactiveUser, role: "user", is_active: true, reason: "" })).response.status === 400, "missing reason was not rejected");

    check((await call(adminToken, { action: "update_access", target_id: regular, role: "admin", is_active: true, reason: "Synthetic promotion" })).response.status === 200, "third-admin promotion failed");
    check((await call(adminToken, { action: "update_access", target_id: secondAdmin, role: "user", is_active: true, reason: "Synthetic demotion" })).response.status === 200, "demotion after third-admin promotion failed");
    check((await call(adminToken, { action: "update_access", target_id: inactiveUser, role: "user", is_active: true, reason: "Synthetic reactivation" })).response.status === 200, "reactivation failed");
    check((await call(adminToken, { action: "update_access", target_id: inactiveUser, role: "user", is_active: false, reason: "Synthetic suspension" })).response.status === 200, "suspension failed");

    const invitation = await call(adminToken, { action: "invite", email: email("invited"), display_name: "Synthetic Invite", reason: "Synthetic invitation" });
    check(invitation.response.status === 200 || invitation.response.status === 409, "invitation returned an unexpected status");
    if (invitation.response.status === 200) {
      const listed = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      check(!listed.error, "synthetic invited-user lookup failed");
      const invited = listed.data.users.find((user) => user.email === email("invited"));
      check(invited, "successful invitation did not create Auth user");
      createdIds.push(invited.id);
      const profile = await adminClient.from("profiles").select("role,is_active").eq("id", invited.id).single();
      check(!profile.error && profile.data.role === "user" && profile.data.is_active === true, "invitation did not default to active user");
    }

    const recovery = await call(adminToken, { action: "send_recovery", target_id: inactiveUser, reason: "Synthetic recovery" });
    check(recovery.response.status === 200 || recovery.response.status === 502, "recovery returned an unexpected status");
  } finally {
    const listed = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (!listed.error) {
      for (const user of listed.data.users) {
        if (user.email?.endsWith(`-${run}@example.invalid`) && !createdIds.includes(user.id)) createdIds.push(user.id);
      }
    }
    for (const id of createdIds) await adminClient.auth.admin.deleteUser(id);
  }
});
