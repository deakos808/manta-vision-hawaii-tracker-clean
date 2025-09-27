import React, { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import "leaflet/dist/leaflet.css";
import type { Map as MLMap, Marker as MLMarker } from "maplibre-gl";
import type * as LeafletNS from "leaflet";

type Props = { lat?: number; lon?: number; onPick?: (lat:number, lon:number)=>void; };

export default function TempSightingMap({ lat, lon, onPick }: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);

  // MapLibre state
  const mlMap = useRef<MLMap | null>(null);
  const mlMarker = useRef<MLMarker | null>(null);

  // Leaflet state
  const Lref = useRef<typeof LeafletNS | null>(null);
  const lfMap = useRef<LeafletNS.Map | null>(null);
  const lfMarker = useRef<LeafletNS.Marker | null>(null);

  const [usingLeaflet, setUsingLeaflet] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [hasPick, setHasPick] = useState<boolean>(Number.isFinite(lat) && Number.isFinite(lon));

  const center = (): [number, number] =>
    (typeof lon === "number" && typeof lat === "number") ? [lon, lat] : [-155.5, 20.5];

  // Init engine: try MapLibre, else Leaflet
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!divRef.current) return;

      // Try MapLibre first
      try {
        const maplibregl = (await import("maplibre-gl")).default;
        const map = new maplibregl.Map({
          container: divRef.current,
          style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
          center: center(),
          zoom: (typeof lon === "number" && typeof lat === "number") ? 8 : 5,
          attributionControl: true,
          failIfMajorPerformanceCaveat: false
        });
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

        if (typeof lon === "number" && typeof lat === "number") {
          mlMarker.current = new maplibregl.Marker({ color: "#1d4ed8" }).setLngLat([lon, lat]).addTo(map);
        }

        map.on("click", (e:any) => {
          const { lng, lat } = e.lngLat;
          if (!mlMarker.current) {
            mlMarker.current = new maplibregl.Marker({ color: "#1d4ed8" }).setLngLat([lng, lat]).addTo(map);
          } else {
            mlMarker.current.setLngLat([lng, lat]);
          }
          setHasPick(true);
          onPick?.(lat, lng);
        });

        mlMap.current = map;
        setUsingLeaflet(false);
        return;
      } catch (err:any) {
        if (cancelled) return;
        setErrMsg(err?.message || "MapLibre init failed; falling back to Leaflet.");
      }

      // Leaflet fallback
      try {
        const L = await import("leaflet");
        Lref.current = L as unknown as typeof LeafletNS;

        // Fix default marker icons in Vite
        // @ts-ignore
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString(),
          iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString(),
          shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
        });

        const map = L.map(divRef.current!).setView([center()[1], center()[0]], (typeof lon==="number"&&typeof lat==="number")?8:5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
          maxZoom: 19
        }).addTo(map);

        // crosshair until first pick
        (map.getContainer() as HTMLElement).style.cursor = hasPick ? "grab" : "crosshair";

        if (typeof lon === "number" && typeof lat === "number") {
          lfMarker.current = L.marker([lat, lon], { draggable: true }).addTo(map);
          lfMarker.current.on("dragend", () => {
            const ll = (lfMarker.current as any).getLatLng();
            setHasPick(true);
            onPick?.(ll.lat, ll.lng);
          });
        }

        map.on("click", (e:any) => {
          const { lat, lng } = e.latlng;
          if (!lfMarker.current) {
            lfMarker.current = L.marker([lat, lng], { draggable: true }).addTo(map);
            lfMarker.current.on("dragend", () => {
              const ll = (lfMarker.current as any).getLatLng();
              setHasPick(true);
              onPick?.(ll.lat, ll.lng);
            });
          } else {
            (lfMarker.current as any).setLatLng([lat, lng]);
          }
          setHasPick(true);
          onPick?.(lat, lng);
        });

        lfMap.current = map;
        setUsingLeaflet(true);
        setErrMsg(null);
        setTimeout(()=>{ try{ map.invalidateSize(); }catch{} }, 0);
        return;
      } catch (err2:any) {
        if (cancelled) return;
        setErrMsg(err2?.message || "Leaflet fallback failed.");
      }
    })();

    return () => {
      cancelled = true;
      try { mlMap.current?.remove(); } catch {}
      try { lfMap.current?.remove(); } catch {}
      mlMap.current = null;
      lfMap.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prop updates -> move marker / fly map
  useEffect(() => {
    // MapLibre update
    if (mlMap.current && typeof lon === "number" && typeof lat === "number") {
      import("maplibre-gl").then(({ default: maplibregl }) => {
        if (!mlMarker.current) {
          mlMarker.current = new maplibregl.Marker({ color: "#1d4ed8" }).setLngLat([lon, lat]).addTo(mlMap.current!);
        } else {
          mlMarker.current.setLngLat([lon, lat]);
        }
        mlMap.current!.easeTo({ center: [lon, lat], essential: true });
      });
      setHasPick(true);
    }
    // Leaflet update
    if (lfMap.current && typeof lon === "number" && typeof lat === "number") {
      const L = Lref.current!;
      if (!lfMarker.current) {
        lfMarker.current = L.marker([lat, lon], { draggable: true }).addTo(lfMap.current!);
        lfMarker.current.on("dragend", () => {
          const ll = (lfMarker.current as any).getLatLng();
          setHasPick(true);
          onPick?.(ll.lat, ll.lng);
        });
      } else {
        (lfMarker.current as any).setLatLng([lat, lon]);
      }
      lfMap.current!.panTo([lat, lon]);
      setHasPick(true);
    }
  }, [lat, lon, onPick]);

  return (
    <div className="relative w-full h-64 rounded border overflow-hidden">
      <div ref={divRef} className="w-full h-full" />
      {!hasPick && (
        <div className="pointer-events-none absolute top-2 left-2 bg-white/85 px-2 py-1 rounded border text-xs text-gray-700">
          Click map to drop pin
        </div>
      )}
      {errMsg && (
        <div className="pointer-events-none absolute bottom-2 left-2 text-xs bg-white/80 px-2 py-1 rounded border text-gray-600">
          {usingLeaflet ? "Leaflet fallback active" : errMsg}
        </div>
      )}
    </div>
  );
}
