import fs from 'fs';

function read(p){ if(!fs.existsSync(p)) throw new Error('missing '+p); return fs.readFileSync(p,'utf8') }
function write(p,s){ fs.writeFileSync(p,s) }

/* Sightings.tsx */
{
  const P = 'src/pages/browse_data/Sightings.tsx';
  let s = read(P);

  if (!/function\s+handleSelectFromMap\s*\(/.test(s)) {
    const startIdx = (() => {
      const keys = ['export default function Sightings','function Sightings','export default function BrowseSightings','export default function('];
      let pos=-1; for (const k of keys){ const i=s.indexOf(k); if(i!==-1 && (pos===-1 || i<pos)) pos=i } return pos;
    })();
    const retIdx = s.indexOf('return (', startIdx>=0?startIdx:0);
    if (retIdx !== -1) {
      const handler = `
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
    }
  }

  s = s.replace(/<MapDialog\b([^>]*?)\/>/, (m, attrs) => {
    return /onSelect=/.test(attrs) ? m : `<MapDialog${attrs} onSelect={handleSelectFromMap} />`;
  });
  s = s.replace(/<MapDialog\b([^>]*?)>/, (m, attrs) => {
    return /onSelect=/.test(attrs) ? m : `<MapDialog${attrs} onSelect={handleSelectFromMap}>`;
  });

  s = s.replace(/data-sighting-id=\{s\.pk_sighting_id\}\s+data-sighting-id=\{s\.pk_sighting_id\}/g,'data-sighting-id={s.pk_sighting_id}');
  if (!/data-sighting-id=\{s\.pk_sighting_id\}/.test(s)) {
    s = s.replace(/<Card\b([^>]*?)>/, (m, attrs) => `<Card${attrs} data-sighting-id={s.pk_sighting_id}>`);
  }

  if (!/fetchAllMapPoints\(\);\s*\}\s*,\s*\[\s*showMap/.test(s)) {
    const eff = `
  useEffect(() => {
    if (!showMap) return;
    try { fetchAllMapPoints(); } catch {}
  }, [showMap, catalogIdParam, species, speciesIds, island, location, population, dateKnown, dateUnknown, date, minMantas, photographer, sightingIdParam]);
`;
    const insertAt = s.lastIndexOf('useEffect(');
    if (insertAt !== -1) {
      const after = s.indexOf(');', insertAt);
      const pos = after !== -1 ? after+2 : s.length;
      s = s.slice(0,pos) + eff + s.slice(pos);
    } else {
      s = s + '\n' + eff;
    }
  }

  write(P,s);
}

/* MapDialog.tsx */
{
  const P = 'src/components/maps/MapDialog.tsx';
  let s = read(P);

  s = s.replace(/type\s+Props\s*=\s*{([\s\S]*?)}/, (m, body) => {
    return /onSelect\?:\s*\(sid:\s*number\)\s*=>\s*void;/.test(body) ? m : `type Props = {${body}\n  onSelect?: (sid: number) => void;\n}`;
  });
  s = s.replace(/interface\s+Props\s*{([\s\S]*?)}/, (m, body) => {
    return /onSelect\?:\s*\(sid:\s*number\)\s*=>\s*void;/.test(body) ? m : `interface Props {${body}\n  onSelect?: (sid: number) => void;\n}`;
  });

  if (!s.includes('__map_onSelect = (sid:number)')) {
    s = s.replace(/return\s*\(/, `
  useEffect(() => {
    (window as any).__map_onSelect = (sid:number) => onSelect?.(sid);
    (window as any).handleSelectFromMap = (sid:number) => onSelect?.(sid);
    return () => { try { delete (window as any).__map_onSelect; delete (window as any).handleSelectFromMap; } catch {} };
  }, [onSelect]);

  return (
`);
  }

  s = s.replace(/onclick="handleSelectFromMap\(/g,'onclick="window.__map_onSelect(');

  write(P,s);
}

console.log('patch-complete');
