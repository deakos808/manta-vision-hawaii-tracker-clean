import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const stem = "20261109084245_contain_legacy_biopsy_kona_table_access";
const forward = read(`../migrations/${stem}.sql`);
const rollback = read(`../rollback/${stem}_rollback.sql`);
const targets = [
  "biopsy_relatedness_review", "kona_age_at_biopsy_legacy", "kona_biopsy_age_rank",
  "stg_biopsies_main", "stg_biopsies_mprf_raw", "stg_corey_kona_catalog",
  "stg_corey_kona_catalog_raw",
];
const statements = (sql: string) => sql.replace(/--[^\n]*/g, "").split(";").map(s => s.trim().replace(/\s+/g, " ")).filter(Boolean);
const guarded = read("../migrations/20261017200432_introduce_guarded_biopsy_admin_reads.sql");
const ui = read("../../src/pages/browse_data/Biopsies.tsx");
const body = (schema: string, name: string) => {
  const match = guarded.match(new RegExp(`create function ${schema}\\.${name}\\(\\)[\\s\\S]*?as \\$function\\$([\\s\\S]*?)\\$function\\$;`));
  assert.ok(match, `${schema}.${name} exists`);
  return match[1];
};

test("forward changes only the seven approved table ACLs", () => {
  assert.deepEqual(statements(forward), targets.map(n => `REVOKE ALL PRIVILEGES ON TABLE public.${n} FROM anon, authenticated`));
});
test("emergency rollback restores only the seven original authenticated privileges", () => {
  assert.match(rollback, /EMERGENCY ONLY/);
  assert.deepEqual(statements(rollback), targets.map(n => `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.${n} TO authenticated`));
});
for (const name of ["admin_biopsy_browse", "admin_biopsy_age_ranking"]) {
  test(`${name} keeps public/private guards and normal UI RPC call`, () => {
    for (const schema of ["public", "private"]) {
      assert.match(body(schema, name), /auth\.uid\(\) is null or public\.is_admin_user\(\) is not true/);
      assert.doesNotMatch(body(schema, name), new RegExp(`\\b(${targets.join("|")})\\b`));
    }
    assert.match(body("public", name), new RegExp(`return private\\.${name}\\(\\);`));
    assert.ok(ui.includes(`.rpc("${name}")`));
  });
}
test("Admin browse uses active scientific relations", () => {
  const sql = body("private", "admin_biopsy_browse");
  for (const relation of ["biopsies", "catalog", "sightings"]) {
    assert.match(sql, new RegExp(`\\bpublic\\.${relation}\\b`));
  }
});
test("Admin ranking resolves to v3 VIEW, not the selected legacy TABLE", () => {
  assert.match(body("private", "admin_biopsy_age_ranking"), /from public\.kona_biopsy_age_rank_view_v3 v/);
  assert.doesNotMatch(forward + rollback, /\bkona_biopsy_age_rank_view_v3\b|\badmin_biopsy_(browse|age_ranking)\b/);
});
