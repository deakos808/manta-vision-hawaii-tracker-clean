const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }

let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

/**
 * Remove any early declaration:
 *   const sightings = data?.pages.flat() ?? [];
 */
s = s.replace(/\s*const\s+sightings\s*=\s*data\?\.\s*pages\.flat\(\)\s*\?\?\s*\[\];\s*\n/g, '');

/**
 * Remove any early block:
 *   const loadMoreRef = useCallback( ... );
 */
s = s.replace(/\s*const\s+observerRef\s*=\s*useRef<IntersectionObserver\s*\|\s*null>\(\s*null\s*\)\s*;\s*const\s+loadMoreRef\s*=\s*useCallback\([\s\S]*?\)\s*;\s*\n/g, '');

/**
 * Find the end of useInfiniteQuery({ ... });
 * We'll scan from the first "useInfiniteQuery({" and balance braces until we hit the matching "});".
 */
const startToken = 'useInfiniteQuery({';
const startIdx = s.indexOf(startToken);
if (startIdx === -1) {
  console.error('✖ Could not locate useInfiniteQuery({ ... }). Please paste the block so I can target it.');
  process.exit(1);
}

let i = startIdx + startToken.length;
let depth = 1;
while (i < s.length && depth > 0) {
  const ch = s[i];
  if (ch === '{') depth++;
  else if (ch === '}') depth--;
  i++;
}
// i now points just after matching '}' for the object; next should be ');'
let endIdx = s.indexOf(');', i);
if (endIdx === -1) { console.error('✖ Could not find closing ");" for useInfiniteQuery'); process.exit(1); }
endIdx += 2; // include closing ');'

/**
 * Construct the block that must appear AFTER useInfiniteQuery.
 */
const insertBlock = `

  // Derived flat list for render
  const sightings = data?.pages.flat() ?? [];

  // IntersectionObserver sentinel
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback(
    (node: HTMLDivElement) => {
      if (isFetchingNextPage) return;
      if (observerRef.current) observerRef.current.disconnect();
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) fetchNextPage();
      });
      if (node) observerRef.current.observe(node);
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );
`;

/**
 * Insert our block right after useInfiniteQuery end.
 */
s = s.slice(0, endIdx) + insertBlock + s.slice(endIdx);

// Save
fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Moved sightings/loadMoreRef to after useInfiniteQuery');
console.log('  • Backup:', bak);
