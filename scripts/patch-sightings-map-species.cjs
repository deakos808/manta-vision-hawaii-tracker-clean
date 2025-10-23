const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

/**
 * Ensure we have the map points state.
 * We'll place it right after the `showMap` state if not present.
 */
if (!/const\s*\[\s*mapPoints\s*,\s*setMapPoints\s*\]/.test(s)) {
  s = s.replace(
    /const\s*\[\s*showMap\s*,\s*setShowMap\s*\]\s*=\s*useState\(\s*false\s*\);\s*/,
    m => m + `\n  // points for MapDialog (filtered & paged)\n  const [mapPoints, setMapPoints] = useState<{ lat: number; lon: number }[]>([]);\n`
  );
}

/**
 * Insert/replace a function buildMapPoints that fetches all points with current filters.
 * We use the same getSpeciesSightingIds(species) helper we added earlier.
 */
if (!/async\s+function\s+buildMapPoints\s*\(/.test(s)) {
  // Try to insert near fetchSightings definition
  s = s.replace(
    /const\s+fetchSightings\s*=\s*async\s*\(\{\s*pageParam\s*=\s*0\s*\}\)\s*=>\s*\{[\s\S]*?\}\s*;?/m,
    (m) => m + `

  // Build all map points under current filters (paged)
  async function buildMapPoints() {
    const pageSz = 1000;
    const pts: { lat:number; lon:number }[] = [];

    // Resolve species sighting ids if species selected
    let speciesIds: number[] = [];
    if (typeof species !== 'undefined' && species) {
      speciesIds = await getSpeciesSightingIds(species);
      if (!speciesIds.length) {
        setMapPoints([]);
        return;
      }
    }

    for (let from = 0; from < 50000; from += pageSz) {
      let q = supabase
        .from("sightings")
        .select("pk_sighting_id,latitude,longitude")
        .order("pk_sighting_id", { ascending: true })
        .range(from, from + pageSz - 1);

      // apply SAME filters as list
      if (population) q = q.ilike("population", \`%\${population}%\`);
      if (island && island !== "all") q = q.ilike("island", \`%\${island}%\`);
      if (location) q = q.eq("sitelocation", location);
      if (photographer) q = q.ilike("photographer", \`%\${photographer}%\`);
      if (minMantas !== "") q = q.gte("total_mantas", minMantas as any);
      if (date) q = q.eq("sighting_date", date);
      if (species && speciesIds.length) q = q.in("pk_sighting_id", speciesIds);

      const { data, error } = await q;
      if (error) { console.error("[buildMapPoints] fetch error", error); break; }
      const chunk = (data ?? [])
        .map((r:any) => ({ lat: Number(r?.latitude), lon: Number(r?.longitude) }))
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      pts.push(...chunk);

      if ((data ?? []).length < pageSz) break;
    }
    setMapPoints(pts);
  }
`
  );
}

/**
 * Ensure the View Map button triggers buildMapPoints before opening.
 * Replace onClick={() => setShowMap(true)} with an async call.
 */
s = s.replace(
  /onClick=\{\(\)\s*=>\s*setShowMap\(\s*true\s*\)\s*\}/g,
  'onClick={() => { buildMapPoints().then(() => setShowMap(true)); }}'
);

/**
 * Ensure <MapDialog ... points={mapPoints} ... />
 */
if (!/MapDialog[^>]*points=/.test(s)) {
  // Add points prop if missing
  s = s.replace(
    /<MapDialog([^>]*)\/>/,
    '<MapDialog$1 points={mapPoints} />'
  );
} else {
  s = s.replace(/<MapDialog([^>]*)points=\{[^}]+\}([^>]*)\/>/, '<MapDialog$1points={mapPoints}$2/>');
}

/**
 * Add species to the dependencies for any useEffect that reopens/rebuilds map points on filter change (optional).
 * If you have a dedicated effect watching `open` to build points, inject species there as dep.
 * This is a best-effort; harmless if not present.
 */
s = s.replace(/\[open(,[^\]]*)?\]/g, (m) => (m.includes('species') ? m : m.replace(/\]$/, ', species]')));

fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Sightings.tsx: Map now builds points with species & current filters; View Map triggers build first');
console.log('  • Backup:', bak);
