const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
let s = fs.readFileSync(p, 'utf8');

/** 1) Make the light-blue block butt up to the hero (add -mt-2 once). */
s = s.replace(
  /<div className="bg-blue-50 ([^"]*)">/,
  (m, rest) => `<div className="bg-blue-50 ${rest.includes('-mt-') ? rest : rest + ' -mt-2'}">`
);

/** 2) Remove the OUTER “Clear All Filters” in the light-blue header (keep the inner one in the white box). */
s = s.replace(
  /<div className="flex justify-between items-center mb-3">\s*<div className="text-sm font-medium">[^<]*<\/div>\s*<button[^>]*onClick=\{onClear\}[^>]*>\s*Clear All Filters\s*<\/button>\s*<\/div>/,
  `<div className="flex justify-between items-center mb-3">
    <div className="text-sm font-medium">Filter Sighting Records by:</div>
  </div>`
);

/** 3) Deduplicate any “Sort by Sighting ID” rows — keep only the LAST instance. */
{
  const sortRe = /<div className="flex items-center text-sm text-gray-700 mt-1 gap-2">[\s\S]*?Sort by Sighting(?:&nbsp;| )ID[\s\S]*?<\/div>/g;
  const matches = [...s.matchAll(sortRe)];
  if (matches.length > 1) {
    for (let i = 0; i < matches.length - 1; i++) s = s.replace(matches[i][0], '');
  }
}

fs.copyFileSync(p, p + '.bak');
fs.writeFileSync(p, s);
console.log('✔ Sightings: joined blue block to hero, kept only inner Clear All, single Sort row. Backup at', p + '.bak');
