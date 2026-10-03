import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const matchModal = readFileSync('src/components/mantas/MatchModal.tsx', 'utf8');
const addSighting = readFileSync('src/pages/AddSightingPage.tsx', 'utf8');
const compatibilityWrapper = readFileSync('src/components/matching/CatalogMatchModal.tsx', 'utf8');
const rankedWorkflow = readFileSync('src/features/matching/rankedMatchWorkflow.ts', 'utf8');

test('actual Add Sighting modal keeps ranked source disabled and opens the manual catalog workflow', () => {
  assert.match(matchModal, /const RANKED_MATCHING_AVAILABLE = false/);
  assert.match(matchModal, /useState<'suggested' \| 'manual'>\('manual'\)/);
  assert.match(matchModal, /setMode\('manual'\)/);
  assert.match(matchModal, /open && rankedIntegrationAvailable/);
  assert.match(matchModal, /rankedIntegrationAvailable && <div className="px-4 pt-3" role="tablist"/);
  assert.match(matchModal, /rankedIntegrationAvailable && mode === 'suggested'/);
  assert.match(rankedWorkflow, /Suggested matches are temporarily unavailable/);
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
