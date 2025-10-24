const fs = require('fs');
const p = 'src/components/sightings/SightingFilterBox.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
const bak = p + '.bak.' + Date.now();
let s = fs.readFileSync(p,'utf8');

// 1) Ensure we have a small helper to read the anon key
if (!/function\s+anonKey\(\)/.test(s)) {
  s = s.replace(
    /function\s+edgeBase\(\)[\s\S]*?\}\n/,
    (m)=> m + `function anonKey(){return import.meta.env.VITE_SUPABASE_ANON_KEY || "";}\n`
  );
}

// 2) Replace the fetch to facet-sightings to include apikey and drop Bearer
s = s.replace(
  /const r = await fetch\(\`\\\$\{base\}\/facet-sightings\`,\s*\{\s*method:\s*"POST",[\s\S]*?headers:\s*\{[\s\S]*?\},\s*body\s*\}\);\s*/m,
  `const r = await fetch(\`\${base}/facet-sightings\`, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey()
        },
        body
      });`
);

// Save
fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Added anon apikey header to facet-sightings fetch (Sightings filter box)');
console.log('  • Backup:', bak);
