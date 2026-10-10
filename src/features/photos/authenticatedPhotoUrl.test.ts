import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { freshSignedPhotoUrl } from './authenticatedPhotoUrl';
import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticatedPhotoUrl, photoStorageReference, PHOTO_URL_LIFETIME_SECONDS, mantaPhotoSource, mantaDisplayReference } from './authenticatedPhotoUrl';
const origin = 'https://project.supabase.co';
const path = 'photos/42/42.jpg';
const ref = Object.freeze({ bucket: 'manta-images', path });
function mock(options: { signedIn?: boolean; failure?: boolean } = {}) {
  const calls: unknown[] = [];
  const client: any = {
    auth: { getUser: async () => ({data: {user: options.signedIn === false ? null : {id: 'user'}}, error: null}) },
    storage: {from: (bucket: string) => ({createSignedUrl: async (key: string, expiry: number) => {
      calls.push({bucket, key, expiry});
      return options.failure ? {data: null, error: new Error('denied')} : {data: {signedUrl: 'https://example.invalid/display-only'}, error: null};
    }})},
  };
  return {client, calls};
}
test('bucket-relative and legacy prefixed paths resolve to the same durable identity', () => {
  for (const input of [path, `manta-images/${path}`, `browse/manta-images/${path}`]) {
    assert.deepEqual(photoStorageReference({...ref, path: input}, origin), ref);
  }
});
test('historical full public URLs and endpoint-relative references require no row rewrite', () => {
  for (const prefix of [origin, '']) {
    assert.deepEqual(photoStorageReference({...ref, path: `${prefix}/storage/v1/object/public/manta-images/${path}`}, origin), ref);
  }
  assert.deepEqual(photoStorageReference({...ref, path: `${origin}/storage/v1/object/public/manta-images/photos/a%20b.jpg?cb=123`}, origin), {bucket: 'manta-images', path: 'photos/a b.jpg'});
});
test('foreign, signed, blob, mismatched bucket and malformed references fail closed', () => {
  for (const input of ['https://foreign.invalid/photo.jpg', `${origin}/photo.jpg`, `${origin}/storage/v1/object/sign/manta-images/${path}?token=example`, `${origin}/storage/v1/object/public/temp-images/${path}`, 'blob:local', '//foreign.invalid/photo', '../photo', 'photos//photo', 'photos/../photo', 'photos/a?token=example']) {
    assert.throws(() => photoStorageReference({...ref, path: input}, origin));
  }
});
test('display signing uses authenticated client, a five-minute lifetime and preserves reference', async () => {
  const {client, calls} = mock();
  assert.equal(await authenticatedPhotoUrl(client, ref, origin), 'https://example.invalid/display-only');
  assert.deepEqual(calls, [{bucket: ref.bucket, key: path, expiry: 300}]);
  assert.equal(PHOTO_URL_LIFETIME_SECONDS, 300);
  assert.deepEqual(ref, {bucket: 'manta-images', path});
});
test('signed-out caller never reaches Storage signing', async () => {
  const {client, calls} = mock({signedIn: false});
  await assert.rejects(authenticatedPhotoUrl(client, ref, origin), /Sign in/);
  assert.deepEqual(calls, []);
});
test('RLS/signing failure never falls back to public delivery', async () => {
  const {client} = mock({failure: true});
  await assert.rejects(authenticatedPhotoUrl(client, ref, origin), /unavailable/);
});
test('pending derivative and original identities survive normalization independently', () => {
  for (const file of ['original.jpg', 'prepared-edit.jpg']) {
    const path = `submissions/user/sighting/manta/photo/${file}`;
    assert.deepEqual(photoStorageReference({bucket: ref.bucket, path}, origin), {bucket: ref.bucket, path});
  }
});

test('pending path and bucket outrank a stale stored public URL without modifying payload', async () => {
  const photo = Object.freeze({path: 'submissions/owner/sighting/manta/photo/prepared-edit.jpg', storageBucket: 'manta-images', originalPath: 'submissions/owner/sighting/manta/photo/original.jpg', url: `${origin}/storage/v1/object/public/manta-images/old.jpg`});
  const snapshot = JSON.stringify(photo);
  const reference = mantaDisplayReference(mantaPhotoSource(photo), origin)!;
  assert.equal(reference.path, photo.path);
  const {client,calls} = mock();
  client.storage.from = (bucket: string) => ({getPublicUrl() {throw Error('disabled');},createSignedUrl: async (key: string, expiry: number) => {calls.push({bucket,key,expiry});return {data:{signedUrl:'https://example.invalid/signed-display'},error:null};}});
  assert.equal(await authenticatedPhotoUrl(client,reference,origin),'https://example.invalid/signed-display');
  assert.equal(JSON.stringify(photo),snapshot);
});
test('legacy URLs normalize while local previews and unrelated buckets are not transitioned', () => {
  assert.equal(mantaDisplayReference(`${origin}/storage/v1/object/public/manta-images/${path}`,origin)?.path,path);
  for(const src of ['blob:local','/manta-logo.svg','/assets/example.jpg',`${origin}/storage/v1/object/public/other-bucket/photo.jpg`]) assert.equal(mantaDisplayReference(src,origin),null);
});

for (const input of ['photos/6128/6128.jpg', 'manta-images/photos/6128/6128.jpg', '/storage/v1/object/public/manta-images/photos/6128/6128.jpg', `${origin}/storage/v1/object/public/manta-images/photos/6128/6128.jpg`]) {
  test(`Phoenix signs the bucket-relative object key from ${input}`, async () => {
    const reference = mantaDisplayReference(input, origin)!;
    assert.deepEqual(reference, {bucket:'manta-images',path:'photos/6128/6128.jpg'});
    const {client,calls} = mock();
    await authenticatedPhotoUrl(client,reference,origin);
    assert.deepEqual(calls,[{bucket:'manta-images',key:'photos/6128/6128.jpg',expiry:300}]);
  });
}
test('permanent storage path outranks a stale thumbnail URL',()=>{
  assert.equal(mantaPhotoSource({storage_bucket:'manta-images',storage_path:'photos/6128/6128.jpg',thumbnail_url:`${origin}/storage/v1/object/public/manta-images/wrong.jpg`}), 'manta-images/photos/6128/6128.jpg');
});

test('expired cached display URL is withheld during refetch and fresh result is displayed',()=>{
 const signed='https://example.invalid/signed-display'; const issued=1000000;
 assert.equal(freshSignedPhotoUrl(signed,issued,issued+239999),signed);
 assert.equal(freshSignedPhotoUrl(signed,issued,issued+240000),undefined);
 assert.equal(freshSignedPhotoUrl(signed,issued,issued+420000),undefined);
 assert.equal(freshSignedPhotoUrl(signed+'-renewed',issued+420000,issued+420001),signed+'-renewed');
});

test('lazy image expiration refreshes its exact query without latching the caller fallback',()=>{
 let now=1000000; let invalidated: unknown; let fallback=0;
 const signed='https://example.invalid/storage/v1/object/sign/manta-images/photos/6128/6128.jpg';
 const query={data:signed,dataUpdatedAt:now,isError:false};
 const key=['manta-photo-display','user','manta-images','photos/6128/6128.jpg'];
 const source=readFileSync('src/features/photos/MantaImage.tsx','utf8').replace(/^import .*;\n/gm,'').replaceAll('import.meta.env','env');
 const exported: any={};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS}}).outputText,{
   exports:exported,env:{VITE_SUPABASE_URL:origin},
   React:{createElement:(_tag:unknown,props:unknown)=>props},forwardRef:(fn:unknown)=>fn,
   useUser:()=>({id:'user'}),useSupabaseClient:()=>({}),useQuery:()=>query,
   authenticatedPhotoUrl,mantaDisplayReference,
   freshSignedPhotoUrl:(url:string,at:number)=>freshSignedPhotoUrl(url,at,now),
   useQueryClient:()=>({getQueryCache:()=>({findAll:()=>[{queryKey:key,state:{data:query.data,dataUpdatedAt:query.dataUpdatedAt}}]}),invalidateQueries:(filter:unknown)=>{invalidated=filter;return Promise.resolve();}}),
 });
 const props={src:'photos/6128/6128.jpg',onError:()=>fallback++};
 const image=exported.MantaImage(props,null);assert.equal(image.src,signed);
 now+=420000;image.onError({});assert.equal(fallback,0);
 assert.equal(JSON.stringify(invalidated),JSON.stringify({queryKey:key,exact:true}));
 assert.equal(exported.MantaImage(props,null).src,undefined);
 query.data=signed+'-renewed';query.dataUpdatedAt=now;
 assert.equal(exported.MantaImage(props,null).src,query.data);
 exported.MantaImage(props,null).onError({});assert.equal(fallback,1,'a genuinely fresh image failure still reaches the normal fallback');
});

test('legacy permanent temp reference overrides stale manta bucket without rewriting Photo 7480', async () => {
  const photo = Object.freeze({pk_photo_id:7480,storage_bucket:'manta-images',storage_path:`${origin}/storage/v1/object/public/temp-images/legacy/photo.jpg`});
  const before = JSON.stringify(photo);
  const reference = mantaDisplayReference(mantaPhotoSource(photo), origin)!;
  assert.deepEqual(reference, {bucket:'temp-images',path:'legacy/photo.jpg'});
  const {client,calls} = mock(); await authenticatedPhotoUrl(client,reference,origin);
  assert.deepEqual(calls,[{bucket:'temp-images',key:'legacy/photo.jpg',expiry:300}]);
  assert.equal(JSON.stringify(photo),before);
});
for (const bucket of ['temp-images','drone-photo']) {
  test(`${bucket}: durable and legacy inputs sign identically; foreign project rejected`, async () => {
    for (const src of [`${bucket}/drone/photo.jpg`,`${origin}/storage/v1/object/public/${bucket}/drone/photo.jpg`]) {
      const reference=mantaDisplayReference(src,origin)!;
      assert.deepEqual(reference,{bucket,path:'drone/photo.jpg'});
      const {client,calls}=mock();await authenticatedPhotoUrl(client,reference,origin);
      assert.deepEqual(calls,[{bucket,key:'drone/photo.jpg',expiry:300}]);
    }
    assert.equal(mantaPhotoSource({storageBucket:bucket,path:'drone/photo.jpg'}),`${bucket}/drone/photo.jpg`);
    assert.throws(()=>mantaDisplayReference(`https://foreign.invalid/storage/v1/object/public/${bucket}/photo.jpg`,origin));
  });
}
