const fs = require("fs");
const path = "src/pages/AddSightingPage.tsx";
if (!fs.existsSync(path)) { console.error("File not found:", path); process.exit(1); }
let src = fs.readFileSync(path, "utf8");
let orig = src;

// 1) Remove/replace the hard-coded ISLANDS array with state + effect that fetches DISTINCT islands.
if (src.includes("const ISLANDS =")) {
  src = src.replace(
    /const\s+ISLANDS\s*=\s*\[[\s\S]*?\];\s*\n/,
`// Islands now come from DB (public.sightings.island)
const [islands, setIslands] = useState<string[]>([]);
const [islandsLoading, setIslandsLoading] = useState<boolean>(true);
const [islandsError, setIslandsError] = useState<string|null>(null);

// Loud fetch-time debug so we always know the source of truth
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
  // If array not found, inject the state/effect right after the time options line
  src = src.replace(
    /const\s+TIME_OPTIONS\s*=\s*buildTimes\(\s*5\s*\);\s*\n/,
`const TIME_OPTIONS = buildTimes(5);

// Islands now come from DB (public.sightings.island)
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

// 2) Replace the island <select> options to render only from DB + render-time console.
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

// 3) Add a tiny on-screen probe under the Location block (before "Notes") so we see counts visibly.
if (src.includes("<CardHeader><CardTitle>Notes</CardTitle></CardHeader>") && !src.includes("data-island-probe")) {
  src = src.replace(
    /<CardHeader><CardTitle>Notes<\/CardTitle><\/CardHeader>/,
    `<div className="text-[11px] text-gray-500 mb-2" data-island-probe>
  Island options: {islandsLoading ? "loading" : ((islands && islands.length) || 0)} from DB
</div>
<CardHeader><CardTitle>Notes</CardTitle></CardHeader>`
  );
}

if (src !== orig) {
  fs.writeFileSync(path, src);
  console.log("Patched:", path);
} else {
  console.log("No changes applied (already dynamic or pattern not found).");
}
