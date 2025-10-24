const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

/**
 * Insert the admin controls block right after the other filter states, if not already present there.
 * Then remove any later duplicate " // Admin controls" block to avoid duplicate declarations.
 */
const adminBlock =
`  // Admin controls
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
`;

if (!/const\s*\[\s*isAdmin\s*,\s*setIsAdmin\s*\]/.test(s)) {
  // put it after the last of the early filter states (we already saw species inserted near dateUnknown)
  s = s.replace(
    /const\s*\[\s*species\s*,\s*setSpecies\s*\]\s*=\s*useState\(\s*""\s*\);\s*\n/,
    (m)=> m + '\n' + adminBlock + '\n'
  );
}

// Remove any later duplicate "Admin controls" block to prevent re-declaration
s = s.replace(/[\t ]*\/\/\s*Admin controls[\s\S]*?setDeletingId\([^)]+\);\s*\}\s*$/m, '');

// In case the later admin block exists but with slightly different spacing
s = s.replace(/[\t ]*\/\/\s*Admin controls[\s\S]*?useEffect\([\s\S]*?\}\);\s*\n/, '');

// Save
fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Moved admin controls above first usage; removed later duplicate');
console.log('  • Backup:', bak);
