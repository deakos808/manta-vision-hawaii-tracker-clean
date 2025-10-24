const fs = require('fs');
const p = 'src/pages/browse_data/Photos.tsx';
let s = fs.readFileSync(p, 'utf8');

// 1) Remove the OUTER "Clear All Filters" in the light-blue header (keep the one inside the white panel)
s = s.replace(/<div className="mb-4 text-sm text-blue-600 text-left space-y-1">([\s\S]*?)<\/div>\s*<div className="[^"]*">\s*Clear All Filters\s*<\/div>/, `<div className="mb-4 text-sm text-blue-600 text-left space-y-1">$1</div>`);

// 2) Ensure the PhotoFilterBox call does NOT pass sort props (so it won't render its own sort UI)
s = s.replace(/<PhotoFilterBox([\s\S]*?)\/>/m, (m, inner) => {
  // remove sortAsc or setSortAsc props if present
  inner = inner.replace(/\s*sortAsc=\{[^}]+\}/g, '');
  inner = inner.replace(/\s*setSortAsc=\{[^}]+\}/g, '');
  return `<PhotoFilterBox${inner} />`;
});

// 3) Remove any old standalone "Sort by Photo ID" UI that the page previously rendered (right-aligned dropdown/text)
s = s.replace(/Sort by Photo ID[:：][^\n]*\n/g, '');

// Save backup + write
fs.copyFileSync(p, p + '.bak');
fs.writeFileSync(p, s);
console.log('✔ Photos polished: outer Clear removed, old sort hidden, only ▲/▼ remains. Backup at', p + '.bak');
