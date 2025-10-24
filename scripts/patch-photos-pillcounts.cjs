const fs = require('fs');
const p = 'src/pages/browse_data/Photos.tsx';
let s = fs.readFileSync(p, 'utf8');

// 1) Remove any render of "Return to Mantas" (inside or outside blue block)
s = s.replace(/^\s*<a href="\/browse\/mantas"[\s\S]*?<\/a>\s*$/m, '');

// 2) Replace the pill-count effect with a full-dataset tally (population, island, location, photo_view)
s = s.replace(
/useEffect\(\s*=>\s*\{\s*async function fetchPillCounts\(\)\s*\{[\s\S]*?}\s*fetchPillCounts\(\);\s*},\s*\[\]\);\s*/m,
`useEffect(() => {
    async function fetchPillCounts() {
      // Pull minimal columns from the full dataset and tally on the client (6716 rows is OK)
      const { data, error } = await supabase
        .from("photos_with_photo_view")
        .select("population,island,location,photo_view");
      if (error) {
        console.error("Pill fetch error:", error);
        return;
      }
      const rows = (data ?? []).map(r => ({
        population: (r.population ?? "").toString().trim(),
        island: (r.island ?? "").toString().trim(),
        location: (r.location ?? "").toString().trim(),
        view: (r.photo_view ?? "").toString().trim(),
      }));

      const tally = (key, allowed) => {
        const map = new Map();
        for (const r of rows) {
          const v = r[key];
          if (!v) continue;
          if (allowed && !allowed.includes(v)) continue;
          map.set(v, (map.get(v) || 0) + 1);
        }
        let arr = Array.from(map, ([value, count]) => ({ value, count }));
        if (allowed) {
          // keep allowed order explicitly
          arr = allowed.map(value => ({ value, count: map.get(value) || 0 }));
        } else {
          arr.sort((a, b) => a.value.localeCompare(b.value));
        }
        return arr;
      };

      setPopulationCounts(tally("population"));
      setIslandCounts(tally("island"));
      setLocationCounts(tally("location"));
      setViewCounts(tally("view", ["ventral","dorsal","other"]));
    }
    fetchPillCounts();
  }, []);`
);

// 3) Ensure search input above the panel is white (if not already)
s = s.replace(
  /(<input[^>]*className=")([^"]*)(")/,
  (m,a,b,c) => a + (/\bbg-white\b/.test(b) ? b : (b + ' bg-white')) + c
);

fs.copyFileSync(p, p + '.bak');
fs.writeFileSync(p, s);
console.log('✔ Photos pill counts use full dataset; "Return to Mantas" removed. Backup at', p + '.bak');
