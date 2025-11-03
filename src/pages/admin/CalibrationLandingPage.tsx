import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Pencil, Trash2 } from "lucide-react";

type Row = {
  session_id: string;
  created_at: string | null;
  measurement_date: string | null;
  photographer_name: string | null;
  camera_model: string | null;
  lens_type: string | null;
  laser_setup: string | null;
  photos: number | null;
  mean_error_pct: number | null;
};

export default function CalibrationLandingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadRows();
  }, []);

  async function loadRows() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("calibration_session_stats")
        .select("*");
      if (error) throw error;

      const list = (data || []) as Row[];
      // Sort by measurement date fallback to created_at (desc)
      const sorted = [...list].sort((a, b) =>
        String(b.measurement_date || b.created_at || "").localeCompare(
          String(a.measurement_date || a.created_at || "")
        )
      );
      setRows(sorted);
    } catch (e) {
      console.error("[Calibration] fetch error", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function deleteSession(sessionId: string) {
    if (!confirm("Delete this calibration and its photos?")) return;
    try {
      // delete photos then the session
      await supabase.from("calibration_photos").delete().eq("session_id", sessionId);
      await supabase.from("calibration_sessions").delete().eq("id", sessionId);
      await loadRows();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      console.error("[Calibration] delete error", e);
      alert("Delete failed — see console for details.");
    }
  }

  return (
    <div className="px-6 pb-12">
      {/* hero */}
      <div className="bg-blue-600 text-white rounded-md px-6 py-8 mt-6 mb-4">
        <h1 className="text-3xl font-bold">Calibration Sessions</h1>
      </div>

      {/* breadcrumb */}
      <div className="mb-4 text-sm">
        <Link to="/browse/data" className="text-blue-700 hover:underline">
          &larr; Return to Browse Data
        </Link>
        <span className="mx-2">/</span>
        <span className="text-slate-500">Calibration</span>
      </div>

      <p className="text-sm text-slate-600 mb-4">
        View and manage uploaded calibration sessions.
      </p>

      <div className="flex justify-end mb-3">
        <Link
          to="/admin/calibration/new"
          className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
        >
          + New Calibration
        </Link>
      </div>

      <div className="rounded-md border bg-white overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="text-left  px-3 py-2">Date</th>
              <th className="text-center px-3 py-2">Photographer</th>
              <th className="text-center px-3 py-2">Camera</th>
              <th className="text-center px-3 py-2">Lens</th>
              <th className="text-center px-3 py-2">Laser setup</th>
              <th className="text-center px-3 py-2">Photos</th>
              <th className="text-center px-3 py-2">Mean error</th>
              <th className="text-center px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={8}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={8}>
                  No sessions found.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const when = r.measurement_date || r.created_at || "";
                const mean = r.mean_error_pct;
                return (
                  <tr key={r.session_id} className="border-t">
                    <td className="px-3 py-2">
                      {when ? new Date(when).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.photographer_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.camera_model ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.lens_type ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.laser_setup ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.photos ?? 0}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {mean == null ? "—" : `${mean.toFixed(2)}%`}
                    </td>
                    <td className="px-3 py-1">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          to={`/admin/calibration/${r.session_id}`}
                          className="inline-flex items-center p-1 rounded hover:bg-slate-50"
                          title="Open"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <button
                          type="button"
                          className="inline-flex items-center p-1 rounded hover:bg-red-50 text-red-600"
                          title="Delete"
                          onClick={() => deleteSession(r.session_id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
