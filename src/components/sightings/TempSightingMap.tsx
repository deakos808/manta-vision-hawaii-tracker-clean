import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { Input } from "@/components/ui/input";

type Props = { lat?: number; lon?: number; onPick: (lat: number, lon: number) => void; open?: boolean; };

export default function TempSightingMap({ lat, lon, onPick, open }: Props) {
  const [latV, setLatV] = useState<string>(lat != null ? String(lat) : "");
  const [lonV, setLonV] = useState<string>(lon != null ? String(lon) : "");
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => { if (lat != null) setLatV(String(lat)); }, [lat]);
  useEffect(() => { if (lon != null) setLonV(String(lon)); }, [lon]);

  useEffect(() => {
    const hasWebGL = (() => { try { const c=document.createElement("canvas"); return !!(c.getContext("webgl")||c.getContext("experimental-webgl")); } catch { return false; }})();
    if (!hasWebGL){ console.log("[MapLite] WebGL unavailable"); return; } else { console.log("[MapLite] WebGL OK, initializing"); }
    let isMounted = true;
    (async () => {
      try {
        const maplibregl = (await import("maplibre-gl")).default;
        if (!isMounted || !divRef.current) return;
        const m = new maplibregl.Map({
          container: divRef.current,
          style: {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors"
    }
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }]
},
center: [lon ?? -155.5828, lat ?? 19.8968],
zoom: 6
        });
        mapRef.current = m;

        function setMarker(lonN:number, latN:number){
          if (!mapRef.current) return;
          if (!markerRef.current) markerRef.current = new maplibregl.Marker().addTo(mapRef.current);
          markerRef.current.setLngLat([lonN, latN]);
        }

        m.on("load", () => {
          if (lat != null && lon != null) setMarker(lon, lat);
        });

        m.on("click", (e:any) => {
          const latN = Number(e.lngLat.lat.toFixed(6));
          const lonN = Number(e.lngLat.lng.toFixed(6));
          setLatV(String(latN));
          setLonV(String(lonN));
          onPick(latN, lonN);
          setMarker(lonN, latN);
        });
      } catch {}
    })();
    return () => { isMounted = false; try { mapRef.current && mapRef.current.remove(); } catch {} };
  }, [open]);

  function onManualChange() {
    const la = parseFloat(latV);
    const lo = parseFloat(lonV);
    if (!Number.isNaN(la) && !Number.isNaN(lo)) onPick(la, lo);
  }

  useEffect(()=>{ if(mapRef.current){ try{ mapRef.current.resize(); }catch{} } const t1=setTimeout(()=>{ if(mapRef.current){ try{ mapRef.current.resize(); }catch{} } },50); const t2=setTimeout(()=>{ if(mapRef.current){ try{ mapRef.current.resize(); }catch{} } },300); const t3=setTimeout(()=>{ if(mapRef.current){ try{ mapRef.current.resize(); }catch{} } },600); return ()=>{ clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); }; },[open]);
useEffect(()=>{ function r(){ if(mapRef.current){ try{ mapRef.current.resize(); }catch{} } } window.addEventListener("resize", r); return ()=>window.removeEventListener("resize", r); }, [open]);
useEffect(()=>{ if(mapRef.current){ try{ mapRef.current.resize(); }catch{} } const t1=setTimeout(()=>{ if(mapRef.current){ try{ mapRef.current.resize(); }catch{} } },50); const t2=setTimeout(()=>{ if(mapRef.current){ try{ mapRef.current.resize(); }catch{} } },300); const t3=setTimeout(()=>{ if(mapRef.current){ try{ mapRef.current.resize(); }catch{} } },600); return ()=>{ clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); }; },[open]);
useEffect(()=>{ function r(){ if(mapRef.current){ try{ mapRef.current.resize(); }catch{} } } window.addEventListener("resize", r); return ()=>window.removeEventListener("resize", r); }, [open]);
useEffect(()=>{ if(mapRef.current){ try{ mapRef.current.resize(); }catch{} } const t1=setTimeout(()=>{ if(mapRef.current){ try{ mapRef.current.resize(); }catch{} } },50); const t2=setTimeout(()=>{ if(mapRef.current){ try{ mapRef.current.resize(); }catch{} } },300); const t3=setTimeout(()=>{ if(mapRef.current){ try{ mapRef.current.resize(); }catch{} } },600); return ()=>{ clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); }; },[open]);
useEffect(()=>{ function r(){ if(mapRef.current){ try{ mapRef.current.resize(); }catch{} } } window.addEventListener("resize", r); return ()=>window.removeEventListener("resize", r); },[]);
console.log("[MapLite] render open=", open, "lat=", lat, "lon=", lon);
return (<div className="space-y-3">
      <div ref={divRef} className="h-64 w-full rounded-md border" />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-xs font-medium">Latitude</div>
          <Input value={latV} onChange={(e)=>setLatV(e.target.value)} onBlur={onManualChange} placeholder="e.g., 19.8968" />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">Longitude</div>
          <Input value={lonV} onChange={(e)=>setLonV(e.target.value)} onBlur={onManualChange} placeholder="e.g., -155.5828" />
        </div>
      </div>
    </div>
  );
}
