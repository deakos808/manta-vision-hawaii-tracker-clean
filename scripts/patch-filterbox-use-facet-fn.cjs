const fs = require('fs');
const p = 'src/components/sightings/SightingFilterBox.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
const bak = p + '.bak.' + Date.now();
let s = fs.readFileSync(p,'utf8');

// Ensure edgeBase helper exists
if (!s.includes('function edgeBase(')) {
  s = s.replace(
    /import { Input } from "@\/components\/ui\/input";\n/,
    '$&\nfunction edgeBase(){const e=import.meta.env.VITE_SUPABASE_EDGE_URL?.replace(/\\/$/,"");if(e)return e;const u=(import.meta.env.VITE_SUPABASE_URL||"").replace(/\\/$/,"");return u?`${u}/functions/v1`:"https://apweteosdbgsolmvcmhn.supabase.co/functions/v1";}\n'
  );
}

// Replace entire effect that sets facet arrays with one that calls the function
s = s.replace(
/useEffect\([\s\S]*?setRows\(\[\]\);\s*\}\)\(\);\s*\n\s*return\s*\(\)\s*=>\s*\{\s*alive\s*=\s*false;\s*\};\s*\n\},\s*\[population,[\s\S]*?date\]\);\s*/m,
`useEffect(() => {
  let alive = true;
  (async () => {
    try {
      const base = edgeBase();
      const body = JSON.stringify({
        population, island, location, photographer, minMantas, date
      });
      const r = await fetch(\`\${base}/facet-sightings\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });
      const j = await r.json().catch(() => ({}));
      if (!alive) return;
      if (!r.ok) { console.error("[facet] error", j); return; }
      setPopulations(j.populations || []);
      setIslands(j.islands || []);
      setLocations(j.locations || []);
      // photographers menu is admin-only; keep client-side tally or add later if needed
    } catch (e) { if (alive) console.error("[facet] fetch failed", e); }
  })();
  return () => { alive = false; };
}, [population, island, location, photographer, minMantas, date]);`
);

// remove old rows[] state block (it’s large; simplest is to null it out)
s = s.replace(/const\s*\[\s*rows\s*,\s*setRows\s*\]\s*=\s*useState<[^>]*>\(\[\]\);\s*/g, '');
s = s.replace(/const\s*values\s*=\s*useMemo\([\s\S]*?\],\s*\[rows\]\);\s*/m, '');
s = s.replace(/const\s*cascadedIslands\s*=\s*useMemo\([\s\S]*?\);\s*/m, '');
s = s.replace(/const\s*cascadedLocations\s*=\s*useMemo\([\s\S]*?\);\s*/m, '');
s = s.replace(/function\s*applyFiltersRow\([\s\S]*?\}\s*$/m, (m)=>''); // best effort remove leftover helper

// Replace menu rows to use arrays from server directly
s = s.replace(/const\s+popRows[\s\S]*?;\s*\n/, 'const popRows = populations;\n');
s = s.replace(/const\s+islRows[\s\S]*?;\s*\n/,  'const islRows = islands;\n');
s = s.replace(/const\s+locRows[\s\S]*?;\s*\n/,  'const locRows = locations;\n');

// Save
fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Filter box now uses facet-sightings results (option-specific counts)');
console.log('  • Backup:', bak);
