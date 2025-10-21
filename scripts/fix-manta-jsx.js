const fs = require('fs');
const file = 'src/pages/AddSightingPage.tsx';
if (!fs.existsSync(file)) {
  console.error('❌ File not found:', file);
  process.exit(1);
}
let s = fs.readFileSync(file, 'utf8');
let orig = s;
let changed = false;

/**
 * 1) Replace the first-column block inside each <li> so that the thumbnails
 *    and the measured summary are wrapped in a SINGLE container.
 *
 *    Before (broken):
 *      <div className="flex items-center gap-1">...</div>
 *      <div className="text-[11px] text-muted-foreground">Measured DL ...</div>
 *      </div>  <-- stray close
 *
 *    After (fixed):
 *      <div className="flex flex-col gap-1">
 *        <div className="flex items-center gap-1">...</div>
 *        { _measure ? <div className="text-[11px] text-muted-foreground">DL ...</div> : null }
 *      </div>
 */

// Step A: if we find the "Measured DL:" variant we previously inserted, replace the whole pair.
const brokenBlock = /<div className="flex items-center gap-1">([\s\S]*?)<\/div>\s*<div className="text-\[11px\]\s+text-muted-foreground">[\s\S]*?Measured DL:[\s\S]*?<\/div>\s*<\/div>/m;
if (brokenBlock.test(s)) {
  s = s.replace(brokenBlock, (_m, inner) =>
    `<div className="flex flex-col gap-1">
  <div className="flex items-center gap-1">
${inner}
  </div>
  {(m as any)._measure ? (
    <div className="text-[11px] text-muted-foreground">
      DL: {(m as any)._measure.dlCm.toFixed(2)} cm · DW: {(m as any)._measure.dwCm.toFixed(2)} cm
    </div>
  ) : null}
</div>`
  );
  changed = true;
}

// Step B: If the summary exists *without* the stray close, also wrap correctly
const twoSiblings = /<div className="flex items-center gap-1">([\s\S]*?)<\/div>\s*<div className="text-\[11px\]\s+text-muted-foreground">([\s\S]*?)(DL:|Measured DL:)[\s\S]*?<\/div>/m;
if (!changed && twoSiblings.test(s)) {
  s = s.replace(twoSiblings, (_m, inner) =>
    `<div className="flex flex-col gap-1">
  <div className="flex items-center gap-1">
${inner}
  </div>
  {(m as any)._measure ? (
    <div className="text-[11px] text-muted-foreground">
      DL: {(m as any)._measure.dlCm.toFixed(2)} cm · DW: {(m as any)._measure.dwCm.toFixed(2)} cm
    </div>
  ) : null}
</div>`
  );
  changed = true;
}

// Step C: Make sure the first column thumbnails are big enough (w-14 h-14), keep header width widened.
if (s.includes('w-10 h-10')) {
  s = s.replace(/w-10 h-10/g, 'w-14 h-14');
  changed = true;
}
if (s.includes('grid-cols-[96px_minmax(0,1fr)_120px_160px_100px]')) {
  s = s.replace(/grid-cols-\[96px_minmax\(0,1fr\)_120px_160px_100px\]/g,
                'grid-cols-[120px_minmax(0,1fr)_120px_160px_100px]');
  changed = true;
}

// Step D: Ensure size renders with two decimals via a helper.
if (!s.includes('function formatCm(')) {
  s = s.replace(
    /const TIME_OPTIONS = buildTimes\(5\);\s*/,
    (m) => m + `\n// format size to two decimals in cm\nfunction formatCm(v:any){ const n=Number(v); return Number.isFinite(n)? \`\${n.toFixed(2)} cm\` : "—"; }\n`
  );
  changed = true;
}
const sizeCell = /<div className="truncate">\{[^}]*m\.size[^}]*\}\s*<\/div>/;
if (sizeCell.test(s)) {
  s = s.replace(sizeCell, '<div className="truncate">{formatCm(m.size)}</div>');
  changed = true;
}

// Step E: add a tiny probe so we can confirm the path
if (!s.includes('[AddSighting] jsx fix applied')) {
  s = s.replace(
    'useEffect(()=>{ console.log("[AddSighting] mounted"); }, []);',
    'useEffect(()=>{ console.log("[AddSighting] mounted"); console.log("[AddSighting] jsx fix applied"); }, []);'
  );
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, s);
  console.log('✅ Fixed JSX structure and kept UI tweaks in', file);
} else {
  console.log('ℹ️ No changes required (patterns not found or already fixed).');
}
