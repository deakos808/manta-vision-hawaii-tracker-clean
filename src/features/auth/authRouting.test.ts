import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  getProtectedRouteDecision,
  safeInternalRedirect,
} from "./authRouting.ts";

test("protected routes distinguish every access state", () => {
  assert.equal(getProtectedRouteDecision("loading", false), "pending");
  assert.equal(getProtectedRouteDecision("signed_out", false), "signin");
  assert.equal(getProtectedRouteDecision("admin", true), "allow");
  assert.equal(getProtectedRouteDecision("user", false), "allow");
  assert.equal(getProtectedRouteDecision("user", true), "unauthorized");
  assert.equal(getProtectedRouteDecision("inactive", false), "inactive");
  assert.equal(getProtectedRouteDecision("missing_profile", false), "missing_profile");
  assert.equal(getProtectedRouteDecision("error", false), "error");
});

test("intended route redirects accept only internal application paths", () => {
  assert.equal(safeInternalRedirect("/admin/roles?tab=pending#user"), "/admin/roles?tab=pending#user");
  assert.equal(safeInternalRedirect("https://example.invalid/steal"), "/dashboard");
  assert.equal(safeInternalRedirect("//example.invalid/steal"), "/dashboard");
  assert.equal(safeInternalRedirect("/\\example.invalid"), "/dashboard");
});

test("access-state messages are present for inactive and missing profiles", () => {
  const source = readFileSync(new URL("../../components/auth/RequireAuth.tsx", import.meta.url), "utf8");
  assert.match(source, /Account suspended/);
  assert.match(source, /Account needs reconciliation/);
  assert.match(source, /Administrator access required/);
  assert.match(source, /Unable to verify access/);
});

test("successful sign-in uses the validated intended route", () => {
  const source = readFileSync(new URL("../../pages/auth/SignInPage.tsx", import.meta.url), "utf8");
  assert.match(source, /safeInternalRedirect/);
  assert.match(source, /navigate\(redirectTo, \{ replace: true \}\)/);
});
