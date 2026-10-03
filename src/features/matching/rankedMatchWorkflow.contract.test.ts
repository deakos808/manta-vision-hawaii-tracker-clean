import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const matchModal = readFileSync('src/components/mantas/MatchModal.tsx', 'utf8');
const addSighting = readFileSync('src/pages/AddSightingPage.tsx', 'utf8');
const compatibilityWrapper = readFileSync('src/components/matching/CatalogMatchModal.tsx', 'utf8');
const rankedWorkflow = readFileSync('src/features/matching/rankedMatchWorkflow.ts', 'utf8');

test('actual Add Sighting modal presents suggested matches first with a manual fallback', () => {
  assert.match(matchModal, /Suggested Matches/);
  assert.match(matchModal, /Browse Catalog Manually/);
  assert.match(matchModal, /role="status"/);
  assert.match(rankedWorkflow, /Suggested matches are temporarily unavailable/);
  assert.match(matchModal, /ranked\.matches\.map/);
  assert.match(matchModal, /chooseMatch\(candidate\.catalog_id\)/);
});

test('explicit selection updates only the intended manta draft association', () => {
  assert.match(addSighting, /String\(mm\.id\) === String\(pageMatchFor\)/);
  assert.match(addSighting, /matchedCatalogId: catalogId, noMatch: false/);
  assert.match(addSighting, /rankedEnabled=\{allowMatching\}/);
  assert.match(addSighting, /access\.isActive === true/);
  assert.match(addSighting, /access\.role === "user" \|\| access\.role === "admin"/);
});

test('historical caller is a compatibility wrapper rather than a second matching implementation', () => {
  assert.match(compatibilityWrapper, /<MatchModal/);
  assert.doesNotMatch(compatibilityWrapper, /generate-newphoto-embedding/);
  assert.doesNotMatch(compatibilityWrapper, /match_temp_photo/);
  assert.doesNotMatch(compatibilityWrapper, /embedding\.slice/);
});

test('modal exposes a single accessible dialog with keyboard-accessible tabs and no embeddings', () => {
  assert.equal((matchModal.match(/role="dialog"/g) ?? []).length, 1);
  assert.match(matchModal, /role="tablist"/);
  assert.equal((matchModal.match(/role="tab"/g) ?? []).length, 2);
  assert.doesNotMatch(matchModal, /JSON\.stringify\([^)]*embedding/);
  assert.doesNotMatch(matchModal, /console\./);
});
