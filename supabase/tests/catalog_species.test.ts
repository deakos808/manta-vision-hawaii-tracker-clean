import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
const prefix = '20261009000459_persist_catalog_species';
const forward = readFileSync(`supabase/migrations/${prefix}.sql`, 'utf8');
const rollback = readFileSync(`supabase/rollback/${prefix}_rollback.sql`, 'utf8');
const definition = (sql: string) => sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION'), sql.lastIndexOf('$function$') + 10) + '\n';
const before = definition(rollback), after = definition(forward);
// Static SQL contracts only: no commit RPC is invoked and no database is mutated.
test('rollback pins exact inspected live definition', () => {
  assert.equal(createHash('sha256').update(before).digest('hex'), 'c081a25c9df61e07dabdf0ceda97bb46f0e341a5fad65e45e027bb0806ca941d');
});
test('no schema, wrapper, catalog updates or observation species writes', () => {
  assert.equal((forward.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 1);
  assert.doesNotMatch(forward, /ALTER TABLE|CREATE TABLE|UPDATE public.catalog|commit_sighting_submission_with_biopsies/i);
  assert.equal(after.slice(after.indexOf('    insert into public.mantas')), before.slice(before.indexOf('    insert into public.mantas')));
  assert.equal(after.slice(after.indexOf('begin'),after.indexOf('  for manta in')),before.slice(before.indexOf('begin'),before.indexOf('  for manta in')));
});
test('all unrelated declarations and resolution code are unchanged', () => {
  let reverted=after.replace('  proposed_species text;\n  catalog_species text;\n','');
  reverted=reverted.replace(/    proposed_species :=[\s\S]*?    end if;\n/,'');
  reverted=reverted.replace('public.catalog (name, species)','public.catalog (name)').replace('        ),\n        proposed_species','        )');
  reverted=reverted.replace(/      -- Catalog identity is authoritative;[\s\S]*?      end if;\n/,'');
  assert.equal(reverted,before);
});
test('canonical proposal whitelist rejects unexpected nonempty values',()=>{
  assert.match(after,/proposed_species := nullif\(manta->>'species', ''\)/);
  assert.match(after,/proposed_species is not null and proposed_species not in \('mobula alfredi', 'mobula birostris'\)/);
  assert.match(after,/raise exception 'Proposed catalog species must/);
});
test('new identity writes canonical proposal or null only to catalog',()=>{
  assert.match(after,/if coalesce\(\(manta->>'noMatch'\)::boolean, false\) = true then\s+insert into public.catalog \(name, species\)/);
  assert.match(after,/'Pending Name'\s+\),\s+proposed_species/);
});
test('existing identity compares canonical and legacy equivalents without rewriting',()=>{
  assert.match(after,/when 'alfredi' then 'mobula alfredi'/);
  assert.match(after,/when 'birostris' then 'mobula birostris'/);
  assert.match(after,/from public.catalog where pk_catalog_id = resolved_catalog_id\s+for share/);
  assert.match(after,/if proposed_species is not null and catalog_species is not null\s+and proposed_species <> catalog_species then\s+raise exception 'Species mismatch:/);
});
