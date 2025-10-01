import fs from 'node:fs';

/* ---------- helper ---------- */
function insertOnce(src, needle, inject, after=true) {
  if (src.includes(inject.trim())) return src;
  const idx = src.indexOf(needle);
  if (idx === -1) return src;
  const cut = after ? idx + needle.length : idx;
  return src.slice(0, cut) + inject + src.slice(cut);
}

/* ---------- A) AddSightingPage.tsx ---------- */
(function patchAddSighting() {
  const f = 'src/pages/AddSightingPage.tsx';
  if (!fs.existsSync(f)) { console.log('skip', f); return; }
  let s = fs.readFileSync(f, 'utf8');
  const before = s;

  // 1) Ensure MatchModal import
  if (!/MatchModal/.test(s)) {
    s = insertOnce(
      s,
      'import',
      'import MatchModal from "@/components/mantas/MatchModal";\n',
      false
    );
  }

  // 2) Ensure state for page-level match modal
  if (!/pageMatchOpen/.test(s)) {
    const sig = 'export default function AddSightingPage';
    const i = s.indexOf(sig);
    if (i !== -1) {
      const brace = s.indexOf('{', i);
      if (brace !== -1) {
        const inject =
`
// --- page-level catalog match modal state ---
const [pageMatchOpen, setPageMatchOpen] = useState(false);
const [pageMatchUrl, setPageMatchUrl] = useState<string | null>(null);
const [pageMatchMeta, setPageMatchMeta] = useState<{name: string | null, gender: string | null, ageClass: string | null, meanSize: number | null}>({name: null, gender: null, ageClass: null, meanSize: null});
`;
        s = s.slice(0, brace + 1) + inject + s.slice(brace + 1);
      }
    }
  }

  // 3) Wrap the best-ventral thumbnail with a column and place a single "Match" under it
  // Handle common pattern: {vBest ? <img .../> : <div ...>no V</div>}
  // We convert to: {vBest ? (<div><img .../><div onClick=...>Match</div></div>) : <div ...>no V</div>}
  if (/\{vBest\s*\?\s*<img[\s\S]*?\/>\s*:\s*<div[\s\S]*?>\s*no V\s*<\/div>\s*\}/.test(s) && !/Match click @row/.test(s)) {
    s = s.replace(
      /\{vBest\s*\?\s*(<img[\s\S]*?\/>)\s*:\s*(<div[\s\S]*?>\s*no V\s*<\/div>)\s*\}/,
      `{vBest ? (<div className="flex flex-col items-start">$1<div className="text-[11px] text-blue-600 underline cursor-pointer mt-1"
  onClick={()=>{
    console.log('[Match click @row] vBest', vBest?.url);
    setPageMatchUrl(vBest?.url || "");
    setPageMatchMeta({ name: m.name ?? null, gender: m.gender ?? null, ageClass: m.ageClass ?? null, meanSize: m.size ?? null });
    setPageMatchOpen(true);
  }}>Match</div></div>) : $2}`
    );
  }

  // 4) If two "Match" links ended up adjacent, collapse to one
  s = s.replace(/>Match<\/div>\s*<div[^>]*>Match<\/div>/g, '>Match</div>');

  // 5) Render the modal near the bottom (before closing Layout)
  if (!/\<MatchModal\b/.test(s)) {
    const anchor = '</Layout>';
    if (s.includes(anchor)) {
      const inject =
`
<MatchModal
  open={pageMatchOpen}
  onOpenChange={(o)=> setPageMatchOpen(o)}
  leftUrl={pageMatchUrl || ""}
  aMeta={{ name: pageMatchMeta.name, gender: pageMatchMeta.gender, ageClass: pageMatchMeta.ageClass, meanSize: pageMatchMeta.meanSize }}
  onChoose={(id)=>{ console.log('[MatchModal onChoose]', id); setPageMatchOpen(false); }}
  onNoMatch={()=>{ console.log('[MatchModal onNoMatch]'); setPageMatchOpen(false); }}
/>
`;
      s = s.replace(anchor, inject + '\n' + anchor);
    }
  }

  if (s !== before) { fs.writeFileSync(f, s); console.log('patched', f); }
  else { console.log('no changes', f); }
})();

/* ---------- B) UnifiedMantaModal.tsx (cleanups) ---------- */
(function patchUnified() {
  const f = 'src/components/mantas/UnifiedMantaModal.tsx';
  if (!fs.existsSync(f)) { console.log('skip', f); return; }
  let s = fs.readFileSync(f, 'utf8');
  const before = s;

  // Remove empty JSX like {cond && ()}
  s = s.replace(/\{\s*\(\s*[^)]*?\)\s*&&\s*\(\s*\)\s*\}/g, '');
  s = s.replace(/\{\s*[^{}()]*?&&\s*\(\s*\)\s*\}/g, '');

  // Remove any lingering modal-level Match buttons
  s = s.replace(/<button\b[^>]*>\s*Match\s*<\/button>/g, '');

  if (s !== before) { fs.writeFileSync(f, s); console.log('patched', f); }
  else { console.log('no changes', f); }
})();
