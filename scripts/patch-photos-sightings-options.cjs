const fs = require('fs');
const p = 'src/pages/browse_data/Photos.tsx';
let s = fs.readFileSync(p, 'utf8');

// 1) Insert state for islandOptionsAll / locationsByIsland right after the filters state
const filtersNeedle = 'const [filters, setFilters]';
const fi = s.indexOf(filtersNeedle);
if (fi !== -1) {
  const nl = s.indexOf('\n', fi);
  const inject = `
  // Sightings-driven option lists (islands + per-island locations)
  const [islandOptionsAll, setIslandOptionsAll] = useState<string[]>([]);
  const [locationsByIsland, setLocationsByIsland] = useState<Record<string,string[]>>({});
`;
  s = s.slice(0, nl + 1) + inject + s.slice(nl + 1);
} else {
  console.error('Could not find filters state to insert sightings options.');
}

// 2) Insert the fetching useEffect before the component's "return ("
const returnIdx = s.indexOf('\n  return (');
if (returnIdx !== -1) {
  const effectBlock = `
  // Load distinct islands and locations from SIGHTINGS (for pill options)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Distinct islands
        const { data: isl, error: e1 } = await supabase
          .from("sightings")
          .select("island")
          .not("island","is", null);
        if (!alive) return;
        const islands = Array.from(
          new Set((isl ?? []).map(r => (r.island ?? "").toString().trim()).filter(Boolean))
        ).sort((a,b)=>a.localeCompare(b));
        setIslandOptionsAll(islands);

        // Distinct locations grouped by island
        const { data: locs, error: e2 } = await supabase
          .from("sightings")
          .select("island,sitelocation")
          .not("island","is", null)
          .not("sitelocation","is", null);
        if (!alive) return;

        const map = {};
        (locs ?? []).forEach(r => {
          const isl = (r.island ?? "").toString().trim();
          const loc = (r.sitelocation ?? "").toString().trim();
          if (!isl || !loc) return;
          if (!map[isl]) map[isl] = [];
          if (!map[isl].includes(loc)) map[isl].push(loc);
        });
        Object.values(map).forEach(arr => arr.sort((a,b)=>a.localeCompare(b)));
        setLocationsByIsland(map);
      } catch {
        // no-op
      }
    })();
    return () => { alive = false; };
  }, []);
`;
  s = s.slice(0, returnIdx) + effectBlock + s.slice(returnIdx);
} else {
  console.error('Could not find "return (" to insert sightings useEffect.');
}

// 3) Replace the first <PhotoFilterBox ... /> self-closing tag with the new props
const start = s.indexOf('<PhotoFilterBox');
if (start !== -1) {
  let i = start, end = -1;
  while (i < s.length) {
    if (s[i] === '/' && s[i+1] === '>') { end = i + 2; break; }
    i++;
  }
  if (end !== -1) {
    const replacement = `<PhotoFilterBox
          rows={photoRows}
          filters={filters}
          setFilters={setFilters}
          sortAsc={sortAsc}
          setSortAsc={setSortAsc}
          onClearAll={onClearFilters}
          search={search}
          setSearch={setSearch}
          hideSearch={true}
          islandOptionsAll={islandOptionsAll}
          locationsByIsland={locationsByIsland}
        />`;
    s = s.slice(0, start) + replacement + s.slice(end);
  } else {
    console.error('Could not find end of <PhotoFilterBox ... /> tag.');
  }
} else {
  console.error('Could not find <PhotoFilterBox ... /> callsite.');
}

// Save file
fs.writeFileSync(p, s);
console.log('✔ Photos.tsx updated with Sightings-based island/location options.');
