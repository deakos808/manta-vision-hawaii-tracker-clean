const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
let s = fs.readFileSync(p, 'utf8');

// 1) Remove the standalone breadcrumb block that sits under the hero (outside the blue block)
s = s.replace(
  /\n\s*<div className="mt-4">\s*<Breadcrumb>[\s\S]*?<\/Breadcrumb>\s*<\/div>\s*\n/,
  '\n'
);

// 2) Remove the extra standalone search input under the hero (outside the blue block)
s = s.replace(
  /\n\s*<input\s+className="mb-4 mt-4 border[^"]*"\s+placeholder="Search location, photographer…"\s+value=\{search\}\s+onChange=\{\(e\)\s*=>\s*setSearch\(e\.target\.value\)\}\s*\/>\s*\n/,
  '\n'
);

// 3) Ensure the light-blue block shows the full breadcrumb UI (replace the simple "Return" link if present)
s = s.replace(
  /<div className="text-sm text-blue-800 mb-2">[\s\S]*?<\/div>/,
  `<div className="text-sm text-blue-800 mb-2">
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/browse/data">Browse Data</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Sightings</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  </div>`
);

// 4) Keep only ONE "Sort by Sighting ID" row — keep the LAST one (inside the blue block)
const sortRe = /<div className="flex items-center text-sm text-gray-700 mt-1 gap-2">[\s\S]*?<\/div>/g;
const sorts = Array.from(s.matchAll(sortRe));
if (sorts.length > 1) {
  for (let i = 0; i < sorts.length - 1; i++) {
    s = s.replace(sorts[i][0], '');
  }
}

// Save backup + write file
fs.copyFileSync(p, p + '.bak');
fs.writeFileSync(p, s);
console.log('✔ Sightings cleaned: breadcrumb moved, extra search removed, single sort row. Backup at', p + '.bak');
