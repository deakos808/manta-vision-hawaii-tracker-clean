const fs = require('fs');
const p = 'src/pages/browse_data/Photos.tsx';
let s = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';

if (!s) {
  console.error('✖ Could not find', p);
  process.exit(1);
}

/* 1) Replace the gradient hero with the full-width blue banner */
s = s.replace(
  /<div className="text-center mb-4">[\s\S]*?<h1[^>]*>Photos<\/h1>[\s\S]*?<\/div>/,
  `<div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 shadow text-center">
        <h1 className="text-4xl font-bold">Photos</h1>
      </div>`
);

/* 2) Wrap breadcrumbs + filter panel in a light-blue block and add a Catalog-style sort row */
const crumbsRe = /<div className="mb-4 text-sm text-blue-600 text-left space-y-1">[\s\S]*?<\/div>\s*/m;
const filterRe = /<PhotoFilterBox[\s\S]*?\/>\s*/m;

const crumbsMatch = s.match(crumbsRe);
const filterMatch = s.match(filterRe);

if (crumbsMatch && filterMatch) {
  const combined = `
      <div className="bg-blue-50 px-4 sm:px-8 lg:px-16 py-4 shadow-sm -mt-2">
        ${crumbsMatch[0].trim()}

        {/* Filter box */}
        ${filterMatch[0].trim()}

        {/* Sort row (Catalog style) */}
        <div className="flex items-center text-sm text-gray-700 mt-3 gap-2">
          <span>Sort by Photo&nbsp;ID</span>
          <Button
            size="icon"
            variant="ghost"
            className={!sortAsc ? "text-blue-600" : ""}
            onClick={() => setSortAsc(false)}
            title="Newest first"
          >
            ▲
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className={sortAsc ? "text-blue-600" : ""}
            onClick={() => setSortAsc(true)}
            title="Oldest first"
          >
            ▼
          </Button>
        </div>
      </div>
  `;

  // Replace the original crumbs + filter block with the new light-blue block
  s = s.replace(crumbsRe, '');
  s = s.replace(filterRe, combined);
}

/* 3) If there is an existing standalone 'Sort by Photo ID' row elsewhere, remove it to avoid duplication */
s = s.replace(/^\s*Sort by Photo ID[:：][^\n]*$/m, '');

/* Save */
fs.copyFileSync(p, p + '.bak');
fs.writeFileSync(p, s);
console.log('✔ Photos layout updated (blue hero + light-blue block + sort row). Backup at', p + '.bak');
