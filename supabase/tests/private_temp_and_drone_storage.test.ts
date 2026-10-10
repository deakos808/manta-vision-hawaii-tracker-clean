import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
const name=readdirSync('supabase/migrations').find(n=>n.endsWith('_private_temp_and_drone_storage.sql'))!;
const sql=readFileSync(`supabase/migrations/${name}`,'utf8');
const rollback=readFileSync(`supabase/rollback/${name.replace('.sql','_rollback.sql')}`,'utf8');
const policies=[...sql.matchAll(/CREATE POLICY (\w+) ON storage.objects\s+FOR SELECT TO authenticated USING \(([\s\S]*?)\n\);/g)];
test('exactly four authenticated SELECT policies and two private buckets; existing writes untouched',()=>{
 assert.deepEqual(policies.map(p=>p[1]),['temp_owner_select','temp_permanent_select','temp_admin_select','drone_admin_select']);
 assert.match(sql,/UPDATE storage.buckets SET public = false WHERE id IN \('temp-images', 'drone-photo'\)/);
 assert.equal((sql.match(/DROP POLICY/g)||[]).length,2);
 assert.doesNotMatch(sql,/FOR (?:INSERT|UPDATE|DELETE|ALL)|(?:INSERT INTO|DELETE FROM|UPDATE) (?:public\.|storage.objects)/i);
 assert.doesNotMatch(sql,/7480|11377|CREATE (?:TABLE|FUNCTION)|ALTER TABLE/);
});
test('owner source is owner_id; both ordinary policies require active user/admin',()=>{
 assert.match(policies[0][2],/owner_id = \(SELECT auth.uid\(\)\)::text/);
 for(const p of policies.slice(0,2)){assert.match(p[2],/u.id = \(SELECT auth.uid\(\)\) AND u.is_active IS TRUE/);assert.match(p[2],/u.role IN \('user', 'admin'\)/);}
 assert.doesNotMatch(policies[0][2],/foldername/);
});
test('permanent access uses only exact modern or legacy references, never bucket-mismatched row inference',()=>{
 const p=policies[1][2];
 assert.match(p,/p.storage_bucket = 'temp-images' AND p.storage_path = objects.name/);
 assert.match(p,/OR p.storage_path = 'https:\/\/apweteosdbgsolmvcmhn.supabase.co\/storage\/v1\/object\/public\/temp-images\/' \|\| objects.name/);
 assert.match(p,/OR p.thumbnail_url = 'https:\/\/apweteosdbgsolmvcmhn.supabase.co\/storage\/v1\/object\/public\/temp-images\/' \|\| objects.name/);
 assert.doesNotMatch(p,/LIKE|pk_photo_id|fk_sighting_id|fk_catalog_id|file_name|foldername/);
});
test('admin policies use the existing active-admin helper and drone has no ordinary policy',()=>{
 for(const p of policies.slice(2))assert.match(p[2],/\(SELECT public.is_admin_user\(\)\)/);
 assert.equal(policies.filter(p=>p[2].includes("'drone-photo'")).length,1);
});
test('rollback exactly pairs introduced/replaced policies and visibility; no data mutation',()=>{
 assert.deepEqual([...rollback.matchAll(/DROP POLICY (\w+)/g)].map(m=>m[1]),policies.map(p=>p[1]));
 assert.match(rollback,/CREATE POLICY "Public read for temp-images" ON storage.objects\s+FOR SELECT TO public USING \(bucket_id = 'temp-images'::text\)/);
 assert.match(rollback,/CREATE POLICY "Public read drone-photo" ON storage.objects\s+FOR SELECT TO anon USING \(bucket_id = 'drone-photo'::text\)/);
 assert.match(rollback,/UPDATE storage.buckets SET public = true WHERE id IN \('temp-images', 'drone-photo'\)/);
 assert.doesNotMatch(rollback,/(?:INSERT INTO|DELETE FROM|UPDATE) (?:public\.|storage.objects)|DROP (?:TABLE|FUNCTION)/i);
});
