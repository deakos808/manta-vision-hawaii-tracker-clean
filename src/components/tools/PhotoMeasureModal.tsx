import React, { useEffect, useMemo, useRef, useState } from "react";

type Pt = { x: number; y: number };
type Props = {
  open: boolean;
  imageUrl: string;
  knownScaleCm?: number;
  onClose: () => void;
  onSave: (r: { scalePx: number; discPx: number; dlCm: number; dwCm: number; scaleCm: number; points: Pt[]; }) => void;
  initial?: { points?: Pt[]; scaleCm?: number };
};

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
const to2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "—");

export default function PhotoMeasureModal({ open, imageUrl, knownScaleCm=60, onClose, onSave, initial }: Props){
  const imgRef = useRef<HTMLImageElement|null>(null);
  const [points, setPoints] = useState<Pt[]>(() => initial?.points ?? []);
  const [dragIdx, setDragIdx] = useState<number|null>(null);
  const [scaleCm, setScaleCm] = useState<number>(initial?.scaleCm ?? knownScaleCm);
  const [editScale, setEditScale] = useState(false);
  const [cursor, setCursor] = useState<{x:number;y:number}|null>(null);
  const [zoom] = useState<number>(3.0);
  const [loupe] = useState<number>(120);

  useEffect(()=>{ if(!open){ setPoints(initial?.points ?? []); setDragIdx(null); setCursor(null); } },[open]); // eslint-disable-line

  const dims = useMemo(()=>({ w: imgRef.current?.clientWidth ?? 0, h: imgRef.current?.clientHeight ?? 0 }), [imgRef.current?.clientWidth, imgRef.current?.clientHeight]); // eslint-disable-line
  const px = (p:Pt)=>({x:p.x*dims.w,y:p.y*dims.h});
  const scalePx = useMemo(()=> points.length>=2?Math.hypot(px(points[0]).x-px(points[1]).x,px(points[0]).y-px(points[1]).y):0,[points,dims]);
  const discPx  = useMemo(()=> points.length>=4?Math.hypot(px(points[2]).x-px(points[3]).x,px(points[2]).y-px(points[3]).y):0,[points,dims]);
  const cmPerPx = useMemo(()=> scalePx>0 ? scaleCm/scalePx : 0, [scalePx,scaleCm]);
  const dlCm    = useMemo(()=> discPx>0 ? discPx*cmPerPx : 0, [discPx,cmPerPx]);
  const dwCm    = useMemo(()=> dlCm>0 ? dlCm*2.3 : 0, [dlCm]);

  function getNorm(e:React.MouseEvent){ const img=imgRef.current; if(!img) return {nx:0,ny:0}; const r=img.getBoundingClientRect(); return { nx: clamp01((e.clientX-r.left)/Math.max(1,r.width)), ny: clamp01((e.clientY-r.top)/Math.max(1,r.height)) }; }
  function onMouseDown(e:React.MouseEvent){ const {nx,ny}=getNorm(e); const tol=12/Math.max(1,imgRef.current?.clientWidth??1); let nearest=-1,best=1e9; points.forEach((p,i)=>{const d=Math.hypot(p.x-nx,p.y-ny); if(d<best){best=d;nearest=i;}}); if(nearest>=0 && best<=tol){ setDragIdx(nearest);} else if(points.length<4){ setPoints(prev=>[...prev,{x:nx,y:ny}]); setDragIdx(null);} }
  function onMouseMove(e:React.MouseEvent){ const {nx,ny}=getNorm(e); setCursor({x:nx*(imgRef.current?.clientWidth??0), y:ny*(imgRef.current?.clientHeight??0)}); if(dragIdx===null) return; setPoints(prev=>prev.map((p,i)=>i===dragIdx?{x:nx,y:ny}:p)); }
  function onMouseUp(){ setDragIdx(null); }
  function reset(){ setPoints([]); setDragIdx(null); }
  function save(){ onSave({ scalePx, discPx, dlCm, dwCm, scaleCm, points }); }
  if(!open) return null;

  return (
    <div className="fixed inset-0 z-[500000] bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded shadow-lg w-[min(1200px,95vw)] max-h-[90vh] overflow-hidden" onClick={(e)=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-medium">Measure Disc Length (DL) — Dorsal View</div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center border rounded">&times;</button>
        </div>
        <div className="px-4 pt-3 pb-2 overflow-auto" style={{ maxHeight:"70vh" }}>
          <div className="inline-block relative">
            <img ref={imgRef} src={imageUrl} alt="Dorsal for sizing" className="block max-h-[65vh] w-auto rounded" draggable={false}/>
            <div className="absolute inset-0 cursor-crosshair" onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {points[0] && <circle cx={px(points[0]).x} cy={px(points[0]).y} r={6} fill="#0ea5e9" />}
                {points.length>=2 && (<><circle cx={px(points[1]).x} cy={px(points[1]).y} r={6} fill="#0ea5e9" /><line x1={px(points[0]).x} y1={px(points[0]).y} x2={px(points[1]).x} y2={px(points[1]).y} stroke="#0ea5e9" strokeWidth={3}/></>)}
                {points.length>=3 && <circle cx={px(points[2]).x} cy={px(points[2]).y} r={6} fill="#14b8a6" />}
                {points.length>=4 && (<><circle cx={px(points[3]).x} cy={px(points[3]).y} r={6} fill="#14b8a6" /><line x1={px(points[2]).x} y1={px(points[2]).y} x2={px(points[3]).x} y2={px(points[3]).y} stroke="#14b8a6" strokeWidth={3}/></>)}
              </svg>
              {cursor && (()=>{ const P=10; let left=cursor.x+P, top=cursor.y+P; const dispW=imgRef.current?.clientWidth??0, dispH=imgRef.current?.clientHeight??0; if(left+loupe>dispW) left=cursor.x-loupe-P; if(top+loupe>dispH) top=cursor.y-loupe-P; left=Math.max(0,Math.min(dispW-loupe,left)); top=Math.max(0,Math.min(dispH-loupe,top)); const url=imageUrl; return (<div className="pointer-events-none absolute rounded-full border border-slate-400 shadow-sm z-30 bg-white/5" style={{width:loupe,height:loupe,left,top,backgroundImage:`linear-gradient(rgba(255,255,255,0.95), rgba(255,255,255,0.95)),linear-gradient(rgba(255,255,255,0.95), rgba(255,255,255,0.95)),radial-gradient(circle at center, rgba(255,255,255,1) 0 3px, rgba(0,0,0,0.35) 3px 4px, rgba(255,255,255,0) 4px),url(${JSON.stringify(url)})`,backgroundRepeat:'no-repeat',backgroundSize:`1px ${loupe}px, ${loupe}px 1px, 6px 6px, ${dispW*zoom}px ${dispH*zoom}px`,backgroundPosition:`${loupe/2}px 0px, 0px ${loupe/2}px, ${loupe/2-3}px ${loupe/2-3}px, ${-(cursor.x*zoom)+loupe/2}px ${-(cursor.y*zoom)+loupe/2}px`}}/>); })()}
            </div>
          </div>
        </div>
        <div className="px-4 py-3 border-t bg-white">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="text-sm">
              <div><span className="text-slate-600">Disc length (px):</span> <span className="font-medium">{to2(discPx)}</span></div>
              <div><span className="text-slate-600">Disc width (px):</span> <span className="font-medium">{to2(discPx*2.3)}</span></div>
              <div className="mt-1">
                <span className="text-slate-600">Scale = </span>
                {editScale ? (<><input type="number" className="border rounded px-2 py-1 w-20 mr-2" value={scaleCm} onChange={(e)=>setScaleCm(Number(e.target.value)||0)} /><button className="text-blue-600 mr-2" onClick={()=>setEditScale(false)}>Done</button></>) : (<><span className="font-medium">{to2(scaleCm/100)}</span> <span className="text-slate-600">m</span><button className="text-blue-600 ml-2 underline" onClick={()=>setEditScale(true)}>change</button></>)}
              </div>
            </div>
            <div className="text-sm">
              <div><span className="text-slate-600">DL (m):</span> <span className="font-medium">{to2(dlCm/100)}</span></div>
              <div><span className="text-slate-600">DW (m):</span> <span className="font-medium">{to2(dwCm/100)}</span></div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded border" onClick={reset}>Reset</button>
              <button className="px-3 py-2 rounded bg-sky-600 text-white" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
