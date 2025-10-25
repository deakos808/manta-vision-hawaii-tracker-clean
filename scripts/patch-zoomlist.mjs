import fs from "node:fs";

const path = "src/components/maps/MapDialog.tsx";
let s = fs.readFileSync(path, "utf8");
const orig = s;

const header = 'if (countHere > 1 && list.length > 0) {';

// 1) Replace the opening of the multi-pin branch with a zoom gate + open an extra "else {"
if (s.includes(header)) {
  s = s.replace(
    header,
    [
      'if (countHere > 1 && list.length > 0) {',
      '  const z = map.getZoom();',
      '  if (z < 9) {',
      '    html += `<div style="font-weight:600;margin-bottom:4px">${countHere} sightings here — zoom in for details</div>`;',
      '  } else {'
    ].join('\n')
  );

  // 2) Close the extra "else {" right after the list's closing line: html += `</div>`;
  const gateStart = s.indexOf('const z = map.getZoom()');
  const closeMarker = 'html += `</div>`;';
  const closeIdx = s.indexOf(closeMarker, gateStart);
  if (closeIdx !== -1) {
    const insertAt = closeIdx + closeMarker.length;
    s = s.slice(0, insertAt) + ' }' + s.slice(insertAt);
  }
}

if (s !== orig) {
  fs.writeFileSync(path, s);
  console.log("[ok] Multi-pin popup now lists at zoom ≥ 9; shows zoom hint otherwise.");
} else {
  console.log("[info] MapDialog.tsx unchanged (patch anchors not found; file may already be updated).");
}
