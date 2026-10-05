import React, { useEffect, useMemo, useRef, useState } from "react";

import { measurementValues, valuesFromDistances, initialMeasurement, commitMeasurementStage, resetMeasurement, type MeasurementPoint as Pt, type MeasurementStage, type MeasureResult } from "@/features/photos/measurement";
export type { MeasureResult } from "@/features/photos/measurement";

type Props = {
  open: boolean;
  src: string;
  onClose: () => void;
  onApply: (r: MeasureResult) => void;
  initial?: Partial<MeasureResult>;
};

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
const to2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "—");

export default function MeasureModal({ open, src, onClose, onApply, initial }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [display, setDisplay] = useState({ width: 0, height: 0 });
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [stage, setStage] = useState<MeasurementStage>(() => initialMeasurement(initial).stage);

  const [points, setPoints] = useState<Pt[]>(() => initial?.points ?? []);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [scaleCm, setScaleCm] = useState<number>(initial?.scaleCm ?? 60);
  const [editScale, setEditScale] = useState(false);

  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [zoom] = useState<number>(3.0);
  const [loupe] = useState<number>(120);

  useEffect(() => {
    if (!open) return;
    const restored = initialMeasurement(initial);
    setPoints(restored.points);
    setScaleCm(restored.scaleCm);
    setStage(restored.stage);
    setDragIdx(null);
    setCursor(null);
    setEditScale(false);
    // initial belongs to this opening, not each parent render.
  }, [open, src]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!open || !workspace || !natural.width || !natural.height) return;
    const fit = () => {
      const scale = Math.min(workspace.clientWidth * .88 / natural.width, workspace.clientHeight * .88 / natural.height);
      setDisplay({ width: natural.width * scale, height: natural.height * scale });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [open, natural]);

  useEffect(() => {
    const img = imgRef.current;
    if (!open || !img) return;
    const update = () => setDims({ w: img.clientWidth, h: img.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(img);
    return () => observer.disconnect();
  }, [open, src]);

  const px = (p: Pt) => ({ x: p.x * dims.w, y: p.y * dims.h });
  const legacyValues = stage === "complete" && points.length === 0 && initial?.scalePx && initial?.discPx;
  const { scalePx, discPx, dlCm, dwCm } = useMemo(() => legacyValues
    ? valuesFromDistances(initial!.scalePx!, initial!.discPx!, scaleCm)
    : measurementValues(points, dims.w, dims.h, scaleCm), [legacyValues, initial, points, dims, scaleCm]);
  const activeLabel = stage === "scale" ? "SCALE" : "DL";
  const nextStage = commitMeasurementStage(stage, points, scaleCm);

  function getNormFromEvent(e: React.PointerEvent) {
    const img = imgRef.current;
    if (!img) return { nx: 0, ny: 0 };
    const r = img.getBoundingClientRect();
    const nx = clamp01((e.clientX - r.left) / Math.max(1, r.width));
    const ny = clamp01((e.clientY - r.top) / Math.max(1, r.height));
    return { nx, ny };
  }

  function onMouseDown(e: React.PointerEvent) {
    if (stage === "complete") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { nx, ny } = getNormFromEvent(e);
    const tol = 12 / Math.max(1, imgRef.current?.clientWidth ?? 1);
    let nearest = -1, best = 1e9;
    const start = stage === "scale" ? 0 : 2;
    const limit = start + 2;
    points.forEach((p, i) => {
      if (i < start || i >= limit) return;
      const d = Math.hypot(p.x - nx, p.y - ny);
      if (d < best) { best = d; nearest = i; }
    });
    if (nearest >= 0 && best <= tol) {
      setDragIdx(nearest);
    } else if (points.length < limit) {
      setPoints(prev => [...prev, { x: nx, y: ny }]);
      setDragIdx(null);
    }
  }

  function onMouseMove(e: React.PointerEvent) {
    if (stage === "complete") return;
    const { nx, ny } = getNormFromEvent(e);
    setCursor({ x: nx * (imgRef.current?.clientWidth ?? 0), y: ny * (imgRef.current?.clientHeight ?? 0) });
    if (dragIdx === null) return;
    setPoints(prev => prev.map((p, i) => (i === dragIdx ? { x: nx, y: ny } : p)));
  }
  function onMouseUp() { setDragIdx(null); }
  function reset() {
    const cleared = resetMeasurement(scaleCm);
    setPoints(cleared.points); setStage(cleared.stage); setDragIdx(null); setCursor(null);
  }
  function back() {
    setStage(stage === "complete" && points.length === 4 ? "dl" : "scale");
    setCursor(null); setDragIdx(null);
  }
  function save() { onApply({ scalePx, discPx, dlCm, dwCm, scaleCm, points }); }
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[500000] bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded shadow-lg w-[min(1200px,95vw)] max-h-[94dvh] overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-medium">Measure Manta Size</div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center border rounded">&times;</button>
        </div>

        <div ref={workspaceRef} className="mx-4 mt-3 h-[48dvh] sm:h-[54dvh] min-h-[180px] bg-slate-100 flex items-center justify-center rounded">
          <div className="relative shrink-0" style={{ width: display.width || undefined, height: display.height || undefined }}>
            <img ref={imgRef} src={src} alt="measure" className="block rounded" style={{ width: display.width || undefined, height: display.height || undefined, visibility: display.width ? "visible" : "hidden" }} onLoad={e => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} draggable={false} />
            <div className={`absolute inset-0 touch-none ${stage === "complete" ? "" : "cursor-crosshair"}`} onPointerDown={onMouseDown} onPointerMove={onMouseMove} onPointerUp={onMouseUp} onPointerCancel={onMouseUp} onPointerLeave={() => { if (dragIdx === null) setCursor(null); }}>
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {points[0] && <circle cx={px(points[0]).x} cy={px(points[0]).y} r={6} fill="#f59e0b" />}
                {points.length>=2 && (<><circle cx={px(points[1]).x} cy={px(points[1]).y} r={6} fill="#f59e0b" /><line x1={px(points[0]).x} y1={px(points[0]).y} x2={px(points[1]).x} y2={px(points[1]).y} stroke="#f59e0b" strokeWidth={3} /></>)}
                {points.length>=3 && <circle cx={px(points[2]).x} cy={px(points[2]).y} r={6} fill="#14b8a6" />}
                {points.length>=4 && (<><circle cx={px(points[3]).x} cy={px(points[3]).y} r={6} fill="#14b8a6" /><line x1={px(points[2]).x} y1={px(points[2]).y} x2={px(points[3]).x} y2={px(points[3]).y} stroke="#14b8a6" strokeWidth={3} /></>)}
              </svg>
              {cursor && (() => {
                const P = 10;
                let left = cursor.x + P, top = cursor.y + P;
                const dispW = imgRef.current?.clientWidth ?? 0, dispH = imgRef.current?.clientHeight ?? 0;
                if (left + loupe > dispW) left = cursor.x - loupe - P;
                if (top + loupe > dispH) top = cursor.y - loupe - P;
                left = Math.max(0, Math.min(dispW - loupe, left));
                top  = Math.max(0, Math.min(dispH - loupe, top));
                const url = src;
                return (
                  <React.Fragment>
                  <span className="pointer-events-none absolute z-40 bg-slate-900/90 text-white text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ left, top: Math.max(0, top - 23) }}>{activeLabel}</span>
                  <div
                    className="pointer-events-none absolute rounded-full border border-slate-400 shadow-sm z-30 bg-white/5"
                    style={{
                      width: loupe, height: loupe, left, top,
                      backgroundImage: `
                        linear-gradient(rgba(255,255,255,0.95), rgba(255,255,255,0.95)),
                        linear-gradient(rgba(255,255,255,0.95), rgba(255,255,255,0.95)),
                        radial-gradient(circle at center, rgba(255,255,255,1) 0 3px, rgba(0,0,0,0.35) 3px 4px, rgba(255,255,255,0) 4px),
                        url(${JSON.stringify(url)})
                      `,
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: `1px ${loupe}px, ${loupe}px 1px, 6px 6px, ${dispW*zoom}px ${dispH*zoom}px`,
                      backgroundPosition: `${loupe/2}px 0px, 0px ${loupe/2}px, ${loupe/2-3}px ${loupe/2-3}px, ${-(cursor.x*zoom)+loupe/2}px ${-(cursor.y*zoom)+loupe/2}px`,
                    }}
                  />
                  </React.Fragment>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-white">
          <div className="mb-3" aria-live="polite">
            <h3 className="font-medium">{stage === "scale" ? "1. Set Scale" : stage === "dl" ? "2. Measure Disc Length" : "Measurement complete"}</h3>
            <p className="text-sm text-slate-600">{stage === "scale" ? "Place the two points on the known-size reference object. Drag to adjust, then commit." : stage === "dl" ? "Place the points for manta disc length. Drag to adjust, then commit." : "Review the reference scale, DL and derived DW, then Save."}</p>
            {legacyValues ? <p className="text-xs text-slate-500">Saved values restored. Point positions were not stored for this older measurement; Back lets you remeasure.</p> : null}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="text-sm">
              <div><span className="text-slate-600">Disc length (px):</span> <span className="font-medium">{to2(discPx)}</span></div>
              <div><span className="text-slate-600">Disc width (px):</span> <span className="font-medium">{to2(discPx * 2.3)}</span></div>
              <div className="mt-1">
                <span className="text-slate-600">Reference/Scale = </span>
                {editScale ? (<><input type="number" aria-label="Reference scale in centimetres" className="border rounded px-2 py-1 w-20 mr-2" value={scaleCm} onChange={(e)=>setScaleCm(Number(e.target.value)||0)} /><span className="mr-2">cm</span><button className="text-blue-600 mr-2" onClick={()=>setEditScale(false)}>Done</button></>) : (<><span className="font-medium">{to2(scaleCm/100)}</span> <span className="text-slate-600">m</span><button className="text-blue-600 ml-2 underline" onClick={()=>setEditScale(true)}>change</button></>)}
              </div>
            </div>
            <div className="text-sm">
              <div><span className="text-slate-600">DL (m):</span> <span className="font-medium">{to2(dlCm/100)}</span></div>
              <div><span className="text-slate-600">DW (m):</span> <span className="font-medium">{to2(dwCm/100)}</span></div>
            </div>
            <div className="flex justify-end gap-2">
              {stage !== "scale" && <button className="px-3 py-2 rounded border" onClick={back}>Back</button>}
              <button className="px-3 py-2 rounded border" onClick={reset}>Reset</button>
              {stage === "complete" ? (
                <button className="px-3 py-2 rounded bg-sky-600 text-white disabled:opacity-50" disabled={!Number.isFinite(dwCm) || dwCm <= 0} onClick={save}>Save</button>
              ) : (
                <button className="px-3 py-2 rounded bg-sky-600 text-white disabled:opacity-50" disabled={nextStage === stage} onClick={() => { setStage(nextStage); setCursor(null); setDragIdx(null); }}>{stage === "scale" ? "Commit Scale Points" : "Commit DL Points"}</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
