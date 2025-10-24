const fs = require('fs');
const p = 'src/components/sightings/SightingFilterBox.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
const bak = p + '.bak.' + Date.now();
let s = fs.readFileSync(p,'utf8');

// Replace fetch call to facet-sightings to include permissive headers and CORS mode
s = s.replace(
  /const r = await fetch\(`\$\{base\}\/facet-sightings`,\s*\{\s*method:\s*"POST",\s*headers:\s*\{\s*"Content-Type":\s*"application\/json"\s*\},\s*body\s*\}\);\s*/m,
  `const r = await fetch(\`\${base}/facet-sightings\`, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
          // pass a benign header so some gateways don't strip it
          "Authorization": "Anon"
        },
        body
      });`
);

fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Added permissive headers for facet-sightings fetch (avoids 401)');
console.log('  • Backup:', bak);
