const fs = require('fs');
const p = 'src/pages/browse_data/Catalog.tsx';
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

/* add const isAdmin = useIsAdmin(); just after component start */
if (!s.includes('const isAdmin = useIsAdmin(')) {
  s = s.replace(/export default function Catalog\(\)[\s\S]*?\{\n/, (m)=> m + `  const isAdmin = useIsAdmin();\n`);
}

/* wrap the 'change' link with {isAdmin && (...)} */
s = s.replace(
  /<div\s+className="mt-1[^"]*text-blue-500[^"]*underline[^"]*cursor-pointer"[\s\S]*?onClick=\{\(\)\s*=>\s*setSelectedCatalogId\(e\.pk_catalog_id\)\}[\s\S]*?>\s*change\s*<\/div>/g,
  (m) => `{isAdmin && (${m})}`
);

fs.copyFileSync(p, bak);
fs.writeFileSync(p, s);
console.log('✔ Catalog.tsx patched (change link hidden for non-admins)');
console.log('  • Backup:', bak);
