const fs = require('fs');
const p = 'src/components/sightings/SightingFilterBox.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
const bak = p + '.bak.' + Date.now();
let s = fs.readFileSync(p,'utf8');

// Ensure we import supabase (already there)
if (!/from "@\/lib\/supabase"/.test(s)) {
  s = s.replace(
    /import { Input } from "@\/components\/ui\/input";\n/,
    'import { Input } from "@/components/ui/input";\nimport { supabase } from "@/lib/supabase";\n'
  );
}

// Ensure edgeBase & anonKey helpers exist
if (!/function\s+edgeBase\(\)/.test(s)) {
  s = s.replace(
    /import { Input } from "@\/components\/ui\/input";\n/,
    '$&\nfunction edgeBase(){const e=import.meta.env.VITE_SUPABASE_EDGE_URL?.replace(/\\/$/,"");if(e)return e;const u=(import.meta.env.VITE_SUPABASE_URL||"").replace(/\\/$/,"");return u?`${u}/functions/v1`:"https://apweteosdbgsolmvcmhn.supabase.co/functions/v1";}\n'
  );
}
if (!/function\s+anonKey\(\)/.test(s)) {
  s = s.replace(/function\s+edgeBase\(\)[\s\S]*?\}\n/, (m)=> m + `function anonKey(){return import.meta.env.VITE_SUPABASE_ANON_KEY || "";}\n`);
}

// Replace facet fetch block to include Bearer token
s = s.replace(
  /const base = edgeBase\(\);\s*const body = JSON\.stringify\(\{[\s\S]*?date\s*,?\s*\}\);\s*const r = await fetch\(\`\\\$\{base\}\/facet-sightings\`,\s*\{[\s\S]*?body\s*\}\);\s*const j = await r\.json\(\)\.catch\(\(\)\s*=>\s*\(\{\}\)\);\s*if\s*\(!alive\)\s*return;/m,
  `const base = edgeBase();
        const body = JSON.stringify({ population, island, location, photographer, minMantas, date });
        const { data: sess } = await supabase.auth.getSession();
        const token = sess?.session?.access_token || "";
        const r = await fetch(\`\${base}/facet-sightings\`, {
          method: "POST",
          mode: "cors",
          headers: {
            "Content-Type": "application/json",
            "apikey": anonKey(),
            ...(token ? { "Authorization": \`Bearer \${token}\` } : {})
          },
          body
        });
        const j = await r.json().catch(() => ({}));
        if (!alive) return;`
);

// Save
fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Added real Bearer token + apikey to facet-sightings fetch');
console.log('  • Backup:', bak);
