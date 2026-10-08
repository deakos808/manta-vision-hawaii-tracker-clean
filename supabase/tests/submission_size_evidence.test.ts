import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';

const name = '20261008011149_persist_submission_size_evidence';
const migration = readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
const rollback = readFileSync(`supabase/rollback/${name}_rollback.sql`, 'utf8');
const definition = (s: string) => s.slice(s.indexOf('CREATE OR REPLACE FUNCTION'), s.lastIndexOf('$function$') + 10) + '\n';
const before = definition(rollback), after = definition(migration);
const persistence = after.slice(after.indexOf('      -- BEGIN size-evidence persistence'), after.indexOf('      -- END size-evidence persistence'));

test('rollback pins exact inspected live RPC', () => {
  assert.equal(createHash('sha256').update(rollback).digest('hex'), '9b00083861e7227dac60d53c48bebce5857077b3805ee797fddfb8670eec4a9a');
});
test('all existing RPC behavior is byte-identical outside explicit persistence additions', () => {
  const restored = after
    .replace(/^ +-- BEGIN size-evidence (.+)\n[\s\S]*?^ +-- END size-evidence \1\n/gm, '')
    .replace('    new_size_ids := array[]::bigint[]; -- size-evidence: reset per manta\n\n', '')
    .replace('returning pk_sighting_id, sighting_date into new_sighting_id, encounter_date;', 'returning pk_sighting_id into new_sighting_id;')
    .replaceAll(') returning pk_photo_id into new_photo_id;', ');');
  assert.equal(restored, before);
  assert.equal((after.match(/\$function\$/g) ?? []).length, 2);
});
test('both photo branches capture permanent Photo_ID, then share exactly one guarded Size_ID insertion', () => {
  assert.equal((after.match(/returning pk_photo_id into new_photo_id;/g) ?? []).length, 2);
  assert.equal((after.match(/insert into public.manta_sizes/g) ?? []).length, 1);
  assert.match(persistence, /measurement is not null and measurement <> 'null'::jsonb/);
  assert.match(persistence, /new_manta_id, new_photo_id, 'paired_laser', 'length'/);
  assert.match(persistence, /\(measurement->>'dlCm'\)::numeric \/ 100/);
  assert.match(persistence, /\(measurement->>'dwCm'\)::numeric \/ 100/);
});
test('required numeric values fail closed, and exceptions are never swallowed', () => {
  assert.match(persistence, /array\['scaleCm', 'scalePx', 'discPx', 'dlCm', 'dwCm'\]/);
  assert.match(persistence, /jsonb_typeof\(measurement->field_name\) is distinct from 'number'/);
  assert.match(persistence, /numeric_value > 0 and numeric_value < 'Infinity'::numeric/);
  assert.doesNotMatch(after, /exception\s+when/i);
});
test('optional points omit NULL but present endpoints must be exactly four normalized numeric pairs', () => {
  assert.match(persistence, /measurement->'points' is not null and measurement->'points' <> 'null'::jsonb/);
  assert.match(persistence, /jsonb_typeof\(measurement->'points'\) is distinct from 'array'/);
  assert.match(persistence, /jsonb_array_length\(measurement->'points'\) <> 4/);
  assert.match(persistence, /jsonb_typeof\(measurement_point->field_name\) is distinct from 'number'/);
  assert.match(persistence, /numeric_value >= 0 and numeric_value <= 1/);
});
test('compact source snapshot has no duplicate sizes or invented legacy evidence', () => {
  const evidence = persistence.slice(persistence.indexOf('jsonb_strip_nulls'));
  for (const key of ['scaleCm', 'scalePx', 'discPx', 'points', 'photoUuid', 'storageBucket', 'storagePath', 'originalStoragePath', 'outputWidth', 'outputHeight']) assert.ok(evidence.includes(`'${key}'`));
  assert.match(evidence, /'formula', 'DW = DL × 2.3', 'ratio', 2.3/);
  assert.doesNotMatch(evidence, /dlCm|dwCm|camera|lens|calibration/);
});
test('encounter date comes from inserted sighting; signatures use stable UUIDs and no conflict bypass', () => {
  assert.match(after, /returning pk_sighting_id, sighting_date into new_sighting_id, encounter_date/);
  assert.match(persistence, /standardized_dw_m, measured_on, row_sig, measurement_evidence/);
  assert.match(persistence, /encounter_date,\n\s*'submission:'/);
  assert.match(persistence, /'submission:' \|\| sub_id::text \|\| ':photo:' \|\| measured_photo_uuid::text \|\| ':paired_laser:v1'/);
  assert.doesNotMatch(persistence, /on conflict/i);
  assert.ok(after.indexOf("status = 'committed'") < after.indexOf('insert into public.sightings'));
  assert.match(after, /for update;/);
});
test('mean uses only newly returned Size_IDs and zero measurements preserve manual size', () => {
  assert.match(after, /new_size_ids := array\[\]::bigint\[\]/);
  assert.match(after, /returning pk_manta_size_id into new_size_id/);
  assert.match(after, /array_append\(new_size_ids, new_size_id\)/);
  assert.match(after, /if cardinality\(new_size_ids\) > 0 then/);
  assert.match(after, /set size_dw_m = \(\s*select avg\(standardized_dw_m\) from public.manta_sizes\s*where pk_manta_size_id = any\(new_size_ids\)/);
  assert.match(after, /nullif\(manta->>'size', ''\)::numeric/);
});
test('no duplicate model, historical updates, table DDL or biopsy wrapper replacement', () => {
  assert.doesNotMatch(after, /photo_measurements|active_measure_id|independent_sizes_import|update public.manta_sizes|commit_sighting_submission_with_biopsies|set size_m\s*=/i);
  assert.doesNotMatch(migration + rollback, /ALTER TABLE|CREATE TABLE|DROP TABLE/i);
  assert.equal((migration.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length, 1);
  const columns = persistence.match(/insert into public.manta_sizes \(([\s\S]*?)\) values/)![1];
  assert.doesNotMatch(columns, /photo_code|quality_note|calibration_params|src_file|fk_catalog_id/);
});

// Mapping fixtures supplement the pinned SQL contract above. They do not execute
// PL/pgSQL or prove live transaction behavior; no live RPC is invoked by this suite.
const uuid = '10000000-0000-4000-8000-000000000001';
const points = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0.5 }, { x: 1, y: 1 }];
const valid = { scaleCm: 60, scalePx: 100, discPx: 246.3333333333333, dlCm: 147.8, dwCm: 339.94 };
function fixture(photos: any[], manual = 3.5) {
  const sizes = photos.flatMap((p, i) => {
    const m = p.measure;
    if (m == null) return [];
    assert.ok(m && typeof m === 'object' && !Array.isArray(m), 'object required');
    for (const k of ['scaleCm', 'scalePx', 'discPx', 'dlCm', 'dwCm']) assert.ok(typeof m[k] === 'number' && Number.isFinite(m[k]) && m[k] > 0, 'finite positive number required');
    if (m.points != null) {
      assert.ok(Array.isArray(m.points) && m.points.length === 4, 'four points required');
      for (const p of m.points) for (const k of ['x', 'y']) assert.ok(p && typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 1, 'normalized point required');
    }
    const source: any = { photoUuid: p.id };
    for (const [key, value] of Object.entries({ storageBucket: p.storageBucket, storagePath: p.path, originalStoragePath: p.originalPath, outputWidth: p.editTransform?.outputWidth, outputHeight: p.editTransform?.outputHeight })) if (value != null) source[key] = value;
    return [{ source_photo_id: 700 + i, size_m: m.dlCm / 100, standardized_dw_m: m.dwCm / 100, measured_on: '2026-10-01', row_sig: `submission:${uuid}:photo:${p.id}:paired_laser:v1`, evidence: { version: 1, scaleCm: m.scaleCm, scalePx: m.scalePx, discPx: m.discPx, ...(m.points == null ? {} : { points: m.points }), conversion: { formula: 'DW = DL × 2.3', ratio: 2.3 }, source } }];
  });
  return { photoCount: photos.length, sizes, mean: sizes.length ? sizes.reduce((s, x) => s + x.standardized_dw_m, 0) / sizes.length : manual };
}
test('unmeasured and null-measure photos persist without Size_ID; manual 3.5 remains', () => {
  assert.deepEqual(fixture([{ id: uuid }, { id: uuid, measure: null }]), { photoCount: 2, sizes: [], mean: 3.5 });
});
test('current photo retains points/source evidence, units and authoritative encounter date', () => {
  const result = fixture([{ id: uuid, measure: { ...valid, points }, path: 'prepared.jpg', storageBucket: 'manta-images', originalPath: 'original.jpg', editTransform: { outputWidth: 1000, outputHeight: 800 } }]);
  assert.equal(result.sizes.length, 1);
  const row = result.sizes[0];
  assert.ok(Math.abs(row.size_m - 1.478) < 1e-12);
  assert.ok(Math.abs(row.standardized_dw_m - 3.3994) < 1e-12);
  assert.equal(row.source_photo_id, 700);
  assert.equal(row.measured_on, '2026-10-01');
  assert.deepEqual(row.evidence.points, points);
  assert.equal(row.evidence.source.outputWidth, 1000);
});
test('older measurement without endpoints/provenance retains only available evidence', () => {
  const row = fixture([{ id: uuid, path: 'old.jpg', measure: valid }]).sizes[0];
  assert.equal(row.source_photo_id, 700);
  assert.ok(!('points' in row.evidence));
  assert.deepEqual(row.evidence.source, { photoUuid: uuid, storagePath: 'old.jpg' });
  assert.ok(!('dlCm' in row.evidence) && !('dwCm' in row.evidence));
});
test('five mixed-role photos create only two Size_IDs with distinct IDs and mean 3.40', () => {
  const photos = [{}, {}, {}, { id: uuid, measure: { ...valid, dwCm: 320 } }, { id: uuid.replace(/1$/, '2'), measure: { ...valid, dwCm: 360 } }];
  const r = fixture(photos);
  assert.equal(r.photoCount, 5); assert.equal(r.sizes.length, 2);
  assert.deepEqual(r.sizes.map(x => x.source_photo_id), [703, 704]);
  assert.ok(Math.abs(r.mean - 3.4) < 1e-12);
  assert.notEqual(r.sizes[0].row_sig, r.sizes[1].row_sig);
  assert.equal(r.sizes[0].row_sig, fixture(photos).sizes[0].row_sig);
});
for (const field of Object.keys(valid)) test(`malformed numeric ${field} rejects`, () => {
  for (const bad of [undefined, null, '', '1', 0, -1, NaN, Infinity, -Infinity]) assert.throws(() => fixture([{ id: uuid, measure: { ...valid, [field]: bad } }]));
});
test('malformed present points reject; absent/null points remain compatible', () => {
  for (const bad of [{}, [], points.slice(0, 3), [...points, points[0]], [null, ...points.slice(1)], [{ x: '0', y: 0 }, ...points.slice(1)], [{ x: -0.1, y: 0 }, ...points.slice(1)], [{ x: 0, y: 1.01 }, ...points.slice(1)]]) assert.throws(() => fixture([{ id: uuid, measure: { ...valid, points: bad } }]));
  assert.ok(!('points' in fixture([{ id: uuid, measure: { ...valid, points: null } }]).sizes[0].evidence));
});
