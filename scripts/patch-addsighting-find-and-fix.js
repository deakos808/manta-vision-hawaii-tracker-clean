const fs = require("fs");
const path = require("path");

function walk(dir, out=[]) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const roots = ["src"];
let candidates = [];
for (const r of roots) if (fs.existsSync(r)) candidates.push(...walk(r));

const hits = [];
for (const f of candidates) {
  const txt = fs.readFileSync(f, "utf8");
  // Heuristic to find the *actual* page you showed:
  // - contains the probe id you pasted
  // - contains the Location card markup
  if (txt.includes('id="probe-add-sighting-v2"') && txt.includes("<CardHeader><CardTitle>Location</CardTitle></CardHeader>")) {
    hits.push(f);
  }
}

if (hits.length === 0) {
  console.error("Could not find the Add Sighting page by probe id. Looked under ./src. Aborting without changes.");
  process.exit(2);
}

if (hits.length > 1) {
  console.log("Multiple matches, will patch the first. Matches:\n" + hits.join("\n"));
}

const target = hits[0];
let src = fs.readFileSync(target, "utf8");
let orig = src;

console.log("[patch] Target file:", target);

// 1) Remove hard-coded ISLANDS array (if present)
src = src.replace(/const\s+ISLANDS\s*=\s*\[[\s\S]*?\];\s*\n/, (m)=>{
  console.log("[patch] Removed hard-coded ISLANDS array");
  return "// ISLANDS removed — will fetch from DB\n";
});

// 2) Inject islands state + effect **inside** the component, right after the mounted probe effect
const needle = 'useEffect(()=>{ console.log("[AddSighting] mounted"); }, []);';
if (src.includes(needle) && !src.includes("[IslandSelect][fetch] start")) {
  src = src.replace(needle, `${needle}

// Islands list from DB (public.sightings.island) with loud probes
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
`);
  console.log("[patch] Injected islands state + DB fetch effect");
} else if (!src.includes("[IslandSelect][fetch] start")) {
  console.warn("[patch] Could not find the mounted probe; injecting islands state near component start instead.");
  src = src.replace(/export\s+default\s+function\s+AddSightingPage\(\)\s*\{\s*/, (m)=>{
    return `${m}
// Islands list from DB (public.sightings.island) with loud probes
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
`;
  });
}

// 3) Replace the island <select> block to render only DB values with render-time log
const selectIslandRegex =
/<select\s+className="border[^"]*"\s+value=\{island\}[\s\S]*?<option\s+value="">Select island<\/option>[\s\S]*?<\/select>/;

if (selectIslandRegex.test(src)) {
  src = src.replace(selectIslandRegex, `
<select
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
</select>
`);
  console.log("[patch] Replaced island <select> to DB-driven options");
} else {
  console.warn("[patch] Could not find the island <select> block to replace.");
}

// 4) Visible micro‑probe under Location (before “Notes”), if not already present
if (src.includes("<CardHeader><CardTitle>Notes</CardTitle></CardHeader>") && !src.includes("data-island-probe")) {
  src = src.replace(
    /<CardHeader><CardTitle>Notes<\/CardTitle><\/CardHeader>/,
`<div className="text-[11px] text-gray-500 mb-2" data-island-probe>
  Island options: {islandsLoading ? "loading" : ((islands && islands.length) || 0)} from DB
</div>
<CardHeader><CardTitle>Notes</CardTitle></CardHeader>`
  );
  console.log("[patch] Inserted on‑screen island count probe under Location");
}

if (src !== orig) {
  fs.writeFileSync(target, src);
  console.log("[patch] Wrote changes to:", target);
  process.exit(0);
} else {
  console.log("[patch] No changes written (already dynamic or patterns not found).");
  process.exit(0);
}
