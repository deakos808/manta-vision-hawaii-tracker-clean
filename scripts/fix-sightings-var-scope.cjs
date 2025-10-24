const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

/**
 * A. Move Admin controls above JSX once (if not already before SightingFilterBox render)
 */
if (!/const\s*\[\s*isAdmin\s*,\s*setIsAdmin\s*\]/.test(s)) {
  // if admin was removed by earlier patch, re-add it just after species state
  s = s.replace(
    /const\s*\[\s*species\s*,\s*setSpecies\s*\]\s*=\s*useState\(""\);\s*/,
    `$&

  // Admin controls
  const [isAdmin, setIsAdmin] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setIsAdmin(false); return; }
        const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        const role = data?.role ?? null;
        setIsAdmin(role === 'admin' || role === 'database_manager');
      } catch {}
    })();
  }, []);
`
  );
}

/**
 * B. Normalize data variable names in fetchSightings and getTotal so we don't have stray "data" leak.
 */
// fetchSightings: rename "{ data } = await q..." -> "{ data: dataList }"
s = s.replace(
  /const\s*\{\s*data\s*\}\s*=\s*await\s*q\s*\.\s*order\([\s\S]*?\)\s*;/m,
  (m)=> m.replace(/\{[^}]*data[^}]*\}/, '{ data: dataList }')
);
// and fix downstream references to "data" in the mapped enrichment
s = s.replace(
  /\(\s*data\s*\?\?\s*\[\]\s*\)\.map\(/g,
  '(dataList ?? []).map('
);

/**
 * C. getTotal: rename "{ count } = await q" uses but ensure we do not use "data" here.
 * (We don't change logic; just ensure we don't accidentally reference a stray "data".)
 */
s = s.replace(
  /const\s*\{\s*count\s*\}\s*=\s*await\s*q\s*;/m,
  'const { count: totalCountVal } = await q;'
);
s = s.replace(/setTotalCount\(count\s*\?\?\s*0\)/g, 'setTotalCount(totalCountVal ?? 0)');

/**
 * D. Ensure handleOpenMap exists only once and is species-aware.
 * Replace any duplicate definitions to the canonical version.
 */
const fnRe = /async\s+function\s+handleOpenMap\s*\([\s\S]*?\}\s*\n/;
s = s.replace(fnRe, `
async function handleOpenMap() {
  try { setMapPoints([]); } catch {}
  // Precompute catalog constraint
  let catSightingIds: number[] = [];
  if (catalogIdParam) {
    const { data: catRows } = await supabase
      .from("mantas")
      .select("fk_sighting_id")
      .eq("fk_catalog_id", Number(catalogIdParam));
    catSightingIds = (catRows ?? []).map((r: any) => r.fk_sighting_id);
    if (!catSightingIds.length) {
      setMapPoints([]);
      setShowMap(true);
      return;
    }
  }
  // Precompute species constraint
  let speciesIds: number[] = [];
  if (species) {
    speciesIds = await getSpeciesSightingIds(species);
    if (!speciesIds.length) {
      setMapPoints([]);
      setShowMap(true);
      return;
    }
  }
  // Fetch paged points with SAME filters
  const pts: { lat:number; lon:number }[] = [];
  const pageSz = 1000;
  for (let from = 0; from < 50000; from += pageSz) {
    let qp = supabase
      .from("sightings")
      .select("pk_sighting_id,latitude,longitude")
      .order("pk_sighting_id", { ascending: true })
      .range(from, from + pageSz - 1);

    if (island !== "all") qp = qp.ilike("island", \`%\${island}%\`);
    if (photographer) qp = qp.ilike("photographer", \`%\${photographer}%\`);
    if (location) qp = qp.eq("sitelocation", location.trim());
    if (population) qp = qp.ilike("population", \`%\${population}%\`);
    if (minMantas !== "") qp = qp.gte("total_mantas", minMantas as any);
    if (dateKnown) qp = qp.not("sighting_date", "is", null);
    if (dateUnknown) qp = qp.is("sighting_date", null);
    if (date) qp = qp.eq("sighting_date", date);
    if (catSightingIds.length) qp = qp.in("pk_sighting_id", catSightingIds);
    if (species && speciesIds.length) qp = qp.in("pk_sighting_id", speciesIds);
    if (sightingIdParam) qp = qp.eq("pk_sighting_id", Number(sightingIdParam));

    const { data: dataPoints, error: errPoints } = await qp;
    if (errPoints) { console.error("[handleOpenMap] fetch error", errPoints); break; }
    const chunk = (dataPoints ?? [])
      .map((r:any) => ({ lat: Number(r?.latitude), lon: Number(r?.longitude) }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    pts.push(...chunk);
    if ((dataPoints ?? []).length < pageSz) break;
  }
  setMapPoints(pts);
  setShowMap(true);
}
\n`);

/**
 * E. Ensure any inline modal open uses handleOpenMap.
 */
s = s.replace(/onClick=\{\(\)\s*=>\s*setShowMap\(\s*true\s*\)\s*\}/g, 'onClick={handleOpenMap}');

fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Normalized variable names, fixed handleOpenMap, routed View Map opens; moved admin if needed');
console.log('  • Backup:', bak);
