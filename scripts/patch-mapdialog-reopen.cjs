const fs = require('fs');
const p = 'src/components/maps/MapDialog.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

// 1) Ensure we have sizeTick(map) helper; if not present, add a simple one
if (!/function\s+sizeTick\s*\(/.test(s)) {
  s = s.replace(/export default function MapDialog\([\s\S]*?\)\s*\{/,
    (m)=> m + `
  function sizeTick(map: any) {
    setTimeout(() => { try { map.invalidateSize ? map.invalidateSize() : map.resize(); } catch {} }, 0);
    setTimeout(() => { try { map.invalidateSize ? map.invalidateSize() : map.resize(); } catch {} }, 250);
  }
`);
}

// 2) Add an effect that runs when "open" flips true: call sizeTick on existing map
if (!/useEffect\(\(\)\s*=>\s*\{\s*\/\/ open tick/.test(s)) {
  s = s.replace(/export default function MapDialog\([\s\S]*?\)\s*\{/, (m)=> m + `
  // open tick: if a map exists, nudge it after dialog animation
  useEffect(() => {
    if (open && mapRef.current?.map) {
      sizeTick(mapRef.current.map);
    }
  }, [open]);
`);
}

// 3) Ensure cleanup when dialog closes (remove map instance)
// Find the cleanup in the main effect and also add a separate close cleanup
if (!/\/\/ cleanup on close \(separate\)/.test(s)) {
  s = s.replace(/return\s*\(\)\s*=>\s*\{\s*if\s*\(!open\s*&&\s*mapRef\.current\?\.map\)\s*\{[\s\S]*?mapRef\.current\s*=\s*null;\s*\}\s*\};/, (m)=> m);
  // add or replace a dedicated close effect
  s += `
  // cleanup on close (separate)
  useEffect(() => {
    if (!open && mapRef.current?.map) {
      try { mapRef.current.map.remove(); } catch {}
      mapRef.current = null;
    }
  }, [open]);
`;
}

// Save
fs.writeFileSync(bak, s);
fs.writeFileSync(p, s);
console.log('✔ Patched MapDialog.tsx for reopen size/cleanup');
console.log('  • Backup:', bak);
