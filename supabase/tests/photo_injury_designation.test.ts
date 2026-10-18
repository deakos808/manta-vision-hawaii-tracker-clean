import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
const migration=readdirSync('supabase/migrations').find(n=>n.endsWith('_persist_photo_injury_designation.sql'))!;
const next=readFileSync(`supabase/migrations/${migration}`,'utf8');
const prior=readFileSync('supabase/migrations/20261014224714_persist_external_photo_measurements.sql','utf8');
const fn=(s:string)=>s.slice(s.indexOf('CREATE OR REPLACE FUNCTION'),s.lastIndexOf('$function$')+10);
test('pending injury draft adds only the two authorized nullable columns and preserves access control',()=>{
 assert.equal((next.match(/ALTER TABLE/g)||[]).length,1);
 assert.match(next,/ADD COLUMN is_injury boolean NULL/);assert.match(next,/ADD COLUMN injury_modifiers text\[\] NULL/);
 assert.doesNotMatch(next,/CREATE TABLE|GRANT|REVOKE|CREATE POLICY|UPDATE public.photos|ALTER COLUMN/i);
 assert.match(next,/photo_injury_modifiers_allowed/);assert.match(next,/photo_injury_modifiers_consistent/);
 assert.equal((next.match(/jsonb_array_elements_text\(photo->'injuryModifiers'\)/g)||[]).length,2);
});
test('scientific conversion and evidence persistence remain byte-identical',()=>{
 const evidence=(sql:string)=>sql.slice(sql.indexOf('      -- BEGIN size-evidence persistence'),sql.indexOf('  update public.sighting_submissions'));
 assert.equal(evidence(next),evidence(prior));
});
test('pending save retains every existing authorization/revision/provenance guard',()=>{
 const old=readFileSync('supabase/migrations/20261014074119_return_pending_edit_conflicts_without_retry.sql','utf8');
 const extract=(sql:string)=>{const start=sql.indexOf('create or replace function private.save_pending_sighting_submission(');return sql.slice(start,sql.indexOf('$$;',sql.indexOf('as $$',start))+3)};
 const added=extract(next);const start=added.indexOf('    for new_photo in\n');const end=added.indexOf('    -- A retained logical photo',start);
 assert.ok(start>0&&end>start);assert.equal(added.slice(0,start)+added.slice(end),extract(old));
});
test('active biopsy variant delegates photo persistence to the same guarded commit',()=>{
 const sql=readFileSync('supabase/migrations/20261005081610_harden_submission_approval.sql','utf8');
 const wrapper=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.commit_sighting_submission_with_biopsies'));
 assert.match(wrapper,/perform public.commit_sighting_submission\(sub_id\)/);
 assert.doesNotMatch(wrapper,/insert into public.photos/i);
});
