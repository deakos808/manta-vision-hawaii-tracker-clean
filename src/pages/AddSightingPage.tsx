import React, { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { useNavigate, useLocation } from "react-router-dom";
import MatchModal from "@/components/mantas/MatchModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UnifiedMantaModal, { type MantaDraft } from "@/components/mantas/UnifiedMantaModal";
import { supabase } from "@/lib/supabase";
import TempSightingMap from "@/components/map/TempSightingMap";

function uuid(){ try { return (crypto as any).randomUUID(); } catch { return Math.random().toString(36).slice(2); } }
function buildTimes(stepMin=5){ const out:string[]=[]; for(let h=0;h<24;h++){ for(let m=0;m<60;m+=stepMin){ out.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);} } return out; }
const TIME_OPTIONS = buildTimes(5);

const ROW_GRID = "grid grid-cols-[220px_minmax(0,1fr)_140px_140px_120px] items-center gap-4";
const useTotalPhotos = (mantas:any[]) => (mantas ?? []).reduce((n,m:any)=> n + (Array.isArray(m?.photos) ? m.photos.length : 0), 0);

// format size to two decimals in cm
function formatCm(v:any){ const n = Number(v); return Number.isFinite(n) ? `${n.toFixed(2)} cm` : "—"; }

type LocRec = { id: string; name: string; island?: string; latitude?: number|null; longitude?: number|null };

export default function AddSightingPage() {
    const navigate = useNavigate();
const location = useLocation();
const [pageMatchOpen, setPageMatchOpen] = useState(false);
  const [pageMatchUrl, setPageMatchUrl] = useState<string>("");
  const [pageMatchMeta, setPageMatchMeta] = useState<{name?:string; gender?:string|null; ageClass?:string|null; meanSize?:number|string|null}>({});
  const [pageMatchFor, setPageMatchFor] = useState<string | null>(null);
const [mantas, setMantas] = useState<MantaDraft[]>([]);
  const totalPhotos = useMemo(() => useTotalPhotos(mantas as any), [mantas]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingManta, setEditingManta] = useState<MantaDraft|null>(null);

  const [date, setDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [stopTime, setStopTime] = useState<string>("");

  const [photographer, setPhotographer] = useState("");
  const [email, setEmail] = useState("");
  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const [phone, setPhone] = useState("");

  const [island, setIsland] = useState("");
  const [islands, setIslands] = useState<string[]>([]);
  const [islandsLoading, setIslandsLoading] = useState<boolean>(true);
  const [islandsError, setIslandsError] = useState<string|null>(null);

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
  const totalPhotosAll = useMemo(() => (mantas ?? []).reduce((a,m)=> a + (Array.isArray((m as any).photos) ? (m as any).photos.length : 0), 0), [mantas]);

  useEffect(()=>{ console.log("[AddSighting] mounted"); }, []);

/* Review mode loader: when ?reviewId=<uuid> is present, hydrate state from submission payload */
useEffect(()=>{
  const params = new URLSearchParams(location.search);
  const rid = params.get('reviewId');
  if(!rid) return;
  (async()=>{
    try{
      const { data, error } = await supabase
        .from("sighting_submissions")
        .select("payload, email, sighting_date, manta_count, photo_count")
        .eq("id", rid)
        .single();
      if(!error && data){
        const p = (data as any).payload || {};
        if(p.date) setDate(String(p.date));
        if(p.email) setEmail(String(p.email));
        if(Array.isArray(p.mantas)) setMantas(p.mantas as any);
      }
    }catch(err){ console.warn("[Review load] failed", err); }
  })();
}, [location.search]);

  
  useEffect(() => {
    const killSlashText = (el) => {
      if (!el || !el.parentNode) return;
      const p = el.parentNode;
      Array.from(p.childNodes).forEach(n=>{
        if(n.nodeType===Node.TEXT_NODE && n.nodeValue && n.nodeValue.trim()==='\\'){ p.removeChild(n); }
      });
    };
    killSlashText(document.querySelector('button[data-clean-id="add-mantas"]'));
    killSlashText(document.querySelector('button[data-clean-id="submit-sighting"]'));
    const email = document.getElementById('contact-email-field');
    if (email) { killSlashText(email); if (email.parentElement) killSlashText(email.parentElement); }
  }, []);
// Load DISTINCT islands from sightings (source of truth)
  useEffect(()=>{
    let alive = true;
    (async ()=>{
      setIslandsLoading(true); setIslandsError(null);
      const { data, error } = await supabase
        .from("sightings")
        .select("island", { distinct: true })
        .not("island", "is", null)
        .order("island", { ascending: true });
      if (!alive) return;
      if (error) { setIslandsError(error.message); setIslandsLoading(false); return; }
      const raw = (data ?? []).map((r:any)=> (r.island ?? "").toString().trim()).filter(Boolean);
      // NFC normalize + dedupe
      const seen = new Set<string>(); const vals:string[]=[];
      for (const name of raw){ const nfc = name.normalize("NFC"); if(!seen.has(nfc)){ seen.add(nfc); vals.push(nfc); } }
      setIslands(vals);
      setIslandsLoading(false);
      console.log("[IslandSelect][fetch] DISTINCT islands:", vals);
    })();
    return ()=>{ alive=false; };
  },[]);

  // Load locations for selected island from location_defaults, fallback to sightings
  useEffect(()=>{
    let cancelled=false;
    (async ()=>{
      const isl = island?.trim();
      if(!isl){ setLocList([]); setLocationId(""); setLocationName(""); return; }

      // 1) try location_defaults
      try{
        const { data, error, status } = await supabase
          .from("location_defaults")
          .select("name,island,latitude,longitude")
          .eq("island", isl)
          .order("name", { ascending: true });

        if(!cancelled && !error && (status ? status < 400 : true) && data && data.length){
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
      }catch(e){ console.warn("[AddSighting] location_defaults failed", e); }

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
      }catch(e){ console.warn("[AddSighting] fallback distinct sights failed", e); }

      // 3) tiny seed if empty
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

  // On location change: use coords from dropdown if present; otherwise earliest in sightings
  useEffect(()=>{
    if(!locationId) return;
    const rec = locList.find(l => l.id === locationId) || locList.find(l => l.name === locationId);
    const displayName = rec?.name ?? locationName ?? locationId;
    if (rec && rec.name) setLocationName(rec.name);

    const apply = (la:number, lo:number, src?:string) => {
      setLat(String(Number(la).toFixed(5)));
      setLng(String(Number(lo).toFixed(5)));
      if (src) setCoordSource(src);
      console.log("[Location autofill]", displayName, src, la, lo);
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

  const handleSubmit = async () => {
  if (!emailValid) return;
  const payload = {
    date, startTime, stopTime, photographer, email, phone,
    island, locationId, locationName,
    latitude: lat, longitude: lng,
    mantas
  };
  try {
    await supabase.from("sighting_submissions").insert({
      email: email || null,
      sighting_date: date || null,
      manta_count: mantas.length,
      photo_count: totalPhotos,
      payload,
      status: "pending"
    });
  } catch {}
  window.alert(`Your sighting has been submitted for review with ${mantas.length} mantas and ${totalPhotos} photos. Thank you!`);
  navigate("/");
};
  const onAddSave = (m: MantaDraft) => {
    console.log("[AddSighting] unified add save", m);
    setAddOpen(false);
    setMantas(prev => {
      const incomingId = (m as any).id ? String((m as any).id) : "";
      const exists = incomingId && prev.some(p => String(p.id) === incomingId);
      const id = exists || !incomingId ? uuid() : incomingId;
      return [...prev, { ...(m as any), id }];
    });
  };
  const onEditSave = (m:MantaDraft) => {
  console.log("[AddSighting] unified edit save", m);
  setMantas(prev=>{
    const i=prev.findIndex(x=>x.id===m.id);
    if(i>=0){
      const keep:any = prev[i] as any;
      const merged:any = { ...(m as any) };
      if (keep.matchedCatalogId != null && merged.matchedCatalogId == null) merged.matchedCatalogId = keep.matchedCatalogId;
      if (typeof keep.noMatch === "boolean" && typeof merged.noMatch !== "boolean") merged.noMatch = keep.noMatch;
      const c=[...prev]; c[i]=merged as any; return c;
    }
    return [...prev, m];
  });
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
              <input id="contact-email-field" className="border rounded px-3 py-2" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
              {!emailValid && (<div className="text-xs text-red-600 mt-1">An email address is required.</div>)}
              <input className="border rounded px-3 py-2" placeholder="Phone" value={phone} onChange={(e)=>setPhone(e.target.value)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Location</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <select className="border rounded px-3 py-2" value={island} onChange={(e)=>setIsland(e.target.value)}>
                  <option value="">Select island</option>
                  {islandsLoading && <option value="__loading" disabled>Loading…</option>}
                  {(!islandsLoading && islandsError) && <option value="__err" disabled>Load error — check console</option>}
                  {(!islandsLoading && !islandsError && islands.length === 0) && <option value="__none" disabled>No islands from DB</option>}
                  {(!islandsLoading && !islandsError && islands.length > 0) &&
                    islands.map((i,idx) => <option key={`isl-${idx}-${i}`} value={i}>{i}</option>)
                  }
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
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent>
              <textarea className="w-full border rounded p-2 min-h-[140px]" placeholder="Enter notes about this sighting..." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Mantas Added</CardTitle></CardHeader>
            <CardContent>
              <div className={`${ROW_GRID} text-sm text-gray-600 px-6 pt-2`}>
  <div className="text-center">Photos{totalPhotos ? ` (${totalPhotos})` : ""}</div>
  <div className="text-center">Temp Name</div>
  <div className="text-center">Gender</div>
  <div className="text-center">Age Class</div>
  <div className="text-center">Size (cm)</div>
</div>
              {mantas.length === 0 ? (
                <div className="text-sm text-gray-600 px-6">No mantas added yet.</div>
              ) : (
                <ul className="px-4">
                  {mantas.map((m)=>{
                    const vBest = m.photos?.find(p=>p.view==="ventral" && p.isBestVentral) || m.photos?.find(p=>p.view==="ventral");
                    const dBest = m.photos?.find(p=>p.view==="dorsal" && p.isBestDorsal)  || m.photos?.find(p=>p.view==="dorsal");
                    return (
                      <li
  key={m.id}
  className={`${ROW_GRID} border rounded mb-3 p-3 px-6`}
>
  <div className="grid grid-cols-[160px_minmax(0,1fr)_120px_120px_120px] items-center gap-3">
    <div className="w-20 h-20 rounded overflow-hidden border bg-gray-50">
      {vBest ? (
        <img src={vBest.url} alt="Ventral" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full grid place-items-center text-[10px] text-gray-400">ventral</div>
      )}
    </div>
    <div className="flex flex-col items-center">
      {(m as any).matchedCatalogId != null ? (
        <>
          <button
            type="button"
            className="h-8 px-3 rounded-full bg-emerald-600 text-white text-xs"
            onClick={()=>{
              setPageMatchFor(m.id);
              setPageMatchUrl(vBest?.url || "");
              setPageMatchMeta({ name: m.name, gender: m.gender ?? null, ageClass: m.ageClass ?? null, meanSize: m.size ?? null });
              setPageMatchOpen(true);
            }}
          >Matched</button>
          <div className="mt-1 text-[11px] text-green-700 whitespace-nowrap">
            pk_catalog_id: {(m as any).matchedCatalogId}
          </div>
        </>
      ) : (
        <button
          type="button"
          className="h-8 px-3 rounded-full bg-blue-600 text-white text-xs"
          onClick={()=>{
            setPageMatchFor(m.id);
            setPageMatchUrl(vBest?.url || "");
            setPageMatchMeta({ name: m.name, gender: m.gender ?? null, ageClass: m.ageClass ?? null, meanSize: m.size ?? null });
            setPageMatchOpen(true);
          }}
        >Match</button>
      )}
      <div className="mt-1 text-[11px] text-gray-500">
        Photos: {Array.isArray(m.photos) ? m.photos.length : 0}
      </div>
    </div>
    <div className="w-20 h-20 rounded overflow-hidden border bg-gray-50">
      {dBest ? (
        <img src={dBest.url} alt="Dorsal" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full grid place-items-center text-[10px] text-gray-400">dorsal</div>
      )}
    </div>
  </div>

  <div className="text-center truncate" className="truncate text-center" className="truncate text-center">{m.name || "—"}</div>
  <div className="text-center truncate" className="truncate text-center" className="truncate text-center">{m.gender || "—"}</div>
  <div className="text-center truncate" className="truncate text-center" className="truncate text-center">{m.ageClass || "—"}</div>
  <div className="text-center truncate" className="truncate text-center" className="truncate text-center">{formatCm(m.size)}</div>

  <div className="col-span-full flex justify-end gap-2 mt-2">
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

          <div className="flex justify-start"><Button data-clean-id="add-mantas" onClick={()=>setAddOpen(true)}>Add Mantas</Button></div><div className="flex justify-center mt-6"><Button data-clean-id="submit-sighting" onClick={handleSubmit} disabled={!emailValid}>Submit Sighting</Button></div>
{/* MM_MOUNT_START */}
<MatchModal
  open={pageMatchOpen}
  onClose={() => setPageMatchOpen(false)}
  tempUrl={pageMatchUrl}
  aMeta={pageMatchMeta}
  onChoose={(catalogId) => {
    if (!pageMatchFor) { setPageMatchOpen(false); return; }
    setMantas(prev =>
      prev.map(mm =>
        String(mm.id) === String(pageMatchFor)
          ? ({ ...mm, matchedCatalogId: catalogId, noMatch: false } as any)
          : mm
      )
    );
    setPageMatchOpen(false);
  }}
  onNoMatch={() => {
    if (!pageMatchFor) { setPageMatchOpen(false); return; }
    setMantas(prev =>
      prev.map(mm =>
        String(mm.id) === String(pageMatchFor)
          ? ({ ...mm, matchedCatalogId: null, noMatch: true } as any)
          : mm
      )
    );
    setPageMatchOpen(false);
  }}
/>
{/* MM_MOUNT_END */}
          <div id="probe-add-sighting-v2" className="mx-auto mt-2 max-w-5xl px-4 text-[10px] text-muted-foreground">probe:add-sighting-v2</div>
        </div>
      
</Layout>
    </>
  );
}
