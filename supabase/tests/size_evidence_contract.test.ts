import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const name = '20261008000257_extend_manta_sizes_size_evidence_contract';
const migration = readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
const rollback = readFileSync(`supabase/rollback/${name}_rollback.sql`, 'utf8');
const sql = (text: string) => text.replace(/^--.*$/gm, '').trim();
const forward = sql(migration);
const reverse = sql(rollback);
const added = [...forward.matchAll(/ADD COLUMN (\w+) (\w+)/g)].map(m => [m[1], m[2]]);
const expected = [
  ['source_photo_id', 'integer'], ['measurement_method', 'text'],
  ['standardized_dw_m', 'numeric'], ['measurement_evidence', 'jsonb'],
];

test('one canonical Size_ID table receives exactly four additive fields; no competing table or N', () => {
  assert.deepEqual(added, expected);
  assert.equal((forward.match(/ALTER TABLE public\.manta_sizes/g) ?? []).length, 1);
  assert.doesNotMatch(forward, /CREATE TABLE|CREATE.*FUNCTION|\b(?:UPDATE|INSERT|DELETE FROM|TRUNCATE|DROP|RENAME)\b/i);
  assert.match(migration, /ONE operational Size_ID table/);
});

test('logical source Photo_ID is a nullable FK without destructive cascading', () => {
  assert.match(forward, /ADD COLUMN source_photo_id integer,/);
  assert.match(forward, /FOREIGN KEY \(source_photo_id\) REFERENCES public\.photos \(pk_photo_id\)\s+ON DELETE RESTRICT/);
  assert.doesNotMatch(forward, /CASCADE|SET NULL/);
});

test('historical NULL contract fields stay valid without defaults or backfill', () => {
  assert.doesNotMatch(forward, /NOT NULL|DEFAULT|UPDATE|INSERT INTO/);
  // PostgreSQL CHECK accepts UNKNOWN for SQL NULL. None of these checks imposes IS NOT NULL.
  assert.doesNotMatch(forward, /IS NOT NULL/);
  assert.match(forward, /CHECK \(measurement_method IN/);
  assert.match(forward, /CHECK \(jsonb_typeof\(measurement_evidence\) = 'object'\)/);
});

test('method has a small vocabulary distinct from unchanged legacy measurement_type', () => {
  assert.match(forward, /measurement_method IN \('paired_laser', 'visual_estimate', 'legacy_unknown'\)/);
  assert.doesNotMatch(forward, /\bmeasurement_type\b/);
  assert.match(migration, /measurement_type = 'length', size_m = dlCm \/ 100/);
  assert.match(migration, /measurement_type = 'width', size_m = directDwCm \/ 100/);
});

test('standardized DW is separate from untouched raw size_m and is finite positive when present', () => {
  assert.doesNotMatch(forward, /\bsize_m\b/);
  assert.match(forward, /CHECK \(standardized_dw_m > 0 AND standardized_dw_m < 'Infinity'::numeric\)/);
  assert.match(migration, /Never fill it automatically[\s\S]*for visual_estimate or ambiguous evidence/);
});

test('evidence requires only an outer JSON object, not a historical JSON backfill', () => {
  assert.match(forward, /ADD COLUMN measurement_evidence jsonb/);
  assert.match(forward, /jsonb_typeof\(measurement_evidence\) = 'object'/);
  assert.doesNotMatch(forward, /calibration_params|src_file|photo_code|jsonb_set/);
});

test('one photo may support multiple Size_IDs; its index is nonunique', () => {
  assert.match(forward, /CREATE INDEX manta_sizes_source_photo_id_idx ON public\.manta_sizes \(source_photo_id\)/);
  assert.doesNotMatch(forward, /UNIQUE|PRIMARY KEY/);
  assert.match(migration, /combined DL \+ direct-DW event stays ONE Size_ID/);
  assert.match(migration, /Optional directDwCm, directDwPx and directDwPoints/);
});

test('no new workflow uses photo_measurements or active_measure_id, and neither is dropped', () => {
  assert.doesNotMatch(forward + reverse, /photo_measurements|active_measure_id/);
  assert.match(migration, /DEPRECATION CANDIDATES ONLY/);
});

test('rollback pairs every new column/constraint/index without touching existing contract elements', () => {
  assert.deepEqual([...reverse.matchAll(/DROP COLUMN (\w+)/g)].map(m => m[1]).sort(), expected.map(x => x[0]).sort());
  assert.deepEqual([...reverse.matchAll(/DROP CONSTRAINT (\w+)/g)].map(m => m[1]).sort(),
    [...forward.matchAll(/ADD CONSTRAINT (\w+)/g)].map(m => m[1]).sort());
  assert.match(reverse, /DROP INDEX public\.manta_sizes_source_photo_id_idx;/);
  assert.doesNotMatch(reverse, /CASCADE|DROP TABLE|UPDATE|DELETE FROM|row_sig|measurement_type|\bsize_m\b/);
  assert.match(rollback, /WARNING:.*new evidence is stored/);
});

test('documented current evidence preserves units, formula, normalized endpoints and exact image dimensions', () => {
  const comments = migration.split('\n').filter(l => l.startsWith('--')).map(l => l.slice(3)).join('\n');
  const example = JSON.parse(comments.slice(comments.indexOf('{'), comments.indexOf('\n}') + 2));
  assert.equal(example.version, 'size-evidence-v1');
  assert.equal(example.dlCm, example.discPx * example.scaleCm / example.scalePx);
  assert.equal(example.dwCm, example.dlCm * 2.3);
  assert.equal(example.points.length, 4);
  const distance = (a: {x: number; y: number}, b: {x: number; y: number}) =>
    Math.hypot((a.x - b.x) * example.image.widthPx, (a.y - b.y) * example.image.heightPx);
  assert.equal(distance(example.points[0], example.points[1]), example.scalePx);
  assert.equal(distance(example.points[2], example.points[3]), example.discPx);
  assert.ok(example.image.path.includes('prepared-'));
  assert.ok(example.image.originalPath);
  assert.ok(example.conversion.version && example.toolVersion);
  assert.match(comments, /exact_frame \(STRING\)/);
  assert.match(comments, /N is derived/);
});
