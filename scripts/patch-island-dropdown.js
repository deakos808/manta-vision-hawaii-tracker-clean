const fs = require("fs");
const path = "src/pages/AddSightingPage.tsx";
if (!fs.existsSync(path)) { console.error("File not found:", path); process.exit(1); }
let src = fs.readFileSync(path, "utf8");
let orig = src;

// 1) ensure import
if (!src.includes("useDistinctIslands")) {
  src = src.replace(/from ["']react["'];?/, m => `${m}\nimport { useDistinctIslands } from "@/hooks/useDistinctIslands";`);
}

// 2) add hook usage just after component start (works for function or const component)
if (!src.includes("useDistinctIslands()")) {
  src = src.replace(
    /(function\s+[A-Za-z0-9_]+\s*\(|const\s+[A-Za-z0-9_]+\s*=\s*\(\s*\)\s*=>\s*\{)/,
    m => `${m}\n  const { islands: islandOptions, loading: islandsLoading } = useDistinctIslands();`
  );
}

// 3) find the <SelectContent> that belongs to the ISLAND select.
// Heuristic: choose the <SelectContent> that appears BEFORE the text "Select island first"
// (the latter is the placeholder for the Location select to the right)
const all = [...src.matchAll(/<SelectContent[^>]*>[\s\S]*?<\/SelectContent>/g)];
let targetIndex = -1;
const idxSelectIslandFirst = src.indexOf("Select island first");
if (all.length) {
  // pick the last <SelectContent> that occurs BEFORE "Select island first"
  for (let i = 0; i < all.length; i++) {
    const m = all[i];
    if (m.index < idxSelectIslandFirst || idxSelectIslandFirst === -1) targetIndex = i;
  }
  if (targetIndex === -1) targetIndex = 0;
}
if (targetIndex === -1) { console.error("Could not find a <SelectContent> to patch."); process.exit(2); }

const m = all[targetIndex];
const replacement =
`<SelectContent>
  {islandsLoading ? (
    <SelectItem value="__loading" disabled>Loading…</SelectItem>
  ) : (
    islandOptions.length === 0 ? (
      <SelectItem value="__none" disabled>No islands found</SelectItem>
    ) : (
      islandOptions.map(i => (
        <SelectItem key={i} value={i}>{i}</SelectItem>
      ))
    )
  )}
</SelectContent>`;

src = src.slice(0, m.index) + replacement + src.slice(m.index + m[0].length);

// 4) write back
if (src !== orig) {
  fs.writeFileSync(path, src);
  console.log("Patched:", path);
} else {
  console.log("No changes were necessary.");
}
