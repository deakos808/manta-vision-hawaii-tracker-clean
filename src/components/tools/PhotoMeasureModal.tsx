import React, { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Pt = { x:number; y:number };
type Props = {
  open: boolean;
  imageUrl: string;
  knownScaleCm: number; // e.g., 60
  onClose: () => void;
  onSave: (res: {
    imageUrl: string;
    scalePx: number;
    dlPx: number;
    dlCm: number;
    dwCm: number;
    points: { scale: [Pt,Pt]; dl: [Pt,Pt] };
  }) => void;
};

function dist(a: Pt, b: Pt){ const dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }

export default function PhotoMeasureModal({ open, imageUrl, knownScaleCm, onClose, onSave }: Props){
  const wrapRef = useRef<HTMLDivElement|null>(null);
  const imgRef  = useRef<HTMLImageElement|null>(null);

  const [scalePts, setScalePts] = useState<Pt[]>([]);
  const [dlPts, setDlPts] = useState<Pt[]>([]);

  const clickStage = useMemo(() => {
    if (scalePts.length < 2) return `Click ${scalePts.length===0 ? "first" : "second"} laser dot`;
    if (dlPts.length < 2) return `Click ${dlPts.length===0 ? "front" : "back"} of manta (disc length)`;
    return "Done";
  }, [scalePts, dlPts]);

  const handleClick = useCallback((e: React.MouseEvent)=>{
    if (!wrapRef.current || !imgRef.current) return;
    const rect   = imgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const p = { x, y };

    if (scalePts.length < 2) {
      setScalePts(prev => [...prev, p].slice(0,2));
    } else if (dlPts.length < 2) {
      setDlPts(prev => [...prev, p].slice(0,2));
    }
  }, [scalePts.length, dlPts.length]);

  const canSave = scalePts.length===2 && dlPts.length===2;

  const metrics = useMemo(()=>{
    if (!canSave) return null;
    const sPx = dist(scalePts[0], scalePts[1]);
    const dPx = dist(dlPts[0], dlPts[1]);
    const dlCm = (dPx / sPx) * knownScaleCm;
    const dwCm = dlCm * 2.3;
    return {
      scalePx: sPx, dlPx: dPx,
      dlCm: Number(dlCm.toFixed(2)),
      dwCm: Number(dwCm.toFixed(2)),
    };
  }, [scalePts, dlPts, knownScaleCm, canSave]);

  const reset = ()=>{ setScalePts([]); setDlPts([]); };
  const undo  = ()=>{ if (dlPts.length){ setDlPts(p=>p.slice(0,-1)); } else if (scalePts.length){ setScalePts(p=>p.slice(0,-1)); } };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300000] bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-4xl rounded-lg border shadow relative" onClick={e=>e.stopPropagation()}>
        <button aria-label="Close" className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full border" onClick={onClose}>
          &times;
        </button>
        <div className="p-4">
          <h3 className="text-lg font-semibold">Measure Disc Length (DL) — Dorsal View</h3>
          <p className="text-sm text-muted-foreground mt-1">
            1) Click the two laser dots (scale). 2) Click the front and back of the manta (disc length). Scale assumed {knownScaleCm} cm. DW = DL × 2.3.
          </p>

          <div ref={wrapRef} className="relative mt-4 mx-auto max-h-[60vh] overflow-auto border rounded">
            <img ref={imgRef} src={imageUrl} alt="Dorsal" className="max-w-full h-auto block select-none" onLoad={()=>console.log("[Measure] image loaded")} />
            {/* Overlay SVG for points/lines */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox={`0 0 ${imgRef.current?.getBoundingClientRect().width ?? 0} ${imgRef.current?.getBoundingClientRect().height ?? 0}`}
              preserveAspectRatio="none"
            >
              {scalePts.length>0 && scalePts.map((p,i)=>(
                <circle key={`s${i}`} cx={p.x} cy={p.y} r={5} fill="red" />
              ))}
              {scalePts.length===2 && (
                <line x1={scalePts[0].x} y1={scalePts[0].y} x2={scalePts[1].x} y2={scalePts[1].y} stroke="red" strokeWidth={2}/>
              )}

              {dlPts.length>0 && dlPts.map((p,i)=>(
                <circle key={`d${i}`} cx={p.x} cy={p.y} r={5} fill="blue" />
              ))}
              {dlPts.length===2 && (
                <line x1={dlPts[0].x} y1={dlPts[0].y} x2={dlPts[1].x} y2={dlPts[1].y} stroke="blue" strokeWidth={2}/>
              )}
            </svg>

            {/* Click-catcher */}
            <div
              className="absolute inset-0 cursor-crosshair"
              onClick={handleClick}
              aria-label="click-to-measure"
              title={clickStage}
            />
          </div>

          <div className="flex items-center gap-2 text-sm mt-3">
            <div className="px-2 py-1 rounded bg-slate-100">Stage: <span className="font-medium">{clickStage}</span></div>
            <div className="px-2 py-1 rounded bg-slate-100">Scale pts: {scalePts.length}/2</div>
            <div className="px-2 py-1 rounded bg-slate-100">DL pts: {dlPts.length}/2</div>
            {metrics && (
              <div className="ml-auto flex gap-3">
                <div>scalePx: <span className="font-mono">{metrics.scalePx.toFixed(1)}</span></div>
                <div>dlPx: <span className="font-mono">{metrics.dlPx.toFixed(1)}</span></div>
                <div>DL: <span className="font-semibold">{metrics.dlCm.toFixed(2)} cm</span></div>
                <div>DW: <span className="font-semibold">{metrics.dwCm.toFixed(2)} cm</span></div>
              </div>
            )}
          </div>

          <div className="flex justify-between mt-4">
            <div className="flex gap-2">
              <Button variant="outline" onClick={undo}>Undo</Button>
              <Button variant="outline" onClick={reset}>Reset</Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                onClick={()=>{
                  if (!metrics) return;
                  console.log("[Measure] save", metrics);
                  onSave({
                    imageUrl,
                    scalePx: metrics.scalePx,
                    dlPx: metrics.dlPx,
                    dlCm: metrics.dlCm,
                    dwCm: metrics.dwCm,
                    points: { scale: [scalePts[0], scalePts[1]] as [Pt,Pt], dl: [dlPts[0], dlPts[1]] as [Pt,Pt] }
                  });
                }}
                disabled={!canSave}
              >
                Save Size
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
