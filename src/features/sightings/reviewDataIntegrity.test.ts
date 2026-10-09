import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { meanDiscWidthMeters } from '../photos/photoPreparation';

const page = readFileSync('src/pages/AddSightingPage.tsx', 'utf8');
const modal = readFileSync('src/components/mantas/UnifiedMantaModal.tsx', 'utf8');
const run = (code: string, context: object) => vm.runInNewContext(ts.transpile(code, { target: ts.ScriptTarget.ES2022 }), context);

test('review coordinates survive hydration/list changes; explicit location selection still autofills', () => {
  const effect = page.slice(page.indexOf('  // On location change, autofill coords'), page.indexOf('  // Submit (user mode)'));
  let lat = '19.123456789', lng = '-155.987654321';
  const guard = { current: true };
  const context = { preserveLocationCoordinates: guard, isReview: true, locationId: 'A', locationName: 'A', island: 'Hawaii',
    locList: [{ id: 'A', name: 'A', latitude: 20, longitude: -156 }],
    useEffect: (fn: () => unknown) => fn(), setLocationName: () => {}, setCoordSource: () => {},
    setLat: (v: string) => { lat = v; }, setLng: (v: string) => { lng = v; }, console,
    fetchEarliestCoords: () => assert.fail('hydration must not request fallback coordinates') };
  run(effect, context);
  assert.deepEqual([lat, lng], ['19.123456789', '-155.987654321']);
  guard.current = false; // Actual select handler enables this same ref.
  run(effect, context);
  assert.deepEqual([lat, lng], ['20.00000', '-156.00000']);
  lat = '19.2222222'; lng = '-155.3333333'; guard.current = true; // Map Save.
  run(effect, context);
  assert.deepEqual([lat, lng], ['19.2222222', '-155.3333333']);
  assert.match(page, /preserveLocationCoordinates.current = true;\s*setMethods/);
  assert.match(page, /onChange=\{\(e\)=>\{ preserveLocationCoordinates.current = false; setLocationId/);
  assert.match(page, /onSave=\{\(point, names\) => \{\s*preserveLocationCoordinates.current = true/);
});

test('opening/saving preserves manual size; measurement changes and measured-photo removal recompute', () => {
  const functions = modal.slice(modal.indexOf('  function updateMeasuredPhotos'), modal.indexOf('  function canSave()'));
  let size = '3.67';
  const photos = [{ id: 'a', measure: { dwCm: 200 } }, { id: 'b', measure: { dwCm: 400 } }];
  const context: any = { photos, meanDiscWidthMeters, setSize: (v: string) => { size = v; },
    setPhotos: (v: unknown) => { context.photos = v; } };
  assert.match(modal, /setSize\(existingManta\?\.size \?\? null\)/);
  assert.doesNotMatch(modal, /\[meanDW\]/);
  run(functions, context);
  const save = modal.slice(modal.indexOf('  function save()'), modal.indexOf('    onSave(draft);')) + '\nreturn draft;\n}';
  const saved = run(save + '\nsave()', { mantaId: 'm', name: 'Kai', gender: 'female', ageClass: 'juvenile', species: null, size, photos,
    potentialCatalogId: null, potentialNoMatch: true, noPhotos: false, firstExifMeta: null, existingManta: {} });
  assert.equal(saved.size, '3.67');
  run('onMeasureApplied("a", {dlCm:100,dwCm:600,discPx:10,scalePx:6,scaleCm:60,points:[]})', context);
  assert.equal(size, '5.00');
  run('deletePhoto("a")', context);
  assert.equal(size, '4.00');
});

for (const [canonical, legacy, expected] of [[true, false, true], [false, true, false], [undefined, true, true]]) {
  test(`noMatch open/save precedence: canonical ${canonical}, legacy ${legacy}`, () => {
    const initialization = modal.match(/setPotentialNoMatch\(existingManta\?\.noMatch[\s\S]*?\);/)![0];
    let decision: unknown;
    run(initialization, { existingManta: { noMatch: canonical, potentialNoMatch: legacy }, setPotentialNoMatch: (v: unknown) => { decision = v; } });
    assert.equal(decision, expected);
    assert.match(modal, /noMatch: potentialNoMatch/);
  });
}
