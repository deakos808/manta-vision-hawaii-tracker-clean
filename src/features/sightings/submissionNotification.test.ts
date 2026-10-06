import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync('src/features/sightings/submissionNotification.ts', 'utf8').replace(/^import .*\n/gm, '').replace('export async', 'async');
test('notification helper sends only ID once and resolves false on failure', async () => {
  for (const outcome of ['success', 'error', 'throw']) {
    const calls: any[] = [];
    const c: any = vm.createContext({ AbortSignal, console: { warn() {} }, supabase: { functions: { invoke: async (...args: any[]) => { calls.push(args); if (outcome === 'throw') throw Error(); return { error: outcome === 'error' }; } } } });
    vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, c);
    assert.equal(await c.notifySubmission('id'), outcome === 'success'); assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'notify-admin'); assert.equal(JSON.stringify(calls[0][1].body), '{"submissionId":"id"}');
  }
});
test('submission insert precedes one notification; failure preserves success', async () => {
  const page = readFileSync('src/pages/AddSightingPage.tsx', 'utf8');
  const handler = page.slice(page.indexOf('  const handleSubmit ='), page.indexOf('  // Save handlers'));
  for (const insertFails of [false, true]) {
    const events: string[] = [];
    const chain: any = { insert: () => { events.push('insert'); return chain; }, select: () => chain, single: async () => ({ data: { id: 'saved-id' }, error: insertFails ? Error('insert') : null }) };
    const c: any = vm.createContext({ submissionIssues: [], mantas: [], validateOrganicBiopsy: () => null, date: '', startTime: '', stopTime: '', photographer: '', email: '', phone: '', locationUnknown: false, island: '', locationId: '', locationName: '', lat: '', lng: '', methods: {}, standardizeSurvey: 'No', totalPhotos: 0, supabase: { from: () => chain }, notifySubmission: async (id: string) => { assert.equal(id, 'saved-id'); events.push('notify'); return false; }, setSuccessMessage: () => events.push('success'), setSuccessOpen: () => events.push('open'), window: { alert: () => events.push('error') }, console });
    vm.runInContext(ts.transpileModule(handler + '\n globalThis.submit = handleSubmit;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, c);
    await c.submit(); assert.deepEqual(events, insertFails ? ['insert','error'] : ['insert','notify','success','open']);
  }
});
