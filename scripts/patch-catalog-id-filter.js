const fs = require("fs");
const path = "src/pages/browse_data/Catalog.tsx";
let s = fs.readFileSync(path, "utf8");
let orig = s;
const w = (msg)=>{}; // quiet logger

// 1) Ensure useState import
if (/from ['"]react['"]/.test(s) && !/\buseState\b/.test(s.split(/from ['"]react['"]/)[0])) {
  s = s.replace(/import\s+React(?:,[^;]*)?from\s+['"]react['"];?/,
    (m)=> m.replace("React", "React, { useState }"));
}
if (!/useState/.test(s)) {
  // Another import style
  s = s.replace(/from\s+['"]react['"];/, (m)=> m.replace("from 'react';", ", useState from 'react';"));
}

// 2) Add state if missing
if (!/const\s*\[\s*catalogIdFilter\s*,\s*setCatalogIdFilter\s*\]\s*=\s*useState/.test(s)) {
  // insert after the first other useState or right after component start
  if (s.match(/useState\(/)) {
    s = s.replace(/(const\s*\[[^\n]*useState[^\n]*\);\s*)/, `$1\n  const [catalogIdFilter, setCatalogIdFilter] = useState("");\n`);
  } else {
    // Try after function component start
    s = s.replace(/(\n\s*function\s+[A-Z]\w*\s*\([^)]*\)\s*\{\s*\n)/, `$1  const [catalogIdFilter, setCatalogIdFilter] = useState("");\n`);
  }
}

// 3) Thread into React Query key (first key containing 'catalog')
s = s.replace(/useQuery\(\s*\[\s*(['"])catalog\1([^]]*)\]/, (m, q, rest)=> {
  if (/\bcatalogIdFilter\b/.test(m)) return m;
  return `useQuery(["catalog", catalogIdFilter${rest}]`;
});

// 4) Server-side filter: add eq on pk_catalog_id when set
// Look for a query builder referencing catalog
let injected = false;
s = s.replace(/(\b(let|const)\s+q\s*=\s*[^;\n]*from\(\s*['"]catalog['"]\s*\)[\s\S]*?\n)/, (m) => {
  if (/\bcatalogIdFilter\b[^;\n]*pk_catalog_id/.test(m)) { injected = true; return m; }
  const add = `\n    if (catalogIdFilter) {\n      q = q.eq("pk_catalog_id", Number(catalogIdFilter));\n    }\n`;
  injected = true;
  // insert after the line where q is declared
  return m + add;
});
if (!injected) {
  // Try a more generic insertion right after the first from("catalog")
  s = s.replace(/(from\(\s*['"]catalog['"]\s*\)[^\n]*\n)/, (m)=>{
    return m + `    if (catalogIdFilter) {\n      q = q.eq("pk_catalog_id", Number(catalogIdFilter));\n    }\n`;
  });
}

// 5) Clear All integration: add reset inside a clear function if present
s = s.replace(/(function\s+(handleClearAll|onClearAll)\s*\([^)]*\)\s*\{\s*)([\s\S]*?\n\})/,
  (m, start, name, body)=> {
    if (/setCatalogIdFilter\(\s*["']{0,1}\s*\)/.test(m)) return m;
    return `${start}  setCatalogIdFilter("");\n${body}`;
  }
);
s = s.replace(/(\bconst\s+(handleClearAll|onClearAll)\s*=\s*\(\)\s*=>\s*\{\s*)([\s\S]*?\n\};)/,
  (m, start, name, end)=> {
    if (/setCatalogIdFilter\(\s*["']{0,1}\s*\)/.test(m)) return m;
    return `${start}  setCatalogIdFilter("");\n${end}`;
  }
);

// 6) UI pill: try to place next to "Species" filter; fallback under H1 "Catalog"
const pill = `
    {/* Catalog ID filter pill */}
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground whitespace-nowrap">Catalog&nbsp;ID</label>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        className="h-8 w-28 rounded-full border px-3 text-sm bg-background"
        placeholder="e.g. 123"
        value={catalogIdFilter}
        onChange={(e) => setCatalogIdFilter(e.target.value.replace(/[^0-9]/g, ""))}
      />
      {catalogIdFilter ? (
        <button
          type="button"
          className="h-8 px-3 rounded-full border text-sm"
          onClick={() => setCatalogIdFilter("")}
          aria-label="Clear Catalog ID"
        >
          Clear
        </button>
      ) : null}
    </div>
`;

if (/Species<\/?/.test(s)) {
  // Heuristic: insert after the Species filter wrapper row
  s = s.replace(/(\bSpecies\b[^]*?\n\s*<\/div>)/, (m)=> m + `\n${pill}\n`);
} else if (/>\s*Catalog\s*<\/h1>/.test(s)) {
  s = s.replace(/(>\s*Catalog\s*<\/h1>\s*\n)/, `$1<div className="mt-2 mb-3 flex flex-wrap items-center gap-3">\n${pill}\n</div>\n`);
} else {
  // As a last resort, append near top of the main filter bar container if present
  s = s.replace(/(<div[^>]*className=["'][^"']*filters[^"']*["'][^>]*>)/i, `$1\n${pill}\n`);
}

// 7) Write back only if changed
if (s !== orig) fs.writeFileSync(path, s);
console.log("Catalog ID filter patch applied.");
