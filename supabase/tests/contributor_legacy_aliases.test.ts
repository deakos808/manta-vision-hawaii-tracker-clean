import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const name = '20261008150838_add_contributor_legacy_aliases';
const sql = readFileSync(`supabase/migrations/${name}.sql`, 'utf8').replace(/^--.*$/gm, '');
const rollback = readFileSync(`supabase/rollback/${name}_rollback.sql`, 'utf8').replace(/^--.*$/gm, '').trim();
test('exactly one two-field table and composite key', () => {
  assert.match(sql, /create table public.contributor_legacy_aliases/);
  assert.match(sql, /user_id uuid not null/); assert.match(sql, /photographer_alias text not null/);
  assert.match(sql, /primary key \(user_id, photographer_alias\)/);
  assert.equal((sql.match(/create table/g) ?? []).length, 1);
  assert.doesNotMatch(sql, /email|display_name|created_at|notes|organization/);
});
test('user deletion cascades alias configuration only', () => {
  assert.match(sql, /references auth.users\(id\) on delete cascade/);
  assert.equal((sql.match(/references/g) ?? []).length, 1);
  assert.doesNotMatch(sql, /alter table auth|delete from/);
});
test('trimmed nonempty aliases and normalized global uniqueness', () => {
  assert.match(sql, /photographer_alias = btrim\(photographer_alias\) and photographer_alias <> ''/);
  assert.match(sql, /create unique index[\s\S]*on public.contributor_legacy_aliases \(lower\(btrim\(photographer_alias\)\)\)/);
});
test('own SELECT requires own uid and active application role', () => {
  assert.match(sql, /enable row level security/);
  const own = sql.split('create policy legacy_aliases_select_own_active')[1].split('create policy')[0];
  assert.match(own, /for select to authenticated/);
  assert.match(own, /user_id = \(select auth.uid\(\)\)/);
  assert.match(own, /id = \(select auth.uid\(\)\) and is_active is true and role in \('user', 'admin'\)/);
});
test('only other-user SELECT is guarded by existing active-admin helper', () => {
  assert.equal((sql.match(/create policy/g) ?? []).length, 2);
  assert.match(sql, /legacy_aliases_select_admin[\s\S]*for select to authenticated[\s\S]*using \(\(select public.is_admin_user\(\)\)\)/);
});
test('anon/PUBLIC have no access and authenticated users have SELECT only', () => {
  assert.match(sql, /revoke all on public.contributor_legacy_aliases from public, anon, authenticated/);
  assert.deepEqual([...sql.matchAll(/grant (.*?) on .*? to authenticated/g)].map(m => m[1]), ['select']);
  assert.doesNotMatch(sql, /for (insert|update|delete)|grant .* to anon/);
  assert.match(sql, /grant all on public.contributor_legacy_aliases to service_role/);
});
test('no scientific/history/Auth data mutation or real contributor seed', () => {
  assert.doesNotMatch(sql, /public\.(sightings|mantas|photos)|insert into|update |delete from|truncate|create.*function/i);
  assert.doesNotMatch(sql, /Relaxing Tropics|@|[0-9a-f]{8}-[0-9a-f]{4}-/i);
});
test('paired rollback removes only new contract without CASCADE', () => {
  assert.equal(rollback, 'begin;\ndrop table public.contributor_legacy_aliases;\ncommit;');
});
