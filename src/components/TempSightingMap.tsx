// src/components/TempSightingMap.tsx
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Props {
  lat: number | null;
  lon: number | null;
  onChange: (lat: number | null, lon: number | null) => void;
}

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

export default function TempSightingMap({ lat, lon, onChange }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [lon || -156.331925, lat || 20.798363],
      zoom: 7,
    });

    mapInstance.current = map;
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('click', (e) => {
      const { lng, lat } = e.lngLat;
      onChange(lat, lng);
    });
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;
    const map = mapInstance.current;

    if (lat != null && lon != null) {
      if (!markerRef.current) {
        markerRef.current = new mapboxgl.Marker({ draggable: true })
          .setLngLat([lon, lat])
          .addTo(map);
        markerRef.current.on('dragend', () => {
          const lngLat = markerRef.current!.getLngLat();
          onChange(lngLat.lat, lngLat.lng);
        });
      } else {
        markerRef.current.setLngLat([lon, lat]);
      }
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [lat, lon]);

  return (
    <div>
      <div ref={mapRef} className="h-[400px] w-full rounded-md border mb-2" />
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => onChange(null, null)}
        >
          Clear Pin
        </Button>
      </div>
    </div>
  );
}
