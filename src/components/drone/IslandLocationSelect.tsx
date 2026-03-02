import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useIslandsLocations } from "@/lib/useIslandsLocations";

type Props = {
  island: string; setIsland: (v:string)=>void;
  location: string; setLocation: (v:string)=>void;
  lat: string; setLat: (v:string)=>void;
  lon: string; setLon: (v:string)=>void;
};

export default function IslandLocationSelect({
  island, setIsland,
  location, setLocation,
  lat, setLat,
  lon, setLon,
}: Props) {
  const { islands, locations, loadingIsl, loadingLoc } = useIslandsLocations(island);

  return (
    <Card>
      <CardHeader><CardTitle>Island &amp; Location</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <select
            className="border rounded px-3 py-2"
            value={island}
            onChange={(e)=>{ setIsland(e.target.value); setLocation(""); }}
          >
            <option value="">{loadingIsl ? "Loading islands…" : "Select island"}</option>
            {islands.map(isl => <option key={isl} value={isl}>{isl}</option>)}
          </select>

          <select
            className="border rounded px-3 py-2"
            value={location}
            onChange={(e)=>{
              const name=e.target.value; setLocation(name);
              const rec = locations.find(l=>l.name===name);
              if (rec) {
                if (!lat && rec.latitude!=null) setLat(String(Number(rec.latitude).toFixed(6)));
                if (!lon && rec.longitude!=null) setLon(String(Number(rec.longitude).toFixed(6)));
              }
            }}
          >
            <option value="">{island ? (loadingLoc ? "Loading locations…" : "Select location") : "Select island first"}</option>
            {locations.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
          </select>
        </div>
      </CardContent>
    </Card>
  );
}
