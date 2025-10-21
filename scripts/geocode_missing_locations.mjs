import fs from "fs";
import path from "path";

// Config
const CSV_IN  = process.env.CSV_IN  || "missing_locations.csv";
const CSV_OUT = process.env.CSV_OUT || "missing_locations_geocoded.csv";
const MAPBOX_TOKEN = process.env.VITE_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN;

if (!MAPBOX_TOKEN) {
  console.error("Missing Mapbox token. Set VITE_MAPBOX_TOKEN or MAPBOX_TOKEN.");
  process.exit(1);
}

// Island centroids (rough) to push points offshore along radial
const ISLAND_CENTROIDS = {
  "hawaii":   { lat: 19.6,  lon: -155.5 },
  "hawaiʻi":  { lat: 19.6,  lon: -155.5 },
  "maui":     { lat: 20.8,  lon: -156.3 },
  "oahu":     { lat: 21.48, lon: -157.98 },
  "oʻahu":    { lat: 21.48, lon: -157.98 },
  "kauai":    { lat: 22.05, lon: -159.50 },
  "kauaʻi":   { lat: 22.05, lon: -159.50 },
  "molokai":  { lat: 21.15, lon: -157.07 },
  "molokaʻi": { lat: 21.15, lon: -157.07 },
  "lānaʻi":   { lat: 20.82, lon: -156.93 },
  "lanai":    { lat: 20.82, lon: -156.93 },
};

// Haversine forward: start lat/lon, distance meters, bearing degrees -> new lat/lon
function moveMeters(lat, lon, meters, bearingDeg){
  const R=6371000;
  const brng=bearingDeg*Math.PI/180;
  const φ1=lat*Math.PI/180, λ1=lon*Math.PI/180, δ=meters/R;
  const sinφ2 = Math.sin(φ1)*Math.cos(δ) + Math.cos(φ1)*Math.sin(δ)*Math.cos(brng);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(brng)*Math.sin(δ)*Math.cos(φ1);
  const x = Math.cos(δ)-Math.sin(φ1)*sinφ2;
  const λ2 = λ1 + Math.atan2(y,x);
  return { lat: φ2*180/Math.PI, lon: ((λ2*180/Math.PI+540)%360)-180 };
}
function bearingDeg(a, b){
  const φ1=a.lat*Math.PI/180, φ2=b.lat*Math.PI/180;
  const Δλ=(b.lon-a.lon)*Math.PI/180;
  const y=Math.sin(Δλ)*Math.cos(φ2);
  const x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
const normIsl = s => (s||"").toLowerCase().replace(/ʻ|’|'/g,"").trim();

function parseCSV(s){
  // Minimal CSV parser for simple cases (no embedded commas in fields)
  const lines = s.split(/\r?\n/).filter(Boolean);
  if(!lines.length) return [];
  const hdr = lines.shift().split(",").map(h=>h.trim().toLowerCase());
  const iIsl = hdr.indexOf("island");
  const iReg = hdr.indexOf("region");
  const iLoc = hdr.indexOf("sitelocation") !== -1 ? hdr.indexOf("sitelocation") : hdr.indexOf("location");
  if(iIsl<0 || iLoc<0) throw new Error("CSV must have headers: island,region,sitelocation");
  return lines.map(l=>{
    const parts = l.split(",").map(x=>x.trim());
    return { island: parts[iIsl]||"", region: iReg>=0?parts[iReg]||"": "", sitelocation: parts[iLoc]||"" };
  }).filter(r=>r.island && r.sitelocation);
}

async function geocodeOne(island, sitelocation){
  const query = encodeURIComponent(`${sitelocation}, ${island}, Hawaii, USA`);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1&proximity=-156,20.7&country=US`;
  const res = await fetch(url);
  if(!res.ok){ return { note: `mapbox ${res.status}` }; }
  const json = await res.json();
  const f = json?.features?.[0];
  if(!f || !Array.isArray(f.center) || f.center.length<2) return { note: "no-feature" };
  const [lon, lat] = f.center;
  return { lat, lon, note: (f.place_name||"").replace(/,/g,"; ") };
}

(async ()=>{
  if(!fs.existsSync(CSV_IN)){
    console.error(`Input CSV not found: ${CSV_IN}
Export public.sightings_missing_locations to CSV with columns: island,region,sitelocation`);
    process.exit(1);
  }
  const rows = parseCSV(fs.readFileSync(CSV_IN,"utf8"));
  const out = ["island,region,sitelocation,lat_found,lon_found,lat_offshore,lon_offshore,geocoder_note"];

  for(const r of rows){
    try{
      const g = await geocodeOne(r.island, r.sitelocation);
      if(!g || g.note?.startsWith("mapbox") || g.note==="no-feature" || g.lat==null || g.lon==null){
        out.push(`${JSON.stringify(r.island)},${JSON.stringify(r.region)},${JSON.stringify(r.sitelocation)},,,,,${JSON.stringify(g?.note||"no-geocode")}`);
        continue;
      }
      const key = normIsl(r.island);
      const pivot = ISLAND_CENTROIDS[key] || ISLAND_CENTROIDS["maui"];
      const brg = bearingDeg(pivot, {lat:g.lat, lon:g.lon});
      const off = moveMeters(g.lat, g.lon, 100, brg);
      out.push(`${JSON.stringify(r.island)},${JSON.stringify(r.region)},${JSON.stringify(r.sitelocation)},${g.lat.toFixed(6)},${g.lon.toFixed(6)},${off.lat.toFixed(6)},${off.lon.toFixed(6)},${JSON.stringify(g.note)}`);
    }catch(e){
      out.push(`${JSON.stringify(r.island)},${JSON.stringify(r.region)},${JSON.stringify(r.sitelocation)},,,,,${JSON.stringify(e.message||String(e))}`);
    }
  }

  fs.writeFileSync(CSV_OUT, out.join("\n"));
  console.log("Wrote", CSV_OUT, "rows:", out.length-1);
})();
