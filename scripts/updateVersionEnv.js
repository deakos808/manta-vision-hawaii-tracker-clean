// File: scripts/updateVersionEnv.js
// -----------------------------------------------------------
// Updates .env and generated/version.ts with build stamp.
// generated/version.ts is outside src/** so nodemon won't loop.

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

const gitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'no-git';
  }
})();

const nowISO = new Date().toISOString();

// ── 1. Update .env ──────────────────────────────────────────
const envPath = path.resolve('.env');
const lines = existsSync(envPath)
  ? readFileSync(envPath, 'utf8').split(/\r?\n/).filter(Boolean)
  : [];

const upsert = (arr, k, v) => {
  const kv = `${k}=${v}`;
  const i = arr.findIndex((l) => l.startsWith(`${k}=`));
  if (i === -1) arr.push(kv);
  else if (arr[i] !== kv) arr[i] = kv;
  return arr;
};

writeFileSync(
  envPath,
  upsert(upsert(lines, 'VITE_DEPLOYED_AT', nowISO), 'VITE_GIT_HASH', gitHash).join('\n') +
    '\n',
  'utf8',
);

// ── 2. Write generated/version.ts  (outside src/) ───────────
const genDir = path.resolve('generated');
if (!existsSync(genDir)) mkdirSync(genDir);

const versionTs = `export const DEPLOYED_AT = '${nowISO}';
export const GIT_HASH = '${gitHash}';
`;
writeFileSync(path.join(genDir, 'version.ts'), versionTs, 'utf8');

console.log(`✅  Version stamped → ${nowISO} (${gitHash})`);
