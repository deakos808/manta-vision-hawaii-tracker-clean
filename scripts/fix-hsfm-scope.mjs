import fs from 'fs';

const P = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(P)) { console.error('missing', P); process.exit(1); }
let s = fs.readFileSync(P,'utf8');

const marker = '// [map-bridge:handler]';
const mIdx = s.indexOf(marker);

function insertTopLevel(fnBlock){
  if (/^\s*function\s+handleSelectFromMap\s*\(/m.test(s)) return;
  const retIdx = s.indexOf('return (');
  if (retIdx !== -1) s = s.slice(0, retIdx) + fnBlock + s.slice(retIdx);
}

if (mIdx !== -1) {
  const funcStart = mIdx;
  const closeBrace = s.indexOf('\n', s.indexOf('}', funcStart));
  const funcBlock = s.slice(funcStart, closeBrace > -1 ? closeBrace+1 : s.length);

  const speciesClose = '}, [species]);';
  const effectCloseIdx = s.indexOf(speciesClose, funcStart);
  if (effectCloseIdx !== -1) {
    s = s.slice(0, funcStart) + s.slice(closeBrace > -1 ? closeBrace+1 : s.length);
    const afterEffect = effectCloseIdx + speciesClose.length;
    const fnTop = '\n' + funcBlock.replace(marker, '') + '\n';
    s = s.slice(0, afterEffect) + fnTop + s.slice(afterEffect);
  } else {
    insertTopLevel('\n' + funcBlock.replace(marker, '') + '\n');
    s = s.replace(funcBlock, '');
  }
} else {
  if (!/^\s*function\s+handleSelectFromMap\s*\(/m.test(s)) {
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
    insertTopLevel(fn);
  }
}

fs.writeFileSync(P, s);
console.log('handleSelectFromMap moved to component scope');
