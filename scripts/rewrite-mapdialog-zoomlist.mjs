import fs from "node:fs";

const path = "src/components/maps/MapDialog.tsx";
let s = fs.readFileSync(path, "utf8");
const orig = s;

// Replace the whole multi-pin block: from "if (countHere > 1 && list.length > 0) {" up to the following "} else {"
const re = /if\s*\(\s*countHere\s*>\s*1\s*&&\s*list\.length\s*>\s*0\s*\)\s*\{[\s\S]*?\n\s*\}\s*else\s*\{/m;

const replacement =
`if (countHere > 1 && list.length > 0) {
            const z = map.getZoom();
            if (z < 9) {
              html += \`<div style="font-weight:600;margin-bottom:4px">\${countHere} sightings here — zoom in for details</div>\`;
            } else {
              html += \`<div style="font-weight:600;margin-bottom:4px">\${countHere} sightings here</div><div style="max-height:200px;overflow:auto">\`;
              for (const p of list) {
                const sid = String(p.id ?? "");
                html += \`<div style="display:flex;gap:6px;align-items:center;margin:2px 0">
                  <a href="#" data-sid="\${sid}" style="color:#2563eb;text-decoration:underline">#\${sid}</a>
                  <span class="js-sighting-details" data-sid="\${sid}" style="color:#6b7280;white-space:nowrap">| loading…</span>
                </div>\`;
              }
              html += \`</div>\`;
            }
          } else {`;

if (!re.test(s)) {
  console.log("[info] Anchor not found — file may already be updated. No changes written.");
} else {
  s = s.replace(re, replacement);
  fs.writeFileSync(path, s);
  console.log("[ok] Multi-pin popup now shows zoom prompt (<9) or list (≥9).");
}
