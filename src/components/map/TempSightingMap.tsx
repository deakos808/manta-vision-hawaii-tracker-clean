import React, { useEffect, useRef, useState } from "react";
import maplibregl, { Map, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = { lat?: number; lon?: number; onPick?: (lat:number, lon:number)=>void; };

export default function TempSightingMap({ lat, lon, onPick }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;

    (async () => {
      try {
        // Attempt init regardless; if it fails, we show the exact reason
        const center = (typeof lon === "number" && typeof lat === "number") ? [lon, lat] : [-155.5, 20.5]; // Hawaiʻi

        const map = new maplibregl.Map({
          container: mapRef.current!,
          style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
          center,
          zoom: (typeof lon === "number" && typeof lat === "number") ? 8 : 5,
          attributionControl: true,
          failIfMajorPerformanceCaveat: false
        });

        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

        if (typeof lon === "number" && typeof lat === "number") {
          markerRef.current = new maplibregl.Marker({ color: "#1d4ed8" })
            .setLngLat([lon, lat])
            .addTo(map);
        }

        map.on("click", (e) => {
          const { lng, lat } = e.lngLat;
          if (!markerRef.current) {
            markerRef.current = new maplibregl.Marker({ color: "#1d4ed8" }).setLngLat([lng, lat]).addTo(map);
          } else {
            markerRef.current.setLngLat([lng, lat]);
          }
          onPick?.(lat, lng);
        });

        mapObj.current = map;
        console.info("[TempSightingMap] initialized OK");
      } catch (err:any) {
        console.warn("[TempSightingMap] init failed:", err?.message || err);
        setErrMsg(err?.message || "Map initialization failed.");
      }
    })();

    return () => { try { mapObj.current?.remove(); } catch {} mapObj.current = null; };
  }, []);

  useEffect(() => {
    if (!mapObj.current) return;
    if (typeof lon === "number" && typeof lat === "number") {
      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({ color: "#1d4ed8" })
          .setLngLat([lon, lat])
          .addTo(mapObj.current);
      } else {
        markerRef.current.setLngLat([lon, lat]);
      }
      mapObj.current.flyTo({ center: [lon, lat], zoom: 8, essential: true });
    }
  }, [lat, lon]);

  if (errMsg) {
    return (
      <div className="w-full h-64 rounded border flex items-center justify-center text-sm text-gray-600 px-3 text-center">
        Map preview unavailable on this device. You can still enter coordinates below.
        <div className="mt-2 text-xs text-gray-500">({errMsg})</div>
      </div>
    );
  }

  return <div ref={mapRef} className="w-full h-64 rounded border" />;
}
