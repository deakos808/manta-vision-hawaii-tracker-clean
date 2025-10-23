const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(p)) {
  console.error('✖ File not found:', p);
  process.exit(1);
}
let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

/* --- A) Fix the getTotal() typo: dataList -> data --- */
s = s.replace(
  /const\s*\{\s*data\s*\}\s*=\s*await\s*supabase[\s\S]*?\.select\([\s\S]*?\);\s*[\r\n]+\s*const\s+ids\s*=\s*\(dataList\s*\?\?\s*\[\]\)\.map\(/m,
  (m)=> m.replace(/dataList/g, 'data')
);

/* --- B) Remove any early block with 'const sightings = data?.pages.flat()' and the early observer/loadMoreRef --- */
const earlyBlockRe = new RegExp(
  String.raw`\s*const\s+sightings\s*=\s*data\?\.\s*pages\.flat\(\)\s*\?\?\s*\[\];\s*` +
  String.raw`[\r\n\s]*const\s+observerRef\s*=\s*useRef<IntersectionObserver\s*\|\s*null>\(\s*null\s*\);\s*` +
  String.raw`[\r\n\s]*const\s+loadMoreRef\s*=\s*useCallback\([\s\S]*?\)\s*;`,
  'm'
);
s = s.replace(earlyBlockRe, ''); // remove the early block if present

/* --- C) Find the end of useInfiniteQuery(...) and insert the block after it --- */
const uiqStart = s.indexOf('useInfiniteQuery(');
if (uiqStart === -1) {
  console.error('✖ Could not locate "useInfiniteQuery(" in Sightings.tsx. Please paste that section so I can tailor the matcher.');
  process.exit(1);
}

// find the first '{' after "useInfiniteQuery("
let braceStart = s.indexOf('{', uiqStart);
if (braceStart === -1) {
  console.error('✖ Could not find opening "{" for useInfiniteQuery call.');
  process.exit(1);
}
// walk until we balance braces to find end of object literal
let i = braceStart + 1;
let depth = 1;
while (i < s.length && depth > 0) {
  const ch = s[i];
  if (ch === '{') depth++;
  else if (ch === '}') depth--;
  i++;
}
if (depth !== 0) {
  console.error('✖ Failed to balance braces inside useInfiniteQuery call.');
  process.exit(1);
}
// after object closes, expect ');'
let closeIdx = s.indexOf(');', i);
if (closeIdx === -1) {
  console.error('✖ Could not find closing ");" for useInfiniteQuery call.');
  process.exit(1);
}
closeIdx += 2; // include ');'

// Build the block we want to insert
const insertBlock = `

  // Derived flat list for render (must be *after* useInfiniteQuery)
  const sightings = data?.pages.flat() ?? [];

  // IntersectionObserver sentinel (must be *after* useInfiniteQuery)
  const observerRef = useRef<\\'undefined' extends never ? never : IntersectionObserver | null>(null);
  const loadMoreRef = useCallback(
    (node: HTMLDivElement) => {
      if (isFetchingNextPage) return;
      if (observerRef.current) observerRef.current?.disconnect?.();
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) {
          fetchNextPage();
        }
      });
      if (node) observerRef.current.observe(node);
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );
`;

// Insert it
s = s.slice(0, closeIdx) + insertBlock + s.slice(closeIdx);

// Save
fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Fixed getTotal() typo and moved sightings/loadMoreRef after useInfiniteQuery');
console.log('  • Backup:', bak);
