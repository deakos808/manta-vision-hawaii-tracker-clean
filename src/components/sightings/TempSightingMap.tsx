import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

type Props = {
  lat?: number;
  lon?: number;
  onPick?: (lat: number, lon: number) => void;
  open?: boolean;
};

export default function TempSightingMap({ lat, lon, onPick }: Props) {
  const [latV, setLatV] = useState<string>(Number.isFinite(lat as number) ? String(lat) : "");
  const [lonV, setLonV] = useState<string>(Number.isFinite(lon as number) ? String(lon) : "");

  useEffect(() => {
    setLatV(Number.isFinite(lat as number) ? String(lat) : "");
  }, [lat]);

  useEffect(() => {
    setLonV(Number.isFinite(lon as number) ? String(lon) : "");
  }, [lon]);

  function commit() {
    const la = parseFloat(latV);
    const lo = parseFloat(lonV);
    if (Number.isFinite(la) && Number.isFinite(lo) && onPick) onPick(la, lo);
  }

  return (
    <div className="space-y-3">
      <div className="h-64 w-full rounded-md border overflow-hidden flex items-center justify-center text-sm text-muted-foreground px-3 text-center">
        Map preview unavailable on this device. Enter coordinates below or use a map-enabled device.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-xs font-medium">Latitude</div>
          <Input
            value={latV}
            onChange={(e) => setLatV(e.target.value)}
            onBlur={commit}
            placeholder="e.g., 19.8968"
          />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">Longitude</div>
          <Input
            value={lonV}
            onChange={(e) => setLonV(e.target.value)}
            onBlur={commit}
            placeholder="e.g., -155.5828"
          />
        </div>
      </div>
    </div>
  );
}
