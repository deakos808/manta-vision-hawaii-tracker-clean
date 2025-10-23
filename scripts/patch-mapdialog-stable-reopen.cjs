const fs = require('fs');
const p = 'src/components/maps/MapDialog.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
const bak = p + '.bak.' + Date.now();
let s = fs.readFileSync(p,'utf8');

// 1) Ensure we import/use useState/useEffect/useRef (already present)
if (!/useState/.test(s) || !/useEffect/.test(s) || !/useRef/.test(s)) {
  console.warn('! Unexpected imports; patch assumes useState/useEffect/useRef are present.');
}

// 2) Add a "openReady" flag to defer init slightly after open renders
if (!/const\s*\[\s*openReady\s*,\s*setOpenReady\s*\]\s*=\s*useState\(/.test(s)) {
  s = s.replace(
    /export default function MapDialog\([\s\S]*?\)\s*\{\n/,
    (m)=> m + `  const [openReady, setOpenReady] = useState(false);\n`
  );
}

// 3) Manage openReady when open changes
if (!/useEffect\(\(\)\s*=>\s*\{\s*if\s*\(open\)/.test(s)) {
  s = s.replace(
    /useEffect\([\s\S]*?setMode/,
    (m)=> m // keep existing choose-engine effect
  );
  // add new effect to toggle openReady and clear container on close
  s += `
  // Defer init until dialog has mounted content
  useEffect(() => {
    if (open) {
      setOpenReady(false);
      // microtask/RAF chain to wait for dialog layout
      Promise.resolve().then(() => requestAnimationFrame(() => setOpenReady(true)));
    } else {
      setOpenReady(false);
      // ensure old map is removed and container cleared
      if (mapRef.current?.map) { try { mapRef.current.map.remove(); } catch {} mapRef.current = null; }
      if (containerRef.current) { try { containerRef.current.innerHTML = ''; } catch {} }
      // also reset engine decision so we recompute at next open
      setMode('none');
    }
  }, [open]);
`;
}

// 4) Adjust main init effect to depend on openReady instead of raw open
s = s.replace(
  /useEffect\(\(\)\s*=>\s*\{\s*const el = .*?\[open, mode.*?\];/s,
  (block)=> block.replace(/\[open,\s*mode/g, '[openReady, mode').replace(/\(!open\b/g, '(!openReady')
);

// 5) Before init, force-clear container
s = s.replace(
  /const el = containerRef\.current;\s*if\s*\(!el\)\s*return;/,
  (m)=> m + `\n    // clear container before new init\n    try { el.innerHTML = ''; } catch {}\n`
);

// 6) After map is created, bump sizes multiple times
s = s.replace(
  /\/\/ Fit to all points[\s\S]*?sizeTick\(map\);/,
  (m)=> m.replace(/sizeTick\(map\);/, `
          // size bumps
          setTimeout(() => { try { map.invalidateSize ? map.invalidateSize() : map.resize(); } catch {} }, 0);
          setTimeout(() => { try { map.invalidateSize ? map.invalidateSize() : map.resize(); } catch {} }, 150);
          setTimeout(() => { try { map.invalidateSize ? map.invalidateSize() : map.resize(); } catch {} }, 350);
`)
);
s = s.replace(
  /\/\/ Fit & render[\s\S]*?sizeTick\(map\);/,
  (m)=> m.replace(/sizeTick\(map\);/, `
          // size bumps
          setTimeout(() => { try { map.invalidateSize ? map.invalidateSize() : map.resize(); } catch {} }, 0);
          setTimeout(() => { try { map.invalidateSize ? map.invalidateSize() : map.resize(); } catch {} }, 150);
          setTimeout(() => { try { map.invalidateSize ? map.invalidateSize() : map.resize(); } catch {} }, 350);
`)
);

// Save
fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ MapDialog.tsx patched for stable reopen (defer + teardown + resize)');
console.log('  • Backup:', bak);
