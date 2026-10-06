import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { getSubmissionIssues, MULTI_DATE_REVIEW_MESSAGE } from './submissionValidation';
const complete = { locationUnknown: false, locationId: 'Named site', locationName: '', latitude: '', longitude: '', date: '2026-10-05', email: 'person@example.org', startTime: '10:00:01', stopTime: '11:00:02', standardizeSurvey: 'Yes', needsTimeReview: false };
const messages = (patch: Partial<typeof complete>) => getSubmissionIssues({ ...complete, ...patch }).map(i => i.message);
test('blank date with valid email identifies Sighting date', () => assert.deepEqual(messages({ date: '' }), ['Sighting date']));
test('invalid or blank email identifies Email address', () => {
  for (const email of ['', 'invalid', 'a@b']) assert.deepEqual(messages({ email }), ['Email address']);
});
test('systematic requires start', () => assert.deepEqual(messages({ startTime: '' }), ['Start Time']));
test('systematic requires stop', () => assert.deepEqual(messages({ stopTime: '' }), ['Stop Time']));
test('opportunistic blank times do not block', () => assert.deepEqual(messages({ standardizeSurvey: 'No', startTime: '', stopTime: '' }), []));
test('complete requirements remove all guidance', () => assert.deepEqual(messages({}), []));
test('multi-date review remains blocking', () => assert.deepEqual(messages({ needsTimeReview: true }), [MULTI_DATE_REVIEW_MESSAGE]));
test('button, summary, and submit handler use the same issue list; field errors appear immediately', () => {
  const source = readFileSync('src/pages/AddSightingPage.tsx', 'utf8');
  assert.match(source, /disabled=\{submissionIssues.length > 0\}/);
  assert.match(source, /submissionIssues.map\(issue => issue.message\)/);
  assert.match(source, /if \(submissionIssues.length > 0\) return;/);
  assert.match(source, /const showFieldIssue = \(field: SubmissionField\) => !isReview\s*&& submissionIssues.some\(issue => issue.field === field\)/);
  assert.doesNotMatch(source, /touchedFields|touchField/);
  for (const field of ['date','email','startTime','stopTime','location']) assert.ok(source.includes(`showFieldIssue("${field}") ? "border-red-500"` ) || source.includes(`showFieldIssue("${field}")`));
});

const missingLocation = { locationId: '', locationName: '', latitude: '', longitude: '' };
const locationIssue = ['Location or “Location unknown”'];
test('missing location, including island alone, blocks', () => {
  assert.deepEqual(messages(missingLocation), locationIssue);
  assert.deepEqual(getSubmissionIssues({ ...complete, ...missingLocation, ...{ island: 'Hawaii' } }).map(i => i.message), locationIssue);
});
test('named location requires no coordinates', () => {
  assert.deepEqual(messages({ ...missingLocation, locationId: 'Site' }), []);
  assert.deepEqual(messages({ ...missingLocation, locationName: 'Site' }), []);
});
test('custom valid coordinates need no name; incomplete or invalid pairs block', () => {
  assert.deepEqual(messages({ ...missingLocation, latitude: '0', longitude: '0' }), []);
  for (const pair of [{ latitude: '20' }, { longitude: '-156' }, { latitude: '91', longitude: '0' }, { latitude: '20', longitude: 'Infinity' }]) {
    assert.deepEqual(messages({ ...missingLocation, ...pair }), locationIssue);
  }
});
test('explicit unknown permits empty location and does not mutate draft values on toggling', () => {
  assert.deepEqual(messages({ ...missingLocation, locationUnknown: true }), []);
  const draft = { ...complete, latitude: '20', longitude: '-156' };
  const before = { ...draft };
  getSubmissionIssues({ ...draft, locationUnknown: true });
  assert.deepEqual(draft, before);
  assert.deepEqual(getSubmissionIssues({ ...draft, locationUnknown: false }), []);
});
test('UI preserves location state on toggle and hydrates and saves unknown in both payloads', () => {
  const source = readFileSync('src/pages/AddSightingPage.tsx', 'utf8');
  assert.match(source, /setLocationUnknown\(p.location_unknown \?\? false\)/);
  assert.match(source, /onChange=\{\(e\) => setLocationUnknown\(e.target.checked\)\}/);
  assert.match(source, /fieldset disabled=\{locationUnknown\}/);
  assert.equal(source.match(/location_unknown: locationUnknown/g)?.length, 2);
});
