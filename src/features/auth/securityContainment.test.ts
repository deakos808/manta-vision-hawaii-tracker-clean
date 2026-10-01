import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(path.join(root, directory), { recursive: true })
    .map(String)
    .map((entry) => path.join(directory, entry))
    .filter((entry) => statSync(path.join(root, entry)).isFile())
    .filter((entry) => /\.(?:ts|tsx|js|jsx|cjs|mjs)$/.test(entry))
    .filter((entry) => !/\.test\.[^.]+$/.test(entry));
}

test("browser source accepts only the publishable Supabase key name", () => {
  const browserSource = sourceFiles("src").map(read).join("\n");
  assert.match(browserSource, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(browserSource, /VITE_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(browserSource, /VITE_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(browserSource, /sb_secret_[A-Za-z0-9_-]+/);
});

test("confirmed unauthenticated or drifted endpoints fail closed", () => {
  for (const functionName of [
    "create-user",
    "delete-manta",
    "delete-photo",
    "generate-newphoto-embedding",
  ]) {
    const source = read(`supabase/functions/${functionName}/index.ts`);
    assert.match(source, /status:\s*410/);
    assert.doesNotMatch(source, /createClient/);
    assert.doesNotMatch(source, /SERVICE_ROLE|SECRET_KEY/);
  }
});

test("remaining privileged user and drone actions require active admin", () => {
  const userManagement = read("supabase/functions/admin-user-management/index.ts");
  const droneCommit = read("supabase/functions/commit-drone-draft/index.ts");
  for (const source of [userManagement, droneCommit]) {
    assert.match(source, /requireActiveAdmin/);
    assert.match(source, /auth\.getUser/);
    assert.match(source, /SUPABASE_PUBLISHABLE_KEY/);
    assert.match(source, /SUPABASE_SECRET_KEY/);
  }
  assert.doesNotMatch(droneCommit, /Access-Control-Allow-Origin["']:\s*["']\*/);
});

test("gateway JWT verification is explicit for contained functions", () => {
  const config = read("supabase/config.toml");
  for (const functionName of [
    "admin-user-management",
    "create-user",
    "delete-manta",
    "delete-photo",
    "commit-drone-draft",
    "generate-newphoto-embedding",
  ]) {
    const section = config.match(new RegExp(`\\[functions\\.${functionName}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
    assert.ok(section, `missing config for ${functionName}`);
    assert.match(section[1], /verify_jwt\s*=\s*true/);
  }
});

test("database proposal preserves the two-active-admin floor and fail-closed fingerprint", () => {
  const migration = read("supabase/migrations/20260816124142_user_access_management.sql");
  assert.match(migration, /manta-active-admin-floor/);
  assert.match(migration, /At least two active administrators must remain/);
  assert.match(migration, /profiles RLS fingerprint mismatch/);
  assert.match(migration, /profiles policy-definition fingerprint mismatch/);
});
