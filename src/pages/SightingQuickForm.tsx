import React, { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SightingQuickForm() {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [stopTime, setStopTime] = useState("");
  const [island, setIsland] = useState("");
  const [population, setPopulation] = useState("");
  const [location, setLocation] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-4 text-sm">
          <Link to="/dashboard" className="text-sky-700 hover:underline">Dashboard</Link>
          <span className="mx-2 text-gray-400">/</span>
          <span className="text-gray-600">Add New Sighting</span>
        </div>

        <h1 className="text-2xl font-semibold mb-4"><span style={{marginLeft:8,fontSize:'12px',padding:'2px 6px',background:'#eef',border:'1px solid #99f',borderRadius:6,color:'#334'}}>PROBE:SightingQuickForm</span>Add New Sighting</h1>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-4 bg-white">
            <h2 className="font-medium mb-3">Sighting Details</h2>
            <div className="space-y-3">
              <div className="max-w-sm">
                <Label className="mb-1 block">Date *</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <Label className="mb-1 block">Start Time</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block">Stop Time</Label>
                  <Input type="time" value={stopTime} onChange={(e) => setStopTime(e.target.value)} />
                </div>
              </div>

              <div className="max-w-sm">
                <Label className="mb-1 block">Island *</Label>
                <select
                  value={island}
                  onChange={(e) => {
                    const v = e.target.value;
                    setIsland(v);
                    const pop =
                      ["Maui","Kahoʻolawe","Lānaʻi","Molokaʻi"].includes(v) ? "Maui Nui" :
                      ["Kauaʻi","Niʻihau"].includes(v) ? "Kauaʻi" : v;
                    setPopulation(pop);
                  }}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="">Select island</option>
                  {["Hawaiʻi","Maui","Oʻahu","Kauaʻi","Molokaʻi","Lānaʻi","Niʻihau"].map(x=>(
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </div>

              <div className="max-w-sm">
                <Label className="mb-1 block">Population</Label>
                <Input value={population} readOnly />
              </div>

              <div className="max-w-xl">
                <Label className="mb-1 block">Location *</Label>
                <Input value={location} onChange={(e)=>setLocation(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-white">
            <h2 className="font-medium mb-3">Location & Notes</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <Label className="mb-1 block">Latitude</Label>
                  <Input value={lat} onChange={(e)=>setLat(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block">Longitude</Label>
                  <Input value={lon} onChange={(e)=>setLon(e.target.value)} />
                </div>
              </div>

              <div className="max-w-xl">
                <Label className="mb-1 block">Notes</Label>
                <textarea
                  value={notes}
                  onChange={(e)=>setNotes(e.target.value)}
                  rows={5}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Optional notes…"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <button className="bg-sky-600 text-white px-4 py-2 rounded disabled:opacity-60" disabled>
            Submit (coming soon)
          </button>
        </div>
      </div>
    </Layout>
  );
}
