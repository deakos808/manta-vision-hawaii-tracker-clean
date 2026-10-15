import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const name='20261014224714_persist_external_photo_measurements';
const forward=readFileSync(`supabase/migrations/${name}.sql`,'utf8');
const rollback=readFileSync(`supabase/rollback/${name}_rollback.sql`,'utf8');
const prior=readFileSync('supabase/migrations/20261009000459_persist_catalog_species.sql','utf8');
const fn=(s:string)=>s.slice(s.indexOf('CREATE OR REPLACE FUNCTION'),s.lastIndexOf('$function$')+10);
test('rollback restores exact prior function',()=>assert.equal(fn(rollback),fn(prior)));
test('in-app validation and insertion branch is byte identical',()=>{
 const branch=(s:string)=>s.slice(s.indexOf("        foreach field_name in array array['scaleCm'"),s.indexOf('        new_size_ids :=')>0?s.indexOf('        new_size_ids :='):s.indexOf('        end if; -- external'));
 const start=forward.indexOf("        foreach field_name in array array['scaleCm'");
 const end=forward.indexOf('        end if; -- external');
 assert.equal(forward.slice(start,end),branch(prior));
});
test('only one nullable column and existing RPC changed; no backfill',()=>{
 assert.equal((forward.match(/ALTER TABLE/g)||[]).length,1);
 assert.match(forward,/ADD COLUMN is_photogrammetry boolean;/);
 assert.equal((forward.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
 assert.doesNotMatch(forward,/UPDATE public.photos|update public.manta_sizes|CREATE TABLE|photo_measurements|active_measure_id|GRANT|REVOKE/i);
});
test('both photo branches persist designation',()=>assert.equal((forward.match(/\(photo->>'isPhotogrammetry'\)::boolean/g)||[]).length,2));
