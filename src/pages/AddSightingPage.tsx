import React, { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UnifiedMantaModal, { type MantaDraft } from "@/components/mantas/UnifiedMantaModal";
import { supabase } from "@/lib/supabase";

// ---- helpers ----
function uuid(){ try { return (crypto as any).randomUUID(); } catch { return Math.random().toString(36).slice(2); } }
function buildTimes(stepMin=5){ const out:string[]=[]; for(let h=0;h<24;h++){ for(let m=0;m<60;m+=stepMin){ out.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);} } return out; }
const TIME_OPTIONS = buildTimes(5);
const ISLANDS = ["Hawaiʻi","Maui","Oʻahu","Kauaʻi","Molokaʻi","Lānaʻi"];

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

  const formSightingId = useMemo(()=>uuid(),[]);

  useEffect(()=>{ console.log("[AddSighting] mounted"); }, []);

  // load locations for island
  useEffect(()=>{
    let cancelled=false;
    async function load(){
      if(!island){ setLocList([]); setLocationId(""); setLocationName(""); return; }
      try{
        const { data, error } = await supabase
          .from("locations")
          .select("*")
          .eq("island", island)
          .order("name", { ascending: true });
        if(!cancelled && !error && data){
          const list = data.map((r:any)=>({
            id: String(r.id), name: String(r.name),
            island: r.island ?? island,
            latitude: (r.latitude ?? null), longitude: (r.longitude ?? null)
          })) as LocRec[];
          setLocList(list);
          return;
        }
      }catch(e){ console.warn("[AddSighting] locations error:", e); }
      // fallback seeds if DB empty (keep UI usable)
      const seed = ["Keauhou Bay","Kailua Pier","Māʻalaea Harbor","Honokōwai"].map(n=>({id:n,name:n,island})) as LocRec[];
      setLocList(seed);
    }
    load();
    return ()=>{ cancelled=true; };
  },[island]);

  // auto-fill coordinates if location has them
  useEffect(()=>{
    if(!locationId) return;
    const rec = locList.find(l=> l.id===locationId) || locList.find(l=> l.name===locationId);
    if(rec){
      setLocationName(rec.name);
      if(rec.latitude!=null && rec.longitude!=null){
        setLat(String(Number(rec.latitude).toFixed(5)));
        setLng(String(Number(rec.longitude).toFixed(5)));
      }
    }
  },[locationId, locList]);

  async function addNewLocation(){
    if(!island || !newLoc.trim()) return;
    const clean=newLoc.trim();
    try{
      const { data, error } = await supabase
        .from("locations")
        .insert({ island, name: clean })
        .select("*")
        .limit(1);
      if(!error && data && data.length){
        const r=data[0];
        const rec:LocRec={ id:String(r.id), name:String(r.name), island:r.island ?? island, latitude:r.latitude ?? null, longitude:r.longitude ?? null };
        setLocList(prev=>[...prev, rec].sort((a,b)=>a.name.localeCompare(b.name)));
        setLocationId(String(rec.id));
        setLocationName(rec.name);
        setNewLoc(""); setAddingLoc(false);
        return;
      }
    }catch(e){ console.warn("[AddSighting] add location failed, local fallback:", e); }
    const rec:LocRec={ id:clean, name:clean, island };
    setLocList(prev=>[...prev, rec].sort((a,b)=>a.name.localeCompare(b.name)));
    setLocationId(clean); setLocationName(clean);
    setNewLoc(""); setAddingLoc(false);
  }

  const onAddSave = (m:MantaDraft)=>{ console.log("[AddSighting] unified add save", m); setMantas(p=>[...p,m]); setAddOpen(false); };
  const onEditSave = (m:MantaDraft)=>{ console.log("[AddSighting] unified edit save", m);
    setMantas(prev=>{ const i=prev.findIndex(x=>x.id===m.id); if(i>=0){ const c=[...prev]; c[i]=m; return c; } return [...prev,m]; });
    setEditingManta(null);
  };

  return (
    <>
      {/* Unified modal instances */}
      <UnifiedMantaModal open={addOpen} onClose={()=>setAddOpen(false)} sightingId={formSightingId} onSave={onAddSave} />
      <UnifiedMantaModal open={!!editingManta} onClose={()=>setEditingManta(null)} sightingId={formSightingId} existingManta={editingManta||undefined} onSave={onEditSave} />

      {/* Simple Pick Location dialog (placeholder; swap to map later) */}
      {mapOpen && (
        <div className="fixed inset-0 z-[300000] bg-black/40 flex items-center justify-center" onClick={()=>setMapOpen(false)}>
          <div className="bg-white w-full max-w-2xl rounded-lg border p-4 relative" onClick={(e)=>e.stopPropagation()}>
            <button aria-label="Close" className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border" onClick={()=>setMapOpen(false)}>&times;</button>
            <h3 className="text-lg font-medium mb-3">Pick Location</h3>
            <div className="rounded border grid place-items-center h-56 mb-3 text-sm text-gray-600">
              Map preview unavailable on this device. Enter coordinates below or use a map-enabled device.
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-xs text-gray-600">Latitude</label>
                <input type="number" step="0.00001" inputMode="decimal" className="w-full border rounded px-3 py-2" value={lat} onChange={(e)=>setLat(e.target.value)} placeholder="19.44400" />
              </div>
              <div>
                <label className="text-xs text-gray-600">Longitude</label>
                <input type="number" step="0.00001" inputMode="decimal" className="w-full border rounded px-3 py-2" value={lng} onChange={(e)=>setLng(e.target.value)} placeholder="-156.44400" />
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

        {/* Breadcrumb under header (left-aligned) */}
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
          {/* Sighting Details: Date, Start, Stop */}
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
                      <Button onClick={addNewLocation} disabled={!newLoc.trim() || !island}>Add</Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600">Latitude</label>
                  <input type="number" step="0.00001" inputMode="decimal" className="border rounded px-3 py-2 w-full" placeholder="19.44400" value={lat} onChange={(e)=>setLat(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Longitude</label>
                  <input type="number" step="0.00001" inputMode="decimal" className="border rounded px-3 py-2 w-full" placeholder="-156.44400" value={lng} onChange={(e)=>setLng(e.target.value)} />
                </div>
              </div>

              <div>
                <Button variant="outline" onClick={()=>setMapOpen(true)}>Use Map for Location</Button>
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
