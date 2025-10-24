import fs from 'fs';

const P = 'src/components/maps/MapDialog.tsx';
if (!fs.existsSync(P)) { console.error('missing', P); process.exit(1); }
let s = fs.readFileSync(P,'utf8');

// Add bridge once: popup HTML can call window.__map_onSelect(id)
if (!s.includes('__map_onSelect = (sid:number)') && !s.includes('__map_onSelect = (sid: number)')) {
  s = s.replace(/return\s*\(/, `
  useEffect(() => {
    (window as any).__map_onSelect = (sid:number) => onSelect?.(sid);
    (window as any).handleSelectFromMap = (sid:number) => onSelect?.(sid);
    return () => { try { delete (window as any).__map_onSelect; delete (window as any).handleSelectFromMap; } catch {} };
  }, [onSelect]);

  return (
`);
  fs.writeFileSync(P, s);
  console.log('MapDialog.tsx bridge added');
} else {
  console.log('MapDialog.tsx bridge already present');
}
