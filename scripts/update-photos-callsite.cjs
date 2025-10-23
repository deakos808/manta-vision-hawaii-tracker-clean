const fs = require('fs');
const p  = 'src/pages/browse_data/Photos.tsx';
let s = fs.readFileSync(p, 'utf8');

// Find the first occurrence of the self-closing <PhotoFilterBox ... />
const start = s.indexOf('<PhotoFilterBox');
if (start === -1) {
  console.error('✖ Could not find <PhotoFilterBox ... /> in', p);
  process.exit(1);
}

// Scan forward to the matching "/>" of this self-closing tag
let i = start;
let end = -1;
while (i < s.length) {
  if (s[i] === '/' && s[i+1] === '>') { end = i + 2; break; }
  i++;
}
if (end === -1) {
  console.error('✖ Could not find the end of the <PhotoFilterBox ... /> tag');
  process.exit(1);
}

const replacement = `<PhotoFilterBox
          rows={photoRows}
          filters={filters}
          setFilters={setFilters}
          sortAsc={sortAsc}
          setSortAsc={setSortAsc}
          onClearAll={onClearFilters}
          search={search}
          setSearch={setSearch}
          hideSearch={true}
        />`;

const out = s.slice(0, start) + replacement + s.slice(end);
fs.writeFileSync(p, out);
console.log('✔ Photos.tsx callsite updated');
