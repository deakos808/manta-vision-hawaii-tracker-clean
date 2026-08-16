import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("the consolidated server action validates JWT and authoritative active-admin state", () => {
  const edge = source("../../../supabase/functions/admin-user-management/index.ts");
  assert.match(edge, /auth\.getUser\(\)/);
  assert.match(edge, /select\("id,role,is_active"\)/);
  assert.match(edge, /requireActiveAdmin\(actorProfile\)/);
  assert.doesNotMatch(edge, /user_metadata[^\n]*(role|is_active)/i);
  assert.match(edge, /allowed\.includes\(origin\)/);
  assert.doesNotMatch(edge, /Access-Control-Allow-Origin["']:\s*["']\*/);
  assert.match(edge, /ALLOWED_REDIRECT_ORIGINS/);
});

test("invitations and recovery never return or generate browser-visible action links", () => {
  const edge = source("../../../supabase/functions/admin-user-management/index.ts");
  assert.match(edge, /inviteUserByEmail/);
  assert.match(edge, /resetPasswordForEmail/);
  assert.doesNotMatch(edge, /generateLink|action_link|updateUserById[^\n]*password|deleteUser/);
  assert.match(edge, /Invitations must start with the user role/);
});

test("legacy account-list, creation, and password endpoints are retired", () => {
  for (const path of ["admin-create-user", "admin-set-password", "list-users"]) {
    const legacy = source(`../../../supabase/functions/${path}/index.ts`);
    assert.match(legacy, /status: 410/);
    assert.doesNotMatch(legacy, /SUPABASE_SERVICE_ROLE_KEY|createClient/);
  }
});

test("the proposed migration is fail-closed, transactional, and narrowly granted", () => {
  const sql = source("../../../supabase/migrations/20260816124142_user_access_management.sql");
  assert.match(sql, /profiles policy-name fingerprint mismatch/);
  assert.match(sql, /profiles policy-definition fingerprint mismatch/);
  assert.match(sql, /profiles grant fingerprint mismatch/);
  assert.match(sql, /c\.relrowsecurity is true and c\.relforcerowsecurity is false/);
  assert.match(sql, /role = 'admin' and is_active is true/);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/i);
  assert.match(sql, /revoke all on function public\.admin_set_profile_access[\s\S]*from public, anon/);
  assert.match(sql, /grant execute on function public\.admin_set_profile_access[\s\S]*to authenticated/);
  assert.match(sql, /At least two active administrators must remain/);
  assert.match(sql, /values \(new\.id, new\.email, 'user', true\)/);
  assert.match(sql, /insert into public\.user_access_audit[\s\S]*update public\.profiles|update public\.profiles[\s\S]*insert into public\.user_access_audit/);
});

test("rollback restores the documented policy and grant baseline", () => {
  const rollback = source("../../../supabase/rollback/20260816124142_user_access_management_rollback.sql");
  assert.match(rollback, /drop function if exists public\.admin_set_profile_access/);
  assert.match(rollback, /create policy profiles_admin_update_all/);
  assert.match(rollback, /grant all privileges on table public\.profiles/);
});

test("admin UI has no profile-only deletion or full identifier column", () => {
  const page = source("../../pages/admin/AdminRolesPage.tsx");
  assert.doesNotMatch(page, /deleteRow|User ID|\.delete\(\)/);
  assert.match(page, /Needs reconciliation/);
  assert.match(page, /Suspend/);
  assert.match(page, /Send recovery/);
});
