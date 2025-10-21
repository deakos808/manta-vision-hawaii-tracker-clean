const fs = require('fs');
const file = 'src/pages/AddSightingPage.tsx';
if (!fs.existsSync(file)) { console.error('Missing '+file); process.exit(1); }
let s = fs.readFileSync(file, 'utf8');
const orig = s;

// 1) Ensure import of saveReviewServer
if (!/from\s+['"]@\/utils\/reviewSave['"]/.test(s)) {
  const imports = [...s.matchAll(/^import[\s\S]*?;[^\S\r\n]*$/gm)];
  const idx = imports.length ? (imports[imports.length-1].index + imports[imports.length-1][0].length) : 0;
  s = s.slice(0, idx) + `\nimport { saveReviewServer } from "@/utils/reviewSave";\n` + s.slice(idx);
}

// 2) Ensure notes state exists
if (!/\bconst\s*\[\s*notes\s*,\s*setNotes\s*\]\s*=\s*useState\s*\(/.test(s)) {
  // insert after phone state
  s = s.replace(
    /const\s*\[\s*phone\s*,\s*setPhone\s*\]\s*=\s*useState\(\s*""\s*\)\s*;\s*/,
    (m)=> m + `\n  const [notes, setNotes] = useState<string>("");\n`
  );
}

// 3) Bind Notes textarea to notes state
{
  const headerIdx = s.indexOf('<CardHeader><CardTitle>Notes</CardTitle></CardHeader>');
  if (headerIdx !== -1) {
    const ccOpen = s.indexOf('<CardContent', headerIdx);
    if (ccOpen !== -1) {
      const ccOpenEnd = s.indexOf('>', ccOpen) + 1;
      const ccClose = s.indexOf('</CardContent>', ccOpenEnd);
      if (ccClose !== -1) {
        let block = s.slice(ccOpenEnd, ccClose);
        if (!/value=\{notes\}/.test(block)) {
          block = block.replace(
            /<textarea([^>]*)\/>/,
            (_m, attrs)=> `<textarea${attrs} value={notes} onChange={(e)=>setNotes(e.target.value)} />`
          );
          // Also handle non self-closing variant
          block = block.replace(
            /<textarea([^>]*)>([\s\S]*?)<\/textarea>/,
            (_m, attrs, inner)=> `<textarea${attrs} value={notes} onChange={(e)=>setNotes(e.target.value)}></textarea>`
          );
          s = s.slice(0, ccOpenEnd) + block + s.slice(ccClose);
        }
      }
    }
  }
}

// 4) Insert handleSaveReview (before handleCommitReview if not present)
if (!/function\s+handleSaveReview\s*\(/.test(s)) {
  s = s.replace(
    /(\n\s*\/\/\s*Review actions\s*\n)/,
    `$1  async function handleSaveReview() {
    if (!reviewId) { window.alert("Not in review mode"); return; }
    const payload: any = {
      date, startTime, stopTime,
      photographer, email, phone,
      island, locationId, locationName,
      latitude: lat, longitude: lng,
      mantas,
      notes
    };
    try {
      await saveReviewServer(reviewId, payload);
      window.alert("Saved ✓");
    } catch (e) {
      console.error("[SaveReview] failed", e);
      window.alert("Save failed");
    }
  }\n\n`
  );
}

// 5) Insert Save button between Cancel and Commit Review in JSX
if (!/Save Changes<\/Button>/.test(s)) {
  // Find the Cancel button closing tag then insert after it
  const cancelTag = '>Cancel</Button>';
  const commitText = 'Commit Review';
  const cancelIdx = s.indexOf(cancelTag);
  const commitIdx = s.indexOf(commitText);
  if (cancelIdx !== -1 && commitIdx !== -1 && cancelIdx < commitIdx) {
    const insertPos = cancelIdx + cancelTag.length;
    const snippet = `\n            <Button variant="secondary" onClick={handleSaveReview}>Save Changes</Button>`;
    s = s.slice(0, insertPos) + snippet + s.slice(insertPos);
  }
}

if (s !== orig) { fs.writeFileSync(file, s); console.log('Patched ' + file); }
else { console.log('No changes needed.'); }
