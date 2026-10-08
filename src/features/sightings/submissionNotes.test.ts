import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { getSubmissionIssues } from './submissionValidation';

const page = readFileSync('src/pages/AddSightingPage.tsx', 'utf8');
const baseline = execFileSync('git', ['show', 'bbe97112edfd20abe813dfa14bc3a1bf691a7958:src/pages/AddSightingPage.tsx'], { encoding: 'utf8' });
const payloadExpression = (source: string) => source.slice(source.indexOf('    const payload = {') + '    const payload = '.length, source.indexOf('\n    };', source.indexOf('    const payload = {')) + 6);
const values = { date: '2026-10-06', startTime: '', stopTime: '', photographer: 'Test', email: 'test@example.invalid', phone: '', locationUnknown: true, island: '', locationId: '', locationName: '', lat: '', lng: '', mantas: [], methods: {}, standardizeSurvey: 'No' };
for (const notes of ['', '  Notes exactly as entered\nSecond line & <text>  ']) {
  test(`initial payload preserves ${notes ? 'multiline' : 'blank'} notes; other fields unchanged`, () => {
    const current = JSON.parse(JSON.stringify(vm.runInNewContext('(' + payloadExpression(page) + ')', { ...values, notes })));
    const old = JSON.parse(JSON.stringify(vm.runInNewContext('(' + payloadExpression(baseline) + ')', values)));
    assert.equal(current.notes, notes);
    delete current.notes;
    assert.deepEqual(current, old);
    assert.deepEqual(getSubmissionIssues({ ...values, latitude: '', longitude: '', needsTimeReview: false }), []);
  });
}
test('review hydration keeps notes verbatim and legacy missing notes blank', () => {
  assert.match(page, /const \[notes, setNotes\] = useState<string>\(""\)/);
  const hydration = page.match(/if \(p.notes\) setNotes\(p.notes\);/)![0];
  for (const p of [{}, { notes: '' }, { notes: '  Keep\nspacing  ' }]) {
    let hydrated = '';
    vm.runInNewContext(hydration, { p, setNotes: (value: string) => { hydrated = value; } });
    assert.equal(hydrated, 'notes' in p ? p.notes : '');
  }
});
test('review payload retains the same exact notes', () => {
  const fn = page.slice(page.indexOf('  function currentReviewPayload()'), page.indexOf('  function reviewIsValid()'));
  const notes = '  Review notes\nunchanged  ';
  const result = vm.runInNewContext(fn + '\ncurrentReviewPayload()', { ...values, notes });
  assert.equal(result.notes, notes);
});
