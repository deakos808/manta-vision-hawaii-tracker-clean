import fs from "node:fs";

const path = "src/components/maps/MapDialog.tsx";
let s = fs.readFileSync(path, "utf8");
const orig = s;

// 1) Ensure supabase import exists
if (!s.includes(`from "@/lib/supabase"`)) {
  const impAnchor = s.match(/^(import .*\n)+/);
  if (impAnchor) {
    const head = impAnchor[0];
    s = s.replace(head, head + `import { supabase } from "@/lib/supabase";\n`);
  }
}

// 2) Replace the marker-popup build block with a version that:
//    - renders #ID immediately and a placeholder span
//    - on popupopen, batch-fetches (date, photographer, total_mantas) and fills all spans
const startKey = `const list = dupIndex[key] || [];`;
const endKey = `m.bindPopup(html);`;

const start = s.indexOf(startKey);
const end = s.indexOf(endKey, start);

if (start !== -1 && end !== -1) {
  const before = s.slice(0, start);
  const after = s.slice(end); // keep from m.bindPopup(html) and beyond; we'll re-add a new handler
  const newBlock = `
          const list = dupIndex[key] || [];
          let html = '<div style="font-size:12px;line-height:1.25">';
          if (countHere > 1 && list.length > 0) {
            html += \`<div style="font-weight:600;margin-bottom:4px">\${countHere} sightings here</div><div style="max-height:200px;overflow:auto">\`;
            for (const p of list) {
              const sid = String(p.id ?? "");
              html += \`<div style="display:flex;gap:6px;align-items:center;margin:2px 0">
                <a href="#" data-sid="\${sid}" style="color:#2563eb;text-decoration:underline">#\${sid}</a>
                <span class="js-sighting-details" data-sid="\${sid}" style="color:#6b7280">| loading…</span>
              </div>\`;
            }
            html += \`</div>\`;
          } else {
            const sid = String(c.properties?.id ?? "");
            html += \`<div style="display:flex;gap:6px;align-items:center;margin:2px 0">
              <a href="#" data-sid="\${sid}" style="color:#2563eb;text-decoration:underline">#\${sid}</a>
              <span class="js-sighting-details" data-sid="\${sid}" style="color:#6b7280">| loading…</span>
            </div>\`;
          }
          html += \`</div>\`;

          m.bindPopup(html);
          m.on("popupopen", (ev) => {
            const root = ev?.popup?.getElement?.();
            if (!root) return;

            root.addEventListener("click", (e) => {
              const a = (e.target.closest && e.target.closest('a[data-sid]')) || null;
              if (!a) return;
              e.preventDefault();
              const sid = Number(a.getAttribute("data-sid") || "0");
              (window).__map_onSelect?.(sid);
            });

            (async () => {
              const spans = Array.from(root.querySelectorAll(".js-sighting-details"));
              if (!spans.length) return;
              const ids = Array.from(new Set(spans.map(el => Number(el.getAttribute("data-sid") || "0")).filter(Boolean)));
              if (!ids.length) return;

              const { data, error } = await supabase
                .from("sightings")
                .select("pk_sighting_id, sighting_date, photographer, total_mantas")
                .in("pk_sighting_id", ids);

              if (error || !Array.isArray(data)) return;

              const byId = {};
              for (const r of data) byId[Number(r.pk_sighting_id)] = r;

              for (const el of spans) {
                const id = Number(el.getAttribute("data-sid") || "0");
                const r = byId[id];
                const dateStr = r?.sighting_date ? new Date(r.sighting_date).toLocaleDateString() : "—";
                const who = r?.photographer ?? "—";
                const tot = typeof r?.total_mantas === "number" ? String(r.total_mantas) : "—";
                el.textContent = \`| \${dateStr} · \${who} · \${tot} manta(s)\`;
              }
            })();
          });
`;

  s = before + newBlock + s.slice(end + endKey.length);
} else {
  console.error("[patch] Could not locate popup block; no changes written.");
}

if (s !== orig) {
  fs.writeFileSync(path, s);
  console.log("[ok] MapDialog popup overwritten to fetch live details.");
} else {
  console.log("[info] MapDialog unchanged.");
}
