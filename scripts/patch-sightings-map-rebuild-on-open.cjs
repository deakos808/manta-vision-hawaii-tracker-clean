const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

/**
 * Ensure we have buildMapPoints(), mapPoints, showMap state as previously patched.
 * Insert a useEffect that rebuilds points whenever the modal opens or filters change.
 */

if (!/async\s+function\s+buildMapPoints\s*\(/.test(s)) {
  console.error('⚠️ buildMapPoints() not found. Please share the surrounding snippet of Sightings.tsx so I can target it precisely.');
} else {
  // Insert the effect only once
  if (!/useEffect\(\(\)\s*=>\s*\{\s*if\s*\(!showMap\)\s*return;\s*buildMapPoints\(\)/.test(s)) {
    s = s.replace(
      /async\s+function\s+buildMapPoints\s*\([\s\S]*?\}\s*\n/,
      (m) => m + `

  // When the modal opens (or filters change while open), always rebuild points for the current filters.
  useEffect(() => {
    if (!showMap) return;
    (async () => {
      // clear first so modal doesn't render stale world clusters
      try { setMapPoints([]); } catch {}
      await buildMapPoints();
    })();
  // keep in sync with list filters + species
  }, [showMap, population, island, location, photographer, minMantas, date, species]);

`
    );
  }
}

/**
 * Replace any remaining inline open handlers to use the robust handler if present.
 * We try to route everything through handleOpenMap() if it exists, else keep setShowMap(false/true) calls as fallback.
 */
if (/function\s+handleOpenMap\s*\(/.test(s)) {
  s = s.replace(/onClick=\{\(\)\s*=>\s*setShowMap\(\s*true\s*\)\s*\}/g, 'onClick={handleOpenMap}');
} else {
  // No explicit handler? At least make clicks rebuild before open.
  // Wrap inline open with buildMapPoints() then open.
  s = s.replace(
    /onClick=\{\(\)\s*=>\s*setShowMap\(\s*true\s*\)\s*\}/g,
    'onClick={() => { (async () => { try { setMapPoints([]); } catch {}; await buildMapPoints(); setShowMap(true); })(); }}'
  );
}

fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Added effect to rebuild points when modal opens; routed open handlers to rebuild before opening');
console.log('  • Backup:', bak);
