import fs from "node:fs";

const path = "src/pages/browse_data/Mantas.tsx";
let s = fs.readFileSync(path, "utf8");
let changed = false;

// 1) Ensure exactly one import for the viewer
if (!s.includes('from "@/components/mantas/MantaPhotosViewer"')) {
  const insAfter = s.indexOf('from "@/components/mantas/MantaPhotosModal"') !== -1
    ? 'import MantaPhotosModal from "@/components/mantas/MantaPhotosModal";'
    : null;
  if (insAfter) {
    s = s.replace(insAfter, insAfter + '\nimport MantaPhotosViewer from "@/components/mantas/MantaPhotosViewer";');
    changed = true;
  } else {
    // fallback: insert after last import
    s = s.replace(/(import .+\n)(?!.*import .+\n)/s, (m) => m + 'import MantaPhotosViewer from "@/components/mantas/MantaPhotosViewer";\n');
    changed = true;
  }
} else {
  // de-dupe duplicate viewer imports (keep first)
  const lines = s.split("\n");
  let seen = false;
  const out = lines.filter((line) => {
    if (line.includes('import MantaPhotosViewer from "@/components/mantas/MantaPhotosViewer"')) {
      if (seen) return false;
      seen = true;
    }
    return true;
  });
  const s2 = out.join("\n");
  if (s2 !== s) { s = s2; changed = true; }
}

// 2) Replace rendered uploader modal with the viewer (single instance at bottom)
const viewerTag = '<MantaPhotosViewer open={showPhotos} onOpenChange={setShowPhotos} mantaId={photosFor?.mantaId ?? null} />\n';
const replaced = s.replace(/<MantaPhotosModal[\s\S]*?\/>\s*$/m, viewerTag);
if (replaced !== s) { s = replaced; changed = true; }

// 3) Stack Population / Island / Location on separate lines
const s2 = s.replace(/className="grid grid-cols-2 gap-2 md:grid-cols-3"/, 'className="grid grid-cols-1 gap-1"');
if (s2 !== s) { s = s2; changed = true; }

if (changed) fs.writeFileSync(path, s);
console.log(changed ? "[ok] viewer wired and details stacked" : "[info] no changes needed");
