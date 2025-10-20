const fs = require('fs');
const file = 'src/pages/AddSightingPage.tsx';
if (!fs.existsSync(file)) { console.error('Missing ' + file); process.exit(1); }
let s = fs.readFileSync(file, 'utf8');
const orig = s;

// 1) Ensure hook import exists once
if (!/from\s+['"]@\/hooks\/useInjectAdminSave['"]/.test(s)) {
  const imports = [...s.matchAll(/^import[\s\S]*?;[^\S\r\n]*$/gm)];
  const idx = imports.length ? (imports[imports.length - 1].index + imports[imports.length - 1][0].length) : 0;
  s = s.slice(0, idx) + `\nimport { useInjectAdminSave } from "@/hooks/useInjectAdminSave";\n` + s.slice(idx);
}

// 2) Insert a call right after the component opens (idempotent)
if (!/USE_INJECT_ADMIN_SAVE_CALL/.test(s)) {
  const sigs = [
    /export\s+default\s+function\s+AddSightingPage\s*\([^)]*\)\s*{/,
    /function\s+AddSightingPage\s*\([^)]*\)\s*{/,
    /const\s+AddSightingPage[^{=]*=\s*\([^)]*\)\s*=>\s*{/
  ];
  let m, idx = -1;
  for (const re of sigs) { m = s.match(re); if (m) { idx = m.index + m[0].length; break; } }
  if (idx !== -1) {
    s = s.slice(0, idx) + `\n  /* USE_INJECT_ADMIN_SAVE_CALL */\n  useInjectAdminSave();\n` + s.slice(idx);
  }
}

if (s !== orig) {
  fs.writeFileSync(file, s);
  console.log('Patched ' + file);
} else {
  console.log('No changes needed.');
}
