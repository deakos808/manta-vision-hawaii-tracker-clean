const fs = require("fs");
const path = "src/pages/AddSightingPage.tsx";

if (!fs.existsSync(path)) {
  console.error("File not found:", path);
  process.exit(1);
}
let src = fs.readFileSync(path, "utf8");
let orig = src;

// 1) ensure import
if (!src.includes("useDistinctIslands")) {
  src = src.replace(/from ["']react["'];?/, m => `${m}\nimport { useDistinctIslands } from "@/hooks/useDistinctIslands";`);
}

// 2) add hook usage just after component start
if (!src.includes("useDistinctIslands()")) {
  // handle function Component or const Component = () => {
  src = src.replace(
    /(function\s+[A-Za-z0-9_]+\s*\(|const\s+[A-Za-z0-9_]+\s*=\s*\(\s*\)\s*=>\s*\{)/,
    m => `${m}\n  const { islands: islandOptions, loading: islandsLoading } = useDistinctIslands();`
  );
}

// 3) replace the first <SelectContent> ... </SelectContent> under the Island select block
// Heuristic: choose the SelectContent that appears near the word "Location" or "Island"
const contentRegex = /<SelectContent[^>]*>[\s\S]*?<\/SelectContent>/g;
let matches = [...src.matchAll(contentRegex)];

let targetIndex = -1;
if (matches.length === 1) {
  targetIndex = 0;
} else if (matches.length > 1) {
  // pick the one whose preceding 400 chars contain 'Location' or 'Island'
  for (let i = 0; i < matches.length; i++) {
    const idx = matches[i].index;
    const start = Math.max(0, idx - 400);
    const context = src.slice(start, idx);
    if (/Location|Island/i.test(context)) { targetIndex = i; break; }
  }
  if (targetIndex < 0) targetIndex = 0; // fallback to first
}

if (targetIndex >= 0) {
  const m = matches[targetIndex];
  const block =
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
  src = src.slice(0, m.index) + block + src.slice(m.index + m[0].length);
} else {
  console.error("Could not find a <SelectContent> block to replace. No changes made.");
  process.exit(2);
}

if (src !== orig) {
  fs.writeFileSync(path, src);
  console.log("Patched:", path);
} else {
  console.log("No changes applied (file may already be patched).");
}
