import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25,41], iconAnchor: [12,41]
});
L.Marker.prototype.options.icon = DefaultIcon;

type Props = { open:boolean; lat:number|null; lng:number|null; onClose:()=>void; onApply:(la:number,lo:number)=>void; };

function ClickCapture({ onPick }:{ onPick:(la:number,lo:number)=>void }) {
  useMapEvents({ click(e){ onPick(e.latlng.lat,e.latlng.lng); }});
  return null;
}

export default function MapPickerModal({ open, lat, lng, onClose, onApply }:Props){
  const [loc,setLoc]=useState<{lat:number,lng:number}|null>(null);
  useEffect(()=>{ if(open){ setLoc({lat: (lat??19.5), lng:(lng??-155.5)}); }},[open,lat,lng]);
  if(!open) return null;
  const center = useMemo(()=> loc?[loc.lat,loc.lng] as [number,number]:[19.5,-155.5] as [number,number],[loc]);

  return (
    <div className="fixed inset-0 z-[300000] bg-black/40 grid place-items-center" onClick={onClose}>
      <div className="bg-white w-full max-w-3xl rounded-md border shadow" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-medium">Pick Location</div>
          <button aria-label="Close" className="h-8 w-8 grid place-items-center rounded-full border" onClick={onClose}>×</button>
        </div>
        <div className="p-4">
          <div className="h-72 rounded overflow-hidden border">
            <MapContainer center={center} zoom={7} style={{height:"100%",width:"100%"}}>
              <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {loc && <Marker position={[loc.lat,loc.lng]} />}
              <ClickCapture onPick={(la,lo)=>setLoc({lat:la,lng:lo})} />
            </MapContainer>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-600">Latitude</label>
              <input className="w-full border rounded px-3 py-2"
                     value={loc?loc.lat.toFixed(6):""}
                     onChange={e=>setLoc(p=>({lat:parseFloat(e.target.value)||0,lng:p?.lng??0}))}/>
            </div>
            <div>
              <label className="text-xs text-gray-600">Longitude</label>
              <input className="w-full border rounded px-3 py-2"
                     value={loc?loc.lng.toFixed(6):""}
                     onChange={e=>setLoc(p=>({lat:p?.lat??0,lng:parseFloat(e.target.value)||0}))}/>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t">
          <button className="px-3 py-2 rounded border" onClick={onClose}>Close</button>
          <button className="px-3 py-2 rounded bg-sky-600 text-white" onClick={()=>{ if(loc) onApply(loc.lat, loc.lng); }}>Use These Coordinates</button>
        </div>
      </div>
    </div>
  );
}
