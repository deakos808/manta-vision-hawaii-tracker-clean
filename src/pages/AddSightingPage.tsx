import React, { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UnifiedMantaModal, { type MantaDraft } from "@/components/mantas/UnifiedMantaModal";

function uuid(){ try { return (crypto as any).randomUUID(); } catch { return Math.random().toString(36).slice(2); } }

export default function AddSightingPage() {
  const [mantas, setMantas] = useState<MantaDraft[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingManta, setEditingManta] = useState<MantaDraft|null>(null);

  // Basic form state (restore your rich sections)
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [observer, setObserver] = useState("");
  const [photographer, setPhotographer] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [island, setIsland] = useState("");
  const [locationName, setLocationName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [mapOpen, setMapOpen] = useState(false);

  const formSightingId = useMemo(()=>uuid(), []);
  useEffect(()=>{ console.log("[AddSighting] mounted"); }, []);

  const onAddSave = (m: MantaDraft) => {
    console.log("[AddSighting] unified add save", m);
    setMantas(prev=>[...prev, m]);
    setAddOpen(false);
  };
  const onEditSave = (m: MantaDraft) => {
    console.log("[AddSighting] unified edit save", m);
    setMantas(prev=>{ const i=prev.findIndex(x=>x.id===m.id); if(i>=0){ const c=[...prev]; c[i]=m; return c; } return [...prev, m]; });
    setEditingManta(null);
  };

  return (
    <>
      {/* Unified modal (Add) */}
      <UnifiedMantaModal
        data-unified-add-modal
        open={addOpen}
        onClose={()=>setAddOpen(false)}
        sightingId={formSightingId}
        onSave={onAddSave}
      />
      {/* Unified modal (Edit) */}
      <UnifiedMantaModal
        data-unified-edit-modal
        open={!!editingManta}
        onClose={()=>setEditingManta(null)}
        sightingId={formSightingId}
        existingManta={editingManta || undefined}
        onSave={onEditSave}
      />

      {/* Map picker modal */}
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
                <input className="w-full border rounded px-3 py-2" value={lat} onChange={(e)=>setLat(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Longitude</label>
                <input className="w-full border rounded px-3 py-2" value={lng} onChange={(e)=>setLng(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={()=>setMapOpen(false)}>Close</Button>
              <Button onClick={()=>setMapOpen(false)}>Use These Coordinates</Button>
            </div>
          </div>
        </div>
      )}

      <Layout>
        {/* Centered hero with breadcrumb */}
        <div className="bg-gradient-to-r from-sky-600 to-blue-700 py-10 text-white">
          <div className="max-w-5xl mx-auto px-4 text-center">
            <div className="text-xs opacity-80 mb-2">/ Dashboard / Sightings / Add</div>
            <h1 className="text-3xl font-semibold">Add Manta Sighting</h1>
            <p className="text-sm opacity-90 mt-1">sighting: {formSightingId.slice(0,8)}</p>
            <div className="mt-4">
              <Button variant="secondary" onClick={()=>setAddOpen(true)}>Add Mantas</Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          {/* Sighting Details */}
          <Card>
            <CardHeader><CardTitle>Sighting Details</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3">
              <input className="border rounded px-3 py-2" placeholder="Date (mm/dd/yyyy)" value={date} onChange={(e)=>setDate(e.target.value)} />
              <input className="border rounded px-3 py-2" placeholder="Time (HH:MM)" value={time} onChange={(e)=>setTime(e.target.value)} />
              <input className="border rounded px-3 py-2" placeholder="Observer" value={observer} onChange={(e)=>setObserver(e.target.value)} />
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

          {/* Location & Submitter */}
          <Card>
            <CardHeader><CardTitle>Location &amp; Submitter</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-3">
              <div className="grid grid-cols-2 gap-2 col-span-2">
                <select className="border rounded px-3 py-2" value={island} onChange={(e)=>setIsland(e.target.value)}>
                  <option value="">Select island</option>
                  <option value="Hawaiʻi">Hawaiʻi</option>
                  <option value="Maui">Maui</option>
                  <option value="Oʻahu">Oʻahu</option>
                  <option value="Kauaʻi">Kauaʻi</option>
                  <option value="Molokaʻi">Molokaʻi</option>
                  <option value="Lānaʻi">Lānaʻi</option>
                </select>
                <input className="border rounded px-3 py-2" placeholder="Location" value={locationName} onChange={(e)=>setLocationName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2 col-span-2">
                <div>
                  <label className="text-xs text-gray-600">Latitude</label>
                  <input className="border rounded px-3 py-2 w-full" placeholder="Latitude" value={lat} onChange={(e)=>setLat(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Longitude</label>
                  <input className="border rounded px-3 py-2 w-full" placeholder="Longitude" value={lng} onChange={(e)=>setLng(e.target.value)} />
                </div>
              </div>
              <div className="col-span-2">
                <Button variant="outline" onClick={()=>setMapOpen(true)}>Use Map for Location</Button>
                <a className="ml-3 text-sm text-sky-700 underline cursor-pointer" onClick={(e)=>{e.preventDefault(); /* placeholder for add new */}}>Not listed? Add new</a>
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
          <Card data-mantas-summary>
            <CardHeader><CardTitle>Mantas Added</CardTitle></CardHeader>
            <CardContent>
              {mantas.length === 0 ? (
                <div className="text-sm text-gray-600">No mantas added yet.</div>
              ) : (
                <ul className="divide-y rounded border">
                  {mantas.map((m,i)=>{
                    const ventralBest = m.photos?.find(p=>p.view==="ventral" && p.isBestVentral) || m.photos?.find(p=>p.view==="ventral");
                    const dorsalBest  = m.photos?.find(p=>p.view==="dorsal"  && p.isBestDorsal)  || m.photos?.find(p=>p.view==="dorsal");
                    return (
                      <li key={m.id} className="p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex items-center gap-2 shrink-0">
                            {ventralBest ? <img src={ventralBest.url} alt="best ventral" className="w-10 h-10 object-cover rounded" /> : <div className="w-10 h-10 rounded bg-gray-100 grid place-items-center text-[10px] text-gray-400">no V</div>}
                            {dorsalBest  ? <img src={dorsalBest?.url} alt="best dorsal"  className="w-10 h-10 object-cover rounded" /> : <div className="w-10 h-10 rounded bg-gray-100 grid place-items-center text-[10px] text-gray-400">no D</div>}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{m.name || `Manta ${i+1}`}</div>
                            <div className="text-xs text-gray-500">{m.photos?.length || 0} photos</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" className="px-2 py-1 border rounded text-xs" onClick={()=>{ console.log("[AddSighting] edit manta", m.id); setEditingManta(m); }}>Edit</button>
                          <button type="button" className="px-2 py-1 border rounded text-xs" onClick={()=>{ console.log("[AddSighting] remove manta", m.id); setMantas(prev=>prev.filter(x=>x.id!==m.id)); }}>Remove</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div id="probe-add-sighting-v2" className="mx-auto mt-2 max-w-5xl px-4 text-[10px] text-muted-foreground">probe:add-sighting-v2</div>
        </div>
      </Layout>
    </>
  );
}
