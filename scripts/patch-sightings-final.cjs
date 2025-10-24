const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
let s = fs.readFileSync(p, 'utf8');

// 1) Remove the breadcrumb block below the hero (outside the blue box)
s = s.replace(
  /\n\s*{\/\* Breadcrumb \(below hero, left-justified\) \*\/}[\s\S]*?<div className="px-4[\s\S]*?<\/div>\s*\n/,
  '\n'
);

// 2) In the light-blue block header, remove the OUTER Clear All button (keep the inner one)
s = s.replace(
  /<div className="flex justify-between items-center mb-3">\s*<div className="text-sm font-medium">Filter Sighting Records by:<\/div>\s*<Button[^>]*onClick=\{onClear\}[^>]*>Clear All Filters<\/Button>\s*<\/div>/,
  `<div className="flex justify-between items-center mb-3">
            <div className="text-sm font-medium">Filter Sighting Records by:</div>
          </div>`
);

// 3) Insert a breadcrumb-like "Return to Browse Data" link at the TOP of the light-blue block (like Catalog)
s = s.replace(
  /<div className="bg-blue-50 px-4 sm:px-8 lg:px-16 py-4 shadow-sm -mt-2">/,
  `<div className="bg-blue-50 px-4 sm:px-8 lg:px-16 py-4 shadow-sm -mt-2">
          <div className="text-sm text-blue-800 mb-2">
            <a href="/browse/data" className="hover:underline">← Return to Browse Data</a>
          </div>`
);

// 4) Remove the duplicate second Sort row (the one with mt-1)
s = s.replace(
  /\n\s*{\/\* Sort row \(Catalog style\) \*\/}\s*\n\s*<div className="flex items-center text-sm text-gray-700 mt-1 gap-2">[\s\S]*?<\/div>\s*\n/,
  '\n'
);

// Save files
fs.copyFileSync(p, p + '.bak');
fs.writeFileSync(p, s);
console.log('✔ Sightings layout updated: breadcrumb moved into blue block, outer Clear removed, single Sort row. Backup at', p + '.bak');
