import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const source = readFileSync('src/pages/admin/DashboardPage.tsx', 'utf8');
test('Latest Activity requests the newest sighting and retains limit/single', () => {
  assert.match(source, /\.order\('sighting_date', \{ ascending: false \}\)\s*\.limit\(1\)\s*\.single\(\)/);
});
test('Latest Activity preserves the calendar date in Hawaii and UTC', () => {
  const expression = source.match(/latestActivity = (format\(new Date\([\s\S]*?\), 'MMM d, yyyy'\));/)?.[1];
  assert.ok(expression);
  for (const TZ of ['Pacific/Honolulu', 'UTC']) {
    const rendered = execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { format } from 'date-fns'; const latest = { sighting_date: '2025-11-11' }; process.stdout.write(${expression});`],
      { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(rendered, 'Nov 11, 2025');
  }
});
