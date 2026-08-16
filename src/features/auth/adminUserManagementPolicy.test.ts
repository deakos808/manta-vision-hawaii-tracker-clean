import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAction,
  parseManagedRole,
  planAccessChange,
  requireActiveAdmin,
  type AccessProfile,
} from "../../../supabase/functions/_shared/user-management-policy.ts";

const admin: AccessProfile = { id: "actor-admin", role: "admin", is_active: true };
const user: AccessProfile = { id: "target-user", role: "user", is_active: true };

test("active admins may list, invite, update, suspend, and reactivate", () => {
  for (const action of ["list", "invite", "send_recovery", "update_access"]) {
    assert.equal(parseAction(action), action);
  }
  assert.equal(requireActiveAdmin(admin), admin);
  assert.deepEqual(planAccessChange({ actor: admin, target: user, requestedRole: "user", requestedActive: false, reason: "Seasonal access ended", activeAdminCount: 2 }), {
    role: "user", isActive: false, reason: "Seasonal access ended",
  });
  assert.deepEqual(planAccessChange({ actor: admin, target: { ...user, is_active: false }, requestedRole: "user", requestedActive: true, reason: "Access approved again", activeAdminCount: 2 }), {
    role: "user", isActive: true, reason: "Access approved again",
  });
});

test("regular, inactive, and missing-profile actors are rejected", () => {
  assert.throws(() => requireActiveAdmin(user), /administrator access/i);
  assert.throws(() => requireActiveAdmin({ ...admin, is_active: false }), /inactive/i);
  assert.throws(() => requireActiveAdmin(null), /no application profile/i);
});

test("invalid actions and roles are rejected", () => {
  assert.throws(() => parseAction("delete"), /unsupported/i);
  assert.throws(() => parseManagedRole("owner"), /invalid/i);
});

test("self-demotion and self-suspension are rejected", () => {
  assert.throws(() => planAccessChange({ actor: admin, target: admin, requestedRole: "user", requestedActive: true, reason: "Changing duties", activeAdminCount: 3 }), /cannot demote or suspend themselves/i);
  assert.throws(() => planAccessChange({ actor: admin, target: admin, requestedRole: "admin", requestedActive: false, reason: "Taking leave", activeAdminCount: 3 }), /cannot demote or suspend themselves/i);
});

test("the two-active-admin floor is protected", () => {
  const otherAdmin = { id: "other-admin", role: "admin", is_active: true };
  assert.throws(() => planAccessChange({ actor: admin, target: otherAdmin, requestedRole: "user", requestedActive: true, reason: "Changing duties", activeAdminCount: 2 }), /at least two/i);
  assert.doesNotThrow(() => planAccessChange({ actor: admin, target: otherAdmin, requestedRole: "user", requestedActive: true, reason: "Changing duties", activeAdminCount: 3 }));
});

test("a rejected plan cannot partially mutate caller state", () => {
  const target = { id: "other-admin", role: "admin", is_active: true };
  const before = structuredClone(target);
  assert.throws(() => planAccessChange({ actor: admin, target, requestedRole: "user", requestedActive: true, reason: "Changing duties", activeAdminCount: 2 }));
  assert.deepEqual(target, before);
});
