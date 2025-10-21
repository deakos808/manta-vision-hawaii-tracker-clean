import fs from "fs";

// IO
const IN  = process.env.CSV_IN  || "manual_overrides.csv";
const OUT = process.env.CSV_OUT || "manual_overrides_offshore.csv";
const CHECK = process.env.CHECK_OUT || "manual_overrides_check.csv";

// rough island centroids
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

const normIsl = s => (s||"").toLowerCase().replace(/[’'ʻ]/g,'').trim();

// Bearing & move
function bearingDeg(a,b){
  const φ1=a.lat*Math.PI/180, φ2=b.lat*Math.PI/180, dλ=(b.lon-a.lon)*Math.PI/180;
  const y=Math.sin(dλ)*Math.cos(φ2);
  const x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(dλ);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
function moveMeters(lat, lon, meters, bearing){
  const R=6371000, brng=bearing*Math.PI/180, φ1=lat*Math.PI/180, λ1=lon*Math.PI/180, δ=meters/R;
  const sinφ2 = Math.sin(φ1)*Math.cos(δ) + Math.cos(φ1)*Math.sin(δ)*Math.cos(brng);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(brng)*Math.sin(δ)*Math.cos(Math.cos(φ1));
  const x = Math.cos(δ)-Math.sin(φ1)*sinφ2;
  const λ2 = λ1 + Math.atan2(Math.sin(brng)*Math.sin(δ)*Math.cos(φ1), x);
  return { lat: φ2*180/Math.PI, lon: ((λ2*180/Math.PI+540)%360)-180 };
}
// Haversine distance in km
function distKm(a,b){
  const R=6371, φ1=a.lat*Math.PI/180, φ2=b.lat*Math.PI/180;
  const dφ=(b.lat-a.lat)*Math.PI/180, dλ=(b.lon-a.lon)*Math.PI/180;
  const h = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

function parseCSV(text){
  const [hdr,...rows]=text.trim().split(/\r?\n/);
  const cols=hdr.split(",").map(h=>h.trim().toLowerCase());
  const iIsl=cols.indexOf("island"), iReg=cols.indexOf("region"), iLoc=cols.indexOf("sitelocation"),
        iLat=cols.indexOf("lat_base"), iLon=cols.indexOf("lon_base");
  if(iIsl<0||iLoc<0||iLat<0||iLon<0) throw new Error("CSV must have: island,region,sitelocation,lat_base,lon_base");
  return rows.map(line=>{
    const p=line.split(","); 
    const isl=p[iIsl]?.trim(), reg=p[iReg]?.trim(), loc=p[iLoc]?.trim();
    const la=Number(p[iLat]), lo=Number(p[iLon]);
    return { island:isl, region:reg, sitelocation:loc, lat:la, lon:lo };
  }).filter(r=>r.island && r.sitelocation && Number.isFinite(r.lat) && Number.isFinite(r.lon));
}

if(!fs.existsSync(IN)){ console.error("Missing CSV:", IN); process.exit(1); }
const src = fs.readFileSync(IN,"utf8");
const rows = parseCSV(src);

const out = ["island,region,sitelocation,lat_found,lon_found,lat_offshore,lon_offshore,geocoder_note"];
const chk = ["island,region,sitelocation,lat_base,lon_base,lat_offshore,lon_offshore,km_from_base"];

for(const r of rows){
  const pivot = C[normIsl(r.island)] || C["maui"];
  const brg = bearingDeg(pivot, {lat:r.lat, lon:r.lon});
  const off = moveMeters(r.lat, r.lon, 100, brg);
  const km = distKm({lat:r.lat, lon:r.lon}, off);
  out.push(`${JSON.stringify(r.island)},${JSON.stringify(r.region)},${JSON.stringify(r.sitelocation)},${r.lat.toFixed(6)},${r.lon.toFixed(6)},${off.lat.toFixed(6)},${off.lon.toFixed(6)},"manual 100m offshore"`);
  chk.push(`${JSON.stringify(r.island)},${JSON.stringify(r.region)},${JSON.stringify(r.sitelocation)},${r.lat.toFixed(6)},${r.lon.toFixed(6)},${off.lat.toFixed(6)},${off.lon.toFixed(6)},${km.toFixed(3)}`);
}

fs.writeFileSync(OUT, out.join("\n"));
fs.writeFileSync(CHECK, chk.join("\n"));
console.log("Wrote", OUT, "and", CHECK, "rows:", rows.length);
