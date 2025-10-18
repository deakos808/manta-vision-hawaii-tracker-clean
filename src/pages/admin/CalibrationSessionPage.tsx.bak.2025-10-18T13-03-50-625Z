import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { supabase } from "@/lib/supabaseClient";
import { fmtMeters } from "../../utils/format";
import CalibrationLineCanvas, { CanvasState } from "../../components/calibration/CalibrationLineCanvas";

type Session = {
  id: string;
  photographer_name: string | null;
  camera_model: string | null;
  lens_type: string | null;
  laser_setup: string | null;
  default_scale_m: number;
  created_at: string;
};

type PhotoRow = {
  id: string;
  storage_path: string;
  width_px: number | null;
  height_px: number | null;
  actual_length_m: number | null;
  signed_url?: string | null;
  m?: {
    scale_px: number;
    object_px: number;
    scale_m: number;
    est_length_m: number;
    error_pct: number;
    scale_p0: any;
    scale_p1: any;
    object_p0: any;
    object_p1: any;
  } | null;
};

type NewPhotoItem = {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
  canvas: CanvasState;
  actualStr: string; // input value
};

function useImageDims(file: File): Promise<{url:string;width:number;height:number}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ url, width: img.width, height: img.height });
    img.onerror = reject;
    img.src = url;
  });
}

export default function CalibrationSessionPage(){
  const { id } = useParams();
  const [sess, setSess] = useState<Session | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(false);
  const [meta, setMeta] = useState<{photographer_name:string;camera_model:string;lens_type:string;laser_setup:string}>({photographer_name:"",camera_model:"",lens_type:"",laser_setup:""});
  const [reMeasure, setReMeasure] = useState<Record<string, {canvas:CanvasState; actualStr:string}>>({});
  const [adding, setAdding] = useState<NewPhotoItem[]>([]);
  const scaleM = sess?.default_scale_m ?? 0.60;

  useEffect(()=>{ (async()=>{
    if (!id) return;
    setLoading(true);
    try{
      // session header
      const { data: srow, error: se } = await supabase.from("calibration_sessions").select("*").eq("id", id).single();
      if (se) throw se;

      // photos
      const { data: prows, error: pe } = await supabase
        .from("calibration_photos")
        .select("id, storage_path, width_px, height_px, actual_length_m")
        .eq("session_id", id);
      if (pe) throw pe;

      // measurements
      const photoIds = (prows||[]).map(p=>p.id);
      let measMap = new Map<string, any>();
      if (photoIds.length){
        const { data: mrows, error: me } = await supabase
          .from("calibration_measurements")
          .select("*")
          .in("photo_id", photoIds);
        if (me) throw me;
        for (const m of (mrows||[])) measMap.set(m.photo_id, m);
      }

      // signed urls
      const withUrls: PhotoRow[] = [];
      for (const p of (prows||[])){
        const { data: u } = await supabase.storage.from("calibration-images").createSignedUrl(p.storage_path, 3600);
        withUrls.push({ ...p, signed_url: u?.signedUrl ?? null, m: measMap.get(p.id) || null });
      }

      setSess(srow as Session);
      setMeta({
        photographer_name: srow.photographer_name ?? "",
        camera_model: srow.camera_model ?? "",
        lens_type: srow.lens_type ?? "",
        laser_setup: srow.laser_setup ?? "",
      });
      setPhotos(withUrls);
    } finally { setLoading(false); }
  })(); }, [id]);

  const measured = photos.filter(p=>p.m);
  const meanErr = measured.length ? measured.reduce((a,p)=>a+(p.m!.error_pct||0),0)/measured.length : null;

  async function saveMeta(){
    if(!sess) return;
    const { error } = await supabase.from("calibration_sessions").update({
      photographer_name: meta.photographer_name || null,
      camera_model: meta.camera_model || null,
      lens_type: meta.lens_type || null,
      laser_setup: meta.laser_setup || null,
    }).eq("id", sess.id);
    if (error) throw error;
  }

  async function saveReMeasure(photo: PhotoRow){
    const r = reMeasure[photo.id]; if(!r || !sess) return;
    const scalePx = r.canvas.scalePx, objPx = r.canvas.objectPx, actual = Number(r.actualStr);
    if(!(scalePx>0 && objPx>0 && actual>0)) { alert("Draw both lines and enter actual length (m)."); return; }
    const est = (objPx/scalePx) * scaleM;
    const errPct = Math.abs(est - actual)/actual*100;

    // update photo actual
    const { error: pErr } = await supabase.from("calibration_photos")
      .update({ actual_length_m: actual })
      .eq("id", photo.id);
    if (pErr) throw pErr;

    // upsert measurement: delete existing then insert
    await supabase.from("calibration_measurements").delete().eq("photo_id", photo.id);
    const { error: mErr } = await supabase.from("calibration_measurements").insert([{
      photo_id: photo.id,
      scale_px: scalePx, object_px: objPx,
      scale_p0: r.canvas.scale.p0, scale_p1: r.canvas.scale.p1,
      object_p0: r.canvas.object.p0, object_p1: r.canvas.object.p1,
      scale_m: scaleM, est_length_m: est, error_pct: errPct
    }]);
    if (mErr) throw mErr;

    // refresh one photo display
    const { data: u } = await supabase.storage.from("calibration-images").createSignedUrl(photo.storage_path, 3600);
    setPhotos(prev=>prev.map(p=> p.id===photo.id ? ({
      ...p,
      actual_length_m: actual,
      signed_url: u?.signedUrl ?? p.signed_url,
      m: {
        scale_px: scalePx, object_px: objPx, scale_m: scaleM, est_length_m: est, error_pct: errPct,
        scale_p0: r.canvas.scale.p0, scale_p1: r.canvas.scale.p1, object_p0: r.canvas.object.p0, object_p1: r.canvas.object.p1
      }
    }) : p));
    setReMeasure(prev=>{ const out={...prev}; delete out[photo.id]; return out; });
  }

  async function deletePhoto(photo: PhotoRow){
    if(!confirm("Delete this photo and its measurement?")) return;
    // delete from storage
    await supabase.storage.from("calibration-images").remove([photo.storage_path]);
    // delete rows (cascade handled if you prefer, but explicit here)
    await supabase.from("calibration_measurements").delete().eq("photo_id", photo.id);
    await supabase.from("calibration_photos").delete().eq("id", photo.id);
    setPhotos(prev=>prev.filter(p=>p.id!==photo.id));
  }

  async function onAddFiles(files: FileList | null){
    if(!files || !files.length) return;
    const items: NewPhotoItem[] = [];
    for(const f of Array.from(files)){
      if(!f.type.startsWith("image/")) continue;
      const meta = await useImageDims(f);
      const maxW = Math.min(720, meta.width);
      items.push({
        id: crypto.randomUUID(), file: f, url: meta.url,
        width: maxW, height: Math.round(meta.height*(maxW/meta.width)),
        canvas: { scale:{p0:null,p1:null}, object:{p0:null,p1:null}, scalePx:0, objectPx:0 },
        actualStr: ""
      });
    }
    setAdding(prev=>[...prev, ...items]);
  }

  async function commitNewPhotos(){
    if(!sess) return;
    const valids = adding.filter(a => a.canvas.scalePx>0 && a.canvas.objectPx>0 && Number(a.actualStr)>0);
    if(!valids.length){ alert("Add at least one fully measured new photo."); return; }

    for(const a of valids){
      const filename = a.file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const path = `calibration/${sess.id}/${filename}`;
      const up = await supabase.storage.from("calibration-images").upload(path, a.file, { upsert:true });
      if (up.error) throw up.error;

      const { data: prow, error: pErr } = await supabase
        .from("calibration_photos")
        .insert([{
          session_id: sess.id,
          storage_path: path,
          width_px: a.width,
          height_px: a.height,
          actual_length_m: Number(a.actualStr),
        }]).select("id").single();
      if (pErr) throw pErr;

      const est = (a.canvas.objectPx/a.canvas.scalePx)*scaleM;
      const errPct = Math.abs(est - Number(a.actualStr))/Number(a.actualStr)*100;

      const { error: mErr } = await supabase.from("calibration_measurements").insert([{
        photo_id: prow!.id,
        scale_px: a.canvas.scalePx, object_px: a.canvas.objectPx,
        scale_p0: a.canvas.scale.p0, scale_p1: a.canvas.scale.p1,
        object_p0: a.canvas.object.p0, object_p1: a.canvas.object.p1,
        scale_m: scaleM, est_length_m: est, error_pct: errPct
      }]);
      if (mErr) throw mErr;

      // add to local list with signed URL
      const { data: u } = await supabase.storage.from("calibration-images").createSignedUrl(path, 3600);
      setPhotos(prev=>[...prev, {
        id: prow!.id, storage_path: path, width_px: a.width, height_px: a.height, actual_length_m: Number(a.actualStr),
        signed_url: u?.signedUrl ?? null,
        m: { scale_px: a.canvas.scalePx, object_px: a.canvas.objectPx, scale_m: scaleM, est_length_m: est, error_pct: errPct,
             scale_p0: a.canvas.scale.p0, scale_p1: a.canvas.scale.p1, object_p0: a.canvas.object.p0, object_p1: a.canvas.object.p1 }
      }]);
    }
    // clear "adding" after commit
    setAdding([]);
  }

  if (!id) return <Layout><div className="p-6">Missing session id.</div></Layout>;
  if (loading) return <Layout><div className="p-6">Loading…</div></Layout>;
  if (!sess) return <Layout><div className="p-6">Session not found.</div></Layout>;

  const nMeasured = photos.filter(p=>p.m).length;
  const meanErrTxt = meanErr!=null && isFinite(meanErr) ? meanErr.toFixed(2)+"%" : "-";

  return (
    <Layout>
      <div className="p-6 space-y-4">
        {/* Breadcrumb */}
        <nav className="text-sm">
          <Link to="/admin" className="text-sky-700 hover:underline">Admin</Link>
          <span className="mx-1">/</span>
          <Link to="/admin/calibration" className="text-sky-700 hover:underline">Calibration</Link>
          <span className="mx-1">/</span>
          <span className="text-slate-500">{id}</span>
        </nav>

        {/* Header card */}
        <div className="rounded-lg border bg-white p-4">
          {!edit ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Photographer:</span> {sess.photographer_name || "-"}</div>
                <div><span className="text-slate-500">Camera:</span> {sess.camera_model || "-"}</div>
                <div><span className="text-slate-500">Lens:</span> {sess.lens_type || "-"}</div>
                <div><span className="text-slate-500">Laser setup:</span> {sess.laser_setup || "-"}</div>
                <div><span className="text-slate-500">Default scale:</span> {fmtMeters(sess.default_scale_m)}</div>
                <div><span className="text-slate-500">Created:</span> {new Date(sess.created_at).toLocaleString()}</div>
              </div>
              <div className="mt-2 text-sm text-slate-600">
                <span className="mr-4">Photos: {photos.length}</span>
                <span className="mr-4">Measured: {nMeasured}</span>
                <span>Mean error: {meanErrTxt}</span>
              </div>
              <div className="mt-3">
                <button className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50" onClick={()=>setEdit(true)}>Edit</button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="text-slate-500">Photographer</span>
                  <input className="border rounded-md px-3 py-2" value={meta.photographer_name} onChange={e=>setMeta({...meta, photographer_name:e.target.value})}/>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-slate-500">Camera</span>
                  <input className="border rounded-md px-3 py-2" value={meta.camera_model} onChange={e=>setMeta({...meta, camera_model:e.target.value})}/>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-slate-500">Lens</span>
                  <input className="border rounded-md px-3 py-2" value={meta.lens_type} onChange={e=>setMeta({...meta, lens_type:e.target.value})}/>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-slate-500">Laser setup</span>
                  <input className="border rounded-md px-3 py-2" value={meta.laser_setup} onChange={e=>setMeta({...meta, laser_setup:e.target.value})}/>
                </label>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50" onClick={async()=>{ await saveMeta(); setEdit(false); }}>Save</button>
                <button className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50" onClick={()=>{ setEdit(false); setMeta({
                  photographer_name: sess.photographer_name ?? "", camera_model: sess.camera_model ?? "",
                  lens_type: sess.lens_type ?? "", laser_setup: sess.laser_setup ?? ""
                });}}>Cancel</button>
              </div>
            </>
          )}
        </div>

        {/* Existing photos */}
        <div className="space-y-4">
          {photos.map((p, i)=>(
            <div key={p.id} className="rounded-lg border bg-white p-4">
              <div className="text-sm font-medium mb-2">Photo #{i+1}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  {p.signed_url ? (
                    <img src={p.signed_url} alt="calibration" className="max-w-full h-auto rounded-md border" />
                  ) : (
                    <div className="text-sm text-slate-500">No image URL.</div>
                  )}
                </div>
                <div className="text-sm grid grid-cols-2 gap-x-4 gap-y-1">
                  {!reMeasure[p.id] ? (
                    <>
                      <div className="text-slate-500">Actual length</div><div>{p.actual_length_m != null ? fmtMeters(p.actual_length_m) : "-"}</div>
                      <div className="text-slate-500">Scale (px)</div><div>{p.m ? Math.round(p.m.scale_px) : "-"}</div>
                      <div className="text-slate-500">Object (px)</div><div>{p.m ? Math.round(p.m.object_px) : "-"}</div>
                      <div className="text-slate-500">Scale (m)</div><div>{p.m ? fmtMeters(p.m.scale_m) : "-"}</div>
                      <div className="text-slate-500">Estimated length</div><div>{p.m ? fmtMeters(p.m.est_length_m) : "-"}</div>
                      <div className="text-slate-500">% error</div><div>{p.m ? p.m.error_pct.toFixed(2) + "%" : "-"}</div>
                      <div className="col-span-2 mt-2 flex gap-2">
                        <button className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50" onClick={()=>setReMeasure(prev=>({...prev, [p.id]: { canvas:{scale:{p0:null,p1:null}, object:{p0:null,p1:null}, scalePx:0, objectPx:0}, actualStr: p.actual_length_m?.toString() || "" }}))}>Re-measure</button>
                        <button className="rounded-md border px-3 py-2 text-sm hover:bg-rose-50 text-rose-700" onClick={()=>deletePhoto(p)}>Delete photo</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="col-span-2">
                        <div className="mb-2 text-slate-600">Draw scale (green) and object (sky) lines:</div>
                        <CalibrationLineCanvas
                          width={Math.min(720, p.width_px||720)}
                          height={Math.round((p.height_px||720) * (Math.min(720, p.width_px||720) / (p.width_px||720)))}
                          onChange={(state)=>setReMeasure(prev=>({...prev, [p.id]: {...prev[p.id], canvas: state}}))}
                        />
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className="text-slate-500">Actual length (m)</span>
                        <input className="border rounded-md px-3 py-2 w-40" type="number" step="0.01" min="0.01"
                          value={reMeasure[p.id].actualStr}
                          onChange={e=>setReMeasure(prev=>({...prev, [p.id]: {...prev[p.id], actualStr: e.target.value}}))}
                        />
                        {reMeasure[p.id].canvas.scalePx>0 && reMeasure[p.id].canvas.objectPx>0 && !reMeasure[p.id].actualStr && (
                          <span className="text-xs text-rose-600">Enter actual length to compute % error.</span>
                        )}
                      </label>
                      <div className="col-span-2 mt-2 flex gap-2">
                        <button className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50" onClick={()=>saveReMeasure(p)}>Save</button>
                        <button className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50" onClick={()=>setReMeasure(prev=>{ const out={...prev}; delete out[p.id]; return out; })}>Cancel</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {photos.length===0 && <div className="text-sm text-slate-500">No photos.</div>}
        </div>

        {/* Add new photos */}
        <div className="rounded-lg border bg-white p-4">
          <div className="text-sm font-medium mb-2">Add photos</div>
          <div
            className="rounded-lg border border-dashed p-6 bg-white text-center"
            onDragOver={(e)=>e.preventDefault()}
            onDrop={(e)=>{ e.preventDefault(); onAddFiles(e.dataTransfer.files); }}
          >
            <div className="text-sm text-slate-600 mb-3">Drag &amp; drop photos here, or</div>
            <label className="inline-flex items-center gap-2 px-3 py-2 border rounded-md cursor-pointer hover:bg-slate-50">
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e)=>onAddFiles(e.target.files)} />
              <span>Select images</span>
            </label>
          </div>

          {adding.length>0 && (
            <div className="mt-4 space-y-6">
              {adding.map((a,idx)=>(
                <div key={a.id} className="rounded-lg border bg-white p-4">
                  <div className="text-sm font-medium mb-2">New photo #{idx+1}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <img src={a.url} className="max-w-full h-auto rounded-md border" />
                      <div className="mt-2">
                        <CalibrationLineCanvas
                          width={a.width}
                          height={a.height}
                          onChange={(state)=>setAdding(prev=>prev.map(x=>x.id===a.id? {...x, canvas: state}: x))}
                        />
                      </div>
                    </div>
                    <div className="text-sm">
                      <label className="flex flex-col gap-1">
                        <span className="text-slate-500">Actual length (m)</span>
                        <input className="border rounded-md px-3 py-2 w-40" type="number" step="0.01" min="0.01"
                          value={a.actualStr}
                          onChange={e=>setAdding(prev=>prev.map(x=>x.id===a.id? {...x, actualStr: e.target.value}: x))}
                        />
                      </label>
                      <div className="mt-3 flex gap-2">
                        <button className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
                          onClick={()=>setAdding(prev=>prev.filter(x=>x.id!==a.id))}>Remove</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-end">
                <button className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50" onClick={commitNewPhotos}>Add to session</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
