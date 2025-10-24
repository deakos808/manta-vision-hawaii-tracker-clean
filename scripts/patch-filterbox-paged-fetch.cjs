const fs = require('fs');
const p = 'src/components/sightings/SightingFilterBox.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
const bak = p + '.bak.' + Date.now();
let s = fs.readFileSync(p,'utf8');

// Replace the effect that sets "rows" with a paged fetch version.
// We detect the block by the "select('population,island,sitelocation,photographer,total_mantas,sighting_date')" marker.
const marker = /useEffect\(\(\)\s*=>\s*\{\s*let\s+alive\s*=\s*true;\s*\(\s*async\s*\(\)\s*=>\s*\{\s*let\s+q\s*=\s*supabase[\s\S]*?select\(\s*"population,island,sitelocation,photographer,total_mantas,sighting_date"\s*\)[\s\S]*?\}\)\(\);\s*return\s*\(\)\s*=>\s*\{\s*alive\s*=\s*false;\s*\};\s*\},\s*\[population,\s*island,\s*location,\s*photographer,\s*minMantas,\s*date\]\);\s*/m;

if (!marker.test(s)) {
  console.error('✖ Could not locate the rows fetch effect in SightingFilterBox.tsx');
  process.exit(1);
}

const patched = `
useEffect(() => {
  let alive = true;
  (async () => {
    const pageSize = 1000;       // PostgREST cap
    const hardCap  = 50000;      // safety
    let acc: any[] = [];

    for (let from = 0; from < hardCap; from += pageSize) {
      let q = supabase
        .from("sightings")
        .select("population,island,sitelocation,photographer,total_mantas,sighting_date");

      // Apply SAME filters as the list
      if (population) q = q.ilike("population", \`%\${population}%\`);
      if (island && island !== "all") q = q.ilike("island", \`%\${island}%\`);
      if (location) q = q.eq("sitelocation", location);
      if (photographer) q = q.ilike("photographer", \`%\${photographer}%\`);
      if (minMantas !== "") q = q.gte("total_mantas", minMantas as any);
      if (date) q = q.eq("sighting_date", date);

      // Range paging 0..999, 1000..1999, ...
      q = q.order("pk_sighting_id", { ascending: true }).range(from, from + pageSize - 1);

      const { data, error } = await q;
      if (!alive) return;
      if (error) { console.error("[filters] fetch error", error); break; }

      const chunk = data ?? [];
      acc.push(...chunk);
      if (chunk.length < pageSize) break; // finished
    }

    if (!alive) return;
    setRows(acc);
  })();

  return () => { alive = false; };
}, [population, island, location, photographer, minMantas, date]);
`;

// Do the replacement
s = s.replace(marker, patched);

// Save files
fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Replaced rows fetch with paged (0..999, 1000..1999, …) version');
console.log('  • Backup:', bak);
