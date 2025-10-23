const fs = require('fs');
const p = 'src/components/sightings/SightingFilterBox.tsx';
if (!fs.existsSync(p)) { console.error('✖ File not found:', p); process.exit(1); }
let s = fs.readFileSync(p,'utf8');
const bak = p + '.bak.' + Date.now();

// Remove the generic RadioList helper to avoid confusion with wrong setter
s = s.replace(/const\s+RadioList[\s\S]*?\);\n\n/, '');

// Species pill: replace its block to use setSpecies directly
s = s.replace(
  /\{\/\* Species \(NEW\) \*\/\}[\s\S]*?<Pill[\s\S]*?<\/Pill>/m,
  `
        {/* Species (NEW) */}
        <Pill label={\`Species\${species ? \`: \${species}\` : ""}\`} active={!!species}>
          {speciesRows.map(r => (
            <label key={r.value} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/50 text-sm cursor-pointer">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={species === r.value}
                  onCheckedChange={() => setSpecies(species === r.value ? "" : r.value)}
                />
                {r.value}
              </div>
              <span className="text-xs text-muted-foreground">{r.count}</span>
            </label>
          ))}
        </Pill>
  `
);

// Population pill: use setPopulation directly
s = s.replace(
  /\{\/\* Population \*\/\}[\s\S]*?<Pill[\s\S]*?<\/Pill>/m,
  `
        {/* Population */}
        <Pill label={\`Population\${population ? \`: \${population}\` : ""}\`} active={!!population}>
          {popRows.map(r => (
            <label key={r.value} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/50 text-sm cursor-pointer">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={population === r.value}
                  onCheckedChange={() => setPopulation(population === r.value ? "" : r.value)}
                />
                {r.value}
              </div>
              <span className="text-xs text-muted-foreground">{r.count}</span>
            </label>
          ))}
        </Pill>
  `
);

// Island pill: use setIsland directly
s = s.replace(
  /\{\/\* Island \*\/\}[\s\S]*?<Pill[\s\S]*?<\/Pill>/m,
  `
        {/* Island */}
        <Pill label={\`Island\${island && island !== "all" ? \`: \${island}\` : ""}\`} active={!!island && island !== "all"}>
          {islRows.map(r => (
            <label key={r.value} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/50 text-sm cursor-pointer">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={island === r.value}
                  onCheckedChange={() => setIsland(island === r.value ? "" : r.value)}
                />
                {r.value}
              </div>
              <span className="text-xs text-muted-foreground">{r.count}</span>
            </label>
          ))}
        </Pill>
  `
);

// Location pill: use setLocation directly
s = s.replace(
  /\{\/\* Location \*\/\}[\s\S]*?<Pill[\s\S]*?<\/Pill>/m,
  `
        {/* Location */}
        <Pill label={\`Location\${location ? \`: \${location}\` : ""}\`} active={!!location}>
          {locRows.map(r => (
            <label key={r.value} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/50 text-sm cursor-pointer">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={location === r.value}
                  onCheckedChange={() => setLocation(location === r.value ? "" : r.value)}
                />
                {r.value}
              </div>
              <span className="text-xs text-muted-foreground">{r.count}</span>
            </label>
          ))}
        </Pill>
  `
);

// Photographer admin-only pill: use setPhotographer directly if exists
s = s.replace(
  /\{\/\* Photographer — admin only \*\/\}[\s\S]*?<\/Pill>\s*\)\}/m,
  `
        {/* Photographer — admin only */}
        {props.isAdmin && (
          <Pill label={\`Photographer\${photographer ? \`: \${photographer}\` : ""}\`} active={!!photographer}>
            {phoRows.map(r => (
              <label key={r.value} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/50 text-sm cursor-pointer">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={photographer === r.value}
                    onCheckedChange={() => setPhotographer(photographer === r.value ? "" : r.value)}
                  />
                  {r.value}
                </div>
                <span className="text-xs text-muted-foreground">{r.count}</span>
              </label>
            ))}
          </Pill>
        )}
  `
);

fs.writeFileSync(bak, fs.readFileSync(p,'utf8'));
fs.writeFileSync(p, s);
console.log('✔ Rewired pills to use their own setters (fixes setCurrent error)');
console.log('  • Backup:', bak);
