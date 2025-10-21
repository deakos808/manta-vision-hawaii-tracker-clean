import fs from 'fs';
const f = 'src/components/mantas/MatchModal.tsx';
if (!fs.existsSync(f)) { console.log('missing', f); process.exit(0); }
let s = fs.readFileSync(f, 'utf8');
const before = s;

const start = s.indexOf('interface Props');
if (start >= 0) {
  const next = s.indexOf('const EMPTY_FILTERS', start);
  if (next > start) {
    const hasBrace = s.slice(start, next).includes('}');
    if (!hasBrace) {
      s = s.slice(0, next) + '}\n\n' + s.slice(next);
    }
  }
}

if (s !== before) {
  fs.writeFileSync(f, s);
  console.log('patched', f);
} else {
  console.log('no changes', f);
}
