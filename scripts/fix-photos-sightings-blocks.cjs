const fs = require('fs');
const p = 'src/pages/browse_data/Photos.tsx';
let s = fs.readFileSync(p,'utf8');

// 0) Remove any previous partial insertions
s = s.replace(/^\s*const \[islandOptionsAll,[^\n]*\n/gm, '');
s = s.replace(/^\s*const \[locationsByIsland,[^\n]*\n/gm, '');
s = s.replace(/^\s*\/\/ Sightings-driven option lists[\s\S]*?\n/gm, '');
s = s.replace(/^\s*\/\/ Load distinct islands and locations from SIGHTINGS[\s\S]*?]\);\n\s*\}\);\n/gm, ''); // remove prior effect if present

// 1) Insert two new state lines RIGHT AFTER the filters useState block
const filtersBlock = /const \[filters,\s*setFilters\][\s\S]*?\}\);\s*\n/;
s = s.replace(filtersBlock, (m) => {
  return m + 
`  // Sightings-driven option lists (islands + per-island locations)
  const [islandOptionsAll, setIslandOptionsAll] = useState<string[]>([]);
  const [locationsByIsland, setLocationsByIsland] = useState<Record<string,string[]>>({});

`;
});

// 2) Insert the fetching useEffect JUST BEFORE the first "return ("
const retIdx = s.indexOf('\n  return (');
if (retIdx !== -1) {
  const effect = `
  // Load distinct islands and locations from SIGHTINGS (for pill options)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Distinct islands
        const { data: isl } = await supabase
          .from("sightings")
          .select("island")
          .not("island","is", null);
        if (!alive) return;
        const islands = Array.from(new Set((isl ?? [])
          .map(r => (r.island ?? "").toString().trim())
          .filter(Boolean))).sort((a,b)=>a.localeCompare(b));
        setIslandOptionsAll(islands);

        // Distinct locations grouped by island
        const { data: locs } = await supabase
          .from("sightings")
          .select("island,sitelocation")
          .not("island","is", null)
          .not("sitelocation","is", null);
        if (!alive) return;
        const map: Record<string,string[]> = {};
        (locs ?? []).forEach(r => {
          const isl = (r.island ?? "").toString().trim();
          const loc = (r.sitelocation ?? "").toString().trim();
          if (!isl || !loc) return;
          (map[isl] ||= []);
          if (!map[isl].includes(loc)) map[isl].push(loc);
        });
        Object.values(map).forEach(arr => arr.sort((a,b)=>a.localeCompare(b)));
        setLocationsByIsland(map);
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

`;
  s = s.slice(0, retIdx) + effect + s.slice(retIdx);
}

// 3) Ensure the PhotoFilterBox call passes the new props
const start = s.indexOf('<PhotoFilterBox');
if (start !== -1) {
  let i = start, end = -1;
  while (i < s.length) { if (s[i] === '/' && s[i+1] === '>') { end = i+2; break; } i++; }
  if (end !== -1) {
    let props = s.slice(start, end);
    if (!/islandOptionsAll=/.test(props)) props = props.replace(/\/>$/, `\n          islandOptionsAll={islandOptionsAll}\n          locationsByIsland={locationsByIsland}\n        />`);
    s = s.slice(0, start) + props + s.slice(end);
  }
}

fs.writeFileSync(p, s);
console.log('✔ Fixed Photos.tsx state/effect insertion and props.');
