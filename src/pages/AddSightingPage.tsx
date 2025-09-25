
import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function AddSightingPage() {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [stopTime, setStopTime] = useState("");
  const [photographer, setPhotographer] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [totalMantas, setTotalMantas] = useState(0);

  const [island, setIsland] = useState("");
  const [location, setLocation] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  const [notes, setNotes] = useState("");
  const [mantaModalOpen, setMantaModalOpen] = useState(false);

  return (
    <Layout title="Add New Sighting" breadcrumb={[{ label: "Dashboard", to: "/dashboard" }, { label: "Add New Sighting" }]}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Sighting Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={date} onChange={(e)=>setDate(e.target.value)} />
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
                <Label htmlFor="photographer">Photographer</Label>
                <Input id="photographer" placeholder="Name" value={photographer} onChange={(e)=>setPhotographer(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="name@example.com" value={email} onChange={(e)=>setEmail(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" placeholder="(808) 555-1234" value={phone} onChange={(e)=>setPhone(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="total">Total Mantas Seen</Label>
                <Input id="total" type="number" min={0} value={totalMantas} onChange={(e)=>setTotalMantas(parseInt(e.target.value || "0"))} />
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
                <Label htmlFor="island">Island</Label>
                <Input id="island" placeholder="e.g., Maui" value={island} onChange={(e)=>setIsland(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="location">Location</Label>
                <Input id="location" placeholder="e.g., site / bay / reef" value={location} onChange={(e)=>setLocation(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="lat">Latitude</Label>
                <Input id="lat" placeholder="19.8968" value={lat} onChange={(e)=>setLat(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="lon">Longitude</Label>
                <Input id="lon" placeholder="-155.5828" value={lon} onChange={(e)=>setLon(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" type="button" onClick={()=>{ if(lat && lon){ setLat(parseFloat(lat).toFixed(6)); setLon(parseFloat(lon).toFixed(6)); } }}>Add Lat/Lon</Button>
              <Button variant="outline" type="button" onClick={()=>{/* map modal hook placeholder */}}>Use Map for Location</Button>
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
          <Button variant="default" type="button" onClick={()=>setMantaModalOpen(true)}>Add Manta Photos</Button>
          <div className="flex-1"></div>
        </div>

        <div className="mt-10 flex justify-center">
          <Button variant="default" type="button">Submit (coming soon)</Button>
        </div>
      </div>
    </Layout>
  );
}
