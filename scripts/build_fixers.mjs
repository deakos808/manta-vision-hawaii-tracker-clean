import fs from 'node:fs';

function patch(file, transform) {
  if (!fs.existsSync(file)) { console.log('skip', file); return; }
  const before = fs.readFileSync(file, 'utf8');
  const after  = transform(before);
  if (after !== before) { fs.writeFileSync(file, after); console.log('patched', file); }
  else { console.log('no changes', file); }
}

/* Remove empty JSX blocks:
   {(something) && ()}
   {something && ()}
*/
const removeEmptyJSX = (s) => s
  .replace(/\{\s*\(\s*[^)]*?\)\s*&&\s*\(\s*\)\s*\}/g, '')
  .replace(/\{\s*[^{}()]*?&&\s*\(\s*\)\s*\}/g, '');

patch('src/components/mantas/UnifiedMantaModal.tsx', removeEmptyJSX);
