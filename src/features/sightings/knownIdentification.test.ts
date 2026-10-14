import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import { catalogTextMatches, knownIdentification } from './knownIdentification';
import { savePendingSubmission, STALE_SUBMISSION_MESSAGE } from './pendingSubmission';
const left = { pk_catalog_id: 733, name: 'Left Spot', species: 'mobula alfredi' };
const note = 'Distinctive dorsal spot visible in this encounter; I have followed this individual for six years.';
const modal = readFileSync('src/components/mantas/UnifiedMantaModal.tsx', 'utf8');
const page = readFileSync('src/pages/AddSightingPage.tsx', 'utf8');
const lookup = readFileSync('src/components/mantas/KnownMantaLookup.tsx', 'utf8');
test('catalog ID and case-insensitive name use shared catalog matching', () => {
  assert.equal(catalogTextMatches(left, '733'), true);
  assert.equal(catalogTextMatches(left, '  LEFT spot '), true);
  assert.equal(catalogTextMatches(left, 'Unknown'), false);
});
test('known proposal uses canonical decision and exact optional evidence, without photos or catalog writes', () => {
  const p = knownIdentification(left, note);
  assert.equal(p.matchedCatalogId, 733); assert.equal(p.noMatch, false);
  assert.equal(p.identificationProposal.evidence, note);
  assert.equal(knownIdentification(left, '').identificationProposal.evidence, '');
  assert.deepEqual(left, { pk_catalog_id: 733, name: 'Left Spot', species: 'mobula alfredi' });
  assert.doesNotMatch(lookup, /\.(insert|update|upsert|delete|rpc)\(/);
});
test('result selection is separate from explicit confirmation', () => {
  assert.match(lookup, /onClick=\{\(\) => setSelected\(row\)\}/);
  assert.match(lookup, /disabled=\{!selected\}/);
  assert.match(lookup, /if \(selected\) onConfirm\(selected, evidence\)/);
});
test('known lookup does not require ventral; photo match still does', () => {
  assert.match(modal, /disabled=\{intakeActive \|\| !photos.some\(p => p.view === 'ventral'\)\}/);
  assert.match(modal, /disabled=\{intakeActive\} onClick=\{\(\) => setKnownOpen\(true\)\}/);
  assert.doesNotMatch(lookup, /setView|isBestVentral|view: /);
});
test('pending edit transports evidence unchanged through existing revision-aware RPC', async () => {
  const changes = { mantas: [{ id: 'm', photos: [{ id: 'p', view: 'dorsal' }], ...knownIdentification(left, note) }] };
  let calls = 0;
  await savePendingSubmission({ rpc: async (name, args) => {
    calls++; assert.equal(name, 'save_pending_sighting_submission'); assert.deepEqual(args.changes, changes);
    assert.equal(args.expected_revision, 4); return { data: { revision: 5, status: 'pending' } };
  } }, 's', 4, changes);
  assert.equal(calls, 1);
});
test('pending removal and replacement survive merge without losing other metadata', () => {
  const handler = page.slice(page.indexOf('  const onEditSave ='), page.indexOf('  function currentReviewPayload'));
  let mantas = [{ id: 'm', ...knownIdentification(left, note), marker: 'retain' }];
  const context = { setMantas: (fn: Function) => { mantas = fn(mantas); }, setEditingManta: () => {} };
  const run = (patch: object) => vm.runInNewContext(ts.transpile(handler + '\nonEditSave(' + JSON.stringify(patch) + ');'), context);
  run({ id: 'm', matchedCatalogId: null, potentialCatalogId: null, identificationProposal: null, noMatch: false });
  assert.equal(mantas[0].matchedCatalogId, null); assert.equal(mantas[0].marker, 'retain');
  run({ id: 'm', ...knownIdentification({ pk_catalog_id: 255, name: 'Cat Print' }, '') });
  assert.equal(mantas[0].matchedCatalogId, 255);
});
test('hydration retains evidence and Admin summary distinguishes methods', () => {
  assert.match(page, /setMantas\(p.mantas.map\(\(m:any\) => \(\{\s*\.\.\.m,/);
  assert.match(modal, /setIdentificationProposal\(existingManta\?\.identificationProposal \?\? null\)/);
  const list = readFileSync('src/components/mantas/MantasList.tsx', 'utf8');
  assert.match(list, /Contributor-known identity/); assert.match(list, /Photo match proposal/); assert.match(list, /Recognition evidence:/);
});
test('stale and unauthorized pending changes fail through unchanged Phase A guard', async () => {
  for (const code of ['PT409', '42501']) {
    let calls = 0;
    await assert.rejects(savePendingSubmission({ rpc: async () => { calls++; return { error: { code } }; } }, 's', 0, { mantas: [knownIdentification(left, note)] }), code === 'PT409' ? { message: STALE_SUBMISSION_MESSAGE } : undefined);
    assert.equal(calls, 1);
  }
});
