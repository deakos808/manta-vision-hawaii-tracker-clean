import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relative: string) =>
  readFileSync(path.join(root, relative), "utf8");

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

test("drifted matching endpoint remains fail closed pending contract reconciliation", () => {
  const source = read(
    "supabase/functions/generate-newphoto-embedding/index.ts",
  );
  assert.match(source, /status:\s*410/);
  assert.doesNotMatch(source, /createClient/);
  assert.doesNotMatch(source, /SERVICE_ROLE|SECRET_KEY/);
});

test("legacy create and delete contracts require an active administrator", () => {
  const authorization = read("supabase/functions/_shared/authorization.ts");
  assert.match(authorization, /auth\.getUser\(token\)/);
  assert.match(authorization, /select\("id,role,is_active"\)/);
  assert.match(authorization, /requireActiveAdmin\(profile\)/);
  assert.doesNotMatch(authorization, /user_metadata[\s\S]*(role|is_active)/i);
  assert.doesNotMatch(
    authorization,
    /Access-Control-Allow-Origin["']:\s*["']\*/,
  );

  const createUser = read("supabase/functions/create-user/index.ts");
  assert.match(createUser, /authorizeCaller\(request, "active-admin"\)/);
  assert.match(createUser, /body\.admin_id/);
  assert.match(createUser, /adminId !== actor\.id/);
  assert.match(createUser, /success: true, user_id: userId, emailed: false/);

  const deleteManta = read("supabase/functions/delete-manta/index.ts");
  assert.match(deleteManta, /authorizeCaller\(request, "active-admin"\)/);
  assert.match(deleteManta, /body\.pk_manta_id/);
  assert.match(deleteManta, /success: true/);

  const deletePhoto = read("supabase/functions/delete-photo/index.ts");
  assert.match(deletePhoto, /authorizeCaller\(request, "active-admin"\)/);
  assert.match(deletePhoto, /body\.pk_photo_id/);
  assert.match(deletePhoto, /success: true/);
});

test("remaining privileged user and drone actions require active admin", () => {
  const userManagement = read(
    "supabase/functions/admin-user-management/index.ts",
  );
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
  for (
    const functionName of [
      "admin-user-management",
      "create-user",
      "delete-manta",
      "delete-photo",
      "commit-drone-draft",
      "generate-newphoto-embedding",
    ]
  ) {
    const section = config.match(
      new RegExp(`\\[functions\\.${functionName}\\]([\\s\\S]*?)(?=\\n\\[|$)`),
    );
    assert.ok(section, `missing config for ${functionName}`);
    assert.match(section[1], /verify_jwt\s*=\s*true/);
  }
});

test("database proposal preserves the two-active-admin floor and fail-closed fingerprint", () => {
  const migration = read(
    "supabase/migrations/20260816124142_user_access_management.sql",
  );
  assert.match(migration, /manta-active-admin-floor/);
  assert.match(migration, /At least two active administrators must remain/);
  assert.match(migration, /profiles RLS fingerprint mismatch/);
  assert.match(migration, /profiles policy-definition fingerprint mismatch/);
});
