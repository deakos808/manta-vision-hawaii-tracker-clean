const fs = require("fs");
const path = "src/pages/AddSightingPage.tsx";
if (!fs.existsSync(path)) { console.error("File not found:", path); process.exit(1); }
let src = fs.readFileSync(path, "utf8");
let orig = src;

// 1) Import hook
if (!src.includes("useDistinctIslands")) {
  src = src.replace(/from ["']react["'];?/, m => `${m}\nimport { useDistinctIslands } from "@/hooks/useDistinctIslands";`);
}

// 2) Hook usage near component start
if (!src.includes("useDistinctIslands()")) {
  src = src.replace(
    /(function\s+[A-Za-z0-9_]+\s*\(|const\s+[A-Za-z0-9_]+\s*=\s*\(\s*\)\s*=>\s*\{)/,
    m => `${m}\n  const { islands: islandOptions, loading: islandsLoading, error: islandsError } = useDistinctIslands();`
  );
}

// 3) Inject a render-time logger component (logs every render)
if (!src.includes("function IslandOptionsDebug(")) {
  src = src.replace(/(\nexport\s+default|\nfunction\s+)/,
`
// Logs exactly what the Island menu will render at this moment.
function IslandOptionsDebug({ opts, loading, error }:{ opts:string[]; loading:boolean; error:string|null }) {
  const src = loading ? "loading" : (opts && opts.length > 0 ? "db" : "none");
  console.log("[IslandSelect][render] source=", src, "count=", opts?.length ?? 0, "error=", error, "opts=", opts);
  return null;
}
$1`);
}

// 4) Replace the Island options block: choose the last <SelectContent> before "Select island first"
const all = [...src.matchAll(/<SelectContent[^>]*>[\s\S]*?<\/SelectContent>/g)];
let targetIndex = -1;
const idxRightPlaceholder = src.indexOf("Select island first");
if (all.length) {
  for (let i = 0; i < all.length; i++) {
    const m = all[i];
    if (idxRightPlaceholder === -1 || m.index < idxRightPlaceholder) targetIndex = i;
  }
  if (targetIndex === -1) targetIndex = 0;
}
if (targetIndex === -1) { console.error("Could not find a <SelectContent> to patch."); process.exit(2); }

const m = all[targetIndex];
const replacement =
`<SelectContent>
  <IslandOptionsDebug opts={islandOptions} loading={islandsLoading} error={islandsError ?? null} />
  {islandsLoading ? (
    <SelectItem value="__loading" disabled>Loading…</SelectItem>
  ) : islandsError ? (
    <>
      <SelectItem value="__err" disabled>Island load error</SelectItem>
      <SelectItem value="__err2" disabled>Check console</SelectItem>
    </>
  ) : islandOptions.length === 0 ? (
    <>
      <SelectItem value="__none" disabled>No islands from DB</SelectItem>
    </>
  ) : (
    islandOptions.map(i => (
      <SelectItem key={i} value={i}>{i}</SelectItem>
    ))
  )}
</SelectContent>`;

src = src.slice(0, m.index) + replacement + src.slice(m.index + m[0].length);

// 5) Visible micro-probe before the "Notes" heading so you can see counts on-screen
if (src.includes(">Notes<") && !src.includes("data-island-probe")) {
  src = src.replace(/>Notes</, 
    `><div data-island-probe className="text-[11px] text-muted-foreground mb-2">Island options: {islandsLoading ? "loading" : (islandOptions?.length ?? 0)} from DB</div>Notes<`);
}

if (src !== orig) {
  fs.writeFileSync(path, src);
  console.log("Patched with DB-driven Island select + probes:", path);
} else {
  console.log("No changes applied (already patched or pattern not found).");
}
