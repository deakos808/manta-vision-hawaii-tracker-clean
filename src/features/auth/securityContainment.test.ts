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

test("photo embedding preserves its contract behind active-user authorization", () => {
  const edge = read("supabase/functions/generate-newphoto-embedding/index.ts");
  const caller = read("src/components/matching/CatalogMatchModal.tsx");
  const authorization = read("supabase/functions/_shared/authorization.ts");

  assert.match(edge, /authorizeCaller\(request, "active-user"\)/);
  assert.match(
    authorization,
    /profile\.role !== "admin" && profile\.role !== "user"/,
  );
  assert.match(edge, /body\.photo_id/);
  assert.match(edge, /from\("temp_photos"\)[\s\S]*select\("photo_url"\)/);
  assert.match(edge, /JSON\.stringify\(\{ image_base64: imageBase64 \}\)/);
  assert.match(edge, /from\("temp_photos"\)[\s\S]*update\(\{ embedding \}\)/);
  assert.match(edge, /status: "ok", photo_id: photoId/);
  assert.doesNotMatch(
    edge,
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  );
  assert.doesNotMatch(edge, /Access-Control-Allow-Origin["']:\s*["']\*/);
  assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY/);
  assert.match(
    authorization,
    /requiredEnv\(\s*"SUPABASE_SECRET_KEY",\s*"SERVICE_ROLE_KEY",\s*"SUPABASE_SERVICE_ROLE_KEY"/,
  );

  assert.match(
    caller,
    /supabase\.functions\.invoke\([\s\S]*["']generate-newphoto-embedding["'][\s\S]*photo_id:\s*tempId/,
  );
  assert.doesNotMatch(
    caller,
    /apweteosdbgsolmvcmhn\.functions\.supabase\.co\/generate-newphoto-embedding/,
  );
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

test("active catalog maintenance contracts require active administrators", () => {
  const selfMatch = read("supabase/functions/catalog_selfmatch/index.ts");
  const mergeCatalogs = read("supabase/functions/merge-catalogs/index.ts");
  const selfMatchCaller = read("src/pages/admin/MatchingPage.tsx");
  const mergeCaller = read("src/pages/admin/FindDuplicates/data/catalog.service.ts");

  for (const source of [selfMatch, mergeCatalogs]) {
    assert.match(source, /authorizeCaller\(req, "active-admin"\)/);
    assert.doesNotMatch(source, /Access-Control-Allow-Origin["']:\s*["']\*/);
  }
  assert.match(
    selfMatchCaller,
    /supabase\.functions\.invoke\("catalog_selfmatch"/,
  );
  assert.match(
    mergeCaller,
    /supabase\.functions\.invoke\("merge-catalogs"/,
  );
});

test("obsolete and diagnostic privileged functions are excluded from deployment", () => {
  const config = read("supabase/config.toml");
  for (
    const functionName of [
      "bootstrap-admin",
      "confirm-user",
      "db_check",
      "embeddings-catalog-missing",
      "match-manta",
      "stream-sighting-embedding-update",
      "test-embed-fix",
      "update-password",
      "whoami",
      "envtest",
      "jwt-debug",
    ]
  ) {
    const section = config.match(
      new RegExp(`\\[functions\\.${functionName}\\]([\\s\\S]*?)(?=\\n\\[|$)`),
    );
    assert.ok(section, `missing deployment disposition for ${functionName}`);
    assert.match(section[1], /enabled\s*=\s*false/);
  }
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
      "catalog_selfmatch",
      "merge-catalogs",
    ]
  ) {
    const section = config.match(
      new RegExp(`\\[functions\\.${functionName}\\]([\\s\\S]*?)(?=\\n\\[|$)`),
    );
    assert.ok(section, `missing config for ${functionName}`);
    assert.match(section[1], /verify_jwt\s*=\s*true/);
  }
});

test("database proposal preserves the one-active-admin floor and fail-closed fingerprint", () => {
  const migration = read(
    "supabase/migrations/20260816124142_user_access_management.sql",
  );
  assert.match(migration, /manta-active-admin-floor/);
  assert.match(migration, /At least one active administrator must remain/);
  assert.match(migration, /Administrators cannot demote, suspend, or deactivate themselves/);
  assert.match(migration, /active_admin_count <= 1/);
  assert.match(migration, /profiles RLS fingerprint mismatch/);
  assert.match(migration, /profiles policy-definition fingerprint mismatch/);
});
