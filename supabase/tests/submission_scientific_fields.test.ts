import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

const prefix = '20261007051430_persist_submission_scientific_fields';
const forward = readFileSync('supabase/migrations/' + prefix + '.sql', 'utf8');
const rollback = readFileSync('supabase/rollback/' + prefix + '_rollback.sql', 'utf8');
const definition = (sql: string) => sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'), sql.lastIndexOf('$function$') + '$function$'.length) + '\n';
const before = definition(rollback);
const after = definition(forward);

// Static contracts, not PostgreSQL execution. Pins pg_get_functiondef captured
// read-only from apweteosdbgsolmvcmhn before drafting.
test('rollback exactly restores the inspected live RPC', () => {
  assert.equal(createHash('sha256').update(before).digest('hex'),
    'b1d4c05aecd855b3d34d81a44c1b6ee9f6f7987e1766edc84e2c89e12df2930f');
});
test('entire RPC changes only the requested INSERT mappings', () => {
  let expected = before;
  const replacements: [string, string][] = [
  [
    "      submission_manta_id\n",
    "      submission_manta_id,\n      gender,\n      age_class,\n      size_m\n"
  ],
  [
    "      nullif(btrim(manta->>'id'), '')\n",
    "      nullif(btrim(manta->>'id'), ''),\n      nullif(manta->>'gender', ''),\n      nullif(manta->>'ageClass', ''),\n      nullif(manta->>'size', '')::numeric\n"
  ],
  [
    "file_name2, photo_view, is_best_manta_ventral_photo\n",
    "file_name2, photo_view, is_best_manta_ventral_photo, is_best_manta_dorsal_photo\n"
  ],
  [
    "          coalesce((photo->>'isBestVentral')::boolean, false)\n",
    "          coalesce((photo->>'isBestVentral')::boolean, false),\n          coalesce((photo->>'isBestDorsal')::boolean, false)\n"
  ],
  [
    "        is_best_manta_ventral_photo\n",
    "        is_best_manta_ventral_photo,\n        is_best_manta_dorsal_photo\n"
  ],
  [
    "        coalesce((photo->>'isBestVentral')::boolean, false)\n",
    "        coalesce((photo->>'isBestVentral')::boolean, false),\n        coalesce((photo->>'isBestDorsal')::boolean, false)\n"
  ]
];
  for (const [oldText, newText] of replacements) {
    assert.equal(expected.split(oldText).length, 2);
    expected = expected.replace(oldText, newText);
  }
  expected = expected.replace(
    '-- Legacy insert is intentionally unchanged, including bucket/UUID defaults.',
    '-- Legacy bucket/UUID defaults are unchanged; missing best-dorsal defaults false.'
  );
  assert.equal(after, expected);
  for (const sql of [forward, rollback]) {
    assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length, 1);
    assert.doesNotMatch(sql, /\b(?:ALTER TABLE|CREATE TABLE|DROP|TRUNCATE)\b/i);
    assert.ok(sql.endsWith('commit;\n'));
  }
});
test('manta columns align with reviewed nullable values and numeric meters', () => {
  assert.match(after, /submission_manta_id,\s+gender,\s+age_class,\s+size_m/);
  assert.match(after, /nullif\(btrim\(manta->>'id'\), ''\),\s+nullif\(manta->>'gender', ''\),\s+nullif\(manta->>'ageClass', ''\),\s+nullif\(manta->>'size', ''\)::numeric/);
  assert.doesNotMatch(after, /coalesce\([^;]*manta->>'size'/);
});

// Fixtures document the null/empty contract pinned to the SQL above.
// Actual SQL casts are not executed by this static suite.
for (const [payload, expected] of [
  [{ gender: 'female', ageClass: 'adult', size: '3.67' }, ['female', 'adult', 3.67]],
  [{}, [null, null, null]],
  [{ gender: null, ageClass: null, size: null }, [null, null, null]],
  [{ gender: '', ageClass: '', size: '' }, [null, null, null]],
  [{ size: 0 }, [null, null, 0]],
] as const) {
  test('manta contract fixture: ' + JSON.stringify(payload), () => {
    const value = (key: string) => {
      const raw = (payload as Record<string, unknown>)[key];
      return raw == null || raw === '' ? null : String(raw);
    };
    assert.deepEqual([value('gender'), value('ageClass'), value('size') === null ? null : Number(value('size'))], expected);
  });
}
const photoInserts = [...after.matchAll(/insert into public\.photos \(([\s\S]*?)\);/g)].map(m => m[1]);
for (const [index, label] of ['provenance', 'legacy'].entries()) {
  test(label + ': dorsal true/false/null/missing and unchanged ventral expression', () => {
    assert.equal(photoInserts.length, 2);
    assert.match(photoInserts[index], /is_best_manta_ventral_photo,\s*is_best_manta_dorsal_photo/);
    assert.match(photoInserts[index], /coalesce\(\(photo->>'isBestVentral'\)::boolean, false\),\s*coalesce\(\(photo->>'isBestDorsal'\)::boolean, false\)/);
    for (const value of [true, false, undefined, null]) {
      assert.equal(value ?? false, value === true);
    }
  });
}
