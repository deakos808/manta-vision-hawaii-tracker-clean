import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
type Row = {
  session_id: string;
  n_measurements: number | null;
  mean_error_pct: number | null;
  photographer_name?: string | null;
  camera_model?: string | null;
  created_at?: string | null;
};

export default function CalibrationLandingPage(){
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [photosCount, setPhotosCount] = useState<Record<string, number>>({});

  useEffect(()=>{ (async ()=>{
    setLoading(true);
    try{
      const { data: stats, error: e1 } = await supabase.from("calibration_session_stats").select("*");
      if (e1) throw e1;
      const { data: heads, error: e2 } = await supabase.from("calibration_sessions").select("id, photographer_name, camera_model, created_at");
      if (e2) throw e2;

      const ids=(heads||[]).map(h=>h.id);
      const cMap: Record<string, number> = {};
      if(ids.length){
        const { data: ph, error: e3 } = await supabase.from("calibration_photos").select("id, session_id").in("session_id", ids);
        if (e3) throw e3;
        for (const p of (ph||[])) cMap[p.session_id]=(cMap[p.session_id]||0)+1;
      }
      setPhotosCount(cMap);

      const map=new Map((heads||[]).map(h=>[h.id,h]));
      const merged: Row[] = (stats||[]).map(s=>({
        session_id:s.session_id,
        n_measurements:s.n_measurements,
        mean_error_pct:s.mean_error_pct,
        photographer_name: map.get(s.session_id)?.photographer_name ?? null,
        camera_model: map.get(s.session_id)?.camera_model ?? null,
        created_at: map.get(s.session_id)?.created_at ?? null,
      })).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
      setRows(merged);
    } finally { setLoading(false); }
  })(); },[]);

  return (
    <div className="min-h-full">
      {/* Hero */}
      <div className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-10 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl font-bold">Calibration Sessions</h1>
        </div>
      </div>

      {/* Breadcrumb (below hero) */}
      <div className="max-w-6xl mx-auto px-4 py-2">
        <a href="/admin" className="text-sm text-blue-700 underline">Admin</a>
        <span className="text-sm text-slate-600"> / Calibration</span>
      </div>

      <div className="max-w-6xl mx-auto p-6">
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Calibration Sessions</h1>
        <p className="text-sm text-slate-600">Mean error is computed across photos with measurements.</p>
      </div>

      <div className="mb-4">
        <Link to="/admin/calibration/new" className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-slate-50">
          New Calibration
        </Link>
      </div>

      <div className="overflow-x-auto border rounded-lg bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">Created</th>
              <th className="text-left px-3 py-2">Photographer</th>
              <th className="text-left px-3 py-2">Camera</th>
              <th className="text-right px-3 py-2">Photos</th>
              <th className="text-right px-3 py-2">Mean error (%)</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.session_id} className="border-t">
                <td className="px-3 py-2">{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td>
                <td className="px-3 py-2">{r.photographer_name || "-"}</td>
                <td className="px-3 py-2">{r.camera_model || "-"}</td>
                <td className="px-3 py-2 text-right">{/* actions cell remains later */}</td>
                <td className="px-3 py-2 text-right">{/* actions cell remains later */}</td>
                <td className="px-3 py-2 text-right">{/* actions cell remains later */}</td>
              </tr>
            ))}
            {(!rows.length && !loading) && (
              <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={6}>No sessions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
