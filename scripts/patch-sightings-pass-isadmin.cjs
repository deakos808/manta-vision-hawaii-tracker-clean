const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();
if (!/SightingFilterBox[^>]*isAdmin=\{isAdmin\}/.test(s)) {
  s = s.replace(/<SightingFilterBox([\s\S]*?)\/>/, '<SightingFilterBox$1 isAdmin={isAdmin} />');
  fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
  fs.writeFileSync(p, s);
  console.log('✔ Passed isAdmin to SightingFilterBox in Sightings.tsx');
  console.log('  • Backup:', bak);
} else {
  console.log('(isAdmin already passed)');
}
