const fs = require('fs');
const p = 'src/pages/browse_data/Mantas.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
const bak = p + '.bak.' + Date.now();
let s = fs.readFileSync(p, 'utf8');

// imports
if (!s.includes('useIsAdmin')) {
  const imports = s.match(/^(?:import[\s\S]*?;\s*)+/m);
  if (imports) s = s.slice(0, imports[0].length) + `import { useIsAdmin } from "@/lib/isAdmin";\n` + s.slice(imports[0].length);
  else s = `import { useIsAdmin } from "@/lib/isAdmin";\n` + s;
}
if (!s.includes('import { Trash2 } from "lucide-react";')) {
  s = s.replace(/^(import .*?;\s*)+/, (m)=> m + `import { Trash2 } from "lucide-react";\n`);
}
if (!s.includes('deleteManta')) {
  s = s.replace(/from "@\/lib\/supabase";\n/, (m)=> m + `import { deleteManta } from "@/lib/adminApi";\n`);
}

// isAdmin
if (!s.includes('const isAdmin = useIsAdmin(')) {
  s = s.replace(/export default function MantasPage\(\)[\s\S]*?\{\n/, (m)=> m + `  const isAdmin = useIsAdmin();\n`);
}

// inject trash button into actions toolbar
s = s.replace(
  /(<div className="mt-3 flex flex-wrap items-center gap-2">)/,
  `$1
      {isAdmin && (
        <button
          className="text-red-600 text-xs underline flex items-center gap-1"
          title="Delete manta and photos"
          onClick={async () => {
            if (!confirm("Are you sure you want to delete this manta and associated photos?")) return;
            try { await deleteManta(m.pk_manta_id); window.location.reload(); }
            catch (e) { alert('Delete failed: ' + (e?.message || e)); }
          }}
        >
          <Trash2 className="h-4 w-4" /> delete
        </button>
      )}`
);

fs.copyFileSync(p, bak);
fs.writeFileSync(p, s);
console.log('✔ Patched Mantas.tsx (admin trash icon)');
console.log('  • Backup:', bak);
