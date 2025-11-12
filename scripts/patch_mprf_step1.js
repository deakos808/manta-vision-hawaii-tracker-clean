const fs = require('fs');

function saveWithBackup(path, mutator) {
  const s = fs.readFileSync(path, 'utf8');
  const out = mutator(s);
  if (out !== s) fs.writeFileSync(path, out, 'utf8');
}

function ensureFiltersStateHasMprf(src) {
  const rx = /export\s+interface\s+FiltersState\s*\{([\s\S]*?)\}/m;
  return src.replace(rx, (m, body) => {
    if (/mprfAddedOnly\?:\s*boolean;?/.test(body)) return m;
    const insert = body.trimEnd() + "\n  mprfAddedOnly?: boolean;\n";
    return m.replace(body, insert);
  });
}

function moveMprfPillToAfterAgeClass(src) {
  let out = src;

  out = out.replace(/\{isAdmin\s*&&\s*\(\s*<MprfFilter[\s\S]*?\)\s*\}\s*/m, '');

  const pillBlock = [
    '        {isAdmin && (',
    '          <MprfFilter',
    '            value={!!filters.mprfAddedOnly}',
    '            onChange={(v)=>setFilters(f=>({...f, mprfAddedOnly:v}))}',
    '          />',
    '        )}',
    ''
  ].join('\n');

  const ageHook = /(\{renderMenu\("Age Class",\s*"age_class",\s*\[\.\.AGES\],\s*ageCounts\)\}\s*)/m;
  if (!ageHook.test(out)) return out;
  out = out.replace(ageHook, (m, g1) => g1 + '\n' + pillBlock);
  return out;
}

function ensureCatalogRowHasFlag(src) {
  const rx = /type\s+CatalogRow\s*=\s*\{([\s\S]*?)\}/m;
  return src.replace(rx, (m, body) => {
    if (/is_mprf_added\?:\s*boolean\s*\|\s*null;?/.test(body)) return m;
    const insert = body.trimEnd() + "\n\n  is_mprf_added?: boolean | null;\n";
    return m.replace(body, insert);
  });
}

function ensureEmptyFiltersHasFlag(src) {
  const rx = /const\s+EMPTY_FILTERS:\s*FiltersState\s*=\s*\{([\s\S]*?)\};/m;
  return src.replace(rx, (m, body) => {
    if (/mprfAddedOnly\s*:\s*false/.test(body)) return m;
    const insert = body.replace(/\}\s*$/, '  mprfAddedOnly: false,\n}');
    return m.replace(body, insert);
  });
}

function addClientFilterCondition(src) {
  const rx = /const\s+rows\s*=\s*catalog\.filter\(\s*\(c\)\s*=>\s*([\s\S]*?)\)\s*;\s*rows\.sort/m;
  return src.replace(rx, (m, predicate) => {
    if (predicate.includes('!filters.mprfAddedOnly')) return m;
    const injected = predicate.replace(/\)\s*$/m, ' && (!filters.mprfAddedOnly || c.is_mprf_added === true))');
    return m.replace(predicate, injected);
  });
}

function widenRange(src) {
  const rx = /(let\s+q\s*=\s*supabase\.from\(\s*"catalog_with_photo_view"\s*\)\.select\(\s*"\*"\s*\)\s*;)/m;
  if (!rx.test(src)) return src;
  if (/q\s*=\s*q\.range\(\s*0\s*,\s*50000\s*\)/.test(src)) return src;
  return src.replace(rx, '$1\n    q = q.range(0, 50000);');
}

saveWithBackup('src/components/catalog/CatalogFilterBox.tsx', (s) => {
  let out = s;
  out = ensureFiltersStateHasMprf(out);
  out = moveMprfPillToAfterAgeClass(out);
  return out;
});

saveWithBackup('src/pages/browse_data/Catalog.tsx', (s) => {
  let out = s;
  out = ensureCatalogRowHasFlag(out);
  out = ensureEmptyFiltersHasFlag(out);
  out = addClientFilterCondition(out);
  out = widenRange(out);
  return out;
});
