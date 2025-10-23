const fs = require('fs');
const p = 'src/pages/browse_data/Photos.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
const bak = p + '.bak.' + Date.now();
let s = fs.readFileSync(p, 'utf8');

// ensure imports
if (!s.includes('import { Trash2 } from "lucide-react";')) {
  s = s.replace(/^(import .*?;\s*)+/, (m)=> m + `import { Trash2 } from "lucide-react";\n`);
}
if (!s.includes('deletePhoto')) {
  s = s.replace(/from "@\/lib\/supabase";\n/, (m)=> m + `import { deletePhoto } from "@/lib/adminApi";\n`);
}

// assume isAdmin already exists in Photos.tsx (we used earlier admin gating)
// inject a delete link below View: line
s = s.replace(
  /(<p><strong>View:<\/strong>\s*\{photo\.photo_view\}<\/p>)/g,
  `$1
          {isAdmin && (
            <div className="mt-1">
              <button
                className="text-red-600 text-xs underline flex items-center gap-1"
                onClick={async () => {
                  if (!confirm("Are you sure you want to delete this photo?")) return;
                  try { await deletePhoto(photo.pk_photo_id); window.location.reload(); }
                  catch (e) { alert('Delete failed: ' + (e?.message || e)); }
                }}
                title="Delete photo"
              >
                <Trash2 className="h-3 w-3" /> delete
              </button>
            </div>
          )}`
);

fs.copyFileSync(p, bak);
fs.writeFileSync(p, s);
console.log('✔ Patched Photos.tsx (admin photo trash icon)');
console.log('  • Backup:', bak);
