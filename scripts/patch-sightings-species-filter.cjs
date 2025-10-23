const fs = require('fs');
const p = 'src/pages/browse_data/Sightings.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

/**
 * 1) Ensure species state exists (const [species, setSpecies] = useState(""))
 */
if (!/const\s*\[\s*species\s*,\s*setSpecies\s*\]/.test(s)) {
  s = s.replace(
    /const\s*\[\s*dateUnknown[\s\S]*?=\s*useState\(false\);\s*/,
    m => m + `\n    // Species (from catalog via mantas)\n    const [species, setSpecies] = useState("");\n`
  );
}

/**
 * 2) Ensure species is in React Query key (so list reloads when changed)
 */
s = s.replace(
  /queryKey:\s*\[[^\]]*\]/m,
  (m) => m.includes('species') ? m : m.replace(/\]$/, ', species ]')
);

/**
 * 3) Insert helper function `getSpeciesSightingIds` after the section marker
 */
if (!/function\s+getSpeciesSightingIds\s*\(/.test(s)) {
  s = s.replace(
    /\/\/\s*--------\s*Data loader\s*\(paged\)\s*--------\s*/m,
    `// -------- Data loader (paged) --------

    // Helper: get all pk_sighting_id that have ANY manta whose catalog.species ILIKE %spec%
    async function getSpeciesSightingIds(spec: string): Promise<number[]> {
      const pageSz = 1000;
      const seen = new Set<number>();
      for (let from = 0; from < 50000; from += pageSz) {
        const { data, error } = await supabase
          .from("mantas")
          .select("fk_sighting_id,catalog:fk_catalog_id(species)")
          .range(from, from + pageSz - 1);
        if (error) {
          console.error("[getSpeciesSightingIds] mantas error", error);
          break;
        }
        const chunk = (data ?? []).filter((mr: any) =>
          (mr?.catalog?.species ?? "").toString().toLowerCase().includes(spec.toLowerCase())
        );
        for (const mr of chunk) {
          const sid = Number(mr?.fk_sighting_id ?? 0);
          if (sid) seen.add(sid);
        }
        if ((data ?? []).length < pageSz) break;
      }
      return Array.from(seen);
    }\n\n`
  );
}

/**
 * 4) In fetchSightings(), compute speciesIds when species set, and apply to q
 */
s = s.replace(
  /const\s+fetchSightings\s*=\s*async\s*\(\{\s*pageParam\s*=\s*0\s*\}\)\s*=>\s*\{\s*/m,
  `const fetchSightings = async ({ pageParam = 0 }) => {
      // Apply species via sighting-id set from mantas→catalog
      let speciesIds: number[] = [];
      if (species) {
        speciesIds = await getSpeciesSightingIds(species);
        if (!speciesIds.length) return [];
      }\n`
);

s = s.replace(
  /let\s+q\s*=\s*supabase\.from\("sightings"\)\.select\("\*"\);/,
  `let q = supabase.from("sightings").select("*");
      if (species && speciesIds.length) q = q.in("pk_sighting_id", speciesIds);`
);

/**
 * 5) Also apply species in the total-count effect (look for getTotal or the effect that sets totalCount)
 */
if (/const\s+getTotal\s*=\s*async\s*\(\)\s*=>\s*\{/.test(s)) {
  // patch inside getTotal
  s = s.replace(
    /const\s+getTotal\s*=\s*async\s*\(\)\s*=>\s*\{\s*[\s\S]*?let\s+q\s*=\s*supabase\.from\("sightings"\)\.select\("\*",\s*\{\s*count:\s*"exact",\s*head:\s*true\s*\}\);\s*/m,
    (m) => m + `\n      // species filter for total count\n      if (species) {\n        const ids = await getSpeciesSightingIds(species);\n        if (!ids.length) { setTotalCount(0); return; }\n        q = q.in("pk_sighting_id", ids);\n      }\n`
  );
} else {
  // Fallback: try to find a typical total-count effect and warn if not found.
  console.warn("⚠️ Could not find getTotal() in Sightings.tsx; species total count may not update. If you share that effect block, I can patch it too.");
}

/**
 * 6) Ensure SightingFilterBox passes species props (and not lost by earlier patches)
 */
if (!/SightingFilterBox[^>]*species=/.test(s)) {
  s = s.replace(
    /<SightingFilterBox([\s\S]*?)\/>/,
    `<SightingFilterBox$1 species={species} setSpecies={setSpecies} isAdmin={isAdmin} />`
  );
} else {
  // normalize names
  s = s.replace(/species=\{[^}]+\}/, 'species={species}');
  if (!/setSpecies=\{[^}]+\}/.test(s)) {
    s = s.replace(/species=\{species\}/, 'species={species} setSpecies={setSpecies}');
  }
  if (!/isAdmin=\{isAdmin\}/.test(s)) {
    s = s.replace(/<SightingFilterBox([^>]*)\/>/, '<SightingFilterBox$1 isAdmin={isAdmin} />');
  }
}

fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Applied species filter to list + total count in Sightings.tsx');
console.log('  • Backup:', bak);
