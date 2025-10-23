const fs = require('fs');
const p = 'src/components/maps/MapDialog.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

// Inline body that was previously sizeTick(map)
const inline = `setTimeout(() => { try { map.invalidateSize ? map.invalidateSize() : map.resize(); } catch {} }, 0);
          setTimeout(() => { try { map.invalidateSize ? map.invalidateSize() : map.resize(); } catch {} }, 250);`;

// Replace all sizeTick(map) occurrences
s = s.replace(/sizeTick\(\s*map\s*\)\s*;?/g, inline);

// Remove the helper declaration if present
s = s.replace(/function\s+sizeTick\s*\(\s*map\s*:\s*any\s*\)\s*\{\s*[\s\S]*?\}\s*/g, '');

// Save
fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Inlined map resize calls and removed helper from MapDialog.tsx');
console.log('  • Backup:', bak);
