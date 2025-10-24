import fs from 'fs';

function read(p){ if(!fs.existsSync(p)) throw new Error('missing '+p); return fs.readFileSync(p,'utf8') }
function write(p,s){ fs.writeFileSync(p,s) }

const P = 'src/pages/browse_data/Sightings.tsx';
let s = read(P);

/* 1) Move handleSelectFromMap out of the species useEffect if it was injected inside */
{
  const marker = '// [map-bridge:handler]';
  const insideIdx = s.indexOf(marker);
  if (insideIdx !== -1) {
    const retStr = 'return () => { alive = false; };';
    const retIdx = s.indexOf(retStr, insideIdx);
    const effectCloseStr = '}, [species]);';
    const effectCloseIdx = s.indexOf(effectCloseStr, retIdx);
    if (retIdx !== -1 && effectCloseIdx !== -1) {
      const funcBodyStart = insideIdx;
      const funcBodyEnd = retIdx; // just before return cleanup
      const funcBlock = s.slice(funcBodyStart, funcBodyEnd).trim() + '\n';
      // remove from inside effect
      s = s.slice(0, funcBodyStart) + s.slice(funcBodyEnd);
      // ensure correct ordering: keep return and close
      // then insert function right after the species effect closes
      const insertPos = s.indexOf(effectCloseStr, funcBodyStart);
      if (insertPos !== -1) {
        const after = insertPos + effectCloseStr.length;
        s = s.slice(0, after) + '\n\n' + funcBlock + s.slice(after);
      }
    }
  }
}

/* 2) Ensure handleSelectFromMap exists (if not present at component scope, insert once before the main return) */
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

/* 3) Repair the corrupted maybeFetchMore useEffect block (lines ~278–310) */
{
  const badStart = s.indexOf('\n    useEffect(() => {\n      if (isLoading) return;');
  if (badStart !== -1) {
    // find end of this effect by matching the first ']);' after badStart
    const endIdx = s.indexOf(']);', badStart);
    if (endIdx !== -1) {
      const fixedEff = `
    useEffect(() => {
      if (isLoading) return;
      let cancelled = false;
      async function maybeFetchMore() {
        await new Promise((r) => setTimeout(r, 50));
        const docH = document.documentElement.scrollHeight;
        const winH = window.innerHeight;
        if (!cancelled && hasNextPage && docH <= winH) {
          await fetchNextPage();
          if (!cancelled) maybeFetchMore();
        }
      }
      maybeFetchMore();
      return () => { cancelled = true; };
    }, [isLoading, hasNextPage, fetchNextPage, quickFiltered.length]);
`;
      s = s.slice(0, badStart) + fixedEff + s.slice(endIdx + 3);
    }
  }
}

/* 4) Ensure refresh-pins effect exists and is not duplicated */
{
  const wanted = 'useEffect(() => {\n    if (!showMap) return;\n    try { fetchAllMapPoints(); } catch {}\n  }, [showMap, catalogIdParam, species, speciesIds, island, location, population, dateKnown, dateUnknown, date, minMantas, photographer, sightingIdParam]);';
  if (!s.includes('fetchAllMapPoints(); } catch {}')) {
    // append after the maybeFetchMore effect
    const anchor = s.indexOf('maybeFetchMore();');
    const insertPos = anchor !== -1 ? s.indexOf('];', anchor) + 2 : s.indexOf('\n  return (');
    const eff = `
  useEffect(() => {
    if (!showMap) return;
    try { fetchAllMapPoints(); } catch {}
  }, [showMap, catalogIdParam, species, speciesIds, island, location, population, dateKnown, dateUnknown, date, minMantas, photographer, sightingIdParam]);
`;
    s = s.slice(0, insertPos) + eff + s.slice(insertPos);
  }
}

/* 5) Ensure MapDialog receives onSelect, and Card has a single data attribute */
s = s.replace(/<MapDialog\b([^>]*?)\/>/, (m, attrs) => (/onSelect=/.test(attrs) ? m : `<MapDialog${attrs} onSelect={handleSelectFromMap} />`));
s = s.replace(/<MapDialog\b([^>]*?)>/, (m, attrs) => (/onSelect=/.test(attrs) ? m : `<MapDialog${attrs} onSelect={handleSelectFromMap}>`));
s = s.replace(/data-sighting-id=\{s\.pk_sighting_id\}\s+data-sighting-id=\{s\.pk_sighting_id\}/g,'data-sighting-id={s.pk_sighting_id}');
if (!/data-sighting-id=\{s\.pk_sighting_id\}/.test(s)) {
  s = s.replace(/<Card\b([^>]*?)>/, (m, attrs) => `<Card${attrs} data-sighting-id={s.pk_sighting_id}>`);
}

write(P,s);

/* 6) MapDialog bridge normalization */
{
  const P2 = 'src/components/maps/MapDialog.tsx';
  if (fs.existsSync(P2)) {
    let md = read(P2);
    md = md.replace(/type\s+Props\s*=\s*{([\s\S]*?)}/, (m, body) => (/onSelect\?:\s*\(sid:\s*number\)\s*=>\s*void;/.test(body) ? m : `type Props = {${body}\n  onSelect?: (sid: number) => void;\n}`));
    md = md.replace(/interface\s+Props\s*{([\s\S]*?)}/, (m, body) => (/onSelect\?:\s*\(sid:\s*number\)\s*=>\s*void;/.test(body) ? m : `interface Props {${body}\n  onSelect?: (sid: number) => void;\n}`));
    if (!md.includes('__map_onSelect = (sid:number)')) {
      md = md.replace(/return\s*\(/, `
  useEffect(() => {
    (window as any).__map_onSelect = (sid:number) => onSelect?.(sid);
    (window as any).handleSelectFromMap = (sid:number) => onSelect?.(sid);
    return () => { try { delete (window as any).__map_onSelect; delete (window as any).handleSelectFromMap; } catch {} };
  }, [onSelect]);

  return (
`);
    }
    md = md.replace(/onclick="handleSelectFromMap\(/g,'onclick="window.__map_onSelect(');
    write(P2, md);
  }
}

console.log('repair-complete');
