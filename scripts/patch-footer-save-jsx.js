const fs = require('fs');
const file = 'src/pages/AddSightingPage.tsx';
if (!fs.existsSync(file)) { console.error('Missing '+file); process.exit(1); }
let s = fs.readFileSync(file, 'utf8');
const orig = s;

// 1) Ensure util import exactly once
if (!/from\s+['"]@\/utils\/reviewSave['"]/.test(s)) {
  const imports = [...s.matchAll(/^import[\s\S]*?;[^\S\r\n]*$/gm)];
  const idx = imports.length ? (imports[imports.length-1].index + imports[imports.length-1][0].length) : 0;
  s = s.slice(0, idx) + `\nimport { saveReviewServer } from "@/utils/reviewSave";\n` + s.slice( idx );
}

// 2) Add handleSave inside component
if (!/ADMIN_HANDLE_SAVE/.test(s)) {
  const sigs = [
    /export\s+default\s+function\s+AddSightingPage\s*\([^)]*\)\s*{/,
    /function\s+AddSightingPage\s*\([^)]*\)\s*{/,
    /const\s+AddSightingPage[^{=]*=\s*\([^)]*\)\s*=>\s*{/
  ];
  let m, idx = -1;
  for (const re of sigs) { m = s.match(re); if (m) { idx = m.index + m[0].length; break; } }
  if (idx !== -1) {
    const snippet = `
  // ADMIN_HANDLE_SAVE
  const handleSave = async (e?: any) => {
    try { e?.preventDefault?.(); } catch {}
    try {
      const params = new URLSearchParams(window.location.search);
      const rid = params.get('review') ?? undefined;
      if (!rid) { alert('Not in review mode'); return; }
      await saveReviewServer(rid);
      if ((window as any).toast?.success) (window as any).toast.success('Saved');
      else alert('Saved ✓');
    } catch (err) {
      console.error('Save failed', err);
      if ((window as any).toast?.error) (window as any).toast.error('Save failed');
      else alert('Save failed');
    }
  };
`;
    s = s.slice(0, idx) + snippet + s.slice(idx);
  }
}

// 3) Insert the Save button in the JSX action row (between Cancel and Commit Review)
if (!/Save Changes<\/Button>/.test(s)) {
  const commitIdx = s.indexOf('Commit Review');
  if (commitIdx !== -1) {
    const cancelIdx = s.lastIndexOf('Cancel', commitIdx);
    if (cancelIdx !== -1) {
      const closeStart = s.indexOf('</', cancelIdx);
      const closeEnd = closeStart !== -1 ? s.indexOf('>', closeStart) : -1;
      if (closeEnd !== -1) {
        const insertPos = closeEnd + 1;
        const snippet = `\n  <Button onClick={handleSave} variant="secondary" data-admin-save="1">Save Changes</Button>\n`;
        s = s.slice(0, insertPos) + snippet + s.slice(insertPos);
      }
    }
  }
}

if (s !== orig) { fs.writeFileSync(file, s); console.log('Patched '+file); }
else { console.log('No changes needed.'); }
