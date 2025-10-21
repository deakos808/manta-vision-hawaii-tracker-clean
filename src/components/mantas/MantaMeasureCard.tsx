import React from "react";
import CalibrationPhotoCard, { PhotoResult } from "../calibration/CalibrationPhotoCard";
import { fmtMeters } from "@/utils/format";

export type MantaMeasureResult = {
  scalePx: number;
  objectPx: number;
  estLengthM: number | null;
  // Keep raw points so parent can persist or derive if needed
  scale: { p0: {x:number,y:number}|null; p1: {x:number,y:number}|null };
  object:{ p0: {x:number,y:number}|null; p1: {x:number,y:number}|null };
};

export default function MantaMeasureCard({
  url, width, height, defaultScaleM,
  onChange,
}: {
  url: string;
  width: number;
  height: number;
  defaultScaleM: number;          // meters
  onChange: (r: MantaMeasureResult) => void;
}) {
  const [last, setLast] = React.useState<PhotoResult | null>(null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Left: photo + canvas + loupe (CalibrationPhotoCard already has Scale/Object toggle + loupe) */}
      <CalibrationPhotoCard
        photo={{ id:"manta", url, width, height, label:"#"}}
        defaultScaleM={defaultScaleM}
        onChange={(r)=>{
          setLast(r);
          onChange({
            scalePx: r.scalePx,
            objectPx: r.objectPx,
            estLengthM: r.estLengthM ?? null,
            scale: r.scale,
            object: r.object,
          });
        }}
      />

      {/* Right: live numbers (no actual length, no error) */}
      <div className="text-sm grid grid-cols-2 gap-x-4 gap-y-1">
        <div className="text-slate-500">Scale length (px)</div><div>{last ? Math.round(last.scalePx) : 0}</div>
        <div className="text-slate-500">Object length (px)</div><div>{last ? Math.round(last.objectPx) : 0}</div>
        <div className="text-slate-500">Estimated length</div>
        <div>{last?.estLengthM != null ? fmtMeters(last.estLengthM) : "-"}</div>
        <div className="col-span-2 mt-2 text-slate-500">
          Tip: use the loupe + crosshair to click the exact laser dots and object edge pixels.
        </div>
      </div>
    </div>
  );
}
