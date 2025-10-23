const fs = require('fs');
const p = 'src/pages/browse_data/Photos.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
const bak = p + '.bak.' + Date.now();
let s = fs.readFileSync(p, 'utf8');

// 1) Remove the hook import if present
s = s.replace(/^\s*import\s*\{\s*useIsAdmin\s*\}\s*from\s*["']@\/lib\/isAdmin["'];?\s*\n/gm, '');

// 2) Remove the line 'const isAdmin = useIsAdmin();' (allow leading spaces)
s = s.replace(/^\s*const\s+isAdmin\s*=\s*useIsAdmin\s*\(\s*\)\s*;\s*\n/gm, '');

// Save
fs.copyFileSync(p, bak);
fs.writeFileSync(p, s);
console.log('✔ Cleaned duplicate isAdmin in Photos.tsx');
console.log('  • Backup:', bak);
