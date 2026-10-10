import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as routing from './authRouting.ts';

const nativeRequire = createRequire(import.meta.url);
function load(relative: string, mocks: Record<string, unknown>) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8').replace(/import\.meta\.env/g, '({ DEV: false })');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', code)((id: string) => mocks[id] ?? nativeRequire(id), module, module.exports);
  return module.exports;
}
function fixture(state: routing.UserAccessState, restoring = false) {
  const router = {
    Navigate: ({ to }: { to: string }) => React.createElement('span', { 'data-redirect': to }),
    useLocation: () => ({ pathname: '/requested', search: '', hash: '' }),
    useNavigate: () => () => {},
    Routes: 'routes', Route: 'route',
  };
  const common = { react: { ...React, default: React }, 'react-router-dom': router, '@/features/auth/authRouting': routing };
  const Guard = load('../../components/auth/RequireAuth.tsx', {
    ...common,
    '@supabase/auth-helpers-react': { useSessionContext: () => ({ isLoading: restoring }) },
    '@/hooks/useUserAccess': { useUserAccess: () => ({ state }) },
  }).default;
  const SignIn = load('../../pages/auth/SignInPage.tsx', { ...common, '@/lib/supabase': {} }).default;
  const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  const mocks: Record<string, unknown> = { ...common };
  for (const [, name, path] of appSource.matchAll(/import (\w+) from "([^"]+)"/g)) {
    if (path === 'react') continue;
    mocks[path] = { default: () => React.createElement('article', null, name) };
  }
  mocks['@/components/auth/RequireAuth'] = { default: Guard };
  mocks['@/pages/auth/SignInPage'] = { default: SignIn };
  const App = load('../../App.tsx', mocks).default;
  const routes = App().props.children[1].props.children as React.ReactElement<any>[];
  const render = (path: string) => renderToStaticMarkup(routes.find((r: any) => r.props.path === path)!.props.element);
  return { render, routes };
}

test('anonymous app routes redirect before rendering data or navigation', () => {
  const { render, routes } = fixture('signed_out');
  for (const route of routes as any[]) {
    const path = route.props.path;
    if (['/signin', '/login', '/set-password', '/signout', '*'].includes(path)) continue;
    assert.equal(render(path), '<span data-redirect="/signin"></span>', path);
  }
  const signin = render('/signin');
  assert.match(signin, /<form/);
  assert.match(signin, /Forgot password/);
  assert.doesNotMatch(signin, /Dashboard|My Contributions|Admin|Sign Out|Layout|Header|footer/);
});

test('active users enter dashboard and ordinary data routes, but not admin diagnostics', () => {
  const { render, routes } = fixture('user');
  for (const path of ['/', '/signin']) assert.match(render(path), /data-redirect="\/dashboard"/);
  for (const path of ['/dashboard', '/my-contributions', '/browse/data', '/browse/catalog', '/browse/photos', '/browse/sightings', '/browse/mantas']) {
    assert.match(render(path), /<article>/, path);
  }
  for (const route of routes as any[]) {
    const path = route.props.path;
    if (path.startsWith('/admin') || ['/import', '/sightings/add2', '/test-match-ui', '/browse/sizes', '/browse/drone', '/browse/biopsies'].includes(path)) {
      assert.match(render(path), /Administrator access required/, path);
    }
  }
});

test('active admins retain every existing protected route', () => {
  const { render, routes } = fixture('admin');
  for (const route of routes as any[]) {
    if (route.props.path.startsWith('/admin') || ['/import', '/sightings/add2', '/test-match-ui'].includes(route.props.path)) assert.match(render(route.props.path), /<article>/);
  }
});

test('restoration never renders sign-in or protected content before access resolves', () => {
  for (const [state, restoring] of [['admin', true], ['signed_out', true], ['loading', false]] as const) {
    const { render } = fixture(state, restoring);
    for (const path of ['/', '/signin', '/dashboard', '/browse/data', '/admin']) {
      assert.match(render(path), /Restoring your secure session/);
      assert.doesNotMatch(render(path), /<form|<article|data-redirect/);
    }
  }
});

test('inactive or unverifiable sessions cannot reach entry or protected pages', () => {
  for (const state of ['inactive', 'missing_profile', 'error'] as const) {
    const { render } = fixture(state);
    for (const path of ['/', '/signin', '/dashboard', '/browse/photos']) {
      assert.match(render(path), /role="alert"/);
      assert.doesNotMatch(render(path), /<form|<article|data-redirect/);
    }
  }
});

test('recovery stays public without the application shell and retains dedicated recovery logic', () => {
  const source = readFileSync(new URL('../../pages/auth/SetPasswordPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /components\/layout|<Layout|<Header/);
  assert.match(source, /supabase.auth.setSession/);
  assert.match(source, /supabase.auth.updateUser/);
  assert.match(fixture('signed_out').render('/set-password'), /SetPasswordPage/);
});

test('access hook ignores stale permissions immediately on signout or account switch', () => {
  for (const session of [null, { user: { id: 'next-user' } }]) {
    const { useUserAccess } = load('../../hooks/useUserAccess.ts', {
      react: { useEffect: () => {}, useState: () => [{ userId: 'prior-user', state: 'admin', role: 'admin', isActive: true, loading: false }, () => {}] },
      '@supabase/auth-helpers-react': { useSessionContext: () => ({ session, isLoading: false }) },
      '@/lib/supabase': {},
    });
    assert.equal(useUserAccess().state, session ? 'loading' : 'signed_out');
  }
});


test('Admin Import clearly disables legacy actions without mounting staging controls', () => {
  const Import = load('../../pages/admin/ImportPage.tsx', {
    react: { ...React, default: React },
    '@/components/layout/Layout': { default: ({ children }: any) => React.createElement('main', null, children) },
  }).default;
  const html = renderToStaticMarkup(React.createElement(Import));
  assert.match(html, /temporarily unavailable/);
  assert.match(html, /invite-only beta/);
  assert.doesNotMatch(html, /<button|<input|<form/);
  const source = readFileSync(new URL('../../pages/admin/ImportPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /CatalogStagingPanel|StagingCsvPanel|ImportCsvPanel/);
});
