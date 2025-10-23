const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

/**
 * 1) Ensure buildMapPoints clears previous points at the start.
 *    (Insert setMapPoints([]) as first line inside the function.)
 */
s = s.replace(
  /(async\s+function\s+buildMapPoints\s*\(\)\s*\{\s*)/,
  `$1
    try { setMapPoints([]); } catch {}
`
);

/**
 * 2) Insert a handleOpenMap helper that awaits buildMapPoints() before opening the modal.
 *    We'll place it just after buildMapPoints definition if missing.
 */
if (!/function\s+handleOpenMap\s*\(/.test(s)) {
  s = s.replace(
    /(async\s+function\s+buildMapPoints[\s\S]*?\}\s*)/,
    `$1

  async function handleOpenMap() {
    try {
      await buildMapPoints();
    } catch (e) {
      console.error("[handleOpenMap] buildMapPoints error", e);
      // still open modal to avoid user confusion, but with last points / empty set
    }
    setShowMap(true);
  }
`
  );
}

/**
 * 3) Replace any inline onClick={() => setShowMap(true)} with onClick={handleOpenMap}
 *    (covers most common patterns).
 */
s = s.replace(/onClick=\{\(\)\s*=>\s*setShowMap\(\s*true\s*\)\s*\}/g, 'onClick={handleOpenMap}');

// Save
fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ View Map now opens AFTER species-filtered points load; points cleared before fetch');
console.log('  • Backup:', bak);
