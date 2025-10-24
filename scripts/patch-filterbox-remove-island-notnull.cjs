const fs = require('fs');
const p = 'src/components/sightings/SightingFilterBox.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
const bak = p + '.bak.' + Date.now();
let s = fs.readFileSync(p,'utf8');

// Remove ".not('island','is', null)" from the rows fetch
s = s.replace(
  /\.not\(\s*["']island["']\s*,\s*["']is["']\s*,\s*null\s*\)\s*/g,
  ''
);

// Optionally lift the cap a bit (if present) to be safe
s = s.replace(/\.limit\(\s*50000\s*\)/g, '.limit(100000)');

fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Removed island IS NOT NULL filter from rows fetch');
console.log('  • Backup:', bak);
