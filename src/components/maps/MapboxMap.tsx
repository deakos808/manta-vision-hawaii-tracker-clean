import React from "react";
type Props = { lat?: string|number; lon?: string|number; onPinDrop?: (lat:string, lon:string)=>void; };
export default function MapboxMap({ lat, lon }: Props) {
  return (
    <div className="border rounded p-3 text-sm text-muted-foreground">
      Map preview temporarily disabled (WebGL not available).<br/>
      Current coords: {lat ?? "—"}, {lon ?? "—"}.
    </div>
  );
}
