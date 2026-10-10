import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { authenticatedPhotoUrl, freshSignedPhotoUrl, mantaDisplayReference } from './authenticatedPhotoUrl';
import { loadContributionPhotos, payloadPhotos } from '../sightings/contributionDetails';

const origin = 'https://fixture.supabase.co';
const permanent = 'photos/6128/6128.jpg';
const pending = 'submissions/owner/sighting/manta/photo/prepared-edit.jpg';
const source = readFileSync('src/features/photos/MantaImage.tsx', 'utf8');
const compiled = ts.transpileModule(source.replace(/^import .*;\n/gm, '').replace(/import\.meta\.env/g, 'env'), {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS },
}).outputText;
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

// Execute the real component/handler with real QueryClient + QueryObserver.
// Only React's hook adapter/element creation, clock and Storage network are doubles.
// No DOM, native automation, live credentials, public delivery or real-time waits.
function setup(t: TestContext) {
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  let user: { id: string } | null = { id: 'owner' };
  const calls: { user: string; bucket: string; path: string; expiry: number }[] = [];
  let failSigning = false;
  const client: any = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    storage: { from: (bucket: string) => ({
      getPublicUrl: () => assert.fail('public delivery must never be used'),
      createSignedUrl: async (path: string, expiry: number) => {
        calls.push({ user: user!.id, bucket, path, expiry });
        return failSigning ? { data: null, error: new Error('denied') }
          : { data: { signedUrl: `${origin}/storage/v1/object/sign/${bucket}/${path}?fixture=${calls.length}` }, error: null };
      },
    }) },
  };
  const cache = new QueryClient();
  type Slot = { observer?: QueryObserver<any>; unsubscribe?: () => void };
  let active: Slot;
  const slots: Slot[] = [];
  const exported: any = {};
  vm.runInNewContext(compiled, {
    exports: exported, env: { VITE_SUPABASE_URL: origin },
    React: { createElement: (_tag: unknown, props: unknown) => props }, forwardRef: (fn: unknown) => fn,
    useUser: () => user, useSupabaseClient: () => client, useQueryClient: () => cache,
    useQuery: (options: any) => {
      if (!active.observer) {
        active.observer = new QueryObserver(cache, options);
        active.unsubscribe = active.observer.subscribe(() => {});
      } else active.observer.setOptions(options);
      return active.observer.getCurrentResult();
    }, authenticatedPhotoUrl, mantaDisplayReference, freshSignedPhotoUrl,
  });
  t.after(() => { for (const slot of slots) slot.unsubscribe?.(); cache.clear(); });
  return {
    client, cache, calls, advance: (ms: number) => { now += ms; },
    user: (id: string | null) => { user = id ? { id } : null; },
    fail: () => { failSigning = true; },
    image: (src: string, onError = () => {}) => {
      const slot: Slot = {}; slots.push(slot);
      return {
        render: () => { active = slot; return exported.MantaImage({ src, onError }, null); },
        unmount: () => { slot.unsubscribe?.(); slot.observer?.destroy(); },
      };
    },
  };
}

async function proveRecovery(t: TestContext, input: string, expectedPath: string) {
  const h = setup(t); let fallback = 0;
  const image = h.image(input, () => fallback++);
  assert.equal(image.render().src, undefined);
  await flush(); const first = image.render();
  assert.match(first.src, /\/object\/sign\//);
  assert.deepEqual(h.calls, [{ user: 'owner', bucket: 'manta-images', path: expectedPath, expiry: 300 }]);
  h.advance(239_000);
  assert.equal(image.render().src, first.src, 'reuse shortly before the four-minute safety boundary');
  assert.equal(h.calls.length, 1);
  h.advance(181_000); // T0 + seven minutes, with no real-time wait.
  first.onError({}); // Delayed request/error from the old lazy image.
  assert.equal(fallback, 0, 'expired error must not latch the consumer fallback');
  assert.equal(image.render().src, undefined, 'withhold the stale URL during refresh');
  await flush(); const refreshed = image.render();
  assert.notEqual(refreshed.src, first.src);
  assert.match(refreshed.src, /\/object\/sign\//);
  assert.equal(h.calls.length, 2); assert.equal(fallback, 0);
  for (let i = 0; i < 5; i++) refreshed.onError({});
  await flush(); assert.equal(h.calls.length, 2, 'genuine fresh-image errors cannot create a signing storm');
  assert.equal(fallback, 5, 'fresh failure reaches the existing graceful fallback');
}

for (const [label, path] of [['Phoenix permanent', permanent], ['own pending prepared', pending]]) {
  test(`${label}: signed image recovers automatically after expiry; fresh failure is bounded`, t => proveRecovery(t, `manta-images/${path}`, path));
}
test('stale cache on remount signs again without requiring a failed image request', async t => {
  const h = setup(t); const old = h.image(permanent); old.render(); await flush(); const first = old.render().src; old.unmount();
  h.advance(420_000);
  const reopened = h.image(permanent); assert.equal(reopened.render().src, undefined);
  await flush(); assert.notEqual(reopened.render().src, first); assert.equal(h.calls.length, 2);
});
test('cache separates normalized path, bucket and user; sign-out never returns prior-user URL', async t => {
  const h = setup(t); const image = h.image(permanent); image.render(); await flush(); const owner = image.render().src;
  const same = h.image(`manta-images/${permanent}`); assert.equal(same.render().src, owner); assert.equal(h.calls.length, 1);
  assert.deepEqual(Array.from(h.cache.getQueryCache().getAll()[0].queryKey), ['manta-photo-display','owner','manta-images',permanent]);
  h.user(null); assert.equal(image.render().src, undefined); await flush(); assert.equal(h.calls.length, 1);
  h.user('admin'); assert.equal(image.render().src, undefined); await flush();
  assert.notEqual(image.render().src, owner); assert.equal(h.calls.length, 2);
  assert.ok(h.cache.getQueryCache().find({ queryKey: ['manta-photo-display','admin','manta-images',permanent] }));
});
test('signing failure after expiration settles without automatic network retries', async t => {
  const h = setup(t); const image = h.image(permanent); image.render(); await flush(); const first = image.render();
  h.advance(420_000); h.fail(); first.onError({}); await flush();
  assert.equal(image.render().src, '/manta-logo.svg');
  for (let i = 0; i < 5; i++) image.render().onError({});
  await flush(); assert.equal(h.calls.length, 2);
});

const match = readFileSync('src/components/mantas/MatchModal.tsx','utf8');
const imgFromRow = vm.runInNewContext(ts.transpileModule(match.slice(match.indexOf('function imgFromRow'), match.indexOf('const IMAGE_FRAME')) + '\nimgFromRow;', {}).outputText);
test('Match submitted and catalog sides refresh independently through the same reader', async t => {
  assert.match(match, /<MantaImage[\s\S]*?src=\{tempUrl/);
  assert.match(match, /src=\{imgFromRow\(current\)\}/);
  const h = setup(t); const left = h.image(`manta-images/${pending}`); left.render(); await flush(); const leftFirst = left.render();
  h.advance(120_000);
  const right = h.image(imgFromRow({best_catalog_ventral_path:permanent,best_catalog_ventral_thumb_url:'unusable-public'}));right.render();await flush();const rightFirst=right.render();
  h.advance(200_000);leftFirst.onError({});await flush();
  assert.notEqual(left.render().src,leftFirst.src);assert.equal(right.render().src,rightFirst.src);
  h.advance(120_000);rightFirst.onError({});await flush();
  assert.notEqual(right.render().src,rightFirst.src);
  assert.equal(h.calls.filter(c=>c.path===pending).length,2);assert.equal(h.calls.filter(c=>c.path===permanent).length,2);
});
const browse = readFileSync('src/pages/browse_data/Catalog.tsx','utf8');
const browseExpression = browse.slice(browse.indexOf('const thumb =') + 'const thumb ='.length, browse.indexOf(';',browse.indexOf('const thumb =')));
for (const id of [6128,4827,4878]) {
  test(`Browse card ${id}: durable path wins and recovers after expiry`, t => {
    const path=`photos/${id}/${id}.jpg`;
    const src=vm.runInNewContext(browseExpression,{viewMode:'ventral',e:{best_catalog_ventral_path:path,best_catalog_ventral_thumb_url:'unusable-public'}});
    assert.equal(src,path);assert.match(browse,/<MantaImage\s+src=\{thumb\}/);
    return proveRecovery(t,src,path);
  });
}
test('historical contribution uses storage_path, never legacy filename, and recovers', async t => {
  const h=setup(t); const filename='remote:pk490_Maui mask.jpg\vJPEG:Secure/legacy';
  h.client.from=()=>{const q:any={select:()=>q,eq:()=>q,order:()=>q,range:async()=>({data:[{storage_bucket:'manta-images',storage_path:permanent,file_name2:filename}],error:null})};return q;};
  const photos=await loadContributionPhotos(h.client,'owner',{source:'historical',sightingId:1} as any);
  assert.equal(photos[0].name,filename);assert.equal(photos[0].url,`manta-images/${permanent}`);
  const image=h.image(photos[0].url!);image.render();await flush();const first=image.render();h.advance(420_000);first.onError({});await flush();
  assert.notEqual(image.render().src,first.src);assert.ok(h.calls.every(c=>c.path===permanent));assert.equal(h.calls.length,2);
});
test('pending contribution path outranks legacy public URL and refreshes', async t => {
  const h=setup(t);const input={mantas:[{photos:[{storageBucket:'manta-images',path:pending,url:'unusable-public',name:'source.jpg'}]}]};
  const snapshot=JSON.stringify(input);const [photo]=payloadPhotos(h.client,input);
  assert.equal(photo.url,`manta-images/${pending}`);
  const image=h.image(photo.url!);image.render();await flush();const first=image.render();h.advance(420_000);first.onError({});await flush();
  assert.notEqual(image.render().src,first.src);assert.equal(h.calls.length,2);assert.equal(JSON.stringify(input),snapshot);
});
test('catalog details and contribution modals share the expiration-tested MantaImage component',()=>{
  for(const path of ['src/features/sightings/ContributionModals.tsx','src/pages/browse_data/modals/CatalogBestPhotoModal.tsx']) {
    assert.match(readFileSync(path,'utf8'),/import \{ MantaImage \}/);assert.match(readFileSync(path,'utf8'),/<MantaImage/);
  }
});

for (const bucket of ['temp-images','drone-photo']) {
  test(`${bucket}: image uses existing user/bucket/path cache and refreshes without public fallback`, async t => {
    const h=setup(t);const image=h.image(`${origin}/storage/v1/object/public/${bucket}/drone/photo.jpg`);
    image.render();await flush();const first=image.render();
    assert.deepEqual(h.calls,[{user:'owner',bucket,path:'drone/photo.jpg',expiry:300}]);
    assert.match(first.src,/\/object\/sign\//);
    const same=h.image(`${bucket}/drone/photo.jpg`);assert.equal(same.render().src,first.src);
    h.advance(420_000);first.onError({});assert.equal(image.render().src,undefined);await flush();
    assert.notEqual(image.render().src,first.src);assert.equal(h.calls.length,2);
    h.user(null);assert.equal(image.render().src,undefined);
  });
}
test('temp preview, admin draft and committed drone screens use the shared signed reader',()=>{
  for (const file of ['src/pages/drone/AddDroneSightingPage.tsx','src/pages/admin/DroneDraftsPage.tsx','src/pages/browse_data/DroneSurveys.tsx']) {
    const s=readFileSync(file,'utf8');assert.match(s,/<MantaImage/);assert.match(s,/mantaPhotoSource/);assert.doesNotMatch(s,/getPublicUrl/);
  }
  const upload=readFileSync('src/components/drone/DronePhotosModal.tsx','utf8');
  assert.match(upload,/storageBucket: "temp-images"/);assert.doesNotMatch(upload,/getPublicUrl|createSignedUrl/);
  const save=readFileSync('src/pages/drone/AddDroneSightingPage.tsx','utf8');assert.match(save,/path: p.path,\s+url: null/);
  const map=readFileSync('src/components/maps/DronePhotosMapModal.tsx','utf8');assert.match(map,/await authenticatedPhotoUrl/);assert.doesNotMatch(map,/getPublicUrl/);
  const diagnostics=readFileSync('src/pages/admin/DiagnosticsPage.tsx','utf8');assert.doesNotMatch(diagnostics,/getPublicUrl/);
});
