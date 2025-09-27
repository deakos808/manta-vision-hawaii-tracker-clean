import React, { useEffect, useRef, useState } from "react";
import maplibregl, { Map, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = { lat?: number; lon?: number; onPick?: (lat:number, lon:number)=>void; };

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch { return false; }
}

export default function TempSightingMap({ lat, lon, onPick }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!mapRef.current || mapObj.current || failed) return;
    if (!hasWebGL()) { setFailed(true); return; }

    try {
      const center = (typeof lon === "number" && typeof lat === "number") ? [lon, lat] : [-155.5, 20.5]; // Hawaiʻi
      mapObj.current = new maplibregl.Map({
        container: mapRef.current,
        style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
        center,
        zoom: (typeof lon === "number" && typeof lat === "number") ? 8 : 5,
        attributionControl: true
      });
      mapObj.current.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

      if (typeof lon === "number" && typeof lat === "number") {
        markerRef.current = new maplibregl.Marker({ color: "#1d4ed8" }).setLngLat([lon, lat]).addTo(mapObj.current);
      }
      mapObj.current.on("click", (e) => {
        const { lng, lat } = e.lngLat;
        if (!markerRef.current) {
          markerRef.current = new maplibregl.Marker({ color: "#1d4ed8" }).setLngLat([lng, lat]).addTo(mapObj.current!);
        } else {
          markerRef.current.setLngLat([lng, lat]);
        }
        onPick?.(lat, lng);
      });
    } catch { setFailed(true); }

    return () => { mapObj.current?.remove(); mapObj.current = null; };
  }, [failed]);

  useEffect(() => {
    if (!mapObj.current) return;
    if (typeof lon === "number" && typeof lat === "number") {
      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({ color: "#1d4ed8" }).setLngLat([lon, lat]).addTo(mapObj.current);
      } else {
        markerRef.current.setLngLat([lon, lat]);
      }
      mapObj.current.flyTo({ center: [lon, lat], zoom: 8, essential: true });
    }
  }, [lat, lon]);

  if (failed) {
    return (
      <div className="w-full h-64 rounded border flex items-center justify-center text-sm text-gray-600">
        Map preview unavailable on this device. You can still enter coordinates below.
      </div>
    );
  }
  return <div ref={mapRef} className="w-full h-64 rounded border" />;
}
