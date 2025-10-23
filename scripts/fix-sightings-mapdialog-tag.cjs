const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
const s0 = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

// Replace the first <MapDialog ... /> block with a normalized tag
const re = /<MapDialog[\s\S]*?\/>/m;
const normalized = [
  '<MapDialog',
  '  open={showMap}',
  '  onOpenChange={setShowMap}',
  '  points={mapPoints}',
  '/>'
].join('\n');

if (!re.test(s0)) {
  console.error('✖ Could not find <MapDialog ... /> tag to normalize.');
  process.exit(1);
}

const s1 = s0.replace(re, normalized);

fs.writeFileSync(bak, s0);
fs.writeFileSync(p, s1);
console.log('✔ Normalized <MapDialog /> tag in Sightings.tsx');
console.log('  • Backup:', bak);
