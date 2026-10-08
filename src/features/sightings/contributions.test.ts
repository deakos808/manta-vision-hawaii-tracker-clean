import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mergeContributions, loadContributions, readContributionPages, type SubmissionContribution, type HistoricalContribution } from './contributions';
import type { SupabaseClient } from '@supabase/supabase-js';
const submission = (overrides: Partial<SubmissionContribution> = {}): SubmissionContribution => ({
  id: 's1', sighting_date: '2026-10-08', submitted_at: '2026-10-09T01:00:00Z',
  manta_count: 1, photo_count: 2, status: 'pending', committed_pk_sighting_id: null, reject_reason: null, ...overrides,
});
const historical = (overrides: Partial<HistoricalContribution> = {}): HistoricalContribution => ({
  pk_sighting_id: 1, photographer: 'Example Photographer', sighting_date: '2024-09-20',
  location: null, sitelocation: 'Example Bay', island: 'Example Island', total_mantas: 2, ...overrides,
});
for (const [status, label] of [['pending', 'Pending'], ['committed', 'Accepted'], ['rejected', 'Rejected']]) {
  test(`${status} displays ${label}`, () => assert.equal(mergeContributions([submission({ status })], [], []).items[0].status, label));
}
test('only exact explicit aliases attribute historical rows', () => {
  const rows = [historical(), historical({ pk_sighting_id: 2, photographer: 'example photographer' }), historical({ pk_sighting_id: 3, photographer: 'Example Photographer Extra' })];
  const result = mergeContributions([], ['Example Photographer'], rows);
  assert.equal(result.total, 1); assert.equal(result.items[0].status, 'Historical');
});
test('committed permanent ID appears once, preferring submission', () => {
  const result = mergeContributions([submission({ status: 'committed', committed_pk_sighting_id: 1 })], ['Example Photographer'], [historical()]);
  assert.equal(result.total, 1); assert.equal(result.items[0].status, 'Accepted');
});
test('no aliases preserves current submissions and excludes historical rows', () => {
  const result = mergeContributions([submission()], [], [historical()]);
  assert.equal(result.total, 1); assert.equal(result.pending, 1);
});
test('empty history has empty summary and friendly page state', () => {
  assert.deepEqual(mergeContributions([], [], []), { items: [], total: 0, latest: null, pending: 0 });
  assert.match(readFileSync('src/pages/MyContributionsPage.tsx', 'utf8'), /No contributions yet/);
});
test('mixed history sorts sighting date first, then submitted time; summary is personal', () => {
  const result = mergeContributions([submission({ id: 'earlier' }), submission({ id: 'later', submitted_at: '2026-10-09T02:00:00Z', status: 'rejected' })], ['Example Photographer'], [historical({ sighting_date: '2026-10-10' })]);
  assert.deepEqual(result.items.map(x => x.key), ['historical-1', 'submission-later', 'submission-earlier']);
  assert.equal(result.total, 3); assert.equal(result.latest, '2026-10-10'); assert.equal(result.pending, 1);
});
test('only rejected submission displays reason; no identity exposed in presentation', () => {
  assert.equal(mergeContributions([submission({ reject_reason: 'unused' })], [], []).items[0].rejectReason, null);
  assert.equal(mergeContributions([submission({ status: 'rejected', reject_reason: 'Please clarify' })], [], []).items[0].rejectReason, 'Please clarify');
});
test('location uses unknown, name, valid coordinates, or dash', () => {
  for (const [row, label] of [[{ location_unknown: 'true', location_name: 'Old draft' }, 'Location unknown'], [{ location_name: 'Bay' }, 'Bay'], [{ latitude: '20', longitude: '-156' }, '20, -156'], [{ latitude: '99', longitude: '0' }, '—']] as const) {
    assert.equal(mergeContributions([submission(row)], [], []).items[0].location, label);
  }
});
test('all paginated history is read; errors are not treated as empty history', async () => {
  const calls: number[][] = [];
  const rows = await readContributionPages<number>(async (from, to) => { calls.push([from,to]); return { data: from === 0 ? Array(500).fill(1) : [2], error: null }; });
  assert.equal(rows.length, 501); assert.deepEqual(calls, [[0,499],[500,999]]);
  await assert.rejects(readContributionPages(async () => ({ data: null, error: new Error('unavailable') })));
});
test('loader filters current user even for admin clients and queries exact mapped alias only', async () => {
  const filters: unknown[][] = [], selects: string[] = [];
  const client = { from(table: string) {
    const q = { select(fields: string) { selects.push(fields); return q; }, eq(field: string, value: string) { filters.push([table,field,value]); return q; }, order() { return q; }, async range() {
      return { data: table === 'sighting_submissions' ? [submission()] : table === 'contributor_legacy_aliases' ? [{ photographer_alias: 'Example Photographer' }] : [historical()], error: null };
    } }; return q;
  } } as unknown as SupabaseClient;
  assert.equal((await loadContributions(client, 'fixture-user')).total, 2);
  assert.deepEqual(filters, [['sighting_submissions','submitted_by','fixture-user'], ['contributor_legacy_aliases','user_id','fixture-user'], ['sightings','photographer','Example Photographer']]);
  assert.ok(selects.every(s => !s.includes('reviewer') && !s.includes('email') && !s.includes('*')));
});
test('authenticated non-admin route and authenticated navigation are present', () => {
  assert.match(readFileSync('src/App.tsx','utf8'), /path="\/my-contributions" element={<RequireAuth><MyContributionsPage \/><\/RequireAuth>}/);
  assert.match(readFileSync('src/components/layout/Header.tsx','utf8'), /authed && <NavLink to="\/my-contributions"/);
});
