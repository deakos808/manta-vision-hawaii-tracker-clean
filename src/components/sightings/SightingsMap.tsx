// File: src/components/sightings/SightingsMap.tsx
import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface Sighting {
  pk_sighting_id: number;
  sighting_date: string;
  island?: string;
  sitelocation?: string;
  latitude?: number;
  longitude?: number;
  photographer?: string;
  organization?: string;
}

interface SightingsMapProps {
  sightings: Sighting[];
  onClose: () => void;
}

export default function SightingsMap({ sightings, onClose }: SightingsMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token || !mapContainer.current) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [-156.3319, 20.7983],
      zoom: 6,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      const geojson = {
        type: "FeatureCollection",
        features: sightings
          .filter((s) => s.latitude && s.longitude)
          .map((s) => ({
            type: "Feature",
            properties: {
              id: s.pk_sighting_id,
              date: s.sighting_date,
              island: s.island,
              site: s.sitelocation,
              photographer: s.photographer,
            },
            geometry: {
              type: "Point",
              coordinates: [s.longitude!, s.latitude!],
            },
          })),
      };

      map.addSource("sightings", {
        type: "geojson",
        data: geojson,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "sightings",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#3b82f6",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            15,
            10, 20,
            25, 25,
            50, 30,
          ],
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "sightings",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
          "text-size": 12,
        },
        paint: {
          "text-color": "#ffffff",
        },
      });

      map.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "sightings",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#22c55e",
          "circle-radius": 6,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      });

      map.on("click", "clusters", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["clusters"],
        });
        const clusterId = features[0].properties?.cluster_id;
        const source = map.getSource("sightings") as mapboxgl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: (features[0].geometry as any).coordinates, zoom });
        });
      });

      map.on("click", "unclustered-point", (e) => {
        const props = e.features?.[0].properties;
        const coords = (e.features?.[0].geometry as any).coordinates;
        new mapboxgl.Popup()
          .setLngLat(coords)
          .setHTML(`
            <div class="text-sm">
              <strong>Date:</strong> ${props?.date}<br/>
              <strong>Island:</strong> ${props?.island}<br/>
              <strong>Site:</strong> ${props?.site}<br/>
              <strong>Photographer:</strong> ${props?.photographer}
            </div>
          `)
          .addTo(map);
      });

      map.on("mouseenter", "clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "clusters", () => {
        map.getCanvas().style.cursor = "";
      });

      // Auto-fit to all points
      const bounds = new mapboxgl.LngLatBounds();
      geojson.features.forEach((f: any) => {
        bounds.extend(f.geometry.coordinates);
      });
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 40, duration: 1000 });
      }
    });

    return () => map.remove();
  }, [sightings]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden">
        <div className="w-full h-[500px]">
          <div ref={mapContainer} className="w-full h-full" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
