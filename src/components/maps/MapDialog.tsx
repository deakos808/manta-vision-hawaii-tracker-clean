import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "mapbox-gl/dist/mapbox-gl.css";
import "leaflet/dist/leaflet.css";
import "@/styles/leaflet-fixes.css";
import Supercluster from "supercluster";

type Point = { id?: number; lat: number; lon: number };
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  points: Point[];
  totalFiltered?: number;
  children?: React.ReactNode;
};

export default function MapDialog({ open, onOpenChange, points, totalFiltered, children }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [engine, setEngine] = useState<"leaflet" | "mapbox" | "none">("none");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const token = (import.meta.env as any).VITE_MAPBOX_TOKEN as string | undefined;
      const canMapbox = !!token && (await webglSupported());
      if (!cancelled) setEngine(canMapbox ? "mapbox" : "leaflet");
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (open) {
      setReady(false);
      Promise.resolve().then(() => requestAnimationFrame(() => setReady(true)));
    } else {
      setReady(false);
      if (mapRef.current?.map) { try { mapRef.current.map.remove(); } catch {} }
      mapRef.current = null;
      if (containerRef.current) try { containerRef.current.innerHTML = ""; } catch {}
      setEngine("none");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !ready || engine === "none") return;
    const el = containerRef.current;
    if (!el) return;
    try { el.innerHTML = ""; } catch {}

    if (engine === "mapbox") {
      (async () => {
        const mapboxgl = (await import("mapbox-gl")).default as any;
        mapboxgl.accessToken = (import.meta.env as any).VITE_MAPBOX_TOKEN;

        const map = new mapboxgl.Map({
          container: el,
          style: "mapbox://styles/mapbox/outdoors-v12",
          center: [0, 0],
          zoom: 2,
        });
        map.addControl(new mapboxgl.NavigationControl(), "top-right");
        mapRef.current = { map, engine: "mapbox" };

        map.on("load", () => {
          const fc = {
            type: "FeatureCollection",
            features: (points ?? []).map(p => ({
              type: "Feature",
              properties: { id: p.id ?? null },
              geometry: { type: "Point", coordinates: [p.lon, p.lat] },
            })),
          };

          map.addSource("sightings", {
            type: "geojson",
            data: fc,
            cluster: true,
            clusterMaxZoom: 16,
            clusterRadius: 40,
          });

          map.addLayer({
            id: "clusters",
            type: "circle",
            source: "sightings",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#2563eb",
              "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26, 100, 32],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1,
            },
          });

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

          map.addLayer({
            id: "unclustered-point",
            type: "circle",
            source: "sightings",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": "#2563eb",
              "circle-radius": 10,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1,
            },
          });

          map.addLayer({
            id: "unclustered-count",
            type: "symbol",
            source: "sightings",
            filter: ["!", ["has", "point_count"]],
            layout: {
              "text-field": "1",
              "text-size": 11,
              "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
              "text-offset": [0, 0],
              "text-anchor": "center",
            },
            paint: { "text-color": "#ffffff" },
          });

          map.on("click", "unclustered-point", (e: any) => {
            const f = e.features?.[0];
            const id = f?.properties?.id;
            if (!id) return;
            new mapboxgl.Popup()
              .setLngLat(f.geometry.coordinates)
              .setHTML(`<div style="font-size:12px">Sighting ${id}</div>`)
              .addTo(map);
          });

          updateMapboxData(map, points);
        });
      })();
    } else {
      (async () => {
        const Lmod: any = await import("leaflet");
        const L = Lmod.default ?? Lmod;

        const map = L.map(el, { zoomControl: true }).setView([20, -155], 6);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
          detectRetina: true,
          updateWhenZooming: false,
          updateWhenIdle: true,
          crossOrigin: true
        }).addTo(map);

        const layer = L.layerGroup().addTo(map);

        const badge = (text: string, size = 28) => {
          const r = Math.round(size / 2);
          const html =
            '<div style="background:#2563eb;color:#fff;border:1px solid #fff;' +
            `width:${size}px;height:${size}px;border-radius:${r}px;display:flex;align-items:center;justify-content:center;` +
            'font-size:12px;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,0.25);">' +
            text +
            "</div>";
          return L.divIcon({ className: "cluster-pin", html, iconSize: [size, size], iconAnchor: [r, r] });
        };

        const index = new Supercluster({ radius: 60, maxZoom: 18, minPoints: 2 });
        const render = () => {
          layer.clearLayers();
          const b = map.getBounds();
          const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
          const clusters = index.getClusters(bbox, map.getZoom());
          clusters.forEach((c: any) => {
            const [lon, lat] = c.geometry.coordinates;
            if (c.properties.cluster) {
              const icon = badge(String(c.properties.point_count), 28);
              const m = L.marker([lat, lon], { icon, zIndexOffset: 100 }).addTo(layer);
              m.on("click", (evt: any) => {
                if (evt?.originalEvent?.altKey) {
                  const leaves: any[] = index.getLeaves(c.id, 10, 0);
                  const ids = leaves.map(l => l.properties?.id).filter(Boolean);
                  L.popup({ offset: [0, -14] })
                    .setLatLng([lat, lon])
                    .setContent(`<div style="font-size:12px"><b>Cluster</b><br/>IDs: ${ids.join(", ") || "n/a"}</div>`)
                    .openOn(map);
                } else {
                  const nextZoom = Math.min(index.getClusterExpansionZoom(c.id), map.getMaxZoom());
                  map.setView([lat, lon], nextZoom, { animate: true });
                }
              });
            } else {
              const icon = badge("1", 24);
              const m = L.marker([lat, lon], { icon, zIndexOffset: 90 }).addTo(layer);
              const id = c.properties?.id;
              if (id) m.bindPopup(`<div style="font-size:12px">Sighting ${id}</div>`);
            }
          });
        };

        mapRef.current = { map, layer, engine: "leaflet", index, render, L };

        function setLeafletData(pts: Point[]) {
          const feats = (pts || []).map(p => ({
            type: "Feature" as const,
            properties: { id: p.id ?? null },
            geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
          }));
          index.load(feats as any);
          if (pts && pts.length) {
            const bounds = (L as any).latLngBounds(pts.map(p => (L as any).latLng(p.lat, p.lon)));
            if (bounds.isValid()) {
              map.once("moveend", () => { render(); });
              map.fitBounds(bounds, { padding: [40, 40] });
            } else {
              render();
            }
          } else {
            render();
          }
        }

        mapRef.current.setLeafletData = setLeafletData;

        setLeafletData(points);

        map.on("moveend", render);
        map.on("zoomend", render);
        setTimeout(() => { try { map.invalidateSize(); } catch {} }, 0);
        setTimeout(() => { try { map.invalidateSize(); } catch {} }, 150);
        setTimeout(() => { try { map.invalidateSize(); } catch {} }, 350);
      })();
    }
  }, [open, ready, engine]);

  useEffect(() => {
    if (!open || !mapRef.current?.map) return;
    if (mapRef.current.engine === "mapbox") {
      updateMapboxData(mapRef.current.map, points);
    } else if (mapRef.current.engine === "leaflet" && typeof mapRef.current.setLeafletData === "function") {
      mapRef.current.setLeafletData(points);
    }
  }, [open, points]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-3 pb-2">
          <DialogTitle>Map</DialogTitle>
          {typeof totalFiltered === "number" && (
            <div className="text-xs text-muted-foreground">
              Showing {points?.length ?? 0} of {totalFiltered} filtered records with coordinates
            </div>
          )}
        </DialogHeader>

        {children && (
          <div className="px-4 pb-3 border-b bg-muted/30">
            {children}
          </div>
        )}

        <div className="w-full h-[540px]">
          {!points || points.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              No mappable points.
            </div>
          ) : (
            <div ref={containerRef} className="w-full h-full" />
          )}
        </div>

        {engine === "leaflet" && (
          <div className="px-4 pb-3 text-xs text-muted-foreground">
            Rendering with Leaflet (OpenStreetMap tiles). Add <code>VITE_MAPBOX_TOKEN</code> to enable Mapbox.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function updateMapboxData(map: any, pts: Point[]) {
  const src: any = map.getSource && map.getSource("sightings");
  if (!src) return;
  const fc = {
    type: "FeatureCollection",
    features: (pts || []).map(p => ({
      type: "Feature",
      properties: { id: p.id ?? null },
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    })),
  };
  try { src.setData(fc); } catch {}
}

async function webglSupported(): Promise<boolean> {
  try {
    const { default: mapboxgl } = await import("mapbox-gl");
    return typeof mapboxgl.supported === "function" ? mapboxgl.supported() : false;
  } catch {
    return false;
  }
}
