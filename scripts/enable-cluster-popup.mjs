import fs from "node:fs";

const path = "src/components/maps/MapDialog.tsx";
let s = fs.readFileSync(path, "utf8");
const orig = s;

// Ensure supabase import exists for batch fill (single-pin path likely already added)
if (!s.includes(`from "@/lib/supabase"`)) {
  s = s.replace(/^(import .*\n)+/, (m) => m + `import { supabase } from "@/lib/supabase";\n`);
}

// Replace the supercluster branch so it opens a popup list at high zoom, else zooms in
const reCluster = /if\s*\(\s*c\.properties\.cluster\s*\)\s*\{[\s\S]*?\}\s*else\s*\{/m;
if (reCluster.test(s)) {
  s = s.replace(
    reCluster,
`if (c.properties.cluster) {
          const m = L.marker([lat, lon], { icon: makeBadge(String(c.properties.point_count), 28), zIndexOffset: 100 }).addTo(layer);
          m.on("click", () => {
            const z = Math.min(index.getClusterExpansionZoom(c.id), map.getMaxZoom());
            if (map.getZoom() < 9) {
              map.setView([lat, lon], z, { animate: true });
              return;
            }
            // Build a popup list from cluster leaves at current zoom
            const leaves = index.getLeaves(c.id, Math.min(200, c.properties.point_count));
            let html = '<div style="font-size:12px;line-height:1.25;white-space:nowrap;min-width:260px">';
            html += \`<div style="font-weight:600;margin-bottom:4px">\${leaves.length} sightings here</div><div style="max-height:200px;overflow:auto">\`;
            for (const leaf of leaves) {
              const sid = String(leaf?.properties?.id ?? leaf?.id ?? "");
              html += \`<div style="display:flex;gap:6px;align-items:center;margin:2px 0">
                <a href="#" data-sid="\${sid}" style="color:#2563eb;text-decoration:underline">#\${sid}</a>
                <span class="js-sighting-details" data-sid="\${sid}" style="color:#6b7280;white-space:nowrap">| loading…</span>
              </div>\`;
            }
            html += \`</div></div>\`;
            m.bindPopup(html).openPopup();
          });
          m.on("popupopen", async (ev) => {
            const root = ev?.popup?.getElement?.();
            if (!root) return;
            // Click-to-scroll binding (same behavior as single pin)
            root.addEventListener("click", (e) => {
              const a = (e.target.closest && e.target.closest('a[data-sid]')) || null;
              if (!a) return;
              e.preventDefault();
              const sid = Number(a.getAttribute("data-sid") || "0");
              (window).__map_onSelect?.(sid);
            });
            // Batch-fill details for all rows in this popup
            const spans = Array.from(root.querySelectorAll(".js-sighting-details"));
            if (!spans.length) return;
            const ids = Array.from(new Set(spans.map(el => Number(el.getAttribute("data-sid") || "0")).filter(Boolean)));
            if (!ids.length) return;
            const { data, error } = await supabase
              .from("sightings")
              .select("pk_sighting_id, sighting_date, photographer, total_mantas, total_manta_ids")
              .in("pk_sighting_id", ids);
            if (error || !Array.isArray(data)) return;
            const byId = {};
            for (const r of data) byId[Number(r.pk_sighting_id)] = r;
            for (const el of spans) {
              const id = Number(el.getAttribute("data-sid") || "0");
              const r = byId[id];
              const dateStr = r?.sighting_date ? new Date(r.sighting_date).toLocaleDateString() : "—";
              const who = r?.photographer ?? "—";
              const totNum = (typeof r?.total_mantas === "number" ? r.total_mantas
                             : (typeof r?.total_manta_ids === "number" ? r.total_manta_ids : undefined));
              const tot = typeof totNum === "number" ? String(totNum) : "—";
              el.textContent = \`| \${dateStr} · \${who} · \${tot} manta(s)\`;
            }
          });
        } else {`
  );
} else {
  console.log("[info] Supercluster branch not found — no changes applied.");
}

if (s !== orig) {
  fs.writeFileSync(path, s);
  console.log("[ok] Cluster click now lists leaves at zoom ≥ 9 (with lazy details).");
} else {
  console.log("[info] MapDialog.tsx unchanged.");
}
