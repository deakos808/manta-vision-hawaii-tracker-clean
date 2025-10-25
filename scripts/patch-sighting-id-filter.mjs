import fs from "node:fs";

function patchSightingsPage() {
  const path = "src/pages/browse_data/Sightings.tsx";
  if (!fs.existsSync(path)) return console.log("[skip] Sightings.tsx not found");
  let s = fs.readFileSync(path, "utf8");
  let orig = s;

  // 1) Add state for sightingId
  if (!/const\s*\[\s*sightingId\s*,\s*setSightingId\s*\]\s*=\s*useState/.test(s)) {
    // Insert after the searchParams hook if present; else after first useState line.
    if (/\buseSearchParams\(\)/.test(s)) {
      s = s.replace(
        /(\bconst\s*\[\s*searchParams\s*,\s*setSearchParams\s*\]\s*=\s*useSearchParams\(\)\s*;?\s*\n)/,
        `$1  const [sightingId, setSightingId] = useState<string>("");\n`
      );
    } else {
      s = s.replace(
        /(useState<[^>]*>\([^)]*\);\s*\n)/,
        `$1  const [sightingId, setSightingId] = useState<string>("");\n`
      );
    }
  }

  // 2) Apply server-side filter in the supabase query
  // Match the builder where q is created from 'sightings'
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
    // Fallback: inject after first .from("sightings")
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

  // 5) Pass props to SightingFilterBox
  s = s.replace(
    /<SightingFilterBox([^>]*?)\/>/,
    (m, props) => {
      if (/sightingId=/.test(m)) return m;
      return `<SightingFilterBox${props}
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

function patchSightingFilterBox() {
  const path = "src/components/sightings/SightingFilterBox.tsx";
  if (!fs.existsSync(path)) return console.log("[skip] SightingFilterBox.tsx not found");
  let s = fs.readFileSync(path, "utf8");
  let orig = s;

  // 1) Extend Props with optional sightingId + setter
  if (!/sightingId\?:\s*string;/.test(s)) {
    s = s.replace(
      /interface\s+Props\s*\{([\s\S]*?)\}/,
      (m, body) => `interface Props {${body}\n  sightingId?: string;\n  setSightingId?: (v: string) => void;\n}`
    );
  }

  // 2) Include props in function signature
  if (!/sightingId,?\s*setSightingId/.test(s)) {
    s = s.replace(
      /export default function SightingFilterBox\(\{\s*([\s\S]*?)\}\s*:\s*Props\)/,
      (m, props) => `export default function SightingFilterBox({ ${props.trim().replace(/\s+$/,'')}, sightingId, setSightingId }: Props)`
    );
  }

  // 3) Render numeric pill at start of the main filter row (before "Date")
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

  // 4) Lightweight debug
  if (!/console\.debug\(\s*\[SightingFilterBox]/.test(s)) {
    s = s.replace(
      /(export default function SightingFilterBox[^\{]*\{\s*)/,
      `$1console.debug("[SightingFilterBox] sightingId prop:", sightingId, "has setter:", typeof setSightingId === "function");\n`
    );
  }

  if (s !== orig) {
    fs.writeFileSync(path, s);
    console.log("[ok] Patched SightingFilterBox.tsx");
  } else {
    console.log("[info] SightingFilterBox.tsx unchanged");
  }
}

try {
  patchSightingsPage();
  patchSightingFilterBox();
} catch (e) {
  console.error("[patch error]", e);
  process.exit(1);
}
