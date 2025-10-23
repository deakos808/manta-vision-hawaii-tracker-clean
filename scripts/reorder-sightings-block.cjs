const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

/**
 * We will:
 *  - Capture the block starting at "const sightings = data?.pages.flat()" through the end of the loadMoreRef useCallback.
 *  - Remove it from its current location.
 *  - Re-insert it immediately after the useInfiniteQuery(...) declaration block.
 */

const startRe = /(\s*const\s+sightings\s*=\s*data\?\.\s*pages\.flat\(\)\s*\?\?\s*\[\];\s*\n)/m;
const loadMoreRe = /const\s+loadMoreRef\s*=\s*useCallback\([\s\S]*?\)\s*;\s*\n/m;

const startMatch = s.match(startRe);
const loadMoreMatch = s.match(loadMoreRe);
if (!startMatch || !loadMoreMatch) {
  console.error('✖ Could not locate sightings/loadMoreRef block. Aborting. Please share the exact section around them.');
  process.exit(1);
}

// slice out block
const startIdx = startMatch.index;
const endIdx = loadMoreMatch.index + loadMoreMatch[0].length;
const block = s.slice(startIdx, endIdx);

// remove that region
s = s.slice(0, startIdx) + s.slice(endIdx);

// find end of useInfiniteQuery block
const uiqRe = /const\s*\{\s*data[\s\S]*?\}\s*=\s*useInfiniteQuery\([\s\S]*?\);\s*/m;
const uiqMatch = s.match(uiqRe);
if (!uiqMatch) {
  console.error('✖ Could not locate useInfiniteQuery block. Aborting.');
  process.exit(1);
}
const uiqEnd = uiqMatch.index + uiqMatch[0].length;

// insert block right after useInfiniteQuery
s = s.slice(0, uiqEnd) + '\n' + block + '\n' + s.slice(uiqEnd);

// write files
fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Reordered sightings/loadMoreRef block to come after useInfiniteQuery');
console.log('  • Backup:', bak);
