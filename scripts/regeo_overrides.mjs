import fs from "fs";

const CSV_IN  = process.env.CSV_IN  || "redo_locations.csv";
const CSV_OUT = process.env.CSV_OUT || "redo_locations_geocoded.csv";
const TOKEN   = process.env.VITE_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN;

if(!TOKEN){ console.error("Missing Mapbox token (VITE_MAPBOX_TOKEN)."); process.exit(1); }

const ISLAND_SYNONYMS = {
  "hawaiʻi": ["Hawaiʻi","Hawaii","Hawai'i","Big Island"],
  "oʻahu":   ["Oʻahu","Oahu","O'ahu","O’ahu"],
  "kauaʻi":  ["Kauaʻi","Kauai","Kaua'i"],
  "molokaʻi":["Molokaʻi","Molokai","Moloka'i"],
  "lānaʻi":  ["Lānaʻi","Lanai","Lana'i"],
  "maui":    ["Maui"]
};
const ISLAND_CENTROIDS = {
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
};

function strip(s){ return (s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[’'ʻ]/g,"").trim(); }
function normIsl(s){ return strip(s).toLowerCase(); }
function parseCSV(s){
  const lines=s.split(/\r?\n/).filter(Boolean); if(!lines.length) return [];
  const hdr=lines.shift().split(",").map(h=>h.trim().toLowerCase());
  const iIsl=hdr.indexOf("island"), iReg=hdr.indexOf("region");
  const iLoc=hdr.indexOf("sitelocation")!==-1?hdr.indexOf("sitelocation"):hdr.indexOf("location");
  if(iIsl<0||iLoc<0) throw new Error("CSV needs columns: island,region,sitelocation");
  return lines.map(l=>{
    const p=l.split(","); return { island:p[iIsl]?.trim()||"", region:(iReg>=0?p[iReg]:"")?.trim()||"", sitelocation:p[iLoc]?.trim()||"" };
  }).filter(r=>r.island && r.sitelocation);
}
function moveMeters(lat, lon, meters, brgDeg){
  const R=6371000, brg=brgDeg*Math.PI/180, φ1=lat*Math.PI/180, λ1=lon*Math.PI/180, δ=meters/R;
  const sinφ2 = Math.sin(φ1)*Math.cos(δ) + Math.cos(φ1)*Math.sin(δ)*Math.cos(brg);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(brg)*Math.sin(δ)*Math.cos(Math.cos(φ1));
  const x = Math.cos(δ)-Math.sin(φ1)*sinφ2;
  const λ2 = λ1 + Math.atan2(Math.sin(brg)*Math.sin(δ)*Math.cos(φ1), x);
  return { lat: φ2*180/Math.PI, lon: ((λ2*180/Math.PI+540)%360)-180 };
}
function bearingDeg(a, b){
  const φ1=a.lat*Math.PI/180, φ2=b.lat*Math.PI/180, Δλ=(b.lon-a.lon)*Math.PI/180;
  const y=Math.sin(Δλ)*Math.cos(φ2);
  const x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
async function geocode(q){
  const url=`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${TOKEN}&limit=1&country=US`;
  const res=await fetch(url); if(!res.ok) return null;
  const j=await res.json(); const f=j.features?.[0]; if(!f?.center) return null;
  return { lon:f.center[0], lat:f.center[1], note:(f.place_name||"").replace(/,/g,"; ") };
}

(async ()=>{
  if(!fs.existsSync(CSV_IN)){ console.error("Missing CSV:", CSV_IN); process.exit(1); }
  const rows=parseCSV(fs.readFileSync(CSV_IN,"utf8"));
  const out=["island,region,sitelocation,lat_found,lon_found,lat_offshore,lon_offshore,geocoder_note"];

  for(const r of rows){
    const islKey = normIsl(r.island);
    const syns = ISLAND_SYNONYMS[islKey] || [r.island];
    const candidates = [
      `${r.sitelocation}, ${r.region}, ${r.island}, Hawaii, USA`,
      `${r.sitelocation}, ${r.island}, Hawaii, USA`,
      `${strip(r.sitelocation)}, ${syns[0]}, Hawaii, USA`,
      `${strip(r.sitelocation)}, Hawaii, USA`
    ];
    let hit=null;
    for(const q of candidates){ hit=await geocode(q); if(hit) break; }

    if(!hit){ out.push(`${JSON.stringify(r.island)},${JSON.stringify(r.region)},${JSON.stringify(r.sitelocation)},,,,,no-geocode`); continue; }

    const pivot = ISLAND_CENTROIDS[islKey] || ISLAND_CENTROIDS["maui"];
    const brg = bearingDeg(pivot, {lat:hit.lat, lon:hit.lon});
    const off = moveMeters(hit.lat, hit.lon, 100, brg);

    out.push(`${JSON.stringify(r.island)},${JSON.stringify(r.region)},${JSON.stringify(r.sitelocation)},${hit.lat.toFixed(6)},${hit.lon.toFixed(6)},${off.lat.toFixed(6)},${off.lon.toFixed(6)},${JSON.stringify(hit.note)}`);
  }

  fs.writeFileSync(CSV_OUT, out.join("\n"));
  console.log("Wrote", CSV_OUT, "rows:", rows.length);
})();
