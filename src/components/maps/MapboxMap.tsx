// src/components/maps/MapboxMap.tsx

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface MapboxMapProps {
  lat?: string;
  lon?: string;
  onPinDrop: (lat: string, lon: string) => void;
}

function hasWebGL(){try{const c=document.createElement("canvas");return !!(window.WebGLRenderingContext&&(c.getContext("webgl")||c.getContext("experimental-webgl")));}catch(e){return false;}}
    
export default function MapboxMap({ lat, lon, onPinDrop }: MapboxMapProps) {
  if (typeof window === "undefined" || !hasWebGL()) {
    return <div className="border rounded p-3 text-sm text-muted-foreground">
      Map preview unavailable on this device. You can still enter coordinates manually.
    </div>;
  }
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token || !mapContainer.current) return;

    console.log('🗺️ MapboxGL version:', mapboxgl.version);
    console.log('🧭 Token used:', token);

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: lon && lat ? [parseFloat(lon), parseFloat(lat)] : [-156.3319, 20.7983],
      zoom: 7,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('click', (e) => {
      const newLat = e.lngLat.lat.toFixed(5);
      const newLon = e.lngLat.lng.toFixed(5);
      onPinDrop(newLat, newLon);

      if (markerRef.current) {
        markerRef.current.setLngLat([e.lngLat.lng, e.lngLat.lat]);
      } else {
        markerRef.current = new mapboxgl.Marker({ draggable: true })
          .setLngLat([e.lngLat.lng, e.lngLat.lat])
          .addTo(map);

        markerRef.current.on('dragend', () => {
          const lngLat = markerRef.current!.getLngLat();
          onPinDrop(lngLat.lat.toFixed(5), lngLat.lng.toFixed(5));
        });
      }
    });

    if (lat && lon) {
      markerRef.current = new mapboxgl.Marker({ draggable: true })
        .setLngLat([parseFloat(lon), parseFloat(lat)])
        .addTo(map);

      markerRef.current.on('dragend', () => {
        const lngLat = markerRef.current!.getLngLat();
        onPinDrop(lngLat.lat.toFixed(5), lngLat.lng.toFixed(5));
      });
    }

    map.on('load', () => {
      map.resize();
    });

    mapRef.current = map;
    return () => map.remove();
  }, []);

  const handleClearPin = () => {
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
      onPinDrop('', '');
    }
  };

  return (
    <div className="space-y-2">
      <div
        ref={mapContainer}
        className="rounded border shadow"
        style={{ width: '100%', height: '400px' }}
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleClearPin}
          className="text-sm text-red-600 hover:underline"
        >
          Clear Pin
        </button>
      </div>
    </div>
  );
}
