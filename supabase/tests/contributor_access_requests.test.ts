import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createHandler, MAX_BODY_BYTES } from '../functions/request-contributor-access/handler.ts';
const good = { fullName: 'Example Person', email: 'person@example.invalid', regions: ['Maui Nui'], ownsPhotos: true, reliableDetails: true, acceptsReview: true };
const origin = 'https://www.mantatracker.com';
function fixture(options: { duplicate?: boolean; storeFails?: boolean; emailFails?: boolean } = {}) {
  const stored: any[] = [], sent: any[] = [], logs: string[] = [];
  const handler = createHandler({ allowedOrigins: [origin], async store(v) { stored.push(v); if (options.storeFails) throw Error('private'); return options.duplicate ? null : 'new-id'; }, async notify(id, v) { sent.push({ id, v }); if (options.emailFails) throw Error('provider private'); }, warn: m => logs.push(m) });
  const request = (body: unknown = good, method = 'POST', requestOrigin: string | null = origin) => handler(new Request('https://example.invalid/request', { method, headers: { ...(requestOrigin ? { Origin: requestOrigin } : {}), 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }));
  return { request, stored, sent, logs };
}
test('public endpoint requires exact origin, POST, bounded valid JSON', async () => {
  const f = fixture();
  for (const o of [null, 'https://www.mantatracker.com.attacker.invalid', 'null']) assert.equal((await f.request(good, 'POST', o)).status, 403);
  assert.equal((await f.request(good, 'GET')).status, 405);
  const preflight = await f.request(good, 'OPTIONS'); assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal((await f.request('{')).status, 400);
  assert.equal((await f.request(' '.repeat(MAX_BODY_BYTES + 1))).status, 413);
  assert.equal(f.stored.length, 0); assert.equal(f.sent.length, 0);
});
test('honeypot and duplicate pending request share ordinary success without email', async () => {
  const bot = fixture(); const botResponse = await bot.request({ website: 'bot' });
  assert.equal(bot.stored.length, 0); assert.equal(bot.sent.length, 0);
  const duplicate = fixture({ duplicate: true }); const dupResponse = await duplicate.request(); assert.equal(duplicate.sent.length, 0);
  const genuine = fixture(); const response = await genuine.request(); assert.equal(genuine.sent.length, 1);
  assert.equal(await response.text(), await dupResponse.text()); assert.equal(await botResponse.text(), '{"success":true}');
});
test('notification error after store is nonfatal and logs contain no applicant/provider data', async () => {
  const f = fixture({ emailFails: true }); assert.equal((await f.request()).status, 200);
  assert.equal(f.stored.length, 1); assert.equal(f.sent.length, 1);
  assert.equal(f.logs.length, 1); assert.doesNotMatch(f.logs.join(''), /person@example|private/);
});
test('failed storage never sends email or claims success', async () => {
  const f = fixture({ storeFails: true }); assert.equal((await f.request()).status, 503); assert.equal(f.sent.length, 0);
});
test('server rejects unchecked consent, invalid regions and injected delivery metadata', async () => {
  const f = fixture();
  for (const patch of [{ acceptsReview: false }, { regions: ['Hawaii'] }, { to: 'x' }, { status: 'invited' }]) assert.equal((await f.request({ ...good, ...patch })).status, 400);
  assert.equal(f.stored.length, 0);
});
const migration = readFileSync('supabase/migrations/20261011192132_contributor_access_requests.sql', 'utf8');
const rollback = readFileSync('supabase/rollback/20261011192132_contributor_access_requests_rollback.sql', 'utf8');
test('table is private with only active-admin SELECT and column-limited UPDATE', () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public.contributor_access_requests from public, anon, authenticated/);
  assert.match(migration, /grant update \(status, reviewed_at, reviewed_by, admin_notes\)/);
  assert.equal((migration.match(/role = 'admin' and is_active is true/g) || []).length, 3);
  assert.doesNotMatch(migration, /for insert|to anon|grant (?:all|insert|delete).*authenticated/i);
});
test('service-only atomic receipt serializes recent pending email duplicates', () => {
  assert.match(migration, /security invoker set search_path = ''/);
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(normalized_email, 0\)\)/);
  assert.match(migration, /status = 'pending' and created_at >= now\(\) - interval '24 hours'/);
  assert.ok(migration.indexOf('return null') < migration.indexOf('insert into public.contributor_access_requests'));
  assert.match(migration, /revoke all on function public.receive_contributor_access_request\(jsonb\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public.receive_contributor_access_request\(jsonb\) to service_role/);
});
test('minimal schema and guarded paired rollback exclude scientific/Auth mutations', () => {
  assert.equal((migration.match(/create table /g) || []).length, 1);
  assert.match(migration, /email = lower\(btrim\(email\)\)/); assert.match(migration, /'pending', 'reviewed', 'invited', 'declined'/);
  assert.match(rollback, /raise exception 'Contributor requests exist/);
  assert.match(rollback, /drop function public.receive_contributor_access_request\(jsonb\)/);
  assert.match(rollback, /drop table public.contributor_access_requests/);
  assert.doesNotMatch(migration, /insert into (?:auth\.|public\.(?:catalog|photos|sightings|mantas))|alter table public\.(?!contributor_access_requests)/);
});
test('endpoint creates no Auth user, exposes no direct browser insert, and is explicitly public', () => {
  const source = readFileSync('supabase/functions/request-contributor-access/index.ts', 'utf8');
  assert.doesNotMatch(source, /auth\.|inviteUser|createUser|signUp|getUser|listUsers/);
  assert.match(source, /resolveSecretKey\(\)/);
  assert.match(readFileSync('supabase/config.toml', 'utf8'), /\[functions.request-contributor-access\]\s*enabled = true\s*verify_jwt = false/);
  assert.doesNotMatch(readFileSync('src/pages/public/ContributePage.tsx', 'utf8'), /\.from\(|auth\.(?:signUp|admin)/);
});
test('Resend envelope and admin URL are server-owned; content escaped; idempotency preserved', async () => {
  const source = readFileSync('supabase/functions/request-contributor-access/index.ts', 'utf8').replace(/^import .*\n/gm, '');
  const sent: any[] = []; const exports: any = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, serve() {}, createHandler() {}, Deno: { env: { get: (key: string) => ({ RESEND_API_KEY: 'fake', ADMIN_NOTIFICATION_EMAIL: 'admin@example.invalid', NOTIFICATION_FROM_EMAIL: 'from@example.invalid' }[key]) } }, AbortSignal,
    fetch: async (url: string, init: any) => { sent.push({ url, ...init }); return new Response('{}'); },
  });
  await exports.notifyRequest('new-id', { full_name: 'Name & Name', email: good.email, regions: ['Maui Nui'], experience_notes: '<b>not markup</b>' });
  const body = JSON.parse(sent[0].body);
  assert.equal(sent[0].url, 'https://api.resend.com/emails'); assert.equal(sent[0].headers['Idempotency-Key'], 'manta-contributor-request/new-id');
  assert.deepEqual(body.to, ['admin@example.invalid']); assert.equal(body.subject, 'New MantaTracker contributor access request — Name & Name');
  assert.match(body.html, /&lt;b&gt;/); assert.match(body.html, /https:\/\/www.mantatracker.com\/admin\/contributor-requests/);
});
