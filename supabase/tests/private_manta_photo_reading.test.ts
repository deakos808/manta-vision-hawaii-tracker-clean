import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const name='20261010074017_private_manta_photo_reading';
const forward=readFileSync(`supabase/migrations/${name}.sql`,'utf8');
const rollback=readFileSync(`supabase/rollback/${name}_rollback.sql`,'utf8');
test('private draft changes only manta visibility and permanent SELECT policy',()=>{
 assert.match(forward,/set public = false where id = 'manta-images'/);
 assert.equal((forward.match(/drop policy/g)||[]).length,1);assert.equal((forward.match(/create policy/g)||[]).length,1);
 assert.doesNotMatch(forward,/create.*function|alter table|delete from|insert into|update public\./i);
});
test('permanent access is active-authenticated and based on photos references, not namespace',()=>{
 assert.match(forward,/for select to authenticated/);assert.match(forward,/u.is_active is true/);assert.match(forward,/u.role in \('user', 'admin'\)/);
 assert.match(forward,/p.storage_bucket = 'manta-images'/);assert.match(forward,/p.storage_path = storage.objects.name/);
 assert.match(forward,/p.thumbnail_url =/);assert.doesNotMatch(forward,/name !~~|name not like/i);
});
test('approved original evidence is excluded from the general permanent read policy',()=>assert.match(forward,/storage.objects.name is distinct from p.original_storage_path/));
test('own/admin submission and service policies are not replaced',()=>{
 assert.doesNotMatch(forward,/drop policy (manta_submission|manta_admin)|revoke|grant/i);
});
test('rollback restores public delivery and exact prior permanent policy',()=>{
 assert.match(rollback,/for select to public/);assert.match(rollback,/name !~~ 'submissions\/%'/);assert.match(rollback,/set public = true where id = 'manta-images'/);
 assert.equal((rollback.match(/drop policy/g)||[]).length,1);assert.equal((rollback.match(/create policy/g)||[]).length,1);
});
