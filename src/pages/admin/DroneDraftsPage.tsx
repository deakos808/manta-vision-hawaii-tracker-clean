import React, { useEffect, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useNavigate, Link } from "react-router-dom";

type Draft = {
  id: string;
  created_at: string | null;
  pilot: string | null;
  email: string | null;
  island: string | null;
  location: string | null;
  status: string | null;
  photo_count?: number;
};

type Photo = {
  id: string;
  url: string | null;
  path: string;
  taken_date: string | null;
  taken_time: string | null;
  lat: number | null;
  lon: number | null;
  total_mantas: number | null;
};

function trimSlash(s?: string) {
  return (s || "").replace(/\/+$/, "");
}

export default function DroneDraftsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("v_temp_drone_sightings_summary")
      .select("*")
      .is("committed_at", null)       // only drafts needing review
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("[Drafts] list error", error.message);
      setRows([]);
    } else {
      setRows((data as any[]) as Draft[]);
    }
    setLoading(false);
    // close any open photos if list changed
    setOpenId(null);
    setPhotos([]);
  }

  useEffect(() => { load(); }, []);

  async function viewPhotos(id: string) {
    if (openId === id) { setOpenId(null); setPhotos([]); return; }
    setOpenId(id);
    const { data, error } = await supabase
      .from("temp_drone_photos")
      .select("id,url,path,taken_date,taken_time,lat,lon,total_mantas")
      .eq("draft_id", id)
      .order("created_at", { ascending: true });
    if (error) { console.warn("[Drafts] photos error", error.message); setPhotos([]); }
    else setPhotos((data as any[]) as Photo[]);
  }

  async function del(id: string) {
    if (!window.confirm("Delete this draft and its photos?")) return;
    setBusyId(id);
    const { error } = await supabase.from("temp_drone_sightings").delete().eq("id", id);
    if (error) window.alert("Delete failed: " + error.message);
    setBusyId(null);
    await load();
  }

  async function commitDraft(id: string) {
  if (!window.confirm("Commit this draft (copy/move to permanent bucket and insert live rows)?")) return;
  try {
    const { data, error } = await supabase.functions.invoke('commit-drone-draft', {
      body: { draft_id: id }
    });
    if (error) {
      console.error('[commit] error', error);
      window.alert("Commit failed: " + (error.message || String(error)));
      return;
    }
    console.info('[commit] ok', data);
    window.alert("Committed.");
    try { typeof load === 'function' && (await load()); } catch {}
  } catch (e:any) {
    console.error('[commit] exception', e);
    window.alert("Commit error: " + (e?.message || String(e)));
  }
}

  return (
    <Layout>
      {/* Hero (centered title) */}
      <div className="bg-gradient-to-r from-sky-600 to-blue-700 text-white py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 lg:px-16 text-center">
          <h1 className="text-3xl font-semibold">Drone Sighting Submissions Needing Review</h1>
        </div>
      </div>
      {/* Breadcrumb under hero, left-aligned */}
      <div className="max-w-6xl mx-auto px-4 sm:px-8 lg:px-16 py-3 text-sm">
        <Link to="/admin" className="text-blue-700 underline">Admin</Link>
        <span className="text-slate-600"> / Drone Drafts</span>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 lg:px-16">
        <Card>
          <CardHeader>
            <CardTitle>Submissions ({loading ? "…" : rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="border rounded p-3 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <div className="font-medium">
                      {(r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : "—")} · {r.island || "—"} {r.location ? `· ${r.location}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      pilot: {r.pilot || "—"} · email: {r.email || "—"} · photos: {r.photo_count ?? "—"} · status: {r.status || "draft"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => viewPhotos(r.id)}>View Photos</Button>
                    <Button variant="secondary" onClick={() => commitDraft(r.id)} disabled={busyId === r.id}>Commit</Button>
                    <Button variant="destructive" onClick={() => del(r.id)} disabled={busyId === r.id}>Delete</Button>
                  </div>
                </div>

                {openId === r.id && (
                  <div className="mt-3">
                    {photos.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No photos for this draft.</div>
                    ) : (
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {photos.map((p) => (
                          <div key={p.id} className="border rounded-lg bg-white overflow-hidden">
                            {p.url ? (
                              <img src={p.url} alt={p.path} className="w-full h-40 object-contain bg-white" />
                            ) : (
                              <div className="w-full h-40 bg-gray-100 flex items-center justify-center text-xs text-gray-500">no image</div>
                            )}
                            <div className="p-3 text-xs">
                              <div className="font-mono break-all text-slate-500">{p.path}</div>
                              <div className="mt-2 space-y-1">
                                <div><span className="text-slate-500">Date:</span> {p.taken_date || "—"}</div>
                                <div><span className="text-slate-500">Time:</span> {p.taken_time || "—"}</div>
                                <div><span className="text-slate-500">Lat:</span> {p.lat != null ? p.lat.toFixed(6) : "—"}</div>
                                <div><span className="text-slate-500">Lon:</span> {p.lon != null ? p.lon.toFixed(6) : "—"}</div>
                                <div><span className="text-slate-500">Mantas:</span> {p.total_mantas ?? "—"}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {rows.length === 0 && !loading && (
              <div className="text-sm text-muted-foreground">No drafts to review.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
