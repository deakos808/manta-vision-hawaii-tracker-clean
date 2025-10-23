const fs = require('fs');
const p = 'src/pages/browse_data/Photos.tsx';
let s = fs.readFileSync(p, 'utf8');

/* 1) Force the hero to be a square-corner solid blue banner */
s = s
  // replace old gradient hero if present
  .replace(
    /<div className="text-center mb-4">[\s\S]*?<h1[^>]*>Photos<\/h1>[\s\S]*?<\/div>/,
    `<div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 shadow text-center">
      <h1 className="text-4xl font-bold">Photos</h1>
    </div>`
  )
  // strip any accidental rounded-* class on the blue hero
  .replace(
    /(bg-blue-600[^"]*)\s+rounded-[^"\s]+/g,
    '$1'
  );

/* 2) Remove breadcrumb outside the blue block ("← Return to Mantas") */
s = s.replace(/\n\s*<a href="\/browse\/mantas"[\s\S]*?<\/a>\s*\n/g, '\n');

/* 3) Keep only ONE "Sort by Photo ID" row (outside the panel) — remove extra one below the panel */
const sortRowRe = /<div className="flex items-center text-sm text-gray-700 mt-3 gap-2">[\s\S]*?Sort by Photo(?:&nbsp;| )ID[\s\S]*?<\/div>/g;
const allSorts = [...s.matchAll(sortRowRe)];
if (allSorts.length > 1) {
  // remove all except the first (we assume the first is inside the panel)
  for (let i = 1; i < allSorts.length; i++) {
    s = s.replace(allSorts[i][0], '');
  }
}

/* 4) Tighten the light-blue block so it ends right AFTER the filter panel */
const blueOpenRe = /<div className="bg-blue-50[^"]*px-4[^"]*py-4[^"]*shadow-sm[^"]*">/;
const filterEndRe = /<PhotoFilterBox[\s\S]*?\/>/m;
if (blueOpenRe.test(s) && filterEndRe.test(s)) {
  // Ensure we have a closing </div> immediately after the PhotoFilterBox
  s = s.replace(filterEndRe, (m) => `${m}\n        </div>`);
  // If there is another closing tag for the blue block much later, remove only ONE extra to avoid double close
  // (Heuristic: remove the next solitary </div> that immediately follows a "Sort by Photo ID" we just kept)
  s = s.replace(/\n\s*<\/div>\s*(\n\s*<\/div>)/, '\n$1'); // collapse duplicates once
}

/* Save backup + write */
fs.copyFileSync(p, p + '.bak');
fs.writeFileSync(p, s);
console.log('✔ Photos fixed: hero square, stray breadcrumb removed, duplicate sort removed, blue block tightened. Backup at', p + '.bak');
