import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Styles for both engines
import "mapbox-gl/dist/mapbox-gl.css";
import "leaflet/dist/leaflet.css";

type Point = { lat: number; lon: number };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  points: Point[];
};

/* In-memory cache for aggregations (accelerates reopen with same inputs) */
const aggCache = new Map<string, Array<{ lat: number; lon: number; count: number }>>();

export default function MapDialog({ open, onOpenChange, points }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mode, setMode] = useState<"mapbox" | "leaflet" | "none">("none");

  // Hash for caching (simple + fast)
  const ptsKey = useMemo(() => {
    // order-insensitive key: we use length + first/last few coords
    const n = points?.length ?? 0;
    if (!n) return "empty";
    const head = points.slice(0, 5).map(p => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join("|");
    const tail = points.slice(-5).map(p => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join("|");
    return `${n}#${head}#${tail}`;
  }, [points]);

  // Decide engine on open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      const token = (import.meta.env as any).VITE_MAPBOX_TOKEN as string | undefined;
      const canMapbox = !!token && (await webglSupported());
      const chosen = canMapbox ? "mapbox" : "leaflet";
      if (!cancelled) setMode(chosen);
    })();

    return () => { cancelled = true; };
  }, [open]);

  // Aggregate identical points (for Leaflet)
  const aggregated = useMemo(() => {
    if (!points || points.length === 0) return [];
    if (aggCache.has(ptsKey)) return aggCache.get(ptsKey)!;

    // exact lat/lon groups; keep as-is (no rounding) for exact duplicates
    const map = new Map<string, { lat: number; lon: number; count: number }>();
    for (const p of points) {
      const key = `${p.lat},${p.lon}`; // exact match only
      const cur = map.get(key);
      if (cur) cur.count++;
      else map.set(key, { lat: p.lat, lon: p.lon, count: 1 });
    }
    const arr = Array.from(map.values());
    aggCache.set(ptsKey, arr);
    return arr;
  }, [points, ptsKey]);

  // Build map on mode/points change
  useEffect(() => {
    if (!open || mode === "none") return;

    const container = mapContainerRef.current;
    if (!container) return;

    // Cleanup any old map
    if (mapInstanceRef.current?.remove) {
      try { mapInstanceRef.current.remove(); } catch {}
      mapInstanceRef.current = null;
    }

    // Guard: no points
    if (!points || points.length === 0) return;

    if (mode === "mapbox") {
      (async () => {
        const mapboxgl = (await import("mapbox-gl")).default as any;
        mapboxgl.accessToken = (import.meta.env as any).VITE_MAPBOX_TOKEN;

        const map = new mapboxgl.Map({
          container,
          style: "mapbox://styles/mapbox/outdoors-v12",
          center: [points[0].lon, points[0].lat],
          zoom: 7,
        });
        map.addControl(new mapboxgl.NavigationControl(), "top-right");

        map.on("load", () => {
          // Build a GeoJSON source with clustering enabled
          const geojson = {
            type: "FeatureCollection",
            features: points.map((p) => ({
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: [p.lon, p.lat] },
            })),
          };

          if (map.getSource("sightings")) map.removeSource("sightings");
          map.addSource("sightings", {
            type: "geojson",
            data: geojson,
            cluster: true,
            clusterMaxZoom: 16,
            clusterRadius: 1, // 1px => only exact/near-identical coords cluster
          });

          // Cluster circles
          map.addLayer({
            id: "clusters",
            type: "circle",
            source: "sightings",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#2563eb",
              "circle-radius": [
                "step",
                ["get", "point_count"],
                12, 5, 14, 25, 18, 50, 22,
              ],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1,
            },
          });

          // Cluster counts
          map.addLayer({
            id: "cluster-count",
            type: "symbol",
            source: "sightings",
            filter: ["has", "point_count"],
            layout: {
              "text-field": "{point_count_abbreviated}",
              "text-size": 12,
              "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            },
            paint: { "text-color": "#ffffff" },
          });

          // Unclustered points
          map.addLayer({
            id: "unclustered-point",
            type: "circle",
            source: "sightings",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": "#22c55e",
              "circle-radius": 5,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1,
            },
          });

          // Fit bounds to all points
          const bounds = new mapboxgl.LngLatBounds();
          points.forEach((p) => bounds.extend([p.lon, p.lat]));
          if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, duration: 700 });

          // Important: ensure proper layout after dialog opens
          setTimeout(() => { try { map.resize(); } catch {} }, 0);
        });

        mapInstanceRef.current = map;
      })();
    } else {
      (async () => {
        const L = await import("leaflet");

        const map = L.map(container).setView([points[0].lat, points[0].lon], 7);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);

        // Create one divIcon marker per unique coord with a count badge
        const markers: any[] = [];
        for (const g of aggregated) {
          const html =
            g.count > 1
              ? `<div style="
                    background:#2563eb; color:#fff; border:1px solid #fff;
                    width:28px;height:28px;border-radius:14px;
                    display:flex;align-items:center;justify-content:center;
                    font-size:12px; font-weight:600; box-shadow:0 1px 2px rgba(0,0,0,0.25);
                 ">${g.count}</div>`
              : `<div style="
                    background:#22c55e; border:1px solid #fff;
                    width:10px;height:10px;border-radius:5px;
                    box-shadow:0 1px 2px rgba(0,0,0,0.25);
                 "></div>`;

          const icon = (L as any).divIcon({
            className: "cluster-pin",
            html,
            iconSize: g.count > 1 ? [28, 28] : [10, 10],
            iconAnchor: g.count > 1 ? [14, 14] : [5, 5],
          });

          const m = L.marker([g.lat, g.lon], { icon }).addTo(map);
          markers.push(m);
        }

        // Fit bounds around the unique markers
        if (markers.length) {
          const group = (L as any).featureGroup(markers);
          const bounds = group.getBounds();
          if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
        }

        // Ensure correct size inside dialog
        setTimeout(() => { try { map.invalidateSize(); } catch {} }, 0);

        mapInstanceRef.current = map;
      })();
    }

    // Cleanup on close or mode change
    return () => {
      if (mapInstanceRef.current?.remove) {
        try { mapInstanceRef.current.remove(); } catch {}
        mapInstanceRef.current = null;
      }
    };
  }, [open, mode, points, aggregated]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-3 pb-0">
          <DialogTitle>Map</DialogTitle>
        </DialogHeader>

        <div className="w-full h-[500px]">
          {!points || points.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              No mappable points.
            </div>
          ) : (
            <div ref={mapContainerRef} className="w-full h-full" />
          )}
        </div>

        {mode === "leaflet" && (
          <div className="px-4 pb-3 text-xs text-muted-foreground">
            Rendering with Leaflet (OpenStreetMap tiles). Add <code>VITE_MAPBOX_TOKEN</code> to enable Mapbox.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- helpers ---------- */
async function webglSupported(): Promise<boolean> {
  try {
    const { default: mapboxgl } = await import("mapbox-gl");
    return typeof mapboxgl.supported === "function" ? mapboxgl.supported() : false;
  } catch {
    return false;
  }
}
