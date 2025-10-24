const fs = require('fs');
const p = 'src/pages/browse_data/Photos.tsx';
let s = fs.readFileSync(p, 'utf8');

// 1) Ensure hero is the solid blue banner (square corners)
s = s.replace(
  /<div className="text-center mb-4">[\s\S]*?<h1[^>]*>Photos<\/h1>[\s\S]*?<\/div>/,
  `<div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 shadow text-center">
    <h1 className="text-4xl font-bold">Photos</h1>
  </div>`
);

// 2) Remove any breadcrumb outside the light-blue block (e.g., "← Return to Mantas" above)
s = s.replace(/\n\s*<a href="\/browse\/mantas"[\s\S]*?<\/a>\s*\n/, '\n');

// 3) Make sure the search input above the panel is white & correct width
s = s.replace(
  /(<input[^>]*placeholder="Search by photo ID,[\s\S]*?className=")([^"]*)"/,
  (m, a, classes) => a + (classes.includes('bg-white') ? classes : (classes + ' bg-white')) + '"'
);

// 4) Remove old standalone "Sort by Photo ID:" (right-aligned) outside the panel
s = s.replace(/\n\s*<div[^>]*>\s*Sort by Photo ID:\s*[^<]*<\/div>\s*\n/g, '\n');

fs.copyFileSync(p, p + '.bak');
fs.writeFileSync(p, s);
console.log('✔ Photos.tsx cleaned: hero ok, breadcrumb outside removed, search white above panel, old right-sort removed. Backup at', p + '.bak');
