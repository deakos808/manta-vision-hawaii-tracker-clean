const fs = require('fs');
const p = 'src/components/maps/MapDialog.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }

let s = fs.readFileSync(p, 'utf8');
const bak = p + '.bak.' + Date.now();

// Replace any `const html = `<div ...>${count}</div>`;` with a plain string version
// This regex captures everything before and after ${count} inside the backticks.
s = s.replace(
  /const\s+html\s*=\s*`([^`]*?)\$\{count\}([^`]*?)`;/g,
  (m, before, after) => {
    const safeBefore = before.replace(/'/g, "\\'");
    const safeAfter  = after.replace(/'/g, "\\'");
    return `const html = '${safeBefore}' + String(count) + '${safeAfter}';`;
  }
);

// Save
fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Fixed back-tick HTML templates in MapDialog.tsx');
console.log('  • Backup:', bak);
