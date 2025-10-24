import fs from 'fs';

const P = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(P)) { console.error('missing', P); process.exit(1); }
let s = fs.readFileSync(P, 'utf8');

// 1) Remove any existing function handleSelectFromMap (wherever it was inserted)
s = s.replace(/\n\s*function\s+handleSelectFromMap\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}\s*\n/g, '\n');

// 2) Insert a top-level handler AFTER the showMap state line
const showMapIdx = s.indexOf('const [showMap, setShowMap]');
if (showMapIdx === -1) {
  console.error('Could not find showMap state to anchor insertion.');
  process.exit(1);
}
const semi = s.indexOf(';', showMapIdx);
if (semi === -1) { console.error('Could not find end of showMap line.'); process.exit(1); }

const fn = `
  function handleSelectFromMap(sid: number) {
    try { setShowMap(false); } catch {}
    const sp = new URLSearchParams(window.location.search);
    sp.set("sightingId", String(sid));
    window.history.replaceState({}, "", \`\${window.location.pathname}?\${sp.toString()}\`);
    setTimeout(() => {
      const el = document.querySelector(\`[data-sighting-id="\${sid}"]\`) as HTMLElement | null;
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }
`;

s = s.slice(0, semi + 1) + fn + s.slice(semi + 1);

// 3) Ensure MapDialog receives onSelect prop (idempotent)
s = s.replace(/<MapDialog\b([^>]*?)\/>/, (m, attrs) =>
  /onSelect=/.test(attrs) ? m : `<MapDialog${attrs} onSelect={handleSelectFromMap} />`
);
s = s.replace(/<MapDialog\b([^>]*?)>/, (m, attrs) =>
  /onSelect=/.test(attrs) ? m : `<MapDialog${attrs} onSelect={handleSelectFromMap}>`
);

// 4) Ensure a single data-sighting-id on Card
s = s.replace(/data-sighting-id=\{s\.pk_sighting_id\}\s+data-sighting-id=\{s\.pk_sighting_id\}/g, 'data-sighting-id={s.pk_sighting_id}');
if (!/data-sighting-id=\{s\.pk_sighting_id\}/.test(s)) {
  s = s.replace(/<Card\b([^>]*?)>/, (m, attrs) => `<Card${attrs} data-sighting-id={s.pk_sighting_id}>`);
}

fs.writeFileSync(P, s);
console.log('Sightings.tsx: handler moved to top-level, MapDialog wired, Card tagged.');
