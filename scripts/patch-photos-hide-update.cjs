const fs = require('fs');
const p = 'src/pages/browse_data/Photos.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
const bak = p + '.bak.' + Date.now();
let s = fs.readFileSync(p, 'utf8');

/* import hook */
if (!s.includes(`useIsAdmin`)) {
  const imports = s.match(/^(?:import[\s\S]*?;\s*)+/m);
  if (imports) {
    s = s.slice(0, imports[0].length) + `import { useIsAdmin } from "@/lib/isAdmin";\n` + s.slice(imports[0].length);
  } else {
    s = `import { useIsAdmin } from "@/lib/isAdmin";\n` + s;
  }
}

/* add const isAdmin = useIsAdmin(); near the top of component */
if (!s.includes('const isAdmin = useIsAdmin(')) {
  s = s.replace(/export default function PhotosPage\(\)[\s\S]*?\{\n/, (m)=> m + `  const isAdmin = useIsAdmin();\n`);
}

/* Gate the 'update' button next to Best Manta Ventral with isAdmin */
s = s.replace(
  /\{photo\.fk_manta_id\s*\?\s*\(([\s\S]*?)\)\s*:\s*null\s*\}/g,
  `{isAdmin && photo.fk_manta_id ? ($1) : null}`
);

/* Also handle any explicit hardcoded 'update' anchors/buttons if present outside that block */
s = s.replace(
  /(<button[^>]*title="Update best manta ventral photo"[^>]*>[\s\S]*?update[\s\S]*?<\/button>)/g,
  `{isAdmin && $1}`
);

fs.copyFileSync(p, bak);
fs.writeFileSync(p, s);
console.log('✔ Photos.tsx patched (update button hidden for non-admins)');
console.log('  • Backup:', bak);
