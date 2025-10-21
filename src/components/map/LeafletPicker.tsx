import React, { useEffect, useRef } from "react";
const NoSSR: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;

export type LatLng = { lat: number; lng: number };
type Props = {
  value: LatLng;
  onChange: (v: LatLng) => void;
  height?: number;
};

export default function LeafletPicker({ value, onChange, height = 260 }: Props) {
  // Delay import until client (avoids SSR/tooling hiccups)
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cleanup = () => {};
    (async () => {
      const L = await import("leaflet");
      // Fix default marker icon path in Leaflet + Vite
      // @ts-ignore
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString(),
        iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString(),
        shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
      });

      const el = ref.current!;
      el.innerHTML = ""; // reset

      const map = L.map(el, { center: [value.lat, value.lng], zoom: 8, zoomControl: true });
      const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      });
      tiles.addTo(map);

      const marker = L.marker([value.lat, value.lng], { draggable: true }).addTo(map);

      const setBoth = (lat: number, lng: number) => {
        marker.setLatLng([lat, lng]);
        onChange({ lat, lng });
      };

      map.on("click", (e: any) => setBoth(e.latlng.lat, e.latlng.lng));
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLatLng();
        onChange({ lat, lng });
      });

      cleanup = () => map.remove();
    })();

    return () => cleanup();
  }, [value.lat, value.lng, onChange]);

  return (
    <NoSSR>
      <div ref={ref} style={{ height, width: "100%", borderRadius: 8, overflow: "hidden" }} />
    </NoSSR>
  );
}
