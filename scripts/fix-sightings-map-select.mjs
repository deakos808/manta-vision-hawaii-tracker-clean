import fs from 'fs';

const P = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(P)) { console.error('File not found:', P); process.exit(1); }
let s = fs.readFileSync(P, 'utf8');

// 1) Ensure the handler exists inside the component (simple function, no imports needed)
if (!/function\s+handleSelectFromMap\s*\(/.test(s)) {
  // find the Sightings component start and its first "return ("
  const compStartIdx = (() => {
    const keys = [
      'export default function Sightings',
      'function Sightings',
      'export default function BrowseSightings',
      'export default function(',
    ];
    let pos = -1;
    for (const k of keys) { const i = s.indexOf(k); if (i !== -1 && (pos === -1 || i < pos)) pos = i; }
    return pos === -1 ? 0 : pos;
  })();
  const retIdx = s.indexOf('return (', compStartIdx);
  if (retIdx !== -1) {
    const handler = `
  // [map-bridge:handler]
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
    s = s.slice(0, retIdx) + handler + s.slice(retIdx);
    console.log('  [+] inserted handleSelectFromMap()');
  } else {
    console.warn('  [!] could not find return ( to insert handler');
  }
}

// 2) Pass onSelect={handleSelectFromMap} to <MapDialog ...> if not present
s = s.replace(/<MapDialog\b([^>]*?)>/, (m, attrs) => {
  if (/onSelect=/.test(attrs)) return m;
  return `<MapDialog${attrs} onSelect={handleSelectFromMap}>`;
});

// 3) Ensure each <Card …> has a single data-sighting-id
s = s.replace(
  /data-sighting-id=\{s\.pk_sighting_id\}\s+data-sighting-id=\{s\.pk_sighting_id\}/g,
  'data-sighting-id={s.pk_sighting_id}'
);
if (!/data-sighting-id=\{s\.pk_sighting_id\}/.test(s)) {
  s = s.replace(/<Card\b([^>]*?)>/, (m, attrs) => `<Card${attrs} data-sighting-id={s.pk_sighting_id}>`);
}

// 4) Add a “refresh pins on filter change” effect if missing
if (!/fetchAllMapPoints\(\);\s*\}\s*,\s*\[\s*showMap/.test(s)) {
  const injectAt = s.lastIndexOf('useEffect('); // drop this near other effects
  const eff = `
  useEffect(() => {
    if (!showMap) return;
    try { fetchAllMapPoints(); } catch {}
  }, [
    showMap,
    catalogIdParam,
    species, speciesIds,
    island, location, population,
    dateKnown, dateUnknown, date,
    minMantas, photographer,
    sightingIdParam
  ]);
`;
  if (injectAt !== -1) {
    // Put the new effect after the last useEffect
    const nextSemi = s.indexOf(');', injectAt);
    const pos = nextSemi !== -1 ? nextSemi + 2 : s.length;
    s = s.slice(0, pos) + eff + s.slice(pos);
    console.log('  [+] added refresh-pins effect');
  }
}

fs.writeFileSync(P, s);
console.log('[OK] Sightings.tsx patched');
