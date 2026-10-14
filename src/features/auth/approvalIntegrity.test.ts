import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { getApprovalIssues, approvalFailureMessage } from '../sightings/submissionValidation';

const page = readFileSync('src/pages/AddSightingPage.tsx', 'utf8');
const handlers = page.slice(page.indexOf('  function currentReviewPayload()'), page.indexOf('  // MantasList hooks'));
function harness(options: Record<string, any> = {}) {
  const events: string[] = [];
  const alerts: string[] = [];
  let saved: any;
  const chain: any = {
    update(value: any) { events.push(`update:${value.status}`); return chain; },
    eq() { return chain; }, select() { return chain; },
    async single() { return options.rejectResult ?? { data: { id: 'review' }, error: null }; }
  };
  const context: any = {
    editProtocol: 1, editRevision: 7, editId: null, canEditPending: false, submissionIssues: [], setEditRevision: () => {}, setEditError: (message: string | null) => { if (message) alerts.push(message); }, reviewId: 'review', canReview: true, loadedReviewId: 'review', reviewBusy: false,
    STALE_SUBMISSION_MESSAGE: "stale", ADMIN_STALE_SUBMISSION_MESSAGE: "admin stale", RELOAD_SUBMISSION_MESSAGE: "reload", approvalFailureMessage, needsTimeReview: false, mantas: [{ id: 'stable-manta', name: 'Kai', noMatch: true, photos: [{ id: 'photo', originalPath: 'original' }] }],
    date: '2026-10-05', startTime: '10:00:01', stopTime: '11:00:02', photographer: 'Researcher',
    email: 'test@example.invalid', phone: '', island: 'Hawaii', locationId: '1', locationName: 'Site',
    locationUnknown: false, lat: '19', lng: '-156', methods: { tagDeployment: true }, standardizeSurvey: 'Yes', notes: 'current notes',
    returnPath: '/admin/review',
    window: { confirm: () => true, alert: (s: string) => alerts.push(s) },
    setReviewBusy: (value: boolean) => { context.reviewBusy = value; },
    validateOrganicBiopsy: () => options.invalidBiopsy ? 'invalid biopsy' : null,
    hasOrganicBiopsies: () => !!options.biopsies,
    saveReviewServer: async (_id: string, payload: any, revision: number, action = 'save') => {
      assert.equal(revision, 7);
      if (action === 'reject') {
        events.push('update:rejected');
        if (options.rejectResult) throw new Error('Rejection failed');
      } else {
        events.push('save'); saved = payload;
        if (options.saveFails) throw new Error('save failed');
        if (action === 'commit') {
          events.push(options.biopsies ? 'commit_sighting_submission_with_biopsies' : 'commit_sighting_submission');
          if (options.rpcError || options.rpcFails) throw options.rpcError ?? new Error('RPC failed');
        }
      }
      return { revision: 8, status: action === 'save' ? 'pending' : action };
    },
    supabase: {
      rpc: async (name: string) => { events.push(name); return { error: options.rpcError ?? (options.rpcFails ? new Error('RPC failed') : null) }; },
      from: () => chain,
    },
    navigate: () => events.push('navigate'),
    ...options.state,
  };
  context.savePendingSubmission = (_client: unknown, id: string, revision: number, changes: unknown) => context.saveReviewServer(id, changes, revision);
  Object.defineProperty(context, 'approvalIssues', { get: () => getApprovalIssues(context) });
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return { context, events, alerts, saved: () => saved };
}

for (const biopsies of [false, true]) {
  test(`approval saves current complete review before ${biopsies ? 'biopsy wrapper' : 'base RPC'}`, async () => {
    const h = harness({ biopsies });
    await h.context.handleCommitReview();
    assert.deepEqual(h.events, ['save', biopsies ? 'commit_sighting_submission_with_biopsies' : 'commit_sighting_submission', 'navigate']);
    assert.equal(h.saved().date, '2026-10-05');
    assert.equal(h.saved().notes, 'current notes');
    assert.equal(h.saved().mantas[0].photos[0].originalPath, 'original');
    assert.equal(h.saved().standardize_survey, 'Yes');
    assert.deepEqual(Object.keys(h.saved()).sort(), ['date','startTime','stopTime','photographer','email','phone','island','locationId','locationName','latitude','longitude','location_unknown','mantas','methods','standardize_survey','notes'].sort());
  });
}
test('save failure prevents approval RPC and navigation', async () => {
  const h = harness({ saveFails: true }); await h.context.handleCommitReview();
  assert.deepEqual(h.events, ['save']); assert.match(h.alerts[0], /failed/);
});
test('RPC failure never writes status or reports success', async () => {
  const h = harness({ rpcFails: true }); await h.context.handleCommitReview();
  assert.deepEqual(h.events, ['save', 'commit_sighting_submission']);
  assert.match(h.alerts[0], /failed/);
});
for (const state of [{ canReview: false }, { loadedReviewId: null }, { needsTimeReview: true }]) {
  test(`approval blocked for ${JSON.stringify(state)}`, async () => {
    const h = harness({ state }); await h.context.handleCommitReview(); assert.deepEqual(h.events, []);
  });
}
test('invalid biopsy stops save and commit', async () => {
  const h = harness({ invalidBiopsy: true }); await h.context.handleCommitReview(); assert.deepEqual(h.events, []);
});
test('successful rejection reports success and navigates', async () => {
  const h = harness(); await h.context.handleRejectReview();
  assert.deepEqual(h.events, ['update:rejected', 'navigate']); assert.equal(h.alerts[0], 'Submission rejected.');
});
for (const rejectResult of [{ data: null, error: new Error('denied') }, { data: null, error: null }]) {
  test('failed/zero-row rejection stays in review', async () => {
    const h = harness({ rejectResult }); await h.context.handleRejectReview();
    assert.deepEqual(h.events, ['update:rejected']); assert.match(h.alerts[0], /failed/);
  });
}
test('all review entry routes resolve synchronously and fetch requires active admin', () => {
  const declaration = page.slice(page.indexOf('  const reviewId ='), page.indexOf('  const userId ='));
  for (const [state, query] of [[{ reviewId: 'r' }, ''], [null, 'review=r'], [null, 'reviewId=r']] as const) {
    for (const access of [{ loading: true, isActive: true, role: 'admin' }, { loading: false, isActive: true, role: 'user' }, { loading: false, isActive: false, role: 'admin' }]) {
      const script = ts.transpileModule(declaration + '\nresult = {reviewId, isReview, canReview};', {}).outputText;
      const ctx: any = { location: { state }, searchParams: new URLSearchParams(query), access };
      vm.runInNewContext(script, ctx);
      assert.equal(ctx.result.reviewId, 'r'); assert.equal(ctx.result.isReview, true); assert.equal(ctx.result.canReview, false);
    }
  }
  assert.match(page, /if \(!existingId \|\| \(isReview \? !canReview : !canEditPending\) \|\| !userId\) return;/);
  assert.match(page, /if \(isReview && !canReview\) return/);
});

test('review save forwards the loaded revision and atomic action without refetching', async () => {
  const source = readFileSync('src/utils/reviewSave.ts', 'utf8');
  let args: any[] = [];
  const client = {};
  const ctx: any = { exports: {}, require: (path: string) => path.includes('pendingSubmission')
    ? { savePendingSubmission: async (...values: any[]) => { args = values; return { revision: 8 }; } }
    : { supabase: client } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, ctx);
  const payload = { notes: 'reviewed' };
  await ctx.exports.saveReviewServer('r', payload, 7, 'commit');
  assert.deepEqual(args, [client, 'r', 7, payload, 'commit']);
  assert.doesNotMatch(source, /\.from\(|\.update\(/);
});

test('review save retains explicit unknown location', async () => {
  const h = harness({ state: { locationUnknown: true } });
  await h.context.handleSaveReview();
  assert.equal(h.saved().location_unknown, true);
  assert.equal(h.saved().latitude, '19');
  assert.equal(h.saved().locationName, 'Site');
});

test('incomplete review can be saved and reopened, but cannot be committed until corrected', async () => {
  const h = harness({ state: { stopTime: '09:00', mantas: [{ name: 'TestA', matchedCatalogId: null, noMatch: false }] } });
  await h.context.handleCommitReview();
  assert.deepEqual(h.events, []);
  assert.match(h.alerts[0], /Stop time must be after start time/);
  assert.match(h.alerts[0], /TestA: select a catalog match or No Match/);
  await h.context.handleSaveReview();
  assert.deepEqual(h.events, ['save']);
  assert.equal(h.saved().mantas[0].noMatch, false);
  const reopened = harness({ state: h.saved() });
  await reopened.context.handleCommitReview();
  assert.deepEqual(reopened.events, []);
  reopened.context.stopTime = '12:00';
  reopened.context.mantas[0].noMatch = true;
  await reopened.context.handleCommitReview();
  assert.deepEqual(reopened.events, ['save', 'commit_sighting_submission', 'navigate']);
});
test('known catalog backend failure is translated without internal identifiers', async () => {
  const h = harness({ rpcError: { message: 'Cannot commit submission secret-id manta internal-id has no resolved catalog match and is not marked noMatch' } });
  await h.context.handleCommitReview();
  assert.equal(h.alerts[0], 'Approval failed. Select a catalog match or No Match for every manta.');
  assert.deepEqual(h.events, ['save', 'commit_sighting_submission']);
});
test('only Commit Review button gains readiness gating', () => {
  assert.match(page, /disabled=\{reviewBusy \|\| approvalIssues.length > 0\}/);
  assert.match(page, /disabled=\{reviewBusy\} onClick=\{handleSaveReview\}/);
});

for (const failure of [false, true]) test(`pending contributor save ${failure ? 'failure retains draft' : 'updates same submission'}`, async () => {
  const h = harness({ saveFails: failure, state: { editId: 'review', canEditPending: true } });
  const before = JSON.stringify(h.context.mantas);
  await h.context.handleSavePending();
  assert.deepEqual(h.events, failure ? ['save'] : ['save','navigate']);
  assert.equal(JSON.stringify(h.context.mantas), before);
  assert.equal(h.saved().notes, 'current notes');
  assert.equal(h.saved().mantas[0].photos[0].originalPath, 'original');
  assert.match(h.alerts[0], failure ? /failed/ : /still pending/);
});
for (const state of [{ canEditPending: false }, { loadedReviewId: null }, { reviewBusy: true }, { submissionIssues: [{ field:'email' }] }]) {
  test(`pending save guard ${JSON.stringify(state)}`, async () => {
    const h = harness({ state: { editId: 'review', canEditPending: true, ...state } });
    await h.context.handleSavePending();
    assert.deepEqual(h.events, []);
  });
}
