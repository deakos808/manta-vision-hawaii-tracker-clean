import React, { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UnifiedMantaModal, { type MantaDraft } from "@/components/mantas/UnifiedMantaModal";
import { supabase } from "@/lib/supabase";
import TempSightingMap from "@/components/map/TempSightingMap";

function uuid(){ try { return (crypto as any).randomUUID(); } catch { return Math.random().toString(36).slice(2); } }
function buildTimes(stepMin=5){ const out:string[]=[]; for(let h=0;h<24;h++){ for(let m=0;m<60;m+=stepMin){ out.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);} } return out; }
const TIME_OPTIONS = buildTimes(5);
const ISLANDS = ["Hawaiʻi","Maui","Oʻahu","Kauaʻi","Molokaʻi","Lānaʻi"];

const ISLAND_CENTROIDS: Record<string, {lat:number; lon:number}> = {
  "hawaii":   { lat: 19.6,  lon: -155.5 },
  "hawaiʻi":  { lat: 19.6,  lon: -155.5 },
  "maui":     { lat: 20.8,  lon: -156.3 },
  "oahu":     { lat: 21.48, lon: -157.98 },
  "oʻahu":    { lat: 21.48, lon: -157.98 },
  "kauai":    { lat: 22.05, lon: -159.50 },
  "kauaʻi":   { lat: 22.05, lon: -159.50 },
  "molokai":  { lat: 21.15, lon: -157.07 },
  "molokaʻi": { lat: 21.15, lon: -157.07 },
  "lanai":    { lat: 20.82, lon: -156.93 },
  "lānaʻi":   { lat: 20.82, lon: -156.93 }
};

function normIslKey(s:string){ return s.toLowerCase().replace(/[’'ʻ]/g,'').trim(); }

// Haversine km
function haversineKm(a:{lat:number; lon:number}, b:{lat:number; lon:number}){
  const R=6371, dLat=(b.lat-a.lat)*Math.PI/180, dLon=(b.lon-a.lon)*Math.PI/180;
  const lat1=a.lat*Math.PI/180, lat2=b.lat*Math.PI/180;
  const sinDlat=Math.sin(dLat/2), sinDlon=Math.sin(dLon/2);
  const h=sinDlat*sinDlat + Math.cos(lat1)*Math.cos(lat2)*sinDlon*sinDlon;
  return 2*R*Math.asin(Math.sqrt(h));
}
function bearingDeg(a:{lat:number; lon:number}, b:{lat:number; lon:number}){
  const φ1=a.lat*Math.PI/180, φ2=b.lat*Math.PI/180, Δλ=(b.lon-a.lon)*Math.PI/180;
  const y=Math.sin(Δλ)*Math.cos(φ2);
  const x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
function moveMeters(lat:number, lon:number, meters:number, bearing:number){
  const R=6371000, brng=bearing*Math.PI/180, φ1=lat*Math.PI/180, λ1=lon*Math.PI/180, δ=meters/R;
  const sinφ2 = Math.sin(φ1)*Math.cos(δ) + Math.cos(φ1)*Math.sin(δ)*Math.cos(brng);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(brng)*Math.sin(δ)*Math.cos(Math.cos(φ1));
  const x = Math.cos(δ)-Math.sin(φ1)*sinφ2;
  const λ2 = λ1 + Math.atan2(Math.sin(brng)*Math.sin(δ)*Math.cos(φ1), x);
  return { lat: φ2*180/Math.PI, lon: ((λ2*180/Math.PI+540)%360)-180 };
}
function islandVariants(name:string): string[] {
  const n = (name||"").trim();
  switch (n) {
    case "Hawaiʻi": return ["Hawaiʻi","Hawaii","Hawai'i"];
    case "Oʻahu":   return ["Oʻahu","Oahu","O'ahu","O’ahu"];
    case "Kauaʻi":  return ["Kauaʻi","Kauai","Kaua'i"];
    case "Molokaʻi":return ["Molokaʻi","Molokai","Moloka'i"];
    case "Lānaʻi":  return ["Lānaʻi","Lanai","Lana'i"];
    case "Maui":    return ["Maui"];
    default:        return [n];
  }
}

type LocRec = { id: string; name: string; island?: string; latitude?: number|null; longitude?: number|null };

export default function AddSightingPage() {
  // unified modal state
  const [mantas, setMantas] = useState<MantaDraft[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingManta, setEditingManta] = useState<MantaDraft|null>(null);

  // form state
  const [date, setDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [stopTime, setStopTime] = useState<string>("");

  const [photographer, setPhotographer] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [island, setIsland] = useState("");
  const [locList, setLocList] = useState<LocRec[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [locationName, setLocationName] = useState<string>(""); // friendly display
  const [addingLoc, setAddingLoc] = useState(false);
  const [newLoc, setNewLoc] = useState("");

  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [mapOpen, setMapOpen] = useState(false);

  
  const [coordSource, setCoordSource] = useState<string>("");
const formSightingId = useMemo(()=>uuid(),[]);

  useEffect(()=>{ console.log("[AddSighting] mounted"); }, []);

  // load locations for island (locations table → fallback distinct(sitelocation) from sightings)
  useEffect(()=>{
    let cancelled=false;
    async function load(){
      const isl = island?.trim();
      if(!isl){ setLocList([]); setLocationId(""); setLocationName(""); return; }

      const variants = islandVariants(isl);

      // try locations table
      try{
        const { data, error, status } = await supabase
          .from("locations")
          .select("id,name,island,latitude,longitude")
          .in("island", variants)
          .order("name", { ascending: true });
        if(!cancelled && !error && status<400 && data && data.length){
          // dedupe by name
          const seen = new Set<string>(); const dedup:LocRec[]=[];
          for(const r of data){
            const k = (r.name||"").trim().toLowerCase();
            if(!seen.has(k)){ seen.add(k); dedup.push({ id:String(r.id), name:String(r.name), island:r.island, latitude:r.latitude ?? null, longitude:r.longitude ?? null }); }
          }
          setLocList(dedup);
          return;
        }
      }catch{ /* continue */ }

      // fallback: sightings distinct sitelocation
      try{
        const { data: srows, error: serr } = await supabase
          .from("sightings")
          .select("sitelocation")
          .in("island", variants)
          .not("sitelocation","is",null);
        if(!cancelled && !serr && srows){
          const names = Array.from(new Set(
            srows.map((r:any)=>(r.sitelocation||"").toString().trim()).filter((n:string)=>n.length>0)
          )).sort((a,b)=>a.localeCompare(b));
          setLocList(names.map((n:string)=>({ id:n, name:n, island:isl })));
          return;
        }
      }catch{/* ignore */}

      // minimal seed
      setLocList(["Keauhou Bay","Kailua Pier","Māʻalaea Harbor","Honokōwai"].map(n=>({id:n,name:n,island:isl})));
    }
    load();
    return ()=>{ cancelled=true; };
  },[island]);

  // earliest-sighting default coords for a (island, location)
  async function fetchDefaultCoords(isl:string, loc:string): Promise<{lat:number, lon:number, source:string} | null> {
  try{
    const variants = islandVariants(isl);
    // Pull several earliest rows; we will ignore centroid-like coords client-side
    const { data, error } = await supabase
      .from("sightings")
      .select("latitude,longitude,sighting_date,pk_sighting_id")
      .in("island", variants)
      .eq("sitelocation", loc)
      .not("latitude","is", null)
      .not("longitude","is", null)
      .order("sighting_date", { ascending: true })
      .order("pk_sighting_id", { ascending: true })
      .limit(50);
    if(!error && data && data.length){
      const key = normIslKey(isl);
      const pivot = ISLAND_CENTROIDS[key] || ISLAND_CENTROIDS["maui"];
      const pick = data.find((r:any)=>{
        const la = Number(r.latitude), lo = Number(r.longitude);
        if(!Number.isFinite(la)||!Number.isFinite(lo)) return false;
        const d = haversineKm(pivot, {lat:la, lon:lo});
        return d > 8; // ignore centroid-like coords
      }) || data[0];
      const la = Number(pick.latitude), lo = Number(pick.longitude);
      if(Number.isFinite(la) && Number.isFinite(lo)) return { lat: la, lon: lo, source: "earliest sighting" };
    }
  }catch(e){ console.warn("[AddSighting] fetchDefaultCoords DB step failed", e); }

  // Fallback: geocode with Mapbox (if token present), then nudge 100 m offshore
  try{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = (import.meta as any).env?.VITE_MAPBOX_TOKEN as string | undefined;
    if(!token) return null;
    const q = encodeURIComponent(`${loc}, ${isl}, Hawaii, USA`);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${token}&limit=1&country=US`;
    const res = await fetch(url);
    if(res.ok){
      const j = await res.json();
      const f = j?.features?.[0];
      if(f?.center?.length===2){
        const lo = Number(f.center[0]), la = Number(f.center[1]);
        const key = normIslKey(isl);
        const pivot = ISLAND_CENTROIDS[key] || ISLAND_CENTROIDS["maui"];
        const brg = bearingDeg(pivot, {lat:la, lon:lo});
        const off = moveMeters(la, lo, 100, brg);
        return { lat: off.lat, lon: off.lon, source: "mapbox 100m offshore" };
      }
    }
  }catch(e){ console.warn("[AddSighting] mapbox fallback failed", e); }

  return null;
}

  // open map: if no lat/lon, try fetch canonical first, then open
  async function openMap(){
    const hasLat = Number.isFinite(parseFloat(lat));
    const hasLng = Number.isFinite(parseFloat(lng));
    if (hasLat && hasLng) { setMapOpen(true); return; }

    const displayLoc = locationName || (locList.find(l=>l.id===locationId)?.name) || "";
    if (island && displayLoc){
      try{
        const res = await fetchDefaultCoords(island, displayLoc);
        if (res) { setLat(String(Number(res.lat).toFixed(5))); setLng(String(Number(res.lon).toFixed(5))); }
      }catch{}
    }
    setMapOpen(true);
  }

  // auto-fill coordinates if location has them (or earliest sighting canonical)
  useEffect(()=>{
    if(!locationId) return;
    const rec = locList.find(l => l.id === locationId) || locList.find(l => l.name === locationId);
    const displayName = rec?.name ?? locationName ?? locationId;
    if (rec && rec.name) setLocationName(rec.name);

    const apply = (la:number, lo:number, src?:string) => { setLat(String(Number(la).toFixed(5))); setLng(String(Number(lo).toFixed(5))); if(src) setCoordSource(src); };

    if (rec && rec.latitude != null && rec.longitude != null) {
      apply(Number(rec.latitude), Number(rec.longitude), "locations table");
      return;
    }

    if (!island || !displayName) return;
    fetchDefaultCoords(island, displayName)
      .then((res)=>{ if(res){ apply(res.lat, res.lon, "earliest sighting"); } })
      .catch(()=>{});
  },[locationId, locList, island]);

  // modal save handlers
  const onAddSave = (m:MantaDraft)=>{ console.log("[AddSighting] unified add save", m); setMantas(p=>[...p,m]); setAddOpen(false); };
  const onEditSave = (m:MantaDraft)=>{ console.log("[AddSighting] unified edit save", m);
    setMantas(prev=>{ const i=prev.findIndex(x=>x.id===m.id); if(i>=0){ const c=[...prev]; c[i]=m; return c; } return [...prev,m]; });
    setEditingManta(null);
  };

  return (
    <>
      {/* unified modals */}
      <UnifiedMantaModal open={addOpen} onClose={()=>setAddOpen(false)} sightingId={formSightingId} onSave={onAddSave} />
      <UnifiedMantaModal open={!!editingManta} onClose={()=>setEditingManta(null)} sightingId={formSightingId} existingManta={editingManta||undefined} onSave={onEditSave} />

      {/* Pick Location dialog */}
      {mapOpen && (
        <div className="fixed inset-0 z-[300000] bg-black/40 flex items-center justify-center" onClick={()=>setMapOpen(false)}>
          <div className="bg-white w-full max-w-2xl rounded-lg border p-4 relative" onClick={(e)=>e.stopPropagation()}>
            <button aria-label="Close" className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border" onClick={()=>setMapOpen(false)}>&times;</button>
            <h3 className="text-lg font-medium mb-3">Pick Location</h3>
            <TempSightingMap
              lat={Number.isFinite(parseFloat(lat)) ? parseFloat(lat) : undefined}
              lon={Number.isFinite(parseFloat(lng)) ? parseFloat(lng) : undefined}
              onPick={(la,lo)=>{ setLat(String(la.toFixed(5))); setLng(String(lo.toFixed(5))); setCoordSource("map pick"); }}
            />
            <div className="grid grid-cols-2 gap-2 mb-3 mt-3">
              <div>
                <label className="text-xs text-gray-600">Latitude</label>
                <input type="number" step="0.00001" inputMode="decimal" className="w-full border rounded px-3 py-2" value={lat} onChange={(e)=>setLat(e.target.value)} placeholder="e.g., 20.456" />
              </div>
              <div>
                <label className="text-xs text-gray-600">Longitude</label>
                <input type="number" step="0.00001" inputMode="decimal" className="w-full border rounded px-3 py-2" value={lng} onChange={(e)=>setLng(e.target.value)} placeholder="e.g., -156.456" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={()=>setMapOpen(false)}>Close</Button>
              <Button onClick={()=>{ setMapOpen(false); }}>Use These Coordinates</Button>
            </div>
          </div>
        </div>
      )}

      <Layout>
        {/* Hero */}
        <div className="bg-gradient-to-r from-sky-600 to-blue-700 py-10 text-white">
          <div className="max-w-5xl mx-auto px-4 text-center">
            <h1 className="text-3xl font-semibold">Add Manta Sighting</h1>
            <p className="text-sm opacity-90 mt-1">sighting: {formSightingId.slice(0,8)}</p>
          </div>
        </div>

        {/* Breadcrumb under header */}
        <div className="bg-white">
          <div className="max-w-5xl mx-auto px-4 py-3 text-sm text-slate-600">
            <a href="/browse" className="underline text-sky-700">Return to Browse Data</a>
            <span className="mx-2">/</span>
            <span className="text-slate-400">Sightings</span>
            <span className="mx-2">/</span>
            <span className="font-medium">Add</span>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-5xl mx-auto px-4 pb-10 space-y-6">
          {/* Sighting Details */}
          <Card>
            <CardHeader><CardTitle>Sighting Details</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3">
              <input type="date" className="border rounded px-3 py-2" value={date} onChange={(e)=>setDate(e.target.value)} />
              <select className="border rounded px-3 py-2" value={startTime} onChange={(e)=>setStartTime(e.target.value)}>
                <option value="">Start Time</option>
                {TIME_OPTIONS.map(t=> <option key={"s-"+t} value={t}>{t}</option>)}
              </select>
              <select className="border rounded px-3 py-2" value={stopTime} onChange={(e)=>setStopTime(e.target.value)}>
                <option value="">Stop Time</option>
                {TIME_OPTIONS.map(t=> <option key={"e-"+t} value={t}>{t}</option>)}
              </select>
            </CardContent>
          </Card>

          {/* Photographer / Contact */}
          <Card>
            <CardHeader><CardTitle>Photographer & Contact</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3">
              <input className="border rounded px-3 py-2" placeholder="Photographer" value={photographer} onChange={(e)=>setPhotographer(e.target.value)} />
              <input className="border rounded px-3 py-2" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
              <input className="border rounded px-3 py-2" placeholder="Phone" value={phone} onChange={(e)=>setPhone(e.target.value)} />
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader><CardTitle>Location</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <select className="border rounded px-3 py-2" value={island} onChange={(e)=>setIsland(e.target.value)}>
                  <option value="">Select island</option>
                  {ISLANDS.map(i=> <option key={i} value={i}>{i}</option>)}
                </select>

                <div>
                  <select className="border rounded px-3 py-2 w-full" value={locationId} onChange={(e)=>setLocationId(e.target.value)} disabled={!island}>
                    <option value="">{island ? "Select location" : "Select island first"}</option>
                    {locList.map(loc=> <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                  </select>
                  <div className="text-xs mt-1">
                    <button className="text-sky-700 underline disabled:text-slate-400" disabled={!island} onClick={(e)=>{ e.preventDefault(); setAddingLoc(v=>!v); }}>
                      Not listed? Add new
                    </button>
                  </div>
                  {addingLoc && (
                    <div className="mt-2 flex gap-2">
                      <input className="border rounded px-3 py-2 flex-1" placeholder="New location name" value={newLoc} onChange={(e)=>setNewLoc(e.target.value)} />
                      <Button onClick={async ()=>{
                        if(!newLoc.trim() || !island) return;
                        const clean=newLoc.trim();
                        try{
                          const { data, error } = await supabase.from("locations")
                            .insert({ island, name: clean }).select("id,name,island").limit(1);
                          if(!error && data && data[0]){
                            const r=data[0]; setLocList(prev=>[...prev, {id:String(r.id), name:String(r.name), island:r.island}].sort((a,b)=>a.name.localeCompare(b.name)));
                            setLocationId(String(r.id)); setLocationName(String(r.name));
                          }else{
                            setLocList(prev=>[...prev, {id:clean, name:clean, island}].sort((a,b)=>a.name.localeCompare(b.name)));
                            setLocationId(clean); setLocationName(clean);
                          }
                        }catch{
                          setLocList(prev=>[...prev, {id:clean, name:clean, island}].sort((a,b)=>a.name.localeCompare(b.name)));
                          setLocationId(clean); setLocationName(clean);
                        }
                        setNewLoc(""); setAddingLoc(false);
                      }}>Add</Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600">Latitude</label>
                  <input type="number" step="0.00001" inputMode="decimal" className="border rounded px-3 py-2 w-full" placeholder="e.g., 20.456" value={lat} onChange={(e)=>setLat(e.target.value)} />
                </div>
                <div>
              <div data-coord-source className="text-[11px] text-gray-500">{coordSource ? `coords source: ${coordSource}` : ""}</div>

                  <label className="text-xs text-gray-600">Longitude</label>
                  <input type="number" step="0.00001" inputMode="decimal" className="border rounded px-3 py-2 w-full" placeholder="e.g., -156.456" value={lng} onChange={(e)=>setLng(e.target.value)} />
                </div>
              </div>

              <div>
                <Button variant="outline" onClick={openMap}>Use Map for Location</Button>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent>
              <textarea className="w-full border rounded p-2 min-h-[140px]" placeholder="Enter notes about this sighting..." />
            </CardContent>
          </Card>

          {/* Mantas Added */}
          <Card>
            <CardHeader><CardTitle>Mantas Added</CardTitle></CardHeader>
            <CardContent>
              <div className="hidden md:grid grid-cols-[96px_minmax(0,1fr)_120px_160px_100px] gap-3 text-[11px] uppercase tracking-wide text-gray-500 px-6 pt-2">
                <div>Photos</div><div>Name</div><div>Gender</div><div>Age Class</div><div>Size (cm)</div>
              </div>
              {mantas.length === 0 ? (
                <div className="text-sm text-gray-600 px-6">No mantas added yet.</div>
              ) : (
                <ul className="px-4">
                  {mantas.map((m)=>{
                    const vBest = m.photos?.find(p=>p.view==="ventral" && p.isBestVentral) || m.photos?.find(p=>p.view==="ventral");
                    const dBest = m.photos?.find(p=>p.view==="dorsal" && p.isBestDorsal)  || m.photos?.find(p=>p.view==="dorsal");
                    return (
                      <li key={m.id} className="grid grid-cols-[96px_minmax(0,1fr)_120px_160px_100px] items-center gap-3 border rounded mb-2 p-2">
                        <div className="flex items-center gap-1">
                          {vBest ? <img src={vBest.url} alt="V" className="w-10 h-10 object-cover rounded" /> : <div className="w-10 h-10 rounded bg-gray-100 grid place-items-center text-[10px] text-gray-400">no V</div>}
                          {dBest ? <img src={dBest.url} alt="D" className="w-10 h-10 object-cover rounded" /> : <div className="w-10 h-10 rounded bg-gray-100 grid place-items-center text-[10px] text-gray-400">no D</div>}
                        </div>
                        <div className="truncate">{m.name || "—"}</div>
                        <div className="truncate">{m.gender || "—"}</div>
                        <div className="truncate">{m.ageClass || "—"}</div>
                        <div className="truncate">{m.size ? `${parseInt(m.size as any,10)} cm` : "—"}</div>
                        <div className="col-span-full flex justify-end gap-2">
                          <button type="button" className="px-2 py-1 border rounded text-xs" onClick={()=>setEditingManta(m)}>Edit</button>
                          <button type="button" className="px-2 py-1 border rounded text-xs" onClick={()=>setMantas(prev=>prev.filter(x=>x.id!==m.id))}>Remove</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-start">
            <Button onClick={()=>setAddOpen(true)}>Add Mantas</Button>
          </div>

          <div id="probe-add-sighting-v2" className="mx-auto mt-2 max-w-5xl px-4 text-[10px] text-muted-foreground">probe:add-sighting-v2</div>
        </div>
      </Layout>
    </>
  );
}
