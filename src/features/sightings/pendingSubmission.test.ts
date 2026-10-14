import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { pendingEditAvailable, savePendingSubmission, STALE_SUBMISSION_MESSAGE } from './pendingSubmission';

for (const [source, status, sightingId, expected] of [
  ['submission','Pending',null,true], ['submission','Accepted',1,false],
  ['submission','Rejected',null,false], ['historical','Historical',1,false], ['submission','Pending',1,false],
] as const) test(`edit link eligibility ${source}/${status}/${sightingId}`, () => {
  assert.equal(pendingEditAvailable({ source, status, sightingId, submissionId: 's' }), expected);
});
test('save sends one revision-protected RPC, unchanged payload, and no INSERT/notification', async () => {
  const calls: unknown[] = [];
  const changes = { notes: '  Keep spacing  ', mantas: [{ id: 'm', photos: [{ id: 'p', originalPath: 'original', path: 'prepared-new', measure: { dwCm: 314 } }] }] };
  const result = await savePendingSubmission({ rpc: async (...args: unknown[]) => {
    calls.push(args); return { data: { revision: 6, status: 'pending' } };
  } }, 's', 5, changes);
  assert.deepEqual(calls, [['save_pending_sighting_submission', { sub_id: 's', expected_revision: 5, changes, action: 'save' }]]);
  assert.equal(result.revision, 6);
});
test('contributor conflict guidance refers only to My Contributions', () => {
  assert.equal(STALE_SUBMISSION_MESSAGE, 'This submission changed while you were editing it. Your changes were not saved. Return to My Contributions and reopen the latest version before trying again. Copy any unsaved notes before leaving this page.');
  assert.doesNotMatch(STALE_SUBMISSION_MESSAGE, /review queue|SQL|RPC/);
});
test('stale revision reports conflict without retrying', async () => {
  let calls = 0;
  await assert.rejects(savePendingSubmission({ rpc: async () => { calls++; return { error: { code: '40001' } }; } }, 's', 0, {}), { message: STALE_SUBMISSION_MESSAGE });
  assert.equal(calls, 1);
});
for (const revision of [null, -1, NaN]) test(`invalid revision ${revision} fails before RPC`, async () => {
  await assert.rejects(savePendingSubmission({ rpc: () => assert.fail('must not send') }, 's', revision, {}));
});
test('unconfirmed response never reports a successful save', async () => {
  await assert.rejects(savePendingSubmission({ rpc: async () => ({ data: null }) }, 's', 0, {}));
});
test('pending mode loads same payload/workbench and excludes fresh intake auto-open', () => {
  const source = readFileSync('src/pages/AddSightingPage.tsx','utf8');
  assert.match(source, /searchParams.get\("edit"\)/);
  assert.match(source, /data.submitted_by !== userId/);
  assert.match(source, /data.status !== "pending"/);
  assert.match(source, /const formSightingId = existingId \|\| newSightingId/);
  const handler = source.slice(source.indexOf('  async function handleSavePending'), source.indexOf('  // MantasList hooks'));
  assert.doesNotMatch(handler, /notifySubmission|\.insert\(|commit_sighting_submission/);
  assert.match(handler, /editRevision, currentReviewPayload\(\)/);
});
test('opening and saving an existing manta retains canonical identity and unknown metadata', () => {
  const modal = readFileSync('src/components/mantas/UnifiedMantaModal.tsx','utf8');
  const init = modal.match(/setPotentialCatalogId\(.*?\);/)![0];
  let id: unknown;
  vm.runInNewContext(init, { existingManta: { matchedCatalogId: 733, potentialCatalogId: 5 }, setPotentialCatalogId: (v: unknown) => { id = v; } });
  assert.equal(id, 733);
  const page = readFileSync('src/pages/AddSightingPage.tsx','utf8');
  const handler = page.slice(page.indexOf('  const onEditSave ='),page.indexOf('  function currentReviewPayload'));
  let mantas = [{ id:'m', unknownEvidence: 'retain', matchedCatalogId:733, photos:[{id:'p',originalPath:'original',path:'old'}] }];
  const ctx: any = { setMantas: (fn: Function) => { mantas = fn(mantas); }, setEditingManta: () => {} };
  vm.runInNewContext(ts.transpile(handler+'\nonEditSave({id:"m",name:"Kai",photos:[{id:"p",originalPath:"original",path:"new"}]});'),ctx);
  assert.equal(mantas[0].id,'m'); assert.equal(mantas[0].unknownEvidence,'retain');
  assert.equal(mantas[0].photos[0].originalPath,'original'); assert.equal(mantas[0].photos[0].path,'new');
  assert.equal(mantas[0].matchedCatalogId,733);
});
