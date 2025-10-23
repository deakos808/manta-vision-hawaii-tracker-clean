const fs = require('fs');
const p = 'src/components/sightings/SightingFilterBox.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

// Only insert once
if (/DEBUG_BIG_ISLAND/.test(s)) {
  console.log('(debug block already present)');
  process.exit(0);
}

// Find the "countIf" declaration and append a debug effect right after it
const re = /const\s+countIf\s*=\s*\(next:\s*Partial<Filters>\)\s*=>\s*[\s\S]*?;\s*/m;
const m = s.match(re);
if (!m) {
  console.error('✖ Could not find countIf() block in SightingFilterBox.tsx.');
  process.exit(1);
}

const debugBlock = `

// DEBUG_BIG_ISLAND
useEffect(() => {
  if (!rows || !rows.length) return;
  try {
    // what-if totals using the same rowMatch predicate
    const popBI = rows.reduce((acc, r) => acc + (rowMatch(r, { ...filters, population: 'Big Island', island: '', location: '' }), 0), 0);
    const islBI = rows.reduce((acc, r) => acc + (rowMatch(r, { ...filters, population: '', island: 'Big Island', location: '' }), 0), 0);

    // safer logging using countIf helper too (equivalent)
    const popBI2 = countIf({ population: 'Big Island', island: '', location: '' });
    const islBI2 = countIf({ population: '', island: 'Big Island', location: '' });

    // show a tiny sample of islands seen in rows to detect variants
    const islSet = new Set(rows.map(r => (r.island ?? '').toString().trim()).filter(Boolean));
    const islSample = Array.from(islSet).slice(0, 10);

    console.log('[DEBUG ⚙️] rows=', rows.length,
      '| pop(Big Island)=', popBI2, '(raw=', popBI, ')',
      '| island(Big Island)=', islBI2, '(raw=', islBI, ')',
      '| active filters=', filters,
      '| island sample=', islSample
    );
  } catch (e) {
    console.error('[DEBUG] error in Big Island debug', e);
  }
}, [rows, population, island, location, photographer, minMantas, date]);
`;

const s2 = s.replace(re, m[0] + debugBlock);
fs.writeFileSync(bak, s);
fs.writeFileSync(p, s2);
console.log('✔ Injected debug block (Big Island what-if) into SightingFilterBox.tsx');
console.log('  • Backup:', bak);
