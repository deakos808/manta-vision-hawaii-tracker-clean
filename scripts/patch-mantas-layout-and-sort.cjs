const fs = require('fs');
const p = 'src/pages/browse_data/Mantas.tsx';
let s = fs.readFileSync(p,'utf8');

/* 1) Add sortAsc state (default newest-first = descending) */
if (!/const \[sortAsc, setSortAsc\]/.test(s)) {
  s = s.replace(
    /const \[photographer, setPhotographer\] = useState<string\[\]\>\(\[\]\);\n/,
    `$&
  // Sort: false = newest first (desc), true = oldest first (asc)
  const [sortAsc, setSortAsc] = useState(false);\n`
  );
}

/* 2) Add sortedMantas memo and switch render to use it */
if (!/const sortedMantas = useMemo\(/.test(s)) {
  s = s.replace(
    /const filteredMantas = useMemo\([\s\S]*?\);\n\}\)\,\s*\[allMantas[\s\S]*?\]\);\n/,
    (m) => m + `\n  // Sort after filtering\n  const sortedMantas = useMemo(() => {\n    const arr = [...filteredMantas];\n    arr.sort((a,b) => (sortAsc ? a.pk_manta_id - b.pk_manta_id : b.pk_manta_id - a.pk_manta_id));\n    return arr;\n  }, [filteredMantas, sortAsc]);\n`
  );
}
// use sortedMantas in render
s = s.replace(/filteredMantas\.map\(/g, 'sortedMantas.map(');

/* 3) Replace the hero + search/filters block with catalog-style hero and light-blue block (with breadcrumb, search, filters, sort row) */
// remove the original breadcrumb block above hero
s = s.replace(
  /\n\s*{\s*\/\* Breadcrumb \*\/\s*}[\s\S]*?<div className="mt-4">[\s\S]*?<\/div>\s*/,
  '\n'
);
// replace the gradient hero with the solid blue banner
s = s.replace(
  /{\s*\/\* Hero \(centered title\) \*\/\s*}\s*<div className="[^"]*?bg-gradient-to-r[^"]*?">\s*<h1[^>]*>Mantas<\/h1>\s*<\/div>/,
  `{/* Hero (full-width, Catalog style) */}
        <div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 shadow text-center">
          <h1 className="text-4xl font-bold">Mantas</h1>
        </div>`
);
// replace the "Search + Filters" section with a light-blue block that includes breadcrumb link, search, filter box, sort row, and summary
s = s.replace(
  /{\s*\/\* Search \+ Filters \*\/\s*}[\s\S]*?<\/div>\s*\n\s*{\s*\/\* Results \*\/\s*}/m,
  `{/* Search + Filters (Catalog style light-blue block) */}
        <div className="bg-blue-50 px-4 sm:px-8 lg:px-16 py-4 shadow-sm -mt-2">
          {/* Breadcrumb-like link (left-justified) */}
          <div className="text-sm text-blue-800 mb-2">
            <a href="/browse/data" className="hover:underline">← Return to Browse Data</a>
          </div>

          {/* Left-justified search */}
          <div>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or ID…"
              aria-label="Search mantas"
              className="max-w-md mb-3"
            />
          </div>

          <div className="bg-white shadow p-4 border mb-3">
            <div className="flex justify-between items-center mb-3">
              <div className="text-sm font-medium">Filter Manta Records by:</div>
              <Button variant="link" size="sm" onClick={handleClearFilters} className="text-blue-700">Clear All Filters</Button>
            </div>

            <MantaFilterBox
              rows={facetRows}
              population={population}
              setPopulation={setPopulation}
              island={island}
              setIsland={setIsland}
              location={location}
              setLocation={setLocation}
              photographer={photographer}
              setPhotographer={setPhotographer}
              onClear={handleClearFilters}
            />
          </div>

          {/* Sort row (Catalog style) */}
          <div className="flex items-center text-sm text-gray-700 mt-1 gap-2">
            <span>Sort by Manta&nbsp;ID</span>
            <Button
              size="icon"
              variant="ghost"
              className={sortAsc ? "" : "text-blue-600"}
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

          {/* Summary below */}
          <div className="mt-3 text-sm text-muted-foreground">{headerSubtitle}</div>
        </div>

        {/* Results */}`
);

/* Save backup + write */
fs.copyFileSync(p, p+'.bak');
fs.writeFileSync(p, s);
console.log('✔ Mantas patched: catalog-style layout + sort by Manta ID. Backup at', p+'.bak');
