const fs = require('fs');
const p = 'src/pages/browse_data/Photos.tsx';
let s = fs.readFileSync(p, 'utf8');

// 1) Ensure the hero is the solid blue banner (no rounded corners)
s = s
  // If an old gradient hero exists, replace it
  .replace(
    /<div className="text-center mb-4">[\s\S]*?<h1[^>]*>Photos<\/h1>[\s\S]*?<\/div>/,
    `<div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 shadow text-center">
      <h1 className="text-4xl font-bold">Photos</h1>
    </div>`
  )
  // Remove any rounded-* class on the blue hero if present
  .replace(/(<div className="[^"]*bg-blue-600[^"]*)\s+rounded-[^"\s]+/g, '$1');

// 2) Remove the stray "← Return to Mantas" link anywhere on the page
s = s.replace(/.*Return to Mantas.*\n/g, '');

// 3) Remove ALL "Sort by Photo ID" rows in this page file (we keep the one inside PhotoFilterBox)
s = s.replace(/\n\s*<div className="flex items-center text-sm text-gray-700 mt-3 gap-2">\s*<span>Sort by Photo(?:&nbsp;| )ID<\/span>[\s\S]*?<\/div>\s*\n/g, '\n');

// (The light-blue block already only wraps breadcrumb+search+filter panel; content below is white.)

fs.copyFileSync(p, p + '.bak');
fs.writeFileSync(p, s);
console.log('✔ Photos header/layout cleaned: square hero, "Return to Mantas" removed, duplicate outer sort removed. Backup at', p + '.bak');
