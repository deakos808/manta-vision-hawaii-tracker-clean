const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

/**
 * Replace the whole async function handleOpenMap() { ... } body
 * with a version that applies species & other filters and waits before opening.
 */
const fnRe = /async\s+function\s+handleOpenMap\s*\([\s\S]*?\n\}\n/;
if (!fnRe.test(s)) {
  console.error('✖ Could not locate async function handleOpenMap() in Sightings.tsx');
  process.exit(1);
}

const newFn = `
async function handleOpenMap() {
  try { setMapPoints([]); } catch {}
  // Precompute sighting ids for catalog filter (if any)
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

  // Precompute sighting ids for species (if any)
  let speciesIds: number[] = [];
  if (species) {
    speciesIds = await getSpeciesSightingIds(species);
    if (!speciesIds.length) {
      setMapPoints([]);
      setShowMap(true);
      return;
    }
  }

  // Fetch all point rows with SAME filters as the list (paged)
  const pts: { lat: number; lon: number }[] = [];
  const pageSz = 1000;
  for (let from = 0; from < 50000; from += pageSz) {
    let q = supabase
      .from("sightings")
      .select("pk_sighting_id,latitude,longitude")
      .order("pk_sighting_id", { ascending: true })
      .range(from, from + pageSz - 1);

    if (island !== "all") q = q.ilike("island", \`%\${island}%\`);
    if (photographer) q = q.ilike("photographer", \`%\${photographer}%\`);
    if (location) q = q.eq("sitelocation", location.trim());
    if (population) q = q.ilike("population", \`%\${population}%\`);
    if (minMantas !== "") q = q.gte("total_mantas", minMantas as any);
    if (dateKnown) q = q.not("sighting_date", "is", null);
    if (dateUnknown) q = q.is("sighting_date", null);
    if (date) q = q.eq("sighting_date", date);
    if (catSightingIds.length) q = q.in("pk_sighting_id", catSightingIds);
    if (species && speciesIds.length) q = q.in("pk_sighting_id", speciesIds);
    if (sightingIdParam) q = q.eq("pk_sighting_id", Number(sightingIdParam));

    const { data, error } = await q;
    if (error) { console.error("[handleOpenMap] fetch error", error); break; }

    const chunk = (data ?? [])
      .map((r: any) => ({ lat: Number(r?.latitude), lon: Number(r?.longitude) }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    pts.push(...chunk);

    if ((data ?? []).length < pageSz) break;
  }

  setMapPoints(pts);
  setShowMap(true);
}
`;

s = s.replace(fnRe, newFn + "\n");

fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ handleOpenMap(): now species-aware & rebuilds points before opening modal');
console.log('  • Backup:', bak);
