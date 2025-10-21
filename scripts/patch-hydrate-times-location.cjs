const fs = require('fs');
const file = 'src/pages/AddSightingPage.tsx';
if (!fs.existsSync(file)) { console.error('Missing ' + file); process.exit(1); }
let s = fs.readFileSync(file, 'utf8');
const orig = s;

/** 1) After "const p = (anyd.payload || {}) as any;" hydrate start/stop time + location + notes (if not already) */
{
  const payloadDecl = 'const p = (anyd.payload || {}) as any;';
  const at = s.indexOf(payloadDecl);
  if (at !== -1) {
    const lineEnd = s.indexOf('\n', at) + 1;
    let insert = '';
    if (!/setStartTime\(p\.startTime/.test(s)) insert += '        if (p.startTime) setStartTime(String(p.startTime));\n';
    if (!/setStopTime\(p\.stopTime/.test(s)) insert += '        if (p.stopTime) setStopTime(String(p.stopTime));\n';
    if (!/setLocationId\(String\(p\.locationId\)\)/.test(s)) insert += '        if (p.locationId) setLocationId(String(p.locationId));\n';
    if (!/setLocationName\(String\(p\.locationName\)\)/.test(s)) insert += '        if (p.locationName) setLocationName(String(p.locationName));\n';
    if (!/setNotes\(p\.notes/.test(s)) insert += '        if (p.notes) setNotes(p.notes);\n';
    if (insert) s = s.slice(0, lineEnd) + insert + s.slice(lineEnd);
  }
}

/** 2) Ensure saved locationId is present in locList options so select shows it */
if (!/AUTO_ADD_SAVED_LOCATION/.test(s)) {
  // insert after the effect that loads locations for an island (ends with "},[island]);")
  const hookEndIdx = s.indexOf('},[island]);');
  if (hookEndIdx !== -1) {
    const insAt = hookEndIdx + '},[island]);'.length;
    const snippet = `
  // AUTO_ADD_SAVED_LOCATION: make sure saved locationId is present in options
  useEffect(() => {
    try {
      if (!island || !locationId) return;
      const found = (locList || []).some(l => String(l.id) === String(locationId));
      if (!found) {
        setLocList(prev => [{ id: String(locationId), name: locationName || String(locationId), island }, ...(prev || [])]);
      }
    } catch {}
  }, [island, locationId, locationName, locList]);
`;
    s = s.slice(0, insAt) + snippet + s.slice(insAt);
  }
}

if (s !== orig) {
  fs.writeFileSync(file, s);
  console.log('Patched ' + file);
} else {
  console.log('No changes needed.');
}
