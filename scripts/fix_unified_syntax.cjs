const fs = require('fs');
const f = 'src/components/mantas/UnifiedMantaModal.tsx';
if (!fs.existsSync(f)) { console.log('missing', f); process.exit(0); }
let s = fs.readFileSync(f, 'utf8');
let o = s;

// remove exact broken sequence
s = s.replace(/\{\(p\.view===["']ventral["']\s*&&\s*p\.isBestVentral\)\s*&&\s*\(\)\}\{p\.view\s*===\s*["']ventral["']\s*&&\s*p\.isBestVentral\s*&&\s*\(\)\}/g, '');

// remove any {(cond with isBestVentral) && ()}
s = s.replace(/\{\s*\(?\s*[^}]*isBestVentral[^}]*\)?\s*&&\s*\(\s*\)\s*\}/g, '');

// remove any bare { () }
s = s.replace(/\{\s*\(\s*\)\s*\}/g, '');

// remove any "Match" link/button inside the modal (we will show it on AddSightingPage instead)
s = s.replace(/\n\s*<div[^>]*>\s*Match\s*<\/div>\s*\n/g, '\n');
s = s.replace(/\n\s*<button[^>]*>\s*Match\s*<\/button>\s*\n/g, '\n');

if (s !== o) { fs.writeFileSync(f, s); console.log('patched', f); } else { console.log('no changes', f); }
