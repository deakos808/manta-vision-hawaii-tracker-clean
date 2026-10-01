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
  assert.doesNotMatch(browserSource, /apweteosdbgsolmvcmhn/);
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

test("manta embedding maintenance requires an active administrator", () => {
  const source = read("supabase/functions/embeddings-manta/index.ts");
  assert.match(source, /authorizeCaller\(req, "active-admin"\)/);
  assert.match(source, /\{ admin: supabase \}/);
  assert.match(source, /Deno\.env\.get\("EMBED_URL"\)/);
  assert.doesNotMatch(source, /apweteosdbgsolmvcmhn/);
  assert.doesNotMatch(source, /Access-Control-Allow-Origin["']:\s*["']\*/);
  assert.match(source, /searchParams\.get\("offset"\)/);
  assert.match(source, /text\/event-stream/);
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
      "embeddings-catalog",
      "embeddings-photo",
      "facet-sightings",
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
      "embeddings-manta",
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

test("import commits preserve contracts behind active-admin database authorization", () => {
  const migration = read(
    "supabase/migrations/20261001064839_import_authorization_containment.sql",
  );
  const rollback = read(
    "supabase/rollback/20261001064839_import_authorization_containment_rollback.sql",
  );
  const sqlTest = read("supabase/tests/import_authorization_containment.sql");
  const importPanel = read("src/admin/ImportCsvPanel.tsx");

  for (const target of ["biopsies", "drone_photos"]) {
    assert.match(
      migration,
      new RegExp(`alter function public\\.fn_imports_commit_${target}\\(uuid\\)`),
    );
    assert.match(
      migration,
      new RegExp(`private\\.fn_imports_commit_${target}_impl\\(p_batch\\)`),
    );
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.fn_imports_commit_${target}\\(uuid\\) from public, anon`),
    );
    assert.match(
      rollback,
      new RegExp(`drop function public\\.fn_imports_commit_${target}\\(uuid\\)`),
    );
  }

  assert.match(migration, /actor_id uuid := auth\.uid\(\)/);
  assert.match(migration, /begin;[\s\S]*commit;/);
  assert.match(migration, /role = 'admin' and is_active is true/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /security_invoker = true/);
  assert.match(migration, /with check \(\(select public\.is_admin_user\(\)\)\)/);
  assert.match(migration, /using \(\(select public\.is_admin_user\(\)\)\)/);
  assert.doesNotMatch(migration, /create(?: or replace)? function public\.try_cast_double/i);
  assert.match(rollback, /Fail-closed rollback/);
  assert.match(rollback, /from public, anon, authenticated, service_role/);
  assert.match(rollback, /private import implementation remains callable/);
  assert.match(rollback, /authoritative import staging policy rollback mismatch/);
  assert.doesNotMatch(rollback, /grant\s+(?:all|execute|select|insert)/i);
  assert.doesNotMatch(rollback, /public\.is_admin\(\)/);
  assert.doesNotMatch(rollback, /delete\s+from|truncate|drop\s+table/i);

  assert.match(importPanel, /from\(tableName\)\.insert\(chunk,/);
  assert.match(importPanel, /supabase\.rpc\(commitFn, \{ p_batch: batchId \}\)/);
  assert.match(importPanel, /fn_imports_commit_drone_photos/);

  for (const scenario of [
    "anonymous",
    "active-user",
    "inactive-user",
    "missing-profile",
    "identity-less privileged-role",
  ]) {
    assert.match(sqlTest, new RegExp(scenario));
  }
  assert.match(sqlTest, /Active administrators retain staging inserts/);
  assert.match(sqlTest, /hostile JWT metadata/);
  assert.match(sqlTest, /public\.try_cast_double\('not-a-number'\) is null/);
});

test("organic biopsy entry uses stable correlation and retires the CSV importer", () => {
  const migration = read(
    "supabase/migrations/20261001150410_organic_biopsy_entry_and_legacy_retirement.sql",
  );
  const rollback = read(
    "supabase/rollback/20261001150410_organic_biopsy_entry_and_legacy_retirement_rollback.sql",
  );
  const hardening = read(
    "supabase/migrations/20261001153752_harden_organic_biopsy_integrity.sql",
  );
  const page = read("src/pages/AddSightingPage.tsx");
  const list = read("src/components/mantas/MantasList.tsx");

  assert.match(migration, /add column submission_manta_id text/);
  assert.match(migration, /mantas_sighting_submission_manta_id_uidx/);
  assert.match(migration, /trg_validate_committed_biopsy_mapping/);
  assert.match(migration, /deferrable initially deferred/);
  assert.match(migration, /sighting commit correlation patch fingerprint mismatch/);
  assert.match(migration, /m\.submission_manta_id = manta_payload->>'id'/);
  assert.doesNotMatch(migration, /offset\s*\(|row_number\s*\(/i);
  assert.match(migration, /role in \('user', 'admin'\)/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /drop function public\.fn_imports_commit_biopsies\(uuid\)/);
  assert.match(migration, /drop function private\.fn_imports_commit_biopsies_impl\(uuid\)/);
  assert.match(migration, /revoke all on table public\.stg_biopsies/);
  assert.match(migration, /drone-photo import contract changed unexpectedly/);
  for (const incompatible of [
    "sample_time_utc",
    "latitude",
    "longitude",
    "storage_vial_id",
    "lab_tracking_id",
  ]) {
    assert.doesNotMatch(
      migration.match(/insert into public\.biopsies[\s\S]*?\);/)?.[0] ?? "",
      new RegExp(`\\b${incompatible}\\b`),
    );
  }

  assert.match(page, /commit_sighting_submission_with_biopsies/);
  assert.match(page, /hasOrganicBiopsies\(mantas\)/);
  assert.match(list, /allowBiopsyEntry &&/);
  assert.match(list, /Biopsy collected for/);

  assert.match(rollback, /Fail-closed rollback/);
  assert.match(rollback, /Biopsy submission is disabled/);
  assert.doesNotMatch(rollback, /create function public\.fn_imports_commit_biopsies/i);
  assert.doesNotMatch(rollback, /grant\s+(?:all|execute|select|insert)/i);
  assert.doesNotMatch(rollback, /delete\s+from|truncate|drop\s+table/i);

  assert.match(hardening, /prevent_submission_manta_id_change/);
  assert.match(hardening, /submission correlation IDs are immutable/);
  assert.match(hardening, /validate_biopsy_parent_consistency/);
  assert.match(hardening, /fk_sighting_id is distinct from m\.fk_sighting_id/);
  assert.match(hardening, /fk_catalog_id is distinct from m\.fk_catalog_id/);
  assert.match(hardening, /revoke insert, update on table public\.mantas/);
  assert.match(hardening, /security definer/);
  assert.match(hardening, /set search_path = ''/);
  assert.match(hardening, /role in \(''user'', ''admin''\)/);
});
