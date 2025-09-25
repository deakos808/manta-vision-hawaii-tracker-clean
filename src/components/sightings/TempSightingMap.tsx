import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  lat?: number;
  lon?: number;
  onPick: (lat: number, lon: number) => void;
};

export default function TempSightingMap({ lat, lon, onPick }: Props) {
  const [latV, setLatV] = useState<string>(lat != null ? String(lat) : "");
  const [lonV, setLonV] = useState<string>(lon != null ? String(lon) : "");

  useEffect(() => { if (lat != null) setLatV(String(lat)); }, [lat]);
  useEffect(() => { if (lon != null) setLonV(String(lon)); }, [lon]);

  function useThese() {
    const la = parseFloat(latV);
    const lo = parseFloat(lonV);
    if (!Number.isNaN(la) && !Number.isNaN(lo)) onPick(la, lo);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/30 p-6 text-sm text-muted-foreground">
        Map preview unavailable here. Enter coordinates below or use a map-enabled device.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-xs font-medium">Latitude</div>
          <Input value={latV} onChange={(e)=>setLatV(e.target.value)} placeholder="19.8968" />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium">Longitude</div>
          <Input value={lonV} onChange={(e)=>setLonV(e.target.value)} placeholder="-155.5828" />
        </div>
      </div>
      <div className="flex justify-end">
        <Button variant="default" type="button" onClick={useThese}>Use These Coordinates</Button>
      </div>
    </div>
  );
}
