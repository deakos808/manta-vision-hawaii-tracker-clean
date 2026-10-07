import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

const name = '20261007074437_fix_generated_manta_size_persistence';
const migration = readFileSync('supabase/migrations/' + name + '.sql', 'utf8');
const rollback = readFileSync('supabase/rollback/' + name + '_rollback.sql', 'utf8');
const definition = (s: string) => s.slice(s.indexOf('CREATE OR REPLACE FUNCTION'), s.lastIndexOf('$function$') + 10) + '\n';
const before = definition(rollback);
const after = definition(migration);
const mantaInsert = after.slice(after.indexOf('    insert into public.mantas'), after.indexOf('    for photo in'));

test('rollback pins the exact pre-fix live definition and warns about incompatibility', () => {
  assert.equal(createHash('sha256').update(before).digest('hex'),
    '360e9f05dc4e1a69f767a6c070ebb5b771752bda69a4de8633f9fc5ef2e8eee0');
  assert.match(rollback, /WARNING:.*generated-column incompatibility/);
});
test('only the manta INSERT column changes; all guards, gender, age and photo logic remain identical', () => {
  assert.equal(before.split('      size_m\n').length, 2);
  assert.equal(after, before.replace('      size_m\n', '      size_dw_m\n'));
});
test('writable size_dw_m is targeted; generated size_m is excluded', () => {
  const columns = mantaInsert.slice(mantaInsert.indexOf('(') + 1, mantaInsert.indexOf(')')).split(',').map(s => s.trim());
  assert.deepEqual(columns, ['fk_sighting_id', 'fk_catalog_id', 'submission_manta_id', 'gender', 'age_class', 'size_dw_m']);
  assert.ok(!columns.includes('size_m'));
  assert.match(mantaInsert, /nullif\(manta->>'size', ''\)::numeric/);
});
test('no measurement persistence or schema changes are introduced', () => {
  assert.doesNotMatch(migration, /photo_measurements|active_measure_id|manta_sizes/);
  assert.doesNotMatch(migration, /\b(?:ALTER TABLE|CREATE TABLE|DROP|TRUNCATE)\b/i);
  assert.equal((migration.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length, 1);
});

// Static fixtures: the exact SQL expression is pinned above. These do not
// execute PostgreSQL or invoke a live commit RPC.
for (const [payload, expected] of [
  [{}, null], [{ size: null }, null], [{ size: '' }, null],
  [{ size: '3.67' }, 3.67], [{ size: 3.67 }, 3.67], [{ size: 0 }, 0],
] as const) {
  test('size meters/null contract: ' + JSON.stringify(payload), () => {
    const value = (payload as { size?: string | number | null }).size;
    const mapped = value == null || value === '' ? null : Number(value);
    assert.equal(mapped, expected);
  });
}
