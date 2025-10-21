import fs from "fs";

const IN  = process.env.CSV_IN || "manual_overrides_offshore.csv";
const OUT = process.env.CSV_OUT || "validation_report.csv";

// island centroids (rough)
const C = {
  "hawaii":  { lat:19.6,  lon:-155.5 },
  "hawaiʻi": { lat:19.6,  lon:-155.5 },
  "maui":    { lat:20.8,  lon:-156.3 },
  "oahu":    { lat:21.48, lon:-157.98 },
  "oʻahu":   { lat:21.48, lon:-157.98 },
  "kauai":   { lat:22.05, lon:-159.50 },
  "kauaʻi":  { lat:22.05, lon:-159.50 },
  "molokai": { lat:21.15, lon:-157.07 },
  "molokaʻi":{ lat:21.15, lon:-157.07 },
  "lanai":   { lat:20.82, lon:-156.93 },
  "lānaʻi":  { lat:20.82, lon:-156.93 },
  "niihau":  { lat:21.90, lon:-160.15 }
};

const normIsl = s => (s||"").toLowerCase().replace(/[’'ʻ]/g,"").trim();

function distKm(a,b){
  const R=6371, φ1=a.lat*Math.PI/180, φ2=b.lat*Math.PI/180;
  const dφ=(b.lat-a.lat)*Math.PI/180, dλ=(b.lon-a.lon)*Math.PI/180;
  const h = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

function parseCSV(txt){
  const lines = txt.trim().split(/\r?\n/);
  const hdr = lines.shift().split(",").map(h=>h.trim().toLowerCase());
  const idx = (name)=>hdr.indexOf(name);
  const iIsl=idx("island"), iReg=idx("region"), iLoc=idx("sitelocation");
  const iLatBase = idx("lat_base"); const iLonBase = idx("lon_base");
  const iLatF = iLatBase>=0 ? iLatBase : idx("lat_found");
  const iLonF = iLonBase>=0 ? iLonBase : idx("lon_found");
  const iLatOff= idx("lat_offshore"); const iLonOff= idx("lon_offshore");
  if (iIsl<0 || iLoc<0 || iLatF<0 || iLonF<0 || iLatOff<0 || iLonOff<0) {
    throw new Error("CSV must have: island, region, sitelocation, (lat_base|lat_found), (lon_base|lon_found), lat_offshore, lon_offshore");
  }
  return lines.map(l=>{
    const p=l.split(",");
    return {
      island: p[iIsl]?.trim(),
      region: p[iReg]?.trim() || "",
      site:   p[iLoc]?.trim(),
      lat0:   Number(p[iLatF]),
      lon0:   Number(p[iLonF]),
      lat1:   Number(p[iLatOff]),
      lon1:   Number(p[iLonOff]),
    };
  }).filter(r=>r.island && r.site && Number.isFinite(r.lat0) && Number.isFinite(r.lon0) && Number.isFinite(r.lat1) && Number.isFinite(r.lon1));
}

if(!fs.existsSync(IN)){ console.error("CSV not found:", IN); process.exit(1); }
const rows = parseCSV(fs.readFileSync(IN,"utf8"));
const out = ["island,region,sitelocation,lat0,lon0,lat1,lon1,km_from_base,km_to_island_centroid,flag"];

for (const r of rows) {
  const kmBase = distKm({lat:r.lat0, lon:r.lon0}, {lat:r.lat1, lon:r.lon1});
  const pivot = C[normIsl(r.island)] || C["maui"];
  const kmCent = distKm(pivot, {lat:r.lat1, lon:r.lon1});
  const flag = (Math.abs(kmBase-0.100) > 0.02 ? "BAD_OFFSET" : "") +
               (kmCent < 8 ? (flag?";":"") + "NEAR_CENTROID" : "");
  out.push(`${JSON.stringify(r.island)},${JSON.stringify(r.region)},${JSON.stringify(r.site)},${r.lat0.toFixed(6)},${r.lon0.toFixed(6)},${r.lat1.toFixed(6)},${r.lon1.toFixed(6)},${kmBase.toFixed(3)},${kmCent.toFixed(2)},${flag||"PASS"}`);
}

fs.writeFileSync(OUT, out.join("\n"));
console.log("Wrote", OUT, "rows:", rows.length);
