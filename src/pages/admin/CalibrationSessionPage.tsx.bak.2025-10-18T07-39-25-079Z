import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { fmtMeters } from "../../utils/format";

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

export default function CalibrationSessionPage(){
  const { id } = useParams();
  const [sess, setSess] = useState<Session | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{ (async()=>{
    if (!id) return;
    setLoading(true);
    try{
      // session header
      const { data: srow, error: se } = await supabase
        .from("calibration_sessions")
        .select("*")
        .eq("id", id)
        .single();
      if (se) throw se;

      // photos
      const { data: prows, error: pe } = await supabase
        .from("calibration_photos")
        .select("id, storage_path, width_px, height_px, actual_length_m")
        .eq("session_id", id);
      if (pe) throw pe;

      // measurements for those photos
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

      // signed URLs for images (private bucket)
      const withUrls: PhotoRow[] = [];
      for (const p of (prows||[])){
        const { data: u, error: ue } = await supabase
          .storage
          .from("calibration-images")
          .createSignedUrl(p.storage_path, 60*60); // 1 hour
        if (ue) {
          withUrls.push({ ...p, signed_url: null, m: measMap.get(p.id) || null });
        } else {
          withUrls.push({ ...p, signed_url: u?.signedUrl ?? null, m: measMap.get(p.id) || null });
        }
      }

      setSess(srow as Session);
      setPhotos(withUrls);
    } finally {
      setLoading(false);
    }
  })(); }, [id]);

  if (!id) return <div className="p-6">Missing session id.</div>;
  if (loading) return <div className="p-6">Loading…</div>;
  if (!sess) return <div className="p-6">Session not found.</div>;

  const nMeasured = photos.filter(p=>p.m).length;
  const meanErr = photos
    .filter(p=>p.m && typeof p.m.error_pct==='number')
    .reduce((acc,p)=>acc+(p.m!.error_pct||0),0) / (nMeasured||1);

  return (
    <div className="p-6 space-y-4">
      <nav className="text-sm">
        <Link to="/admin" className="text-sky-700 hover:underline">Admin</Link>
        <span className="mx-1">/</span>
        <Link to="/admin/calibration" className="text-sky-700 hover:underline">Calibration</Link>
        <span className="mx-1">/</span>
        <span className="text-slate-500">{id}</span>
      </nav>

      <div className="rounded-lg border bg-white p-4">
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
          <span>Mean error: {isFinite(meanErr) ? meanErr.toFixed(2) + "%" : "-"}</span>
        </div>
      </div>

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
                <div className="text-slate-500">Actual length</div>
                <div>{p.actual_length_m != null ? fmtMeters(p.actual_length_m) : "-"}</div>

                <div className="text-slate-500">Scale (px)</div>
                <div>{p.m ? Math.round(p.m.scale_px) : "-"}</div>

                <div className="text-slate-500">Object (px)</div>
                <div>{p.m ? Math.round(p.m.object_px) : "-"}</div>

                <div className="text-slate-500">Scale (m)</div>
                <div>{p.m ? fmtMeters(p.m.scale_m) : "-"}</div>

                <div className="text-slate-500">Estimated length</div>
                <div>{p.m ? fmtMeters(p.m.est_length_m) : "-"}</div>

                <div className="text-slate-500">% error</div>
                <div>{p.m ? p.m.error_pct.toFixed(2) + "%" : "-"}</div>
              </div>
            </div>
          </div>
        ))}
        {photos.length===0 && <div className="text-sm text-slate-500">No photos.</div>}
      </div>
    </div>
  );
}
