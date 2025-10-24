import fs from 'fs';

function read(p){ return fs.readFileSync(p,'utf8'); }
function write(p,s){ fs.writeFileSync(p,s); }

//
// --- Patch Sightings.tsx ---
//
const sightP = 'src/pages/browse_data/Sightings.tsx';
let s = read(sightP);

// (A) Ensure the handler exists inside the component
if (!/handleSelectFromMap\s*\(/.test(s)) {
  const markers = [
    'export default function Sightings',
    'function Sightings',
    'export default function BrowseSightings',
    'export default function(',
  ];
  let start = -1;
  for (const m of markers) { const i = s.indexOf(m); if (i !== -1 && (start === -1 || i < start)) start = i; }
  const ret = start === -1 ? s.indexOf('return (') : s.indexOf('return (', start);
  const handler = `
  // [map-bridge:handler]
  const handleSelectFromMap = React.useCallback((sid: number) => {
    try { setShowMap(false); } catch {}
    const sp = new URLSearchParams(window.location.search);
    sp.set("sightingId", String(sid));
    window.history.replaceState({}, "", \`\${window.location.pathname}?\${sp.toString()}\`);
    const el = document.querySelector(\`[data-sighting-id="\${sid}"]\`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
`;
  if (ret !== -1) {
    s = s.slice(0, ret) + handler + s.slice(ret);
    console.log(' - inserted handleSelectFromMap');
  } else {
    console.log(' ! could not locate insertion point for handler; continuing');
  }
}

// (B) Make sure MapDialog gets the handler as a prop
s = s.replace(/<MapDialog\b([^>]*?)>/, (m, attrs) => {
  if (/onSelect=/.test(attrs)) return m;               // already present
  return `<MapDialog${attrs} onSelect={handleSelectFromMap}>`;
});

// (C) Ensure a single data-sighting-id on each Card
s = s.replace(
  /data-sighting-id=\{s\.pk_sighting_id\}\s+data-sighting-id=\{s\.pk_sighting_id\}/g,
  'data-sighting-id={s.pk_sighting_id}'
);
if (!/data-sighting-id=\{s\.pk_sighting_id\}/.test(s)) {
  s = s.replace(/<Card\b([^>]*?)>/, (m, attrs) => `<Card${attrs} data-sighting-id={s.pk_sighting_id}>`);
}

write(sightP, s);
console.log('[OK] Sightings.tsx patched');

//
// --- Patch MapDialog.tsx ---
//
const mapP = 'src/components/maps/MapDialog.tsx';
let ms = read(mapP);

// (D) Ensure Props has onSelect?: (id:number)=>void
ms = ms.replace(/interface\s+Props\s*{([^}]*)}/s, (m, body) => {
  if (/\bonSelect\?:\s*\(id:\s*number\)\s*=>\s*void;?/.test(body)) return m;
  return `interface Props {${body}\n  onSelect?: (id: number) => void;\n}`;
});

// (E) Add a bridge that popup HTML can call safely
if (!ms.includes('// [map-bridge:onSelect]')) {
  ms = ms.replace(/return\s*\(/, `
  // [map-bridge:onSelect]
  useEffect(() => {
    (window as any).__map_onSelect = (sid:number) => onSelect?.(sid);
    (window as any).handleSelectFromMap = (sid:number) => onSelect?.(sid); // back-compat
    return () => {
      try { delete (window as any).__map_onSelect; delete (window as any).handleSelectFromMap; } catch {}
    };
  }, [onSelect]);

  return (
  `);
}

// (F) Normalize inline onclick in popup HTML
ms = ms.replace(/onclick="handleSelectFromMap\(/g, 'onclick="window.__map_onSelect(');

write(mapP, ms);
console.log('[OK] MapDialog.tsx patched');
