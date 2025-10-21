const fs = require('fs');
const f = 'src/components/mantas/UnifiedMantaModal.tsx';
if (!fs.existsSync(f)) { console.log('missing', f); process.exit(0); }
let s = fs.readFileSync(f, 'utf8');
let o = s;

s = s.replace(/\{\s*\(\s*p\.view\s*===\s*["']ventral["']\s*&&\s*p\.isBestVentral\s*\)\s*&&\s*\(\s*\)\s*\}/g, '');
s = s.replace(/\{\s*p\.view\s*===\s*["']ventral["']\s*&&\s*p\.isBestVentral\s*&&\s*\(\s*\)\s*\}/g, '');
s = s.replace(/\{\s*\(\s*\)\s*\}/g, '');
s = s.replace(/\n\s*<div className="text-xs text-blue-600 underline cursor-pointer mt-1"[^>]*>\s*Match\s*<\/div>\s*\n/g, '\n');

if (s !== o) { fs.writeFileSync(f, s); console.log('patched', f); } else { console.log('no changes', f); }
