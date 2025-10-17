import React, { useEffect, useRef, useState } from "react";
import CalibrationLineCanvas, { CanvasState } from "./CalibrationLineCanvas";
import { fmtMeters } from "../../utils/format";

export type PhotoModel = {
  id: string;
  url: string;
  file?: File;
  width: number;
  height: number;
  label?: string; // e.g., "#1"
};

export type PhotoResult = {
  scalePx: number;
  objectPx: number;
  estLengthM: number | null;
  actualLengthM: number | null;
  errorPct: number | null;
  diffM: number | null;
  // raw points for persistence
  scale: { p0: {x:number,y:number} | null; p1: {x:number,y:number} | null };
  object: { p0: {x:number,y:number} | null; p1: {x:number,y:number} | null };
};

export default function CalibrationPhotoCard({
  photo,
  defaultScaleM,
  onChange,
}: {
  photo: PhotoModel;
  defaultScaleM: number;
  onChange?: (r: PhotoResult) => void;
}) {
  const [canvas, setCanvas] = useState<CanvasState>({ scale:{p0:null,p1:null}, object:{p0:null,p1:null}, scalePx:0, objectPx:0 });
  const [actualM, setActualM] = useState<string>("");

  function compute(canvasState: CanvasState, actualStr: string): PhotoResult {
    const scalePx = canvasState.scalePx;
    const objectPx = canvasState.objectPx;
    const scaleM = defaultScaleM; // v1 uses session default
    let est: number | null = null;
    if (scalePx > 0 && objectPx > 0 && scaleM > 0) est = (objectPx / scalePx) * scaleM;
    const actual = actualStr ? Number(actualStr) : null;
    let errorPct: number | null = null;
    let diffM: number | null = null;
    if (est != null && actual != null && actual > 0) {
      diffM = Math.abs(est - actual);
      errorPct = (Math.abs(est - actual) / actual) * 100;
    }
    return {
      scalePx, objectPx,
      estLengthM: est,
      actualLengthM: actual,
      errorPct,
      diffM,
      scale: canvasState.scale,
      object: canvasState.object,
    };
  }

  useEffect(()=>{ onChange?.(compute(canvas, actualM)); }, [canvas, actualM]);

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-50">
        <div className="font-medium">{photo.label || "Photo"}</div>
        <div className="text-xs text-slate-600">Default scale: {fmtMeters(defaultScaleM)}</div>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative">
          <div className="relative inline-block" style={{ width: photo.width, height: photo.height }}>
            <img src={photo.url} width={photo.width} height={photo.height} className="block max-w-full h-auto select-none" alt="calibration" />
            <div className="absolute inset-0 pointer-events-none"></div>
            <div className="absolute inset-0">
              <CalibrationLineCanvas
                width={photo.width}
                height={photo.height}
                onChange={(s)=>setCanvas(s)}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Actual Object Length (m)</span>
            <input
              type="number" step="0.01" min="0.01"
              value={actualM}
              onChange={(e)=>setActualM(e.target.value)}
              placeholder="e.g., 0.60"
              className="border rounded-md px-3 py-2 w-40"
            />
            <span className="text-xs text-slate-500">Required for % error.</span>
          </label>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-slate-500">Scale length (px)</div><div>{Math.round(canvas.scalePx)}</div>
            <div className="text-slate-500">Object length (px)</div><div>{Math.round(canvas.objectPx)}</div>
            <div className="text-slate-500">Estimated length</div>
            <div>{(compute(canvas, actualM).estLengthM != null) ? fmtMeters(compute(canvas, actualM).estLengthM!) : "-"}</div>
            <div className="text-slate-500">Δ length</div>
            <div>{(compute(canvas, actualM).diffM != null) ? fmtMeters(compute(canvas, actualM).diffM!) : "-"}</div>
            <div className="text-slate-500">% error</div>
            <div>{(compute(canvas, actualM).errorPct != null) ? compute(canvas, actualM).errorPct!.toFixed(2) + "%" : "-"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
