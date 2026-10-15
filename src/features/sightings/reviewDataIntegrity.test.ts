import { measurementSummary, isExternal } from "../photos/photoMeasurements";
import { photoForPayload } from '../photos/photoPresentation';
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

test('photo edits never overwrite legacy size or independent estimate', () => {
  assert.match(modal, /setSize\(existingManta\?\.size \?\? null\)/);
  const functions = modal.slice(modal.indexOf('  function updateMeasuredPhotos'), modal.indexOf('  function canSave()'));
  let size: string | null = '3.67';
  const context: any = { photos: [], summary: { dw: {n:1} }, measurementSummary, isExternal,
    setSize: (v: string | null) => {size=v;}, setPhotos: (v: unknown)=>{context.photos=v;} };
  run(functions,context);
  run('updateMeasuredPhotos([{measure:{source:"external",metric:"dw",units:"m",valueMeters:3.14}}])',context);
  assert.equal(size,'3.67');
  run('updateMeasuredPhotos([])',context); assert.equal(size,'3.67');
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
