const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
let s = fs.readFileSync(p,'utf8');

// 0) Fix accidental double comma in query key (prevents subtle issues)
s = s.replace('sightingIdParam,,', 'sightingIdParam,');

// 1) Import the trash icon
if (!s.includes('Trash2')) {
  s = s.replace(
    /import \{ Button \} from "@\/components\/ui\/button";/,
    'import { Button } from "@/components/ui/button";\nimport { Trash2 } from "lucide-react";'
  );
}

// 2) Add admin state + role loader + delete handler (only if not present)
if (!s.includes('handleDeleteSighting')) {
  s = s.replace(
    /const \[showMap, setShowMap\] = useState\(false\);\n/,
`const [showMap, setShowMap] = useState(false);

// Admin controls
const [isAdmin, setIsAdmin] = useState(false);
const [deletingId, setDeletingId] = useState<number | null>(null);
useEffect(() => {
  (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsAdmin(false); return; }
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      const role = data?.role ?? null;
      setIsAdmin(role === 'admin' || role === 'database_manager');
    } catch {}
  })();
}, []);

async function handleDeleteSighting(id: number) {
  if (!isAdmin) return;
  const ok = confirm('Are you sure you want to delete this sighting and all associated mantas and photos for this sighting ID?');
  if (!ok) return;
  setDeletingId(id);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const edgeBase = import.meta.env.VITE_SUPABASE_EDGE_URL || ((import.meta.env.VITE_SUPABASE_URL || '').replace(/\\/$/, '') + '/functions/v1');
    const resp = await fetch(edgeBase + '/delete-sighting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: \`Bearer \${token}\` } : {}) },
      body: JSON.stringify({ pk_sighting_id: id })
    });
    if (!resp.ok) {
      const t = await resp.text().catch(()=> '');
      alert('Delete failed: ' + resp.status + (t ? (' — ' + t) : ''));
      return;
    }
    // Easiest: reload to reflect changes
    window.location.reload();
  } finally {
    setDeletingId(null);
  }
}
`
  );
}

// 3) Inject the red trash button into each card (right side, centered on md+)
s = s.replace(
  /<div className="text-sm space-y-2 md:w-1\/2">/,
  `<div className="text-sm space-y-2 md:w-1/2">
                    {isAdmin && (
                      <div className="flex justify-end md:self-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDeleteSighting(s.pk_sighting_id)}
                          disabled={deletingId === s.pk_sighting_id}
                          title="Delete sighting"
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </div>
                    )}`
);

// Save backup + write
fs.copyFileSync(p, p + '.bak');
fs.writeFileSync(p, s);
console.log('✔ Sightings.tsx patched: admin delete UI + role gating + confirm. Backup at', p + '.bak');
