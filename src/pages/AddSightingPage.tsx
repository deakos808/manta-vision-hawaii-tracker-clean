import { useMemo, useState, useEffect } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "react-router-dom";
import { useSightingLookups } from "@/hooks/useSightingLookups";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import TempSightingMap from "@/components/sightings/TempSightingMap";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MantaPhotosModal from "@/components/mantas/MantaPhotosModal";
import AddMantasFlow from "@/components/mantas/AddMantasFlow";
function uuid(){ try { return (crypto as any).randomUUID(); } catch { return Math.random().toString(36).slice(2); } }

function MantasDock({mantas, formSightingId}:{mantas:any[]; formSightingId:string}){
  return (
    <div data-mantas-dock className="fixed bottom-24 right-6 z-[999]">
      <div className="shadow-lg rounded-xl border bg-white/95 backdrop-blur px-4 py-3 min-w-[260px]">
        <div className="text-sm font-semibold mb-1">Mantas for this sighting</div>
        <div className="text-xs text-gray-600 mb-2">sighting: {formSightingId.slice(0,8)} · total: {mantas.length}</div>
        {mantas.length===0 ? (
          <div className="text-xs text-gray-500">None yet — click “Add Mantas”.</div>
        ) : (
          <ul className="space-y-1 text-sm">
            {mantas.map((m:any,i:number)=>(
              <li key={m.id} className="flex items-center justify-between gap-3">
                <span className="truncate">{i+1}. {m.name}</span>
                <span className="text-xs text-gray-600">{m.photos?.length||0} photos</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function AddSightingPage(props:any){
  useEffect(()=>{ console.log("[AddSighting] mounted"); }, []);
  const [mantas, setMantas] = useState<any[]>([]);
  const [editingManta, setEditingManta] = useState<any|null>(null);
  const formSightingId = useMemo(()=>uuid(),[]);
  useEffect(()=>{
    const h=(e:any)=>{
      try{
        const d=e.detail; if(!d||!d.manta) return;
        if(d.sightingId && d.sightingId!==formSightingId) return;
        console.log("[AddSighting] manta added via event", d);
        setMantas(prev=>[...prev, d.manta]);
      }catch(err){ console.warn("[AddSighting] event parse error", err); }
    };
    window.addEventListener("manta-added", h);
    return ()=>window.removeEventListener("manta-added", h);
  },[formSightingId]);

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [stopTime, setStopTime] = useState("");
  const [photographer, setPhotographer] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [totalMantas, setTotalMantas] = useState<number | "">("");

  const [island, setIsland] = useState("");
  const [location, setLocation] = useState("");
  const [customLoc, setCustomLoc] = useState(false);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  const [notes, setNotes] = useState("");
  const [mantaModalOpen, setMantaModalOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const clientRef = useMemo(()=> (typeof crypto!=="undefined" && "randomUUID" in crypto ? "sighting-"+crypto.randomUUID() : "sighting-"+Math.random().toString(36).slice(2)), []);
  const [attempted, setAttempted] = useState(false);

  const { islands, locations, loadingIslands, loadingLocations } = useSightingLookups(island);

  const locOk = useMemo(() => {
    const havePlace = island.trim() && location.trim();
    const haveCoords = lat.trim() && lon.trim();
    return !!(havePlace || haveCoords);
  }, [island, location, lat, lon]);

  const isValid = useMemo(() => {
    const req = date.trim() && photographer.trim() && email.trim() && Number(totalMantas) > 0;
    return !!(req && locOk);
  }, [date, photographer, email, totalMantas, locOk]);

  const err = {
    date: attempted && !date.trim(),
    photographer: attempted && !photographer.trim(),
    email: attempted && !email.trim(),
    total: attempted && !(Number(totalMantas) > 0),
    island: attempted && !locOk && !island.trim(),
    location: attempted && !locOk && !location.trim(),
    lat: attempted && !locOk && !lat.trim(),
    lon: attempted && !locOk && !lon.trim(),
  };

  function cls(base: string, bad?: boolean) {
    return base + (bad ? " border-red-500 focus-visible:ring-red-500" : "");
  }

  function handleSubmit() {
    setAttempted(true);
    if (!isValid) return;
    console.log("submit: coming soon");
  }

  return (
    <Layout>
      <div className="bg-gradient-to-r from-blue-700 to-blue-600 py-8 text-white">
        <h1 className="mx-auto max-w-3xl text-center text-2xl font-semibold">Add Manta Sighting</h1>
      </div>

      <div className="mx-auto mt-3 max-w-3xl px-4 text-sm text-muted-foreground">
        <Link to="/dashboard" className="underline">Dashboard</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Add Manta Sighting</span>
      </div>

      <div className="mx-auto mt-4 max-w-3xl space-y-6 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Sighting Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date">Date *</Label>
                <Input id="date" type="date" value={date} onChange={(e)=>setDate(e.target.value)} className={cls("", err.date)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="start">Start Time</Label>
                  <Input id="start" type="time" value={startTime} onChange={(e)=>setStartTime(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="stop">Stop Time</Label>
                  <Input id="stop" type="time" value={stopTime} onChange={(e)=>setStopTime(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="photographer">Photographer *</Label>
                <Input id="photographer" placeholder="Name" value={photographer} onChange={(e)=>setPhotographer(e.target.value)} className={cls("", err.photographer)} />
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" placeholder="name@example.com" value={email} onChange={(e)=>setEmail(e.target.value)} className={cls("", err.email)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" placeholder="(808) 555-1234" value={phone} onChange={(e)=>setPhone(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="total">Total Mantas Seen *</Label>
                <Input id="total" type="number" min={0} value={totalMantas} onChange={(e)=>setTotalMantas(e.target.value === "" ? "" : parseInt(e.target.value))} className={cls("", err.total)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Location & Submitter</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Island</Label>
                <Select value={island} onValueChange={(v)=>{ setIsland(v); setLocation(""); }}>
                  <SelectTrigger className={cls("", err.island)}>
                    <SelectValue placeholder={loadingIslands ? "Loading..." : "Select island"} />
                  </SelectTrigger>
                  <SelectContent>
                    {islands.map((i)=>(<SelectItem key={i} value={i}>{i}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Location</Label>
{!customLoc ? (
  <>
    <Select value={location} onValueChange={setLocation} disabled={!island}>
      <SelectTrigger className={cls("", err.location)}>
        <SelectValue placeholder={island ? (loadingLocations ? "Loading..." : "Select location") : "Select island first"} />
      </SelectTrigger>
      <SelectContent>
        {locations.map((loc)=>(<SelectItem key={loc} value={loc}>{loc}</SelectItem>))}
      </SelectContent>
    </Select>
    <div className="mt-1 text-xs">
      <button type="button" className="underline text-muted-foreground" onClick={()=>{ setCustomLoc(true); setLocation(""); }}>Not listed? Add new</button>
    </div>
  </>
) : (
  <>
    <Input placeholder="Type a new location name" value={location} onChange={(e)=>setLocation(e.target.value)} className={cls("", err.location)} />
    <div className="mt-1 text-xs">
      <button type="button" className="underline text-muted-foreground" onClick={()=>{ setCustomLoc(false); }}>Use dropdown instead</button>
    </div>
  </>
)}
</div>
</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lat">Latitude</Label>
                <Input id="lat" placeholder="e.g., 19.8968" value={lat} onChange={(e)=>setLat(e.target.value)} className={cls("", err.lat)} />
              </div>
              <div>
                <Label htmlFor="lon">Longitude</Label>
                <Input id="lon" placeholder="e.g., -155.5828" value={lon} onChange={(e)=>setLon(e.target.value)} className={cls("", err.lon)} />
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" type="button" onClick={()=>setMapOpen(true)}>Use Map for Location</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea placeholder="Optional notes..." value={notes} onChange={(e)=>setNotes(e.target.value)} />
          </CardContent>
        </Card>
<Card className="mt-6" data-mantas-summary>
  <CardHeader>
    <CardTitle>Mantas Added</CardTitle>
  </CardHeader>
  <CardContent>
    {mantas.length === 0 ? (
      <div className="text-sm text-gray-600">No mantas added yet.</div>
    ) : (
      <ul className="divide-y rounded border">
        {mantas.map((m:any, i:number)=>(
          <li key={m.id} className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium truncate">{m.name || `Manta ${i+1}`}</div>
              <div className="text-xs text-gray-500">{m.photos?.length || 0} photos</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="px-2 py-1 border rounded text-xs" onClick={()=>{ console.log("[AddSighting] edit manta", m.id); setEditingManta(m); }}>Edit</button>
              <button type="button" className="px-2 py-1 border rounded text-xs" onClick={()=>{ console.log("[AddSighting] remove manta", m.id); setMantas(prev=>prev.filter(x=>x.id!==m.id)); }}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
    )}
  </CardContent>
</Card>


        <div className="flex items-center justify-between">
          <Button variant="default" type="button" onClick={()=>setMantaModalOpen(true)}>Add Mantas</Button>
          <div className="flex-1"></div>
        </div>

        <div className="mt-10 flex justify-center">
          <Button variant="default" type="button" onClick={()=>{ setAttempted(true); handleSubmit(); }} disabled={!isValid}>Submit</Button>
        </div>
      </div>

      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Pick Location</DialogTitle></DialogHeader>
          <TempSightingMap
            lat={!Number.isNaN(parseFloat(lat)) ? parseFloat(lat) : undefined}
            lon={!Number.isNaN(parseFloat(lon)) ? parseFloat(lon) : undefined}
            onPick={(latV, lonV) => { setLat(latV.toFixed(6)); setLon(lonV.toFixed(6)); }}
           open={mapOpen}  open={mapOpen} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={()=>{ const la=parseFloat(lat||""); const lo=parseFloat(lon||""); if(!Number.isNaN(la)&&!Number.isNaN(lo)){ /* keep open */ } }}>Close</Button>
            <Button variant="default" onClick={()=>{ const la=parseFloat(lat||""); const lo=parseFloat(lon||""); if(!Number.isNaN(la)&&!Number.isNaN(lo)){ /* keep open */ } }}>Use These Coordinates</Button>
          </div>
        </DialogContent>
      </Dialog>
    
      
      <AddMantasFlow
        open={mantaModalOpen}
        onOpenChange={setMantaModalOpen}
        sightingId={clientRef}
        onAddManta={(m)=>setMantas(prev=>[...prev,m])}
      />
      <div id="probe-add-sighting-v2" className="mx-auto mt-2 max-w-3xl px-4 text-[10px] text-muted-foreground">probe:add-sighting-v2</div>
    </Layout>
  );
}
