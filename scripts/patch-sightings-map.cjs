const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p, 'utf8');
const bak = p + '.bak.' + Date.now();

/* 1) Add mapPoints state right after showMap if missing */
if (!/const\s*\[\s*mapPoints\s*,\s*setMapPoints\s*\]/.test(s)) {
  s = s.replace(
    /const\s*\[\s*showMap\s*,\s*setShowMap\s*\]\s*=\s*useState\(false\);\s*\n/,
    m => m + `  const [mapPoints, setMapPoints] = useState<{ lat: number; lon: number }[]>([]);\n`
  );
}

/* 2) Add handleOpenMap() that refetches all coords under current filters */
if (!/async\s+function\s+handleOpenMap\(/.test(s)) {
  s = s.replace(
    /const\s*\[\s*showMap\s*,\s*setShowMap\s*\]\s*=\s*useState\(false\);\s*\n(?:\s*const\s*\[\s*mapPoints[\s\S]*?;\s*\n)?/,
    m => m + `
  async function handleOpenMap() {
    // Build a Supabase query that reuses the SAME filters as the list,
    // but fetches ONLY latitude/longitude and WITHOUT pagination
    // so the modal reflects the full found set.
    let catSightingIds: number[] = [];
    if (catalogIdParam) {
      const { data } = await supabase
        .from("mantas")
        .select("fk_sighting_id")
        .eq("fk_catalog_id", Number(catalogIdParam));
      catSightingIds = (data ?? []).map((r: any) => r.fk_sighting_id);
      if (!catSightingIds.length) {
        setMapPoints([]);
        setShowMap(true);
        return;
      }
    }

    let q = supabase
      .from("sightings")
      .select("latitude,longitude")
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (island !== "all") q = q.ilike("island", \`%\${island}%\`);
    if (photographer) q = q.ilike("photographer", \`%\${photographer}%\`);
    if (location) q = q.eq("sitelocation", location.trim());
    if (population) q = q.ilike("population", \`%\${population}%\`);
    if (minMantas !== "") q = q.gte("total_mantas", minMantas as any);
    if (dateKnown) q = q.not("sighting_date", "is", null);
    if (dateUnknown) q = q.is("sighting_date", null);
    if (date) q = q.eq("sighting_date", date);
    if (catSightingIds.length) q = q.in("pk_sighting_id", catSightingIds);
    if (sightingIdParam) q = q.eq("pk_sighting_id", Number(sightingIdParam));

    // generous cap; adjust if needed
    q = q.limit(20000);

    const { data, error } = await q;
    if (error) {
      console.error("[map] fetch error", error);
      setMapPoints([]);
    } else {
      const pts = (data ?? [])
        .map((r: any) => ({ lat: Number(r.latitude), lon: Number(r.longitude) }))
        .filter((p: any) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      setMapPoints(pts);
    }
    setShowMap(true);
  }
`
  );
}

/* 3) Replace any inline onClick that opens the map with handleOpenMap */
s = s.replace(/onClick=\{\(\)\s*=>\s*setShowMap\(true\)\}/g, 'onClick={handleOpenMap}');

/* 4) Force MapDialog points prop to mapPoints */
s = s.replace(/<MapDialog([^>]*)points=\{[^}]+\}([^>]*)\/>/g, '<MapDialog$1points={mapPoints}$2/>');

/* 5) If points prop not found in the MapDialog tag, add it */
if (!/<MapDialog[^>]*points=\{mapPoints\}/.test(s)) {
  s = s.replace(/<MapDialog([^>]*)\/>/, '<MapDialog$1 points={mapPoints} />');
}

/* Save backup and file */
fs.writeFileSync(bak, s);
fs.writeFileSync(p, s);
console.log('✔ Sightings.tsx patched to load full coords on View Map');
console.log('  • Backup:', bak);
