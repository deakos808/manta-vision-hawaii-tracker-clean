import fs from 'node:fs';

/* ---- A) AddSightingPage.tsx: wrap vBest image + Match under it, dedupe Match ---- */
(function patchAdd() {
  const f = 'src/pages/AddSightingPage.tsx';
  if (!fs.existsSync(f)) { console.log('skip', f); return; }
  let s = fs.readFileSync(f, 'utf8');
  let o = s;

  // 1) If the vBest ternary begins with an <img .../> but has no wrapping "( ... )" after '?', wrap it.
  if (/\{vBest\s*\?\s*<img/.test(s) && !/\{vBest\s*\?\s*\(/.test(s)) {
    s = s.replace(/\{vBest\s*\?\s*<img/, '{vBest ? (<div className="flex flex-col items-start"><img');
    // 2) Close the wrapper right before the ":" else-branch.
    s = s.replace(/:\s*<div\s+className="w-14 h-14/, '</div>) : <div className="w-14 h-14');
  }

  // 3) If two consecutive "Match" links ended up side-by-side, collapse to one.
  s = s.replace(/>Match<\/div>\s*<div[^>]*>Match<\/div>/g, '>Match</div>');

  if (s !== o) { fs.writeFileSync(f, s); console.log('patched', f); }
  else { console.log('no changes', f); }
})();

/* ---- B) UnifiedMantaModal.tsx: remove any modal-level Match buttons & empty JSX blocks ---- */
(function patchUnified() {
  const f = 'src/components/mantas/UnifiedMantaModal.tsx';
  if (!fs.existsSync(f)) { console.log('skip', f); return; }
  let s = fs.readFileSync(f, 'utf8');
  let o = s;

  // Remove empty JSX like {cond && ()}
  s = s.replace(/\{\s*\(\s*[^)]*?\)\s*&&\s*\(\s*\)\s*\}/g, '');
  s = s.replace(/\{\s*[^{}()]*?&&\s*\(\s*\)\s*\}/g, '');

  // Remove any <button>Match</button> left in the modal
  s = s.replace(/<button\b[^>]*>\s*Match\s*<\/button>/g, '');

  if (s !== o) { fs.writeFileSync(f, s); console.log('patched', f); }
  else { console.log('no changes', f); }
})();
