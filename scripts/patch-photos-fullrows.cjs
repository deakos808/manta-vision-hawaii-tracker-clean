const fs = require('fs');
const p = 'src/pages/browse_data/Photos.tsx';
let s = fs.readFileSync(p, 'utf8');

// 1) Ensure fullRows state exists (for pill counts)
if (!/const \[fullRows,\s*setFullRows\]/.test(s)) {
  // Insert before the photos state if present, else after filters
  if (/const \[photos,\s*setPhotos\]/.test(s)) {
    s = s.replace(/const \[photos,\s*setPhotos[^\n]*\n/, 
      `const [fullRows, setFullRows] = useState<Array<{population:string|null; island:string|null; location:string|null; photo_view:string|null; species:string|null}>>([]);\n$&`);
  } else {
    s = s.replace(/const \[filters,[\s\S]*?\);\s*\n/, 
      `$&  const [fullRows, setFullRows] = useState<Array<{population:string|null; island:string|null; location:string|null; photo_view:string|null; species:string|null}>>([]);\n`);
  }
}

// 2) Remove any prior "fetchFullRowsForPills" style effect if it exists (best-effort)
s = s.replace(/useEffect\(function fetchFullRowsForPills\(\)[\s\S]*?\}, \[\]\);\s*/m, '');

// 3) Insert a new chunked, species-aware loader BEFORE the first "return ("
const retIdx = s.indexOf('\n  return (');
if (retIdx === -1) {
  console.error('✖ Could not find component return(');
  process.exit(1);
}
const effectBlock = `
  // Species-aware, chunked loader for pill-basis (photos_pill_basis)
  useEffect(function loadPillBasis() {
    let alive = true;
    (async () => {
      const BATCH = 1000;
      let from = 0;
      const rows: Array<{population:string|null; island:string|null; location:string|null; photo_view:string|null; species:string|null}> = [];
      while (true) {
        const to = from + BATCH - 1;
        const { data, error } = await supabase
          .from("photos_pill_basis")
          .select("population,island,location,photo_view,species")
          .range(from, to);
        if (!alive) return;
        if (error) { console.error("[Photos] pill-basis error:", error); break; }
        const chunk = (data ?? []).map((r: any) => ({
          population: r.population ?? null,
          island:     r.island ?? null,
          location:   r.location ?? null,
          photo_view: r.photo_view ?? null,
          species:    r.species ?? null,
        }));
        rows.push(...chunk);
        if (chunk.length < BATCH) break;
        from += BATCH;
      }
      setFullRows(rows);
    })();
    return () => { alive = false; };
  }, []);
`;
s = s.slice(0, retIdx) + effectBlock + s.slice(retIdx);

// 4) Ensure the PhotoFilterBox receives rows={fullRows}
s = s.replace(/<PhotoFilterBox[\s\S]*?rows=\{[^}]+\}/m, (m) => m.replace(/rows=\{[^}]+\}/, 'rows={fullRows}'));

// Save
fs.writeFileSync(p, s);
console.log('✔ Inserted chunked species-aware fullRows loader and wired rows={fullRows}');
