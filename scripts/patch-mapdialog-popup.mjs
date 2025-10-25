import fs from "node:fs";

const path = "src/components/maps/MapDialog.tsx";
let s = fs.readFileSync(path, "utf8");
let changed = false;

// 1) Make popup wrapper wider and no-wrap
{
  const before = `<div style="font-size:12px;line-height:1.25">`;
  const after  = `<div style="font-size:12px;line-height:1.25;white-space:nowrap;min-width:260px">`;
  if (s.includes(before)) { s = s.split(before).join(after); changed = true; }
}

// 2) Ensure detail spans don’t wrap
{
  const re = /class="js-sighting-details"([^>]*?)style="color:#6b7280"/g;
  const after = `class="js-sighting-details"$1style="color:#6b7280;white-space:nowrap"`;
  const next = s.replace(re, after);
  if (next !== s) { s = next; changed = true; }
}

// 3) Add total_manta_ids to the select (if not already there)
{
  const before = `.select("pk_sighting_id, sighting_date, photographer, total_mantas")`;
  const after  = `.select("pk_sighting_id, sighting_date, photographer, total_mantas, total_manta_ids")`;
  if (s.includes(before) && !s.includes(after)) { s = s.replace(before, after); changed = true; }
}

// 4) Use total_mantas else total_manta_ids for count
{
  const re = /const tot\s*=\s*typeof\s+r\?\.total_mantas\s*===\s*"number"\s*\?\s*String\(r\.total_mantas\)\s*:\s*"—";/;
  if (re.test(s)) {
    s = s.replace(
      re,
      `const totNum = (typeof r?.total_mantas === "number" ? r.total_mantas : (typeof r?.total_manta_ids === "number" ? r.total_manta_ids : undefined));
       const tot = typeof totNum === "number" ? String(totNum) : "—";`
    );
    changed = true;
  }
}

if (changed) fs.writeFileSync(path, s);
console.log(changed ? "[ok] MapDialog popup widened + count fallback added" : "[info] No changes applied");
