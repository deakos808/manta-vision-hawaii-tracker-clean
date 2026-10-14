import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as contract from './pendingSubmission';

function mock(migrated = false) {
  const state = { migrated, notes: 'original', revision: 0, status: 'pending', calls: [] as string[] };
  const client = {
    from: (_table: string) => {
      let patch: any;
      const query: any = {
        select() { return query; }, eq() { return query; },
        update(value: any) { patch = value; return query; },
        async single() {
          if (!patch) return { data: { payload: { notes: state.notes, mantas: [], untouched: 'keep' }, sighting_date: '2026-10-12' } };
          state.calls.push('legacy update');
          if (state.migrated) return { error: { code: '40001' } };
          state.notes = patch.payload?.notes ?? state.notes;
          state.status = patch.status ?? state.status;
          return { data: { id: 's' } };
        },
      };
      return query;
    },
    async rpc(name: string, args?: any) {
      state.calls.push(name);
      if (name === 'pending_submission_edit_protocol') return state.migrated ? { data: 1 } : { error: { code: 'PGRST202' } };
      if (name === 'save_pending_sighting_submission') {
        if (!state.migrated) return { error: { code: 'PGRST202' } };
        if (state.status !== 'pending') return { error: { code: '40001' } };
        if (args.expected_revision !== state.revision) return { error: { code: 'PT409' } };
        state.notes = args.changes.notes ?? state.notes;
        state.revision++;
        if (args.action !== 'save') state.status = args.action === 'commit' ? 'committed' : 'rejected';
        return { data: { revision: state.revision, status: state.status } };
      }
      if (state.migrated) return { error: { code: '42501' } };
      state.status = 'committed'; return { data: null };
    },
  };
  const ctx: any = { exports: {}, Error, require: (path: string) => path.includes('pendingSubmission') ? contract : { supabase: client } };
  vm.runInNewContext(ts.transpileModule(readFileSync('src/utils/reviewSave.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, ctx);
  return { state, client, saveAdmin: ctx.exports.saveReviewServer };
}

for (const action of ['save','commit','reject'] as const) test(`B: new Admin/current backend retains ${action}`, async () => {
  const { state, client, saveAdmin } = mock();
  const protocol = await contract.pendingEditProtocol(client);
  assert.equal(protocol, 0);
  await saveAdmin('s', { notes: 'edited', mantas: [] }, null, action, protocol);
  assert.equal(state.status, action === 'commit' ? 'committed' : action === 'reject' ? 'rejected' : 'pending');
  assert.ok(!state.calls.includes('save_pending_sighting_submission'));
});
for (const error of [{ code: '42501' }, { code: 'PGRST301' }, { message: 'network unavailable' }]) test(`capability ${JSON.stringify(error)} never enables legacy fallback`, async () => {
  await assert.rejects(contract.pendingEditProtocol({ rpc: async () => ({ error }) }), /Unable to check/);
});
test('unknown backend protocol fails closed', async () => {
  await assert.rejects(contract.pendingEditProtocol({ rpc: async () => ({ data: 2 }) }), /Unsupported/);
});
test('B: edit links require explicit capability and edit URL fails closed before hydration', () => {
  assert.match(readFileSync('src/pages/MyContributionsPage.tsx','utf8'), /editProtocol === 1 && pendingEditAvailable/);
  assert.match(readFileSync('src/pages/AddSightingPage.tsx','utf8'), /if \(editId && protocol !== 1\)/);
});
test('C: cutover between opening legacy review and saving rejects without approval or retry', async () => {
  const { state, client, saveAdmin } = mock();
  const loadedProtocol = await contract.pendingEditProtocol(client);
  state.migrated = true;
  await contract.savePendingSubmission(client, 's', 0, { notes: 'contributor revision one' });
  await assert.rejects(saveAdmin('s', { notes: 'stale' }, null, 'commit', loadedProtocol), { message: contract.RELOAD_SUBMISSION_MESSAGE });
  assert.equal(state.notes, 'contributor revision one'); assert.equal(state.revision, 1);
  assert.ok(!state.calls.includes('commit_sighting_submission'));
});
test('D: multi-actor 0 → 1 → 2 conflicts preserve newest values and use audience-specific copy', async () => {
  const { state, client, saveAdmin } = mock(true);
  assert.equal(await contract.pendingEditProtocol(client), 1);
  await contract.savePendingSubmission(client, 's', 0, { notes: 'contributor' });
  await assert.rejects(saveAdmin('s', { notes: 'stale admin' }, 0), { message: contract.ADMIN_STALE_SUBMISSION_MESSAGE });
  await saveAdmin('s', { notes: 'current admin' }, 1);
  await assert.rejects(contract.savePendingSubmission(client, 's', 1, { notes: 'stale contributor' }), { message: contract.STALE_SUBMISSION_MESSAGE });
  assert.equal(state.revision, 2); assert.equal(state.notes, 'current admin');
  assert.ok(!state.calls.includes('legacy update'));
});
test('D: no downgrade when revision-aware RPC disappears or errors', async () => {
  const { state, saveAdmin } = mock(false);
  await assert.rejects(saveAdmin('s', {}, 0, 'save', 1));
  assert.deepEqual(state.calls, ['save_pending_sighting_submission']);
});
test('both Admin list rejection paths use loaded revision and check result', () => {
  for (const name of ['ReviewListPage','ReviewSubmissionsPage']) {
    const text = readFileSync(`src/pages/admin/${name}.tsx`,'utf8');
    assert.match(text, /saveReviewServer/);
    assert.match(text, /edit_revision \?\? null, "reject", .*editProtocol/);
    assert.doesNotMatch(text, /\.update\(/);
    assert.match(text, /catch \(error\)/);
  }
});
