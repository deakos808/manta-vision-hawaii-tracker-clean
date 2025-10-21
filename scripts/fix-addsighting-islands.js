const fs = require("fs");
const path = "src/pages/AddSightingPage.tsx";
if (!fs.existsSync(path)) { console.error("File not found:", path); process.exit(1); }
let src = fs.readFileSync(path, "utf8");
let orig = src;

// 1) Remove the hard-coded ISLANDS array
src = src.replace(
  /const\s+ISLANDS\s*=\s*\[[\s\S]*?\];\s*\n/,
  `// ISLANDS removed — islands now come from DB (public.sightings.island)\n`
);

// 2) Insert islands state + effect **inside** the component (after the mounted probe)
const mountedProbe = 'useEffect(()=>{ console.log("[AddSighting] mounted"); }, []);';
if (src.includes(mountedProbe)) {
  src = src.replace(
    mountedProbe,
    `${mountedProbe}

// Islands list from DB with loud console probes
const [islands, setIslands] = useState<string[]>([]);
const [islandsLoading, setIslandsLoading] = useState<boolean>(true);
const [islandsError, setIslandsError] = useState<string|null>(null);

useEffect(() => {
  let alive = true;
  (async () => {
    console.log("[IslandSelect][fetch] start");
    setIslandsLoading(true);
    setIslandsError(null);
    try {
      const { data, error } = await supabase
        .from("sightings")
        .select("island", { distinct: true })
        .not("island", "is", null)
        .order("island", { ascending: true });
      if (!alive) return;
      if (error) {
        console.log("[IslandSelect][fetch] ERROR:", error);
        setIslandsError(error.message);
        setIslandsLoading(false);
        return;
      }
      const vals = (data ?? [])
        .map((r:any) => (r.island ?? "").toString().trim())
        .filter((x:string) => x.length > 0);
      console.log("[IslandSelect][fetch] DISTINCT islands from DB:", vals);
      setIslands(vals);
      setIslandsLoading(false);
    } catch (e:any) {
      if (!alive) return;
      console.log("[IslandSelect][fetch] EXCEPTION:", e?.message || e);
      setIslandsError(e?.message || String(e));
      setIslandsLoading(false);
    }
  })();
  return () => { alive = false; };
}, []);
`
  );
} else {
  // Fallback: inject right after component start if the probe line changes later
  src = src.replace(
    /export\s+default\s+function\s+AddSightingPage\(\)\s*\{\s*/,
    match => `${match}
// Islands list from DB with loud console probes
const [islands, setIslands] = useState<string[]>([]);
const [islandsLoading, setIslandsLoading] = useState<boolean>(true);
const [islandsError, setIslandsError] = useState<string|null>(null);

useEffect(() => {
  let alive = true;
  (async () => {
    console.log("[IslandSelect][fetch] start");
    setIslandsLoading(true);
    setIslandsError(null);
    try {
      const { data, error } = await supabase
        .from("sightings")
        .select("island", { distinct: true })
        .not("island", "is", null)
        .order("island", { ascending: true });
      if (!alive) return;
      if (error) {
        console.log("[IslandSelect][fetch] ERROR:", error);
        setIslandsError(error.message);
        setIslandsLoading(false);
        return;
      }
      const vals = (data ?? [])
        .map((r:any) => (r.island ?? "").toString().trim())
        .filter((x:string) => x.length > 0);
      console.log("[IslandSelect][fetch] DISTINCT islands from DB:", vals);
      setIslands(vals);
      setIslandsLoading(false);
    } catch (e:any) {
      if (!alive) return;
      console.log("[IslandSelect][fetch] EXCEPTION:", e?.message || e);
      setIslandsError(e?.message || String(e));
      setIslandsLoading(false);
    }
  })();
  return () => { alive = false; };
}, []);
`
  );
}

// 3) Replace the island <select> to render only DB items and to log at render time
src = src.replace(
  /<select\s+className="border[^"]*"\s+value=\{island\}[\s\S]*?<option\s+value="">Select island<\/option>[\s\S]*?<\/select>/,
  `<select
  className="border rounded px-3 py-2"
  value={island}
  onChange={(e)=>setIsland(e.target.value)}
>
  {(() => {
    const srcLabel = islandsLoading ? "loading" : (islands && islands.length ? "db" : "none");
    console.log("[IslandSelect][render] source=", srcLabel, "count=", islands?.length ?? 0, "error=", islandsError, "opts=", islands);
    return null;
  })()}
  <option value="">Select island</option>
  {islandsLoading && <option value="__loading" disabled>Loading…</option>}
  {(!islandsLoading && islandsError) && <option value="__err" disabled>Load error — check console</option>}
  {(!islandsLoading && !islandsError && islands.length === 0) && <option value="__none" disabled>No islands from DB</option>}
  {(!islandsLoading && !islandsError && islands.length > 0) &&
    islands.map(i => <option key={i} value={i}>{i}</option>)
  }
</select>`
);

if (src !== orig) {
  fs.writeFileSync(path, src);
  console.log("Patched:", path);
} else {
  console.log("No changes applied (patterns not found or already patched).");
}
