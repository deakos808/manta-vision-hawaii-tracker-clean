import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const name = readdirSync(new URL('migrations/', root)).find(n => /^\d+_contain_anonymous_public_table_access\.sql$/.test(n))!;
const forward = readFileSync(new URL(`migrations/${name}`, root), 'utf8');
const rollback = readFileSync(new URL(`rollback/${name.replace('.sql', '_rollback.sql')}`, root), 'utf8');
const audit = JSON.parse(readFileSync(new URL('tests/fixtures/anonymous_public_access_inventory.json', root), 'utf8'));
const qi = (s: string) => `"${s.replace(/"/g, '""')}"`;

test('inventory records all 147 exposed RLS-off tables and exact row counts', () => {
 const tables = audit.relations.filter((r: any) => ['r','p'].includes(r.kind) && !r.rls && r.anon_privileges.length);
 assert.equal(tables.length, 147);
 assert.ok(tables.every((r: any) => /^\d+$/.test(r.row_count)));
});
test('every inspected postgres-owned anon relation grant is revoked and restored exactly', () => {
 let expected = 0;
 for (const r of audit.relations) {
  if (r.owner !== 'postgres' || !r.anon_grants.length) continue;
  expected++;
  const object = `${r.kind === 'S' ? 'SEQUENCE' : 'TABLE'} public.${qi(r.name)}`;
  assert.ok(forward.includes(`REVOKE ALL PRIVILEGES ON ${object} FROM anon;`), r.name);
  assert.ok(r.anon_grants.every((g: any) => !g.grantable && g.grantor === 'postgres'));
  const privileges = r.anon_grants.map((g: any) => g.privilege).sort().join(', ');
  assert.ok(rollback.includes(`GRANT ${privileges} ON ${object} TO anon;`), r.name);
 }
 assert.equal((forward.match(/^REVOKE ALL PRIVILEGES ON /gm) || []).length, expected);
 assert.equal((rollback.match(/^GRANT .* ON (TABLE|SEQUENCE) public\."[^\"]+" TO anon;/gm) || []).length, expected + 1);
 assert.doesNotMatch(rollback, /GRANT ALL ON ALL TABLES/i);
});
test('column-level mutation grants are also paired exactly', () => {
 const columns = audit.columns.map((c: any) => qi(c.attname)).join(', ');
 assert.equal(audit.columns.length, 49);
 assert.ok(audit.columns.every((c: any) => c.relname === 'mantas' && c.attacl === '{anon=aw/postgres,authenticated=aw/postgres}'));
 const privileges = `INSERT (${columns}), UPDATE (${columns}) ON TABLE public."mantas"`;
 assert.ok(forward.includes(`REVOKE ${privileges} FROM anon;`));
 assert.ok(rollback.includes(`GRANT ${privileges} TO anon;`));
});
test('only the explicit anonymous photo policy is removed and restored', () => {
 assert.equal((forward.match(/^DROP POLICY/gm) || []).length, 1);
 assert.ok(forward.includes('DROP POLICY "anon_select_ventral" ON public.photos;'));
 const policy = audit.corePolicies.find((p: any) => p.policyname === 'anon_select_ventral');
 assert.ok(rollback.includes(`CREATE POLICY "anon_select_ventral" ON public.photos AS PERMISSIVE FOR SELECT TO anon USING (${policy.qual});`));
});
test('owner-aware defaults preserve all non-anon access and exclude unmanageable extension objects', () => {
 for (const type of ['TABLES','SEQUENCES']) assert.ok(forward.includes(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON ${type} FROM anon;`));
 assert.doesNotMatch(forward, /ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin/);
 for (const name of ['spatial_ref_sys','geometry_columns','geography_columns']) assert.ok(!forward.includes(`ON TABLE public."${name}" FROM anon`));
 for (const statement of forward.split(';').filter(s => /\bREVOKE\b/.test(s))) assert.doesNotMatch(statement, /FROM\s+(authenticated|service_role|PUBLIC)\b/i);
});
test('migration fails closed on baseline drift and changes no scientific rows or schemas', () => {
 assert.ok(forward.includes(audit.privilegeBaselineFingerprint));
 assert.match(forward, /RAISE EXCEPTION 'Public privilege baseline drifted/);
 const sql = forward.replace(/--[^\n]*/g, '');
 assert.doesNotMatch(sql, /^\s*(INSERT INTO|UPDATE\s|DELETE FROM|TRUNCATE\s|ALTER TABLE|CREATE TABLE|DROP TABLE|CREATE OR REPLACE FUNCTION)/im);
 assert.doesNotMatch(sql, /\b(storage\.|auth\.|REVOKE EXECUTE|ON FUNCTIONS)\b/i);
 assert.match(forward, /BEGIN;/); assert.match(forward, /COMMIT;/);
});
test('audit explicitly records unresolved callable functions and public Storage limitations', () => {
 assert.equal(audit.functions.length, 967);
 assert.ok(audit.functions.every((f: any) => ['A','B','C','D'].includes(f.classification)));
 assert.equal(audit.functions.find((f: any) => f.name === 'fn_imports_clear_staging').classification, 'D');
 assert.equal(audit.buckets.find((b: any) => b.id === 'manta-images').public, true);
 assert.equal(audit.scientificBefore.length, 7);
});
