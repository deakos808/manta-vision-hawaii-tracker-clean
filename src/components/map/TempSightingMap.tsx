import React, { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import "leaflet/dist/leaflet.css";
import type { Map as MLMap, Marker as MLMarker } from "maplibre-gl";
import type * as LeafletNS from "leaflet";

// Public cached imagery; attribution follows the service's copyrightText.
const IMAGERY_TILES = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const IMAGERY_ATTRIBUTION = 'Source: <a href="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer" target="_blank" rel="noopener noreferrer">Esri, Vantor, Earthstar Geographics, and the GIS User Community</a>';

type Props = { lat?: number; lon?: number; onPick?: (lat:number, lon:number)=>void; };

export default function TempSightingMap({ lat, lon, onPick }: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);

  // MapLibre state
  const mlMap = useRef<MLMap | null>(null);
  const mlMarker = useRef<MLMarker | null>(null);

  // Leaflet state
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
        if (cancelled || !divRef.current) return;
        const map = new maplibregl.Map({
          container: divRef.current,
          style: {
            version: 8,
            sources: { imagery: { type: "raster", tiles: [IMAGERY_TILES], tileSize: 256, maxzoom: 19, attribution: IMAGERY_ATTRIBUTION } },
            layers: [{ id: "imagery", type: "raster", source: "imagery" }],
          },
          center: center(),
          zoom: (typeof lon === "number" && typeof lat === "number") ? 9 : 5,
          attributionControl: { compact: false },
          canvasContextAttributes: { failIfMajorPerformanceCaveat: false }
        });
        mlMap.current = map;
        map.getCanvas().style.cursor = "crosshair";
        const makeMarker = (lat: number, lng: number) => {
          const marker = new maplibregl.Marker({ color: "#1d4ed8", draggable: true }).setLngLat([lng, lat]).addTo(map);
          marker.on("drag", () => {
            const point = marker.getLngLat().wrap();
            setHasPick(true);
            onPick?.(point.lat, point.lng);
          });
          return marker;
        };
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

        if (typeof lon === "number" && typeof lat === "number") {
          mlMarker.current = makeMarker(lat, lon);
        }

        map.on("click", (e:any) => {
          const { lng, lat } = e.lngLat.wrap();
          if (!mlMarker.current) {
            mlMarker.current = makeMarker(lat, lng);
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
        try { mlMap.current?.remove(); } catch {}
        mlMap.current = null;
        mlMarker.current = null;
        setErrMsg(err?.message || "MapLibre init failed; falling back to Leaflet.");
      }

      // Leaflet fallback
      try {
        const L = await import("leaflet");
        if (cancelled || !divRef.current) return;

        // Fix default marker icons in Vite
        // @ts-ignore
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString(),
          iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString(),
          shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
        });

        const map = L.map(divRef.current!).setView([center()[1], center()[0]], (typeof lon==="number"&&typeof lat==="number")? 9 : 5);
        L.tileLayer(IMAGERY_TILES, {
          attribution: IMAGERY_ATTRIBUTION,
          maxZoom: 19
        }).addTo(map);

        // Keep the selection cue even after placing a pin.
        (map.getContainer() as HTMLElement).style.cursor = "crosshair";

        if (typeof lon === "number" && typeof lat === "number") {
          lfMarker.current = L.marker([lat, lon], { draggable: true }).addTo(map);
          lfMarker.current.on("drag", () => {
            const ll = (lfMarker.current as any).getLatLng().wrap();
            setHasPick(true);
            onPick?.(ll.lat, ll.lng);
          });
        }

        map.on("click", (e:any) => {
          const { lat, lng } = e.latlng.wrap();
          if (!lfMarker.current) {
            lfMarker.current = L.marker([lat, lng], { draggable: true }).addTo(map);
            lfMarker.current.on("drag", () => {
              const ll = (lfMarker.current as any).getLatLng().wrap();
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
      mlMarker.current = null;
      lfMarker.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The containing modal supplies an opening snapshot; clicks/drags move the
  // marker directly without panning/reinitializing the map on every draft update.

  return (
    <div className="relative w-full h-64 rounded border overflow-hidden">
      <div ref={divRef} className="w-full h-full" style={{ cursor: "crosshair" }} />
      <div className="pointer-events-none absolute top-2 left-2 bg-white/85 px-2 py-1 rounded border text-xs text-gray-700">
          {hasPick ? "Click map or drag pin to adjust" : "Click map to drop pin"}
      </div>
      {errMsg && (
        <div className="pointer-events-none absolute bottom-2 left-2 text-xs bg-white/80 px-2 py-1 rounded border text-gray-600">
          {usingLeaflet ? "Leaflet fallback active" : errMsg}
        </div>
      )}
    </div>
  );
}
