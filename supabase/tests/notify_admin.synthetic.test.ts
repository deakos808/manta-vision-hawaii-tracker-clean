import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const id = '12345678-1234-1234-1234-123456789abc';
const source = readFileSync('supabase/functions/notify-admin/index.ts', 'utf8').replace(/^import .*\n/gm, '');
async function run(options: any = {}) {
  let handler: any; const sent: any[] = [];
  const row = { id, submitted_by: 'owner', status: 'pending', submitted_at: new Date().toISOString(), sighting_date: '2026-10-05', manta_count: 1, photo_count: 2, payload: { photographer: '<script>bad</script>', phone: 'PRIVATE', island: 'Hawaii' }, ...options.row };
  const client = { auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'owner' } } }) }, from: (table: string) => {
    const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: table === 'profiles' ? { role: 'user', is_active: true, ...options.profile } : options.missing ? null : row }) }; return chain;
  } };
  const env: any = { SUPABASE_URL: 'https://example.invalid', SUPABASE_ANON_KEY: 'fake', RESEND_API_KEY: 'fake', ADMIN_NOTIFICATION_EMAIL: 'admin@example.invalid', NOTIFICATION_FROM_EMAIL: 'sender@example.invalid', APP_BASE_URL: 'https://app.example.invalid', ...options.env };
  const context = vm.createContext({ serve: (h: any) => { handler = h; }, createClient: () => client, Deno: { env: { get: (name: string) => env[name] } }, Response, URL, AbortSignal, console: { warn() {} }, fetch: async (url: string, init: any) => { sent.push({ url, ...init }); if (options.throwFetch) throw Error('mock'); return new Response('{}', { status: options.providerStatus || 200 }); } });
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context);
  const response = await handler(new Request('https://function.example.invalid', { method: 'POST', headers: options.noHeader ? {} : { Authorization: 'Bearer fake' }, body: JSON.stringify(options.body ?? { submissionId: id }) }));
  return { response, sent };
}
test('rejects malformed and extra request data without sending', async () => {
  for (const body of [{}, { submissionId: 'bad' }, { submissionId: id, to: 'other' }, { submissionId: id, html: 'bad' }]) assert.equal((await run({ body })).response.status, 400);
});
test('requires valid authenticated identity and active profile', async () => {
  for (const options of [{ noHeader: true }, { noUser: true }]) assert.equal((await run(options)).response.status, 401);
  assert.equal((await run({ profile: { role: 'admin', is_active: false } })).response.status, 403);
});
test('owner only gets own recent pending submission', async () => {
  for (const row of [{ submitted_by: 'other' }, { status: 'rejected' }, { status: 'committed' }, { submitted_at: '2000-01-01' }, { submitted_at: 'invalid' }]) {
    const r = await run({ row }); assert.equal(r.response.status, 403); assert.equal(r.sent.length, 0);
  }
  assert.equal((await run({ missing: true })).response.status, 404);
});
test('active admin may notify old pending submission, never committed', async () => {
  assert.equal((await run({ profile: { role: 'admin' }, row: { submitted_by: 'other', submitted_at: '2000-01-01' } })).response.status, 200);
  assert.equal((await run({ profile: { role: 'admin' }, row: { status: 'committed' } })).response.status, 403);
});
test('fixed trusted Resend envelope, escaped content and deterministic idempotency', async () => {
  const r = await run(); assert.equal(r.response.status, 200); assert.equal(r.sent.length, 1);
  const send = r.sent[0], body = JSON.parse(send.body);
  assert.equal(send.url, 'https://api.resend.com/emails'); assert.equal(send.method, 'POST');
  assert.equal(send.headers['Idempotency-Key'], `manta-sighting-submitted/${id}`);
  assert.deepEqual(body.to, ['admin@example.invalid']); assert.equal(body.from, 'sender@example.invalid');
  assert.equal(body.subject, 'New MantaTracker sighting submitted');
  assert.ok(body.html.includes(`https://app.example.invalid/sightings/add?review=${id}&amp;return=%2Fadmin%2Freview`));
  assert.ok(body.html.includes('&lt;script&gt;')); assert.ok(!body.html.includes('PRIVATE'));
});
test('configuration/provider failures fail safely without retry', async () => {
  assert.equal((await run({ env: { RESEND_API_KEY: '' } })).response.status, 503);
  const r = await run({ providerStatus: 500 }); assert.equal(r.response.status, 502); assert.equal(r.sent.length, 1);
  assert.equal((await run({ throwFetch: true })).response.status, 500);
});
