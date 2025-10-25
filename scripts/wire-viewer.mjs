import fs from "node:fs";
const p = "src/pages/browse_data/Mantas.tsx";
let s = fs.readFileSync(p, "utf8");
let o = s;
if (!/from "@\/components\/mantas\/MantaPhotosViewer"/.test(s)) {
  s = s.replace(
    /import MantaPhotosModal from "@\/components\/mantas\/MantaPhotosModal";/,
    'import MantaPhotosModal from "@/components/mantas/MantaPhotosModal";\nimport MantaPhotosViewer from "@/components/mantas/MantaPhotosViewer";'
  );
}
s = s.replace(
  /className="grid grid-cols-2 gap-2 md:grid-cols-3"/,
  'className="grid grid-cols-1 gap-1"'
);
s = s.replace(
  /<MantaPhotosModal([\s\S]*?)\/>\s*$/,
  '<MantaPhotosViewer open={showPhotos} onOpenChange={setShowPhotos} mantaId={photosFor?.mantaId ?? null} />\n'
);
if (s !== o) {
  fs.writeFileSync(p, s);
  console.log("[ok] wired viewer + stacked PIL");
} else {
  console.log("[info] no changes");
}
