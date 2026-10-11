import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as contract from '../../../supabase/functions/request-contributor-access/contract.ts';
import { invitePrefill, contributorInviteLink } from './invitePrefill.ts';
const valid = { fullName: 'Mark Example', email: ' PERSON@Example.invalid ', regions: ['Maui Nui'], ownsPhotos: true, reliableDetails: true, acceptsReview: true };

test('request normalizes email and preserves optional blanks as null', () => {
  const r = contract.validateAccessRequest(valid);
  assert.equal(r.kind, 'valid');
  if (r.kind === 'valid') { assert.equal(r.value.email, 'person@example.invalid'); assert.equal(r.value.earliest_year, null); assert.equal(r.value.organization, null); }
});
test('required name, email, regions and each confirmation fail closed', () => {
  for (const patch of [{ fullName: '' }, { email: 'not email' }, { regions: [] }, { regions: ['Big Island'] }, { regions: ['Maui Nui', 'Maui Nui'] }, { ownsPhotos: false }, { reliableDetails: false }, { acceptsReview: false }, { acceptsReview: 'true' }]) {
    assert.equal(contract.validateAccessRequest({ ...valid, ...patch }).kind, 'invalid', JSON.stringify(patch));
  }
});
test('optional years/counts are bounded and markup/oversized text rejected', () => {
  for (const patch of [{ earliestYear: 1825 }, { earliestYear: 2027 }, { earliestYear: 2000.5 }, { earliestYear: true }, { photoCountRange: 10 }, { photoCountRange: '6-20' }, { experienceNotes: '<img src=x>' }, { fullName: 'a'.repeat(121) }, { experienceNotes: 'a'.repeat(2001) }, { email: 'a'.repeat(255) }]) {
    assert.equal(contract.validateAccessRequest({ ...valid, ...patch }, 2026).kind, 'invalid');
  }
  for (const photoCountRange of contract.PHOTO_COUNTS) assert.equal(contract.validateAccessRequest({ ...valid, photoCountRange, earliestYear: '1997' }).kind, 'valid');
});
test('honeypot is generic and extra privileged fields are rejected', () => {
  assert.equal(contract.validateAccessRequest({ website: 'spam' }).kind, 'honeypot');
  for (const patch of [{ role: 'admin' }, { status: 'invited' }, { recipient: 'attacker@example.invalid' }]) assert.equal(contract.validateAccessRequest({ ...valid, ...patch }).kind, 'invalid');
});
test('invitation URL prefill accepts only bounded display fields and cannot elevate permissions', () => {
  const result = invitePrefill('?email=PERSON%40example.invalid&displayName=Sam&reason=approved&role=admin&legacyPhotographerAlias=someone&permissions=all');
  assert.deepEqual(result, { email: 'person@example.invalid', displayName: 'Sam', reason: 'approved' });
  assert.equal(invitePrefill('?email=bad&displayName=%3Cscript%3E&reason='+ 'a'.repeat(600)).reason.length, 500);
  assert.equal(invitePrefill('?email=bad').email, '');
  const link = contributorInviteLink({ id: 'request-id', email: 'a+b@example.invalid', full_name: 'A & B' });
  const params = new URLSearchParams(link.split('?')[1]);
  assert.equal(params.get('email'), 'a+b@example.invalid'); assert.equal(params.get('displayName'), 'A & B');
  assert.equal(params.get('requestId'), 'request-id'); assert.equal(params.get('reason'), 'Contributor access approved');
  assert.equal(params.has('role'), false);
});
function pageFixture(user: unknown = null, invoke = async (_name: string, _options: any) => ({ data: { success: true }, error: null })) {
  const states: any[] = []; let cursor = 0; let ref: any;
  const react = { ...React, useState(initial: any) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], (v: any) => { states[i] = v; }]; }, useRef(initial: any) { return ref ??= { current: initial }; } };
  class Data { constructor(private body: any) {} get(k: string) { return this.body[k] ?? ''; } getAll(k: string) { return this.body[k] ?? []; } has(k: string) { return this.body[k] === true; } }
  const mocks: Record<string, any> = { react, 'react-router-dom': { Link: ({ to, children, ...props }: any) => React.createElement('a', { ...props, href: to }, children) }, '@supabase/auth-helpers-react': { useUser: () => user }, '@/lib/supabase': { supabase: { functions: { invoke } } }, '@/assets/manta-orientation-example.jpg': { default: '/example.jpg' }, '../../../supabase/functions/request-contributor-access/contract': contract };
  const source = readFileSync('src/pages/public/ContributePage.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', 'React', 'FormData', code)((id: string) => { if (!(id in mocks)) throw Error(id); return mocks[id]; }, module, module.exports, React, Data);
  const render = () => { cursor = 0; return module.exports.default(); };
  function findForm(node: any): any { if (!node || typeof node !== 'object') return; if (node.type === 'form') return node; for (const child of React.Children.toArray(node.props?.children)) { const found = findForm(child); if (found) return found; } }
  return { render, html: () => renderToStaticMarkup(render()), submit: (body = valid) => findForm(render()).props.onSubmit({ preventDefault() {}, currentTarget: body }) };
}
test('public page has no authenticated navigation, password or upload controls', () => {
  const html = pageFixture().html();
  assert.match(html, /Contribute to the Hawaiʻi Manta Tracker/); assert.match(html, /Request Contributor Access/);
  assert.match(html, /noopener noreferrer/); assert.match(html, /Manta Pacific Research Foundation/);
  assert.doesNotMatch(html, /href="\/(dashboard|browse|admin|my-contributions)|type="(password|file)"/);
  assert.match(pageFixture({ id: 'user' }).html(), /Already a contributor\? Go to Dashboard/);
});
test('valid form submits once, renders success, and never performs account creation', async () => {
  const calls: any[] = []; let finish!: (value: any) => void;
  const page = pageFixture(null, async (name, options) => { calls.push({ name, ...options }); return new Promise(resolve => { finish = resolve; }); });
  const pending = page.submit(); await page.submit(); assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'request-contributor-access');
  finish({ data: { success: true }, error: null }); await pending;
  assert.match(page.html(), /Request received/); assert.doesNotMatch(page.html(), /<form/);
});
test('form validation prevents request and delivery failure stays editable', async () => {
  let calls = 0; const page = pageFixture(null, async () => { calls++; return { data: null, error: Error('mock') }; });
  await page.submit({ ...valid, regions: [] }); assert.equal(calls, 0); assert.match(page.html(), /Choose at least one/);
  await page.submit(); assert.equal(calls, 1); assert.match(page.html(), /could not be received/); assert.match(page.html(), /<form/);
});
test('invite prefill changes initialization only; send still needs existing manual confirmation', () => {
  const source = readFileSync('src/pages/admin/UsersInvitePage.tsx', 'utf8');
  assert.match(source, /useState\(\(\) => invitePrefill\(search\)\)/);
  assert.match(source, /window.confirm\("Invite this person as a regular user\?"\)/);
  assert.match(source, /linkHistory && candidate\?\.status === "eligible"/);
  assert.doesNotMatch(source, /useEffect|params.get\(['"]role|role:\s*['"]admin/);
});


test('Invite User renders safe prefill without invoking invitation or historical lookup', () => {
  const source = readFileSync('src/pages/admin/UsersInvitePage.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText;
  let calls = 0;
  const mocks: Record<string, any> = {
    react: { ...React, default: React },
    'react-router-dom': { useLocation: () => ({ search: '?email=person%40example.invalid&displayName=Pat&reason=Contributor+access+approved&role=admin&legacyPhotographerAlias=Other' }), Link: ({ to, children, ...props }: any) => React.createElement('a', { ...props, href: to }, children) },
    '@/features/contributors/invitePrefill': { invitePrefill },
    '@/components/layout/Layout': { default: ({ children }: any) => React.createElement('main', null, children) },
    '@/components/ui/button': { Button: 'button' }, '@/components/ui/input': { Input: 'input' }, '@/components/ui/label': { Label: 'label' },
    '@/lib/adminUserManagementApi': { inviteManagedUser: () => { calls++; }, checkHistoricalContributions: () => { calls++; } },
  };
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', 'React', code)((id: string) => mocks[id], module, module.exports, React);
  const html = renderToStaticMarkup(React.createElement(module.exports.default));
  assert.match(html, /value="person@example.invalid"/); assert.match(html, /value="Pat"/);
  assert.match(html, /value="Contributor access approved"/); assert.match(html, />user</);
  assert.doesNotMatch(html, /value="admin"|Other/); assert.equal(calls, 0);
});
