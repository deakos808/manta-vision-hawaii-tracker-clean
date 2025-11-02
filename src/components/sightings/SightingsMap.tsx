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

/**
 * SightingsMap (no-cluster): plot every sighting at its exact coordinate.
 * - Clustering disabled
 * - Auto-fit to all points
 * - Clean popup on click
 */
export default function SightingsMap({ sightings, onClose }: SightingsMapProps) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token || !mapContainer.current) return;
    mapboxgl.accessToken = token;

    // Build FeatureCollection with valid coordinates only
    const features = sightings
      .map((s) => ({
        id: s.pk_sighting_id,
        lat: Number(s.latitude),
        lon: Number(s.longitude),
        date: s.sighting_date,
        island: s.island ?? "",
        site: s.sitelocation ?? "",
        photographer: s.photographer ?? "",
      }))
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: features.map((s) => ({
        type: "Feature",
        properties: {
          id: s.id,
          date: s.date,
          island: s.island,
          site: s.site,
          photographer: s.photographer,
        },
        geometry: {
          type: "Point",
          coordinates: [s.lon, s.lat], // GeoJSON expects [lon, lat]
        },
      })) as GeoJSON.Feature[],
    };

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [-156.3319, 20.7983], // Hawaiʻi – starter center; fitBounds will update
      zoom: 6,
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", () => {
      // Source without clustering
      map.addSource("sightings", {
        type: "geojson",
        data: geojson,
      });

      // Exact points as circles
      map.addLayer({
        id: "sighting-points",
        type: "circle",
        source: "sightings",
        paint: {
          "circle-color": "#1d4ed8", // blue-700
          "circle-radius": 6,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Click popup for any single point
      map.on("click", "sighting-points", (e) => {
        const f = e.features && e.features[0];
        if (!f) return;
        const props = f.properties as any;
        const coords = (f.geometry as any).coordinates as [number, number];

        new mapboxgl.Popup({ closeButton: true, closeOnClick: true })
          .setLngLat(coords)
          .setHTML(`
            <div class="text-sm">
              <div><strong>Date:</strong> ${props?.date ?? "—"}</div>
              <div><strong>Island:</strong> ${props?.island ?? "—"}</div>
              <div><strong>Site:</strong> ${props?.site ?? "—"}</div>
              <div><strong>Photographer:</strong> ${props?.photographer ?? "—"}</div>
            </div>
          `)
          .addTo(map);
      });

      map.on("mouseenter", "sighting-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "sighting-points", () => {
        map.getCanvas().style.cursor = "";
      });

      // Auto-fit to all points
      if (features.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        geojson.features.forEach((f: any) => bounds.extend(f.geometry.coordinates));
        map.fitBounds(bounds, { padding: 40, duration: 800, maxZoom: 13 });
      }
    });

    return () => {
      map.remove();
    };
  }, [sightings]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-6xl p-0 overflow-hidden">
        <div className="w-full h-[520px]">
          <div ref={mapContainer} className="w-full h-full" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
