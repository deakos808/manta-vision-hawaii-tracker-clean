import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import L, { Map as LeafletMap, LayerGroup, DivIcon } from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/lib/supabase";

type Point = {
  id?: number;
  lat: number;
  lon: number;
  date?: string | null;
  photographer?: string | null;
  total?: number | null;
  total_mantas?: number | null;
  pk_drone_photo?: string | number;
  pk_drone_id?: string | number;
  pk_drone_photo_id?: string | number;
  pk_sighting_id?: number;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  points: Point[];
  totalFiltered?: number;
  children?: React.ReactNode;
  onSelect?: (sid: number) => void;
};

type Group = { lat: number; lon: number; items: Point[] };

function round5(n: number) {
  return Math.round(n * 1e5) / 1e5;
}

function groupByExactCoord(points: Point[]): Map<string, Group> {
  const m = new Map<string, Group>();
  for (const p of points || []) {
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = `${round5(lat)},${round5(lon)}`;
    if (!m.has(key)) m.set(key, { lat: round5(lat), lon: round5(lon), items: [] });
    m.get(key)!.items.push(p);
  }
  return m;
}

function makeCountIcon(count?: number): DivIcon {
  const txt = String(count ?? 0);
  // Pure circular badge (no pin “dot”)
  return L.divIcon({
    html: `
      <div style="position:relative;width:26px;height:26px;">
        <div style="
          position:absolute;left:0;top:0;width:26px;height:26px;
          border-radius:9999px;background:#2563eb;color:#fff;
          display:flex;align-items:center;justify-content:center;
          font-weight:800;font-size:12px;box-shadow:0 1px 2px rgba(0,0,0,.35);">
          ${txt}
        </div>
      </div>`,
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  }) as unknown as DivIcon;
}

export default function MapDialog({
  open,
  onOpenChange,
  points,
  totalFiltered,
  children,
  onSelect,
}: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<LeafletMap | null>(null);
  const overlayRef = React.useRef<LayerGroup | null>(null);

  const groups = React.useMemo(() => groupByExactCoord(points), [points]);

  // Init map when dialog opens
  React.useEffect(() => {
    if (!open) {
      teardown();
      return;
    }
    let raf: number | null = null;
    const init = () => {
      if (!containerRef.current) {
        raf = requestAnimationFrame(init);
        return;
      }
      const arr = Array.from(groups.values());
      const has = arr.length > 0;
      const defaultCenter: [number, number] = [21.3069, -157.8583]; // Honolulu fallback
      const center = has
        ? ((): [number, number] => {
            const lat = arr.reduce((s, g) => s + g.lat, 0) / arr.length;
            const lon = arr.reduce((s, g) => s + g.lon, 0) / arr.length;
            return [lat, lon];
          })()
        : defaultCenter;

      const map = L.map(containerRef.current!, { center, zoom: has ? 11 : 7, zoomControl: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);
      L.control.zoom({ position: "topleft" }).addTo(map);

      mapRef.current = map;
      overlayRef.current = L.layerGroup().addTo(map);

      if (has) {
        const bounds = L.latLngBounds(arr.map(g => L.latLng(g.lat, g.lon)));
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
      }
      draw();
    };
    raf = requestAnimationFrame(init);
    return () => { if (raf) cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Redraw when points change
  React.useEffect(() => {
    if (!open) return;
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  function teardown() {
    try { overlayRef.current?.remove(); } catch { /* noop */ }
    overlayRef.current = null;
    try { mapRef.current?.remove(); } catch { /* noop */ }
    mapRef.current = null;
  }

  function draw() {
    const map = mapRef.current;
    if (!map) return;
    if (!overlayRef.current) overlayRef.current = L.layerGroup().addTo(map);
    overlayRef.current!.clearLayers();

    groups.forEach((g) => {
      const count = g.items.length;
      const icon = makeCountIcon(count);
      const marker = L.marker([g.lat, g.lon], { icon: icon as any, zIndexOffset: 1000 }).addTo(overlayRef.current!);

      // Build table rows with placeholders; fetched data will fill these spans
      const rows = g.items.map((it) => {
        const sid = (it?.id ?? it?.pk_sighting_id ?? it?.pk_drone_photo ?? it?.pk_drone_id ?? it?.pk_drone_photo_id ?? "");
        const sidAttr = sid ? ` data-sid="${sid}"` : "";
        return `
          <div style="display:flex;gap:8px;align-items:center;padding:2px 0;">
            <div style="min-width:80px"><span class="js-sighting-details" data-sid="${sid}" data-field="date">—</span></div>
            <div style="flex:1"><span class="js-sighting-details" data-sid="${sid}" data-field="photographer">—</span></div>
            <div style="min-width:40px;text-align:right;"><span class="js-sighting-details" data-sid="${sid}" data-field="mantas">—</span></div>
            ${sid ? `<a href="#"${sidAttr} style="margin-left:8px;color:#2563eb;text-decoration:none">open</a>` : ""}
          </div>`;
      }).join("");

      const html = `
        <div style="min-width:280px">
          <div style="font-weight:700;margin-bottom:6px">${count} ${count === 1 ? "sighting" : "sightings"} at ${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}</div>
          <div style="font-size:12px;color:#111;max-height:240px;overflow:auto;">
            <div style="display:flex;gap:8px;font-weight:600;opacity:.7;">
              <div style="min-width:80px">Date</div>
              <div style="flex:1">Photographer</div>
              <div style="min-width:40px;text-align:right;">M</div>
              <div style="width:32px"></div>
            </div>
            ${rows || "<em>No details</em>"}
          </div>
        </div>`;

      marker.bindPopup(html);

      // On popup open: keep "open" click-through and fetch details to fill placeholders
      marker.on("popupopen", (ev: any) => {
        const root: HTMLElement | null = ev?.popup?.getElement?.() ?? null;
        if (!root) return;

        // Click handler → onSelect(sid)
        const clickHandler = (e: Event) => {
          const t = e.target as HTMLElement;
          const link = t.closest("[data-sid]") as HTMLElement | null;
          if (link) {
            e.preventDefault();
            const sid = Number(link.getAttribute("data-sid"));
            if (!Number.isNaN(sid) && typeof onSelect === "function") onSelect(sid);
          }
        };
        root.addEventListener("click", clickHandler);

        const spans = Array.from(root.querySelectorAll(".js-sighting-details")) as HTMLElement[];
        if (!spans.length) return;
        const ids = Array.from(new Set(
          spans.map(el => Number(el.getAttribute("data-sid") || "0")).filter(Boolean)
        ));
        if (!ids.length) return;

        (async () => {
          const { data, error } = await supabase
            .from("sightings")
            .select("pk_sighting_id, sighting_date, photographer, total_mantas, total_manta_ids")
            .in("pk_sighting_id", ids);

          if (error || !Array.isArray(data)) return;
          const byId: Record<number, any> = {};
          for (const r of data) byId[Number(r.pk_sighting_id)] = r;

          for (const el of spans) {
            const id = Number(el.getAttribute("data-sid") || "0");
            const field = String(el.getAttribute("data-field") || "");
            const r = byId[id];
            if (!r) continue;

            if (field === "date") {
              const d = r?.sighting_date ? new Date(r.sighting_date) : null;
              el.textContent = d ? d.toISOString().slice(0,10) : "—";
            } else if (field === "photographer") {
              el.textContent = r?.photographer ?? "—";
            } else if (field === "mantas") {
              const tot = (typeof r?.total_mantas === "number")
                ? r.total_mantas
                : (typeof r?.total_manta_ids === "number" ? r.total_manta_ids : undefined);
              el.textContent = (typeof tot === "number") ? String(tot) : "—";
            }
          }
        })();

        ev.popup.once("remove", () => {
          root.removeEventListener("click", clickHandler as any);
        });
      });
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1100px]">
        <DialogHeader>
          <DialogTitle>Map</DialogTitle>
          <div className="text-sm text-muted-foreground">
            {points?.length ?? 0} {points?.length === 1 ? "sighting" : "sightings"}
            {typeof totalFiltered === "number" ? ` of ${totalFiltered} filtered records` : ""} with coordinates
          </div>
          {children}
        </DialogHeader>
        <div ref={containerRef} className="h-[60vh] w-full rounded overflow-hidden" />
      </DialogContent>
    </Dialog>
  );
}
