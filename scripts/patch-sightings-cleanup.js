const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
let s = fs.readFileSync(p, 'utf8');

// 1) Remove the standalone breadcrumb block just under the hero (outside the blue box)
{
  const re = new RegExp(
    String.raw`<div className="px-4[^>]*py-2">[\s\S]*?</div>\s*`,
    'm'
  );
  s = s.replace(re, '');
}

// 2) Remove the extra standalone search input under the hero (outside the blue box)
{
  const re = new RegExp(
    String.raw`\n\s*<input\s+className="mb-4 mt-4 border[\s\S]*?setSearch\(e\.target\.value\)\}\s*\/>\s*\n`,
    'm'
  );
  s = s.replace(re, '\n');
}

// 3) Keep only ONE "Sort by Sighting ID" row (keep the LAST one, inside the blue block)
{
  const sortRe = /<div className="flex items-center text-sm text-gray-700 mt-1 gap-2">[\s\S]*?<\/div>/g;
  const matches = [...s.matchAll(sortRe)];
  if (matches.length > 1) {
    // remove the first occurrence
    s = s.replace(matches[0][0], '');
  }
}

// Write backup + file
fs.copyFileSync(p, p + '.bak');
fs.writeFileSync(p, s);
console.log('✔ Cleaned layout: removed extra breadcrumb/search & duplicate sort. Backup at', p + '.bak');
