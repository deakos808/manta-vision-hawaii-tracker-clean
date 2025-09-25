import { useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "react-router-dom";
import { useSightingLookups } from "@/hooks/useSightingLookups";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TempSightingMap from "@/components/sightings/TempSightingMap";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import AddMantasModal from "@/components/mantas/AddMantasModal";
export default function AddSightingPage() {
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
    
      <AddMantasModal open={mantaModalOpen} onOpenChange={setMantaModalOpen} />
    </Layout>
  );
}
