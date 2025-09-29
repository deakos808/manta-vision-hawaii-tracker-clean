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
// ISLANDS removed — islands now come from DB
console.log("[IslandSelect][hardcoded] ISLANDS:", ISLANDS);

type LocRec = { id: string; name: string; island?: string; latitude?: number|null; longitude?: number|null };

export default function AddSightingPage() {
  const [mantas, setMantas] = useState<MantaDraft[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingManta, setEditingManta] = useState<MantaDraft|null>(null);

  const [date, setDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [stopTime, setStopTime] = useState<string>("");

  const [photographer, setPhotographer] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [island, setIsland] = useState("");
  const [locList, setLocList] = useState<LocRec[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [locationName, setLocationName] = useState<string>("");
  const [addingLoc, setAddingLoc] = useState(false);
  const [newLoc, setNewLoc] = useState("");

  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [coordSource, setCoordSource] = useState<string>("");

  const [mapOpen, setMapOpen] = useState(false);
  const formSightingId = useMemo(()=>uuid(),[]);

  useEffect(()=>{ console.log("[AddSighting] mounted"); }, []);

// Islands from DB (public.sightings.island) with loud probes
const [islands, setIslands] = useState<string[]>([]);
const [islandsLoading, setIslandsLoading] = useState<boolean>(true);
const [islandsError, setIslandsError] = useState<string|null>(null);

useEffect(() => {
  let alive = true;
  (async () => {
    console.log("[IslandSelect][fetch] start");
    setIslandsLoading(true);
    setIslandsError(null);
    try {
      const { data, error } = await supabase
        .from("sightings")
        .select("island", { distinct: true })
        .not("island", "is", null)
        .order("island", { ascending: true });
      if (!alive) return;
      if (error) {
        console.log("[IslandSelect][fetch] ERROR:", error);
        setIslandsError(error.message);
        setIslandsLoading(false);
        return;
      }
      const vals = (data ?? [])
        .map((r:any) => (r.island ?? "").toString().trim())
        .filter((x:string) => x.length > 0);
      console.log("[IslandSelect][fetch] DISTINCT islands from DB:", vals);
      setIslands(vals);
      setIslandsLoading(false);
    } catch (e:any) {
      if (!alive) return;
      console.log("[IslandSelect][fetch] EXCEPTION:", e?.message || e);
      setIslandsError(e?.message || String(e));
      setIslandsLoading(false);
    }
  })();
  return () => { alive = false; };
}, []);

useEffect(()=>{ console.log("[IslandSelect][hardcoded][render] options:", ISLANDS); }, []);

  // Load locations for selected island from a RESTable view with coords,
  // then fallback to distinct names from sightings.
  useEffect(()=>{
    let cancelled=false;
    (async ()=>{
      const isl = island?.trim();
      if(!isl){ setLocList([]); setLocationId(""); setLocationName(""); return; }

      // 1) try location_defaults (name + latitude/longitude)
      try{
        const { data, error, status } = await supabase
          .from("location_defaults")
          .select("name,island,latitude,longitude")
          .eq("island", isl)
          .order("name", { ascending: true });

        if(!cancelled && !error && status!>=400 && data && data.length){
          const seen = new Set<string>(); const list:LocRec[]=[];
          for(const r of data){
            const key = (r.name||"").trim().toLowerCase();
            if(!seen.has(key)){
              seen.add(key);
              list.push({ id: String(r.name), name: String(r.name), island: r.island, latitude: r.latitude ?? null, longitude: r.longitude ?? null });
            }
          }
          setLocList(list);
          return;
        }
      }catch{}

      // 2) fallback to distinct sitelocation from sightings (no coords)
      try{
        const { data: srows, error: serr } = await supabase
          .from("sightings")
          .select("sitelocation")
          .eq("island", isl)
          .not("sitelocation","is", null);

        if(!cancelled && !serr && srows){
          const names = Array.from(new Set(
            srows.map((r:any)=>(r.sitelocation||"").toString().trim()).filter((n:string)=>n.length>0)
          )).sort((a,b)=>a.localeCompare(b));
          setLocList(names.map((n:string)=>({ id:n, name:n, island:isl })));
          return;
        }
      }catch{}

      setLocList(["Keauhou Bay","Kailua Pier","Māʻalaea Harbor","Honokōwai"].map(n=>({id:n,name:n,island:isl})));
    })();
    return ()=>{ cancelled=true; };
  },[island]);

  async function fetchEarliestCoords(isl: string, loc: string): Promise<{lat:number; lon:number} | null> {
    try{
      const { data, error } = await supabase
        .from("sightings")
        .select("latitude,longitude,sighting_date,pk_sighting_id")
        .eq("island", isl)
        .ilike("sitelocation", loc)      // case-insensitive
        .not("latitude","is", null)
        .not("longitude","is", null)
        .order("sighting_date", { ascending: true })
        .order("pk_sighting_id", { ascending: true })
        .limit(1);
      if(error || !data || !data.length) return null;
      const r = data[0];
      const la = Number(r.latitude), lo = Number(r.longitude);
      if(!Number.isFinite(la) || !Number.isFinite(lo)) return null;
      return { lat: la, lon: lo };
    }catch(e){ console.warn("[AddSighting] fetchEarliestCoords failed", e); return null; }
  }

  // On location change: use coords from dropdown item if present; otherwise earliest in sightings
  useEffect(()=>{
    if(!locationId) return;
    const rec = locList.find(l => l.id === locationId) || locList.find(l => l.name === locationId);
    const displayName = rec?.name ?? locationName ?? locationId;
    if (rec && rec.name) setLocationName(rec.name);

    const apply = (la:number, lo:number, src?:string) => {
      setLat(String(Number(la).toFixed(5)));
      setLng(String(Number(lo).toFixed(5)));
      if (src) setCoordSource(src);
    };

    if (rec && rec.latitude != null && rec.longitude != null) {
      apply(Number(rec.latitude), Number(rec.longitude), "location defaults");
      return;
    }

    if (!island || !displayName) return;
    fetchEarliestCoords(island, displayName)
      .then((res)=>{ if(res){ apply(res.lat, res.lon, "earliest sighting"); } })
      .catch(()=>{});
  },[locationId, locList, island]);

  function openMap(){ setMapOpen(true); }

  const onAddSave = (m:MantaDraft)=>{ console.log("[AddSighting] unified add save", m); setMantas(prev=>[...prev,m]); setAddOpen(false); };
  const onEditSave = (m:MantaDraft)=>{ console.log("[AddSighting] unified edit save", m);
    setMantas(prev=>{ const i=prev.findIndex(x=>x.id===m.id); if(i>=0){ const c=[...prev]; c[i]=m; return c; } return [...prev,m]; });
    setEditingManta(null);
  };

  return (
    <>
      <UnifiedMantaModal open={addOpen} onClose={()=>setAddOpen(false)} sightingId={formSightingId} onSave={onAddSave} />
      <UnifiedMantaModal open={!!editingManta} onClose={()=>setEditingManta(null)} sightingId={formSightingId} existingManta={editingManta||undefined} onSave={onEditSave} />

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
                <input type="number" step="0.00001" inputMode="decimal" className="border rounded px-3 py-2"
                  value={lat} onChange={(e)=>{ setLat(e.target.value); setCoordSource("manual input"); }} placeholder="e.g., 20.456" />
              </div>
              <div>
                <label className="text-xs text-gray-600">Longitude</label>
                <input type="number" step="0.00001" inputMode="decimal" className="border rounded px-3 py-2"
                  value={lng} onChange={(e)=>{ setLng(e.target.value); setCoordSource("manual input"); }} placeholder="e.g., -156.456" />
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
        <div className="bg-gradient-to-r from-sky-600 to-blue-700 py-10 text-white">
          <div className="max-w-5xl mx-auto px-4 text-center">
            <h1 className="text-3xl font-semibold">Add Manta Sighting</h1>
            <p className="text-sm opacity-90 mt-1">sighting: {formSightingId.slice(0,8)}</p>
          </div>
        </div>

        <div className="bg-white">
          <div className="max-w-5xl mx-auto px-4 py-3 text-sm text-slate-600">
            <a href="/browse" className="underline text-sky-700">Return to Browse Data</a>
            <span className="mx-2">/</span>
            <span className="text-slate-400">Sightings</span>
            <span className="mx-2">/</span>
            <span className="font-medium">Add</span>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 pb-10 space-y-6">
          <Card>
            <CardHeader><CardTitle>Sighting Details</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3">
              <input type="date" className="border rounded px-3 py-2" value={date} onChange={(e)=>setDate(e.target.value)} />
              <select className="border rounded px-3 py-2" value={startTime} onChange={(e)=>setStartTime(e.target.value)}>
                <option value="">Start Time</option>
                {TIME_OPTIONS.map(t=> <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="border rounded px-3 py-2" value={stopTime} onChange={(e)=>setStopTime(e.target.value)}>
                <option value="">Stop Time</option>
                {TIME_OPTIONS.map(t=> <option key={t} value={t}>{t}</option>)}
              </select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Photographer & Contact</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3">
              <input className="border rounded px-3 py-2" placeholder="Photographer" value={photographer} onChange={(e)=>setPhotographer(e.target.value)} />
              <input className="border rounded px-3 py-2" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
              <input className="border rounded px-3 py-2" placeholder="Phone" value={phone} onChange={(e)=>setPhone(e.target.value)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Location</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <select className="border rounded px-3 py-2" value={island} onChange={(e)=>setIsland(e.target.value)}>
  {(() => { const srcLabel = islandsLoading ? "loading" : (islands && islands.length ? "db" : "none");
    console.log("[IslandSelect][render] source=", srcLabel, "count=", islands?.length ?? 0, "error=", islandsError, "opts=", islands);
    return null;
  })()}
  <option value="">Select island</option>
  {islandsLoading && <option value="__loading" disabled>Loading…</option>}
  {(!islandsLoading && islandsError) && <option value="__err" disabled>Load error — check console</option>}
  {(!islandsLoading && !islandsError && islands.length === 0) && <option value="__none" disabled>No islands from DB</option>}
  {(!islandsLoading && !islandsError && islands.length > 0) && islands.map(i => (
    <option key={i} value={i}>{i}</option>
  ))}
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
                  <input type="number" step="0.00001" inputMode="decimal" className="border rounded px-3 py-2 w-full" placeholder="e.g., 20.456"
                    value={lat} onChange={(e)=>{ setLat(e.target.value); setCoordSource("manual input"); }} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Longitude</label>
                  <input type="number" step="0.00001" inputMode="decimal" className="border rounded px-3 py-2 w-full" placeholder="e.g., -156.456"
                    value={lng} onChange={(e)=>{ setLng(e.target.value); setCoordSource("manual input"); }} />
                </div>
              </div>

              <div className="text-[11px] text-gray-500">{coordSource ? `coords source: ${coordSource}` : ""}</div>

              <div>
                <Button variant="outline" onClick={openMap}>Use Map for Location</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <div className="text-[11px] text-gray-500 mb-2" data-island-probe>
  Island options: {islandsLoading ? "loading" : ((islands && islands.length) || 0)} from DB
</div>
<CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent>
              <textarea className="w-full border rounded p-2 min-h-[140px]" placeholder="Enter notes about this sighting..." />
            </CardContent>
          </Card>

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
