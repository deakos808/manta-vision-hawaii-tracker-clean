import React, { useEffect, useMemo, useRef, useState } from "react";

type Pt = { x: number; y: number }; // normalized 0..1 within displayed image

export type MeasureResult = {
  scalePx: number;
  discPx: number;
  dlCm: number;
  dwCm: number;
  scaleCm: number;
  points: Pt[];
};

type Props = {
  open: boolean;
  src: string;
  onClose: () => void;
  onApply: (r: MeasureResult) => void;
  initial?: Partial<MeasureResult>;
};

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
function dist(ax: number, ay: number, bx: number, by: number) { return Math.hypot(ax - bx, ay - by); }
const to2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "—");

export default function MeasureModal({ open, src, onClose, onApply, initial }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [points, setPoints] = useState<Pt[]>(() => initial?.points ?? []);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [scaleCm, setScaleCm] = useState<number>(initial?.scaleCm ?? 60);
  const [editScale, setEditScale] = useState(false);

  useEffect(() => {
    if (!open) { setPoints(initial?.points ?? []); setDragIdx(null); }
  }, [open]); // eslint-disable-line

  const dims = useMemo(() => {
    const w = imgRef.current?.clientWidth ?? 0;
    const h = imgRef.current?.clientHeight ?? 0;
    return { w, h };
  }, [imgRef.current?.clientWidth, imgRef.current?.clientHeight]); // eslint-disable-line

  const px = (p: Pt) => ({ x: p.x * dims.w, y: p.y * dims.h });
  const scalePx = useMemo(() => points.length >= 2 ? dist(px(points[0]).x, px(points[0]).y, px(points[1]).x, px(points[1]).y) : 0, [points, dims]);
  const discPx  = useMemo(() => points.length >= 4 ? dist(px(points[2]).x, px(points[2]).y, px(points[3]).x, px(points[3]).y) : 0, [points, dims]);

  const cmPerPx = useMemo(() => (scalePx > 0 ? (scaleCm / scalePx) : 0), [scalePx, scaleCm]);
  const dlCm = useMemo(() => (discPx > 0 ? discPx * cmPerPx : 0), [discPx, cmPerPx]);
  const dwCm = useMemo(() => (dlCm > 0 ? dlCm * 2.3 : 0), [dlCm]);

  function getNormFromEvent(e: React.MouseEvent) {
    const img = imgRef.current;
    if (!img) return { nx: 0, ny: 0 };
    const r = img.getBoundingClientRect();
    const nx = clamp01((e.clientX - r.left) / Math.max(1, r.width));
    const ny = clamp01((e.clientY - r.top) / Math.max(1, r.height));
    return { nx, ny };
  }

  function onMouseDown(e: React.MouseEvent) {
    const { nx, ny } = getNormFromEvent(e);
    const rad = 12 / Math.max(1, imgRef.current?.clientWidth ?? 1); // ~12px tolerance
    let nearest = -1, best = 1e9;
    points.forEach((p, i) => {
      const d = Math.hypot(p.x - nx, p.y - ny);
      if (d < best) { best = d; nearest = i; }
    });
    if (nearest >= 0 && best <= rad) {
      setDragIdx(nearest);
    } else if (points.length < 4) {
      setPoints((prev) => [...prev, { x: nx, y: ny }]);
      setDragIdx(null);
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    if (dragIdx === null) return;
    const { nx, ny } = getNormFromEvent(e);
    setPoints((prev) => prev.map((p, i) => (i === dragIdx ? { x: nx, y: ny } : p)));
  }

  function onMouseUp() { setDragIdx(null); }

  function reset() { setPoints([]); setDragIdx(null); }

  function apply() {
    onApply({
      scalePx,
      discPx,
      dlCm,
      dwCm,
      scaleCm,
      points,
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[500000] bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded shadow-lg w-[min(1200px,95vw)] max-h-[90vh] overflow-hidden" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-medium">Measure (click 1–2 laser dots, then 3–4 disc ends). Drag points to adjust.</div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center border rounded">&times;</button>
        </div>

        <div className="px-4 pt-3 pb-2 overflow-auto" style={{ maxHeight: "70vh" }}>
          <div ref={wrapRef} className="inline-block relative">
            <img
              ref={imgRef}
              src={src}
              alt="measure"
              className="block max-h-[65vh] w-auto rounded"
              draggable={false}
            />
            <div
              className="absolute inset-0 cursor-crosshair"
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
            >
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
  {points[0] && <circle cx={px(points[0]).x} cy={px(points[0]).y} r={6} fill="#0ea5e9" />}
  {points.length>=2 && (
    <>
      <circle cx={px(points[1]).x} cy={px(points[1]).y} r={6} fill="#0ea5e9" />
      <line x1={px(points[0]).x} y1={px(points[0]).y} x2={px(points[1]).x} y2={px(points[1]).y} stroke="#0ea5e9" strokeWidth={3} />
    </>
  )}
  {points.length>=3 && <circle cx={px(points[2]).x} cy={px(points[2]).y} r={6} fill="#14b8a6" />}
  {points.length>=4 && (
    <>
      <circle cx={px(points[3]).x} cy={px(points[3]).y} r={6} fill="#14b8a6" />
      <line x1={px(points[2]).x} y1={px(points[2]).y} x2={px(points[3]).x} y2={px(points[3]).y} stroke="#14b8a6" strokeWidth={3} />
    </>
  )}
</svg>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-white">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="text-sm">
              <div><span className="text-slate-600">Disc length (px):</span> <span className="font-medium">{to2(discPx)}</span></div>
              <div><span className="text-slate-600">Disc width (px):</span> <span className="font-medium">{to2(discPx * 2.3)}</span></div>
              <div className="mt-1">
                <span className="text-slate-600">Scale = </span>
                {editScale ? (
                  <>
                    <input
                      type="number" className="border rounded px-2 py-1 w-20 mr-2"
                      value={scaleCm} onChange={(e)=>setScaleCm(Number(e.target.value)||0)} />
                    <button className="text-blue-600 mr-2" onClick={()=>setEditScale(false)}>Done</button>
                  </>
                ) : (
                  <>
                    <span className="font-medium">{to2(scaleCm)}</span> <span className="text-slate-600">cm</span>
                    <button className="text-blue-600 ml-2 underline" onClick={()=>setEditScale(true)}>change</button>
                  </>
                )}
              </div>
            </div>

            <div className="text-sm">
              <div><span className="text-slate-600">DL (cm):</span> <span className="font-medium">{to2(dlCm)}</span></div>
              <div><span className="text-slate-600">DW (cm):</span> <span className="font-medium">{to2(dwCm)}</span></div>
            </div>

            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded border" onClick={reset}>Reset</button>
              <button className="px-3 py-2 rounded bg-sky-600 text-white" onClick={apply}>Apply &amp; Fill</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
