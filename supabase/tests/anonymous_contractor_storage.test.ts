import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const name = '20261009175810_contain_anonymous_contractor_storage';
const clean = (s: string) => s.replace(/^--.*$/gm, '').trim();
const forward = clean(readFileSync(`supabase/migrations/${name}.sql`, 'utf8'));
const rollback = clean(readFileSync(`supabase/rollback/${name}_rollback.sql`, 'utf8'));
const audit = JSON.parse(readFileSync('docs/security/storage_privacy_audit.json', 'utf8'));
const read = 'allow anon read path metadata for contractor-docs';
const upload = 'allow anon upload to contractor-docs';
test('forward draft changes exactly two anonymous contractor policies', () => {
  assert.equal(forward, `begin;\ndrop policy "${read}" on storage.objects;\ndrop policy "${upload}" on storage.objects;\ncommit;`);
});
test('rollback exactly restores audited policy names, roles, operation and predicates', () => {
  assert.deepEqual(audit.policies.filter((p: any) => [read, upload].includes(p.policyname)), [
    {policyname: read, permissive: 'PERMISSIVE', roles: '{anon}', cmd: 'SELECT', qual: "(bucket_id = 'contractor-docs'::text)", with_check: null},
    {policyname: upload, permissive: 'PERMISSIVE', roles: '{anon}', cmd: 'INSERT', qual: null, with_check: "(bucket_id = 'contractor-docs'::text)"},
  ]);
  assert.equal(rollback, `begin;\ncreate policy "${read}"\non storage.objects as permissive for select to anon\nusing (bucket_id = 'contractor-docs'::text);\ncreate policy "${upload}"\non storage.objects as permissive for insert to anon\nwith check (bucket_id = 'contractor-docs'::text);\ncommit;`);
});
test('authenticated contractor policy coverage remains available and untouched', () => {
  for (const [name, cmd] of [['contractor_authenticated_select', 'SELECT'], ['contractor_authenticated_insert', 'INSERT']]) {
    const p = audit.policies.find((p: any) => p.policyname === name);
    assert.equal(p.roles, '{authenticated}'); assert.equal(p.cmd, cmd);
    assert.equal(p.qual || p.with_check, "(bucket_id = 'contractor-docs'::text)");
    assert.ok(!forward.includes(name) && !rollback.includes(name));
  }
});
test('draft does not toggle visibility, mutate data, move objects or alter routines', () => {
  assert.doesNotMatch(forward + rollback, /storage\.buckets|public\.|create.*function|alter\s+table|update\s|insert\s+into|delete\s+from|truncate|copy|grant|revoke/i);
});
