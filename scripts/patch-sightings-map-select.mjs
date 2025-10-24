import fs from 'fs';

const P = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(P)) { console.error('missing', P); process.exit(1); }
let s = fs.readFileSync(P,'utf8');

if (!/function\s+handleSelectFromMap\s*\(/.test(s)) {
  const ins = s.indexOf('return (');
  if (ins !== -1) {
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
    s = s.slice(0, ins) + fn + s.slice(ins);
  }
}

s = s.replace(/<MapDialog\b([^>]*?)\/>/, (m, attrs) => (/onSelect=/.test(attrs) ? m : `<MapDialog${attrs} onSelect={handleSelectFromMap} />`));
s = s.replace(/<MapDialog\b([^>]*?)>/, (m, attrs) => (/onSelect=/.test(attrs) ? m : `<MapDialog${attrs} onSelect={handleSelectFromMap}>`));

s = s.replace(/data-sighting-id=\{s\.pk_sighting_id\}\s+data-sighting-id=\{s\.pk_sighting_id\}/g,'data-sighting-id={s.pk_sighting_id}');
if (!/data-sighting-id=\{s\.pk_sighting_id\}/.test(s)) {
  s = s.replace(/<Card\b([^>]*?)>/, (m, attrs) => `<Card${attrs} data-sighting-id={s.pk_sighting_id}>`);
}

fs.writeFileSync(P, s);
console.log('patched Sightings.tsx');
