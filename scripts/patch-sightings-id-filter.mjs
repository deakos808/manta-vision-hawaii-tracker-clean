import fs from "node:fs";

function patchSightingsPage() {
  const path = "src/pages/browse_data/Sightings.tsx";
  if (!fs.existsSync(path)) return console.log("[skip] Sightings.tsx not found");
  let s = fs.readFileSync(path, "utf8");
  let orig = s;

  // 1) Add state for sightingId
  if (!/const\s*\[\s*sightingId\s*,\s*setSightingId\s*\]\s*=\s*useState/.test(s)) {
    // After other useState declarations near the top of component
    s = s.replace(
      /(const\s*\[[^\n]*useState[^\n]*\);\s*)+/,
      (m) => m + `  const [sightingId, setSightingId] = useState<string>("");\n`
    );
    if (!/sightingId/.test(s)) {
      // Fallback: after searchParams block
      s = s.replace(
        /(\bconst\s*\[\s*searchParams\s*,\s*setSearchParams\s*\]\s*=\s*useSearchParams\(\)\s*;?\s*\n)/,
        (m) => m + `  const [sightingId, setSightingId] = useState<string>("");\n`
      );
    }
  }

  // 2) Apply server-side filter in the supabase query
  // Find query builder "let q = supabase.from('sightings" or similar
  let injected = false;
  s = s.replace(
    /(\b(let|const)\s+q\s*=\s*supabase\.from\(\s*['"]sightings[^'"]*['"]\s*\)[\s\S]*?\n)/,
    (m) => {
      if (m.includes('pk_sighting_id')) { injected = true; return m; }
      injected = true;
      return m + `    if (sightingId) { q = q.eq("pk_sighting_id", Number(sightingId)); }\n`;
    }
  );
  if (!injected) {
    // Generic fallback: after first ".from("
    s = s.replace(
      /(supabase\.from\(\s*['"]sightings[^'"]*['"]\s*\)[^\n]*\n)/,
      (m) => m + `    if (sightingId) { q = q.eq("pk_sighting_id", Number(sightingId)); }\n`
    );
  }

  // 3) Ensure effect reloads when sightingId changes
  s = s.replace(
    /useEffect\(\s*\(\)\s*=>\s*\{\s*load\(\);\s*\}\s*,\s*\[([^\]]*)\]\s*\);/,
    (m, deps) => {
      if (deps.includes("sightingId")) return m;
      const newDeps = deps.trim() ? `${deps.trim()}, sightingId` : "sightingId";
      return `useEffect(() => { load(); }, [${newDeps}]);`;
    }
  );

  // 4) Clear All resets sightingId
  s = s.replace(
    /(\bconst\s+clearAll\s*=\s*\(\)\s*=>\s*\{\s*)([\s\S]*?\n\};)/,
    (m, start, rest) => {
      if (/setSightingId\(/.test(m)) return m;
      return `${start}  setSightingId("");\n${rest}`;
    }
  );

  // 5) Pass props to filter box
  s = s.replace(
    /<SightingsFilterBox([^>]*?)\/>/,
    (m, props) => {
      if (/sightingId=/.test(m)) return m;
      return `<SightingsFilterBox${props}
          sightingId={sightingId}
          setSightingId={setSightingId}
        />`;
    }
  );

  if (s !== orig) {
    fs.writeFileSync(path, s);
    console.log("[ok] Patched Sightings.tsx");
  } else {
    console.log("[info] Sightings.tsx unchanged");
  }
}

function patchSightingsFilterBox() {
  const path = "src/components/sightings/SightingsFilterBox.tsx";
  if (!fs.existsSync(path)) return console.log("[skip] SightingsFilterBox.tsx not found");
  let s = fs.readFileSync(path, "utf8");
  let orig = s;

  // 1) Extend props
  if (!/sightingId\?:\s*string;/.test(s)) {
    s = s.replace(
      /interface\s+Props\s*\{([\s\S]*?)\}/,
      (m, body) => `interface Props {${body}\n  sightingId?: string;\n  setSightingId?: (v: string) => void;\n}`
    );
  }

  // 2) Accept props in component signature
  if (!/sightingId,?\s*setSightingId/.test(s)) {
    s = s.replace(
      /export default function SightingsFilterBox\(\{\s*([\s\S]*?)\}\s*:\s*Props\)/,
      (m, props) => `export default function SightingsFilterBox({ ${props.trim().replace(/\s+$/,'')}, sightingId, setSightingId }: Props)`
    );
  }

  // 3) Render numeric pill near Date button: insert at start of the "dropdown row" container
  // Heuristic anchor: the row that includes Date/Species/Population buttons.
  if (!/Sighting ID/.test(s)) {
    s = s.replace(
      /(<div\s+className=["'][^"']*flex[^"']*wrap[^"']*gap[^"']*["'][^>]*>\s*)/,
      `$1{typeof setSightingId === "function" && (\n` +
      `  <div className="flex items-center gap-2">\n` +
      `    <span className="text-sm text-muted-foreground whitespace-nowrap">Sighting&nbsp;ID</span>\n` +
      `    <input\n` +
      `      inputMode="numeric"\n` +
      `      pattern="[0-9]*"\n` +
      `      className="h-8 w-28 rounded-full border px-3 text-sm bg-background"\n` +
      `      placeholder="e.g. 5951"\n` +
      `      value={sightingId ?? ""}\n` +
      `      onChange={(e) => setSightingId(e.target.value.replace(/[^0-9]/g, ""))}\n` +
      `    />\n` +
      `    {sightingId ? (\n` +
      `      <button type="button" className="h-8 px-3 rounded-full border text-sm" onClick={() => setSightingId("")}>Clear</button>\n` +
      `    ) : null}\n` +
      `  </div>\n` +
      `)}\n`
    );
  }

  // 4) Optional debug log
  if (!/console\.debug\(\s*\[SightingsFilterBox]/.test(s)) {
    s = s.replace(
      /(export default function SightingsFilterBox[^\{]*\{\s*)/,
      `$1console.debug("[SightingsFilterBox] sightingId prop:", sightingId, "has setter:", typeof setSightingId === "function");\n`
    );
  }

  if (s !== orig) {
    fs.writeFileSync(path, s);
    console.log("[ok] Patched SightingsFilterBox.tsx");
  } else {
    console.log("[info] SightingsFilterBox.tsx unchanged");
  }
}

try {
  patchSightingsPage();
  patchSightingsFilterBox();
} catch (e) {
  console.error("[patch error]", e);
  process.exit(1);
}
