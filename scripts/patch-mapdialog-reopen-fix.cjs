const fs = require('fs');
const p = 'src/components/maps/MapDialog.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
const bak = p + '.bak.' + Date.now();
let s = fs.readFileSync(p, 'utf8');

// --- A) Ensure we clear the container & tear down the old map on close ---
if (!s.includes('CLOSE_CLEANUP_ADDED')) {
  const anchor = '}, [open, mode, points, aggregated]);';
  if (s.includes(anchor)) {
    s = s.replace(
      anchor,
      `${anchor}

// CLOSE_CLEANUP_ADDED
useEffect(() => {
  if (!open) {
    // Remove previous map instance if present
    if (mapInstanceRef.current?.remove) {
      try { mapInstanceRef.current.remove(); } catch {}
      mapInstanceRef.current = null;
    }
    // Clear container DOM
    if (mapContainerRef.current) {
      try { mapContainerRef.current.innerHTML = ''; } catch {}
    }
    // Reset engine decision so we recompute next time
    setMode('none');
  }
}, [open]);
`
    );
  }
}

// --- B) When (re)building, start with an empty container ---
s = s.replace(
  /const container = mapContainerRef\.current;[\s\S]*?if \(!container\) return;/,
  match => match + `

    // Make sure container is empty prior to new init
    try { container.innerHTML = ''; } catch {}
`
);

// --- C) Beef up resize/reflow after init for Leaflet ---
s = s.replace(
  /\/\/ Ensure correct size inside dialog[\s\S]*?mapInstanceRef\.current = map;[\s\S]*?\}\)\(\);\n\s*\}/,
  (m) => {
    // replace the "Ensure correct size..." block with multiple bumps
    const bumped = m.replace(
      /\/\/ Ensure correct size inside dialog[\s\S]*?mapInstanceRef\.current = map;/,
      `// Ensure correct size inside dialog
        const bump = () => { try { map.invalidateSize(); } catch {} };
        requestAnimationFrame(bump);
        setTimeout(bump, 120);
        setTimeout(bump, 300);

        mapInstanceRef.current = map;`
    );
    return bumped;
  }
);

// --- D) Also bump Mapbox branch resizes (if you later add a token) ---
s = s.replace(
  /setTimeout\(\(\) => \{ try \{ map\.resize\(\); \} catch \{\} \}, 0\);\s*/g,
  `setTimeout(() => { try { map.resize(); } catch {} }, 0);
          setTimeout(() => { try { map.resize(); } catch {} }, 120);
          setTimeout(() => { try { map.resize(); } catch {} }, 300);
`
);

// Save
fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ MapDialog.tsx patched for reliable reopen/resize');
console.log('  • Backup:', bak);
