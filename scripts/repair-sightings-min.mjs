import fs from 'fs';

const P = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(P)) { console.error('missing', P); process.exit(1); }
let s = fs.readFileSync(P,'utf8');

/* 1) Remove any broken maybeFetchMore effect(s) completely */
s = s.replace(/[\r\n]+\s*useEffect\(\s*\(\)\s*=>\s*{\s*[^]*?maybeFetchMore\(\);\s*return\s*=>\s*{[^]*?}\s*,\s*\[[^\]]*?\]\s*\);\s*/g, '\n');

/* 2) Insert a correct maybeFetchMore effect after the quickFiltered declaration */
const qIdx = s.indexOf('const quickFiltered');
if (qIdx !== -1) {
  const semi = s.indexOf(';', qIdx);
  const insertPos = semi !== -1 ? semi + 1 : qIdx + 1;
  const eff = `
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
  if (!s.includes('async function maybeFetchMore()')) {
    s = s.slice(0, insertPos) + eff + s.slice(insertPos);
  }
}

/* 3) Ensure handleSelectFromMap exists at component scope (before first "return (") */
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

/* 4) Ensure refresh-pins effect exists once (when modal is open and filters change) */
if (!s.includes('fetchAllMapPoints(); } catch {}')) {
  const beforeReturn = s.indexOf('\n    return (');
  const eff2 = `
    useEffect(() => {
      if (!showMap) return;
      try { fetchAllMapPoints(); } catch {}
    }, [showMap, catalogIdParam, species, speciesIds, island, location, population, dateKnown, dateUnknown, date, minMantas, photographer, sightingIdParam]);
`;
  s = s.slice(0, beforeReturn) + eff2 + s.slice(beforeReturn);
}

/* 5) Ensure MapDialog receives onSelect and Card has a single data attribute */
s = s.replace(/<MapDialog\b([^>]*?)\/>/, (m, attrs) => (/onSelect=/.test(attrs) ? m : `<MapDialog${attrs} onSelect={handleSelectFromMap} />`));
s = s.replace(/<MapDialog\b([^>]*?)>/, (m, attrs) => (/onSelect=/.test(attrs) ? m : `<MapDialog${attrs} onSelect={handleSelectFromMap}>`));
s = s.replace(/data-sighting-id=\{s\.pk_sighting_id\}\s+data-sighting-id=\{s\.pk_sighting_id\}/g,'data-sighting-id={s.pk_sighting_id}');
if (!/data-sighting-id=\{s\.pk_sighting_id\}/.test(s)) {
  s = s.replace(/<Card\b([^>]*?)>/, (m, attrs) => `<Card${attrs} data-sighting-id={s.pk_sighting_id}>`);
}

fs.writeFileSync(P, s);
console.log('Sightings.tsx repaired');
