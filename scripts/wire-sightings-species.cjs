const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

// 1) Insert state if missing
if (!/const\s*\[\s*species\s*,\s*setSpecies\s*\]/.test(s)) {
  s = s.replace(
    /const\s*\[\s*dateUnknown[\s\S]*?=\s*useState\(false\);\s*/,
    m => m + `\n    // Species (from catalog via mantas)\n    const [species, setSpecies] = useState("");\n`
  );
}

// 2) Pass species + setSpecies to SightingFilterBox
if (!/SightingFilterBox[^>]*species=/.test(s)) {
  s = s.replace(
    /<SightingFilterBox([\s\S]*?)\/>/,
    `<SightingFilterBox$1 species={species} setSpecies={setSpecies} />`
  );
} else {
  // ensure both props are present
  s = s.replace(/species=\{[^}]+\}/, 'species={species}');
  if (!/setSpecies=\{[^}]+\}/.test(s)) {
    s = s.replace(/species=\{species\}/, 'species={species} setSpecies={setSpecies}');
  }
}

// 3) Keep isAdmin if you’re passing it elsewhere – add back if needed
if (!/SightingFilterBox[^>]*isAdmin=\{isAdmin\}/.test(s)) {
  s = s.replace(
    /<SightingFilterBox([\s\S]*?)\/>/,
    '<SightingFilterBox$1 isAdmin={isAdmin} />'
  );
}

fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Sightings.tsx: ensured species state + setSpecies prop is wired');
console.log('  • Backup:', bak);
