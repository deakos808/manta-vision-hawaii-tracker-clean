import React, { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MapLite from "@/components/maps/MapLite";
import MantaPhotosModal from "@/components/photos/MantaPhotosModal";



export default function AddSightingPage() {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [stopTime, setStopTime] = useState("");
  const [island, setIsland] = useState("");
  const [location, setLocation] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [notes, setNotes] = useState("");
  const [photographer, setPhotographer] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [totalMantas, setTotalMantas] = useState<string>("");

  const [mantaModalOpen, setMantaModalOpen] = useState(false);
  const [mantas, setMantas] = useState<{ id:string; name:string; photos:any[] }[]>([]);
  const [mapOpen, setMapOpen] = useState(false);

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  const hasCoords = !Number.isNaN(latNum) && !Number.isNaN(lonNum);

  return (<>
<Layout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <section className="rounded-lg bg-sky-700 text-white px-6 py-7 mb-4">
      <h1 className="text-3xl font-bold text-center">Add New Sighting</h1>
    </section>

        <div className="mb-4 text-sm">
          <Link to="/dashboard" className="text-sky-700 hover:underline">Dashboard</Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-gray-700">Add New Sighting</span>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="rounded-lg bg-white border p-4">
            <h2 className="font-medium mb-3">Sighting Details</h2>
            <div className="space-y-3">
              <div className="max-w-sm">
                <Label className="mb-1 block">Date *</Label>
                <Input type="date" value={date} onChange={(e)=>setDate(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <Label className="mb-1 block">Start Time</Label>
                  <Input type="time" value={startTime} onChange={(e)=>setStartTime(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block">Stop Time</Label>
                  <Input type="time" value={stopTime} onChange={(e)=>setStopTime(e.target.value)} />
                </div>
              </div>

              <div className="max-w-sm">
                <Label className="mb-1 block">Island *</Label>
                <select
                  value={island}
                  onChange={(e)=>setIsland(e.target.value)}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Select island</option>
                  {["Hawaiʻi","Maui","Oʻahu","Kauaʻi","Molokaʻi","Lānaʻi","Niʻihau"].map(x=>(
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </div>

              <div className="max-w-xl">
                <Label className="mb-1 block">Location *</Label>
                <Input value={location} onChange={(e)=>setLocation(e.target.value)} placeholder="e.g., site / bay / reef" />
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={()=>setMapOpen(true)} className="px-3 py-2 rounded border text-sky-700 hover:bg-sky-50">Add Lat/Lon</button>
                <button type="button" onClick={()=>setMapOpen(true)} className="px-3 py-2 rounded border text-sky-700 hover:bg-sky-50">Use Map for Location</button>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white border p-4">
            <h2 className="font-medium mb-3">Location & Submitter</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <Label className="mb-1 block">Latitude</Label>
                  <Input value={lat} onChange={(e)=>setLat(e.target.value)} placeholder="e.g., 19.8968" />
                </div>
                <div>
                  <Label className="mb-1 block">Longitude</Label>
                  <Input value={lon} onChange={(e)=>setLon(e.target.value)} placeholder="e.g., -155.5828" />
                </div>
              </div>

              <div className="max-w-xl">
                <Label className="mb-1 block">Notes</Label>
                <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} rows={4} className="w-full border rounded px-3 py-2" placeholder="Optional notes…" />
              </div>

              <div className="grid grid-cols-2 gap-3 max-w-xl">
                <div>
                  <Label className="mb-1 block">Photographer Name</Label>
                  <Input value={photographer} onChange={(e)=>setPhotographer(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block">Email *</Label>
                  <Input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block">Phone</Label>
                  <Input value={phone} onChange={(e)=>setPhone(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block">Total Mantas Seen</Label>
                  <Input value={totalMantas} onChange={(e)=>setTotalMantas(e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
  <button className="px-3 py-2 rounded border" type="button" onClick={()=>setMantaModalOpen(true)}>Add Manta Photos</button>
  <button className="bg-sky-600 text-white px-4 py-2 rounded disabled:opacity-60" disabled>
    Submit (coming soon)
  </button>
</div>

        {mapOpen && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg border w-full max-w-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium">Pick Location</h3>
                <button onClick={()=>setMapOpen(false)} className="px-2 py-1 border rounded">Close</button>
              </div>

              <div className="grid grid-cols-2 gap-3 max-w-md mb-4">
                <div>
                  <Label className="mb-1 block">Latitude</Label>
                  <Input value={lat} onChange={(e)=>setLat(e.target.value)} placeholder="e.g., 19.8968" />
                </div>
                <div>
                  <Label className="mb-1 block">Longitude</Label>
                  <Input value={lon} onChange={(e)=>setLon(e.target.value)} placeholder="e.g., -155.5828" />
                </div>
              </div>

              <MapLite
                lat={!Number.isNaN(parseFloat(lat)) ? parseFloat(lat) : undefined}
                lon={!Number.isNaN(parseFloat(lon)) ? parseFloat(lon) : undefined}
                onPick={(latV, lonV) => { setLat(latV.toFixed(6)
<div data-anchor-submit-bottom className="mt-10 flex justify-center"><Button variant="default">Submit (coming soon)</Button></div>
</>);
 setLon(lonV.toFixed(6)); }}
              />

              <div className="mt-4 flex justify-end gap-2">
                <button onClick={()=>setMapOpen(false)} className="px-3 py-2 rounded border">Cancel</button>
                <button onClick={()=>setMapOpen(false)} className="px-3 py-2 rounded bg-sky-600 text-white">Use These Coordinates</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
