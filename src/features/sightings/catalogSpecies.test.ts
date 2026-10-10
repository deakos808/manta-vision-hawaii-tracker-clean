import { photoForPayload } from '../photos/photoPresentation';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { SPECIES_OPTIONS, speciesLabel } from './catalogSpecies';
import { approvalFailureMessage } from './submissionValidation';
const modalSource = readFileSync('src/components/mantas/UnifiedMantaModal.tsx', 'utf8');
const saveSource = modalSource.slice(modalSource.indexOf('  function save()'), modalSource.indexOf('    onSave(draft);')) + '\nreturn draft;\n}';
for (const [value,label] of [['mobula alfredi','Reef manta'],['mobula birostris','Oceanic manta'],[null,'—'],[undefined,'—']] as const) {
  test(`species Add/Edit save and payload round trip: ${value}`,()=>{
    let species: unknown;
    const hydrate = modalSource.match(/setSpecies\(existingManta\?\.species \?\? null\)/)![0];
    vm.runInNewContext(hydrate, { existingManta: { species: value }, setSpecies: (v: unknown) => { species = v; } });
    const saved = vm.runInNewContext(ts.transpile(saveSource + '\nsave()', { target: ts.ScriptTarget.ES2022 }), {
      photoForPayload, mantaId: 'stable-id', name: 'Kai', gender: 'female', ageClass: 'juvenile', species,
      size: '3.67', photos: [], potentialCatalogId: null, potentialNoMatch: true,
      noPhotos: true, firstExifMeta: null, existingManta: {},
    });
    const payload = JSON.parse(JSON.stringify(saved));
    assert.equal(payload.species, value ?? null);
    assert.equal(payload.id, 'stable-id');
    assert.equal(payload.size, '3.67');
    assert.equal(speciesLabel(payload.species),label);
    vm.runInNewContext(hydrate, { existingManta: payload, setSpecies: (v: unknown) => { species = v; } });
    assert.equal(species, value ?? null);
  });
}
test('optional selector uses exactly the two canonical values',()=>{
 assert.deepEqual(SPECIES_OPTIONS.map(o=>o.value),['','mobula alfredi','mobula birostris']);
});
test('Add/Edit and review retain species and pass the same manta array to both payloads',()=>{
 const modal=readFileSync('src/components/mantas/UnifiedMantaModal.tsx','utf8');
 const page=readFileSync('src/pages/AddSightingPage.tsx','utf8');
 assert.match(modal,/setSpecies\(existingManta\?\.species \?\? null\)/);
 assert.match(modal,/ageClass,\s+species,/);
 assert.match(modal,/value={species \?\? ""}/);
 assert.match(page,/species: m.species \?\? null/);
 assert.equal((page.match(/mantas, methods, standardize_survey/g)||[]).length,2);
 assert.match(readFileSync('src/utils/reviewSave.ts','utf8'),/if \(Array.isArray\(v\)\) out\[k\] = v.slice\(\)/);
});
test('summary and comparison clearly separate proposal and catalog',()=>{
 assert.match(readFileSync('src/components/mantas/MantasList.tsx','utf8'),/Proposed species:/);
 const match=readFileSync('src/components/mantas/MatchModal.tsx','utf8');
 assert.match(match,/Proposed species: {speciesLabel\(aMeta\?\.species\)}/);
 assert.match(match,/Catalog species: {speciesLabel\(current\?\.species\)}/);
});
test('species errors guide review without internal IDs',()=>{
 assert.match(approvalFailureMessage({message:'Species mismatch: private-id'}),/proposed species conflicts/);
 assert.doesNotMatch(approvalFailureMessage({message:'Species mismatch: private-id'}),/private-id/);
 assert.match(approvalFailureMessage({message:'Proposed catalog species must be canonical'}),/select Reef manta, Oceanic manta, or Unknown/);
});
