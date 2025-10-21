import React, { useRef, useState, useEffect } from "react";

type Point = { x: number; y: number };
type Line = { p0: Point | null; p1: Point | null };
type Mode = "scale" | "object";

export type CanvasState = {
  scale: Line;
  object: Line;
  scalePx: number;
  objectPx: number;
};

export default function CalibrationLineCanvas({
  width,
  height,
  value,
  onChange,
}: {
  width: number;
  height: number;
  value?: Partial<CanvasState>;
  onChange?: (next: CanvasState) => void;
}) {
  const [mode, setMode] = useState<Mode>("scale");
  const [scale, setScale] = useState<Line>({ p0: null, p1: null });
  const [object, setObject] = useState<Line>({ p0: null, p1: null });
  const [drag, setDrag] = useState<{ which: Mode; end: "p0" | "p1" } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value?.scale) setScale(value.scale as Line);
    if (value?.object) setObject(value.object as Line);
  }, [value?.scale, value?.object]);

  function dist(a: Point | null, b: Point | null): number {
    if (!a || !b) return 0;
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx*dx + dy*dy);
  }

  function emit(nextScale = scale, nextObject = object) {
    const state: CanvasState = {
      scale: nextScale,
      object: nextObject,
      scalePx: dist(nextScale.p0, nextScale.p1),
      objectPx: dist(nextObject.p0, nextObject.p1),
    };
    onChange?.(state);
  }

  function relCoords(e: React.MouseEvent) {
    const r = wrapRef.current?.getBoundingClientRect();
    const x = e.clientX - (r?.left ?? 0);
    const y = e.clientY - (r?.top ?? 0);
    // clamp
    return { x: Math.max(0, Math.min(width, x)), y: Math.max(0, Math.min(height, y)) };
  }

  function handleDown(e: React.MouseEvent) {
    const pt = relCoords(e);
    const cur = mode === "scale" ? scale : object;
    // Hit test handles first
    const handles: Array<{ which: Mode; end: "p0" | "p1"; pt: Point | null }> = [
      { which: "scale", end: "p0", pt: scale.p0 },
      { which: "scale", end: "p1", pt: scale.p1 },
      { which: "object", end: "p0", pt: object.p0 },
      { which: "object", end: "p1", pt: object.p1 },
    ];
    for (const h of handles) {
      if (!h.pt) continue;
      const dx = pt.x - h.pt.x, dy = pt.y - h.pt.y;
      if (dx*dx + dy*dy <= 8*8) { setDrag({ which: h.which, end: h.end }); return; }
    }
    // If no handle, place points for current mode
    if (!cur.p0) {
      const next = { ...cur, p0: pt };
      if (mode === "scale") { setScale(next); emit(next, object); }
      else { setObject(next); emit(scale, next); }
    } else if (!cur.p1) {
      const next = { ...cur, p1: pt };
      if (mode === "scale") { setScale(next); emit(next, object); }
      else { setObject(next); emit(scale, next); }
    } else {
      // Reset current line first point for quick re-placement
      const next = { p0: pt, p1: null };
      if (mode === "scale") { setScale(next); emit(next, object); }
      else { setObject(next); emit(scale, next); }
    }
  }

  function handleMove(e: React.MouseEvent) {
    if (!drag) return;
    const pt = relCoords(e);
    if (drag.which === "scale") {
      const next = { ...scale, [drag.end]: pt } as Line;
      setScale(next); emit(next, object);
    } else {
      const next = { ...object, [drag.end]: pt } as Line;
      setObject(next); emit(scale, next);
    }
  }

  function handleUp() { setDrag(null); }

  function clear(which: Mode) {
    if (which === "scale") { const next = { p0: null, p1: null }; setScale(next); emit(next, object); }
    else { const next = { p0: null, p1: null }; setObject(next); emit(scale, next); }
  }

  const scalePx = dist(scale.p0, scale.p1);
  const objectPx = dist(object.p0, object.p1);

  return (
    <div className="relative select-none" style={{ width, height }}>
      <div className="absolute left-2 top-2 z-10 flex items-center gap-2 bg-white/90 border rounded-md px-2 py-1 text-xs">
        <button
          type="button"
          className={`px-2 py-0.5 rounded ${mode === "scale" ? "bg-slate-800 text-white" : "border"}`}
          onClick={()=>setMode("scale")}
        >Scale</button>
        <button
          type="button"
          className={`px-2 py-0.5 rounded ${mode === "object" ? "bg-slate-800 text-white" : "border"}`}
          onClick={()=>setMode("object")}
        >Object</button>
        <div className="ml-2 text-slate-600">px: {Math.round(scalePx)} / {Math.round(objectPx)}</div>
        <button type="button" className="ml-2 underline" onClick={()=>clear(mode)}>Clear {mode}</button>
      </div>

      <div
        ref={wrapRef}
        className="absolute inset-0"
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseUp={handleUp}
        onMouseLeave={handleUp}
      >
        <svg width={width} height={height} className="absolute inset-0">
          {/* scale line: green */}
          {scale.p0 && scale.p1 && (
            <g>
              <line x1={scale.p0.x} y1={scale.p0.y} x2={scale.p1.x} y2={scale.p1.y} stroke="#10b981" strokeWidth="2" />
            </g>
          )}
          {scale.p0 && (<circle cx={scale.p0.x} cy={scale.p0.y} r={6} fill="#10b981" />)}
          {scale.p1 && (<circle cx={scale.p1.x} cy={scale.p1.y} r={6} fill="#10b981" />)}

          {/* object line: sky */}
          {object.p0 && object.p1 && (
            <g>
              <line x1={object.p0.x} y1={object.p0.y} x2={object.p1.x} y2={object.p1.y} stroke="#0ea5e9" strokeWidth="2" />
            </g>
          )}
          {object.p0 && (<circle cx={object.p0.x} cy={object.p0.y} r={6} fill="#0ea5e9" />)}
          {object.p1 && (<circle cx={object.p1.x} cy={object.p1.y} r={6} fill="#0ea5e9" />)}
        </svg>
      </div>
    </div>
  );
}
