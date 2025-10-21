const fs = require('fs');
const file = 'src/pages/AddSightingPage.tsx';
if (!fs.existsSync(file)) { console.error('Missing ' + file); process.exit(1); }
let s = fs.readFileSync(file, 'utf8');
const orig = s;

// 1) Ensure util import
if (!/from\s+['"]@\/utils\/reviewSave['"]/.test(s)) {
  const imports = [...s.matchAll(/^import[\s\S]*?;[^\S\r\n]*$/gm)];
  const idx = imports.length ? (imports[imports.length-1].index + imports[imports.length-1][0].length) : 0;
  s = s.slice(0, idx) + `\nimport { saveReviewServer } from "@/utils/reviewSave";\n` + s.slice(idx);
}

// 2) Insert hook and handler inside the component (idempotent)
if (!/ADMIN_SAVE_HOOK/.test(s)) {
  const sigs = [
    /export\s+default\s+function\s+AddSightingPage\s*\([^)]*\)\s*{/,
    /function\s+AddSightingPage\s*\([^)]*\)\s*{/,
    /const\s+AddSightingPage[^{=]*=\s*\([^)]*\)\s*=>\s*{/
  ];
  let m, idx = -1;
  for (const re of sigs) { m = s.match(re); if (m) { idx = m.index + m[0].length; break; } }
  if (idx !== -1) {
    const snippet = `
  // ADMIN_SAVE_HOOK
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inReview = !!params.get('review');
    if (!inReview) return;

    const findBtn = (rx) => Array.from(document.querySelectorAll('button,[role="button"]')).find(el => rx.test((el.textContent||'').trim()));
    const insert = () => {
      if (document.querySelector('[data-admin-save="1"]')) return;
      const cancelBtn = findBtn(/^\\s*Cancel\\s*$/i);
      if (!cancelBtn) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-admin-save','1');
      btn.textContent = 'Save Changes';
      btn.className = (cancelBtn.className || '');
      btn.addEventListener('click', handleSave);
      cancelBtn.insertAdjacentElement('afterend', btn);
    };

    insert();
    const mo = new MutationObserver(() => insert());
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); const b = document.querySelector('[data-admin-save="1"]'); if (b) b.remove(); };
  }, []); // END ADMIN_SAVE_HOOK
`;
    s = s.slice(0, idx) + snippet + s.slice(idx);
  }
}

if (s !== orig) {
  fs.writeFileSync(file, s);
  console.log('Patched ' + file);
} else {
  console.log('No changes needed.');
}
