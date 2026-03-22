import React, { useEffect, useMemo, useState } from "react";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Draft = {
  id: string;
  created_at: string | null;
  pilot: string | null;
  email: string | null;
  island: string | null;
  location: string | null;
  status: string | null;
  photo_count?: number;
  total_mantas_observed?: number | null;
  times_unknown?: boolean | null;
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

export default function DroneDraftsPage() {
  const [rows, setRows] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [commitId, setCommitId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState("Done");
  const [noticeMessage, setNoticeMessage] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("v_temp_drone_sightings_summary")
      .select("*")
      .is("committed_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[DroneDrafts] list error", error.message);
      setRows([]);
    } else {
      setRows((data as any[]) as Draft[]);
    }

    setLoading(false);
    setOpenId(null);
    setPhotos([]);
  }

  useEffect(() => {
    load();
  }, []);

  async function viewPhotos(id: string) {
    if (openId === id) {
      setOpenId(null);
      setPhotos([]);
      return;
    }

    setOpenId(id);

    const { data, error } = await supabase
      .from("temp_drone_photos")
      .select("id,url,path,taken_date,taken_time,lat,lon,total_mantas")
      .eq("draft_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("[DroneDrafts] photos error", error.message);
      setPhotos([]);
      return;
    }

    setPhotos((data as any[]) as Photo[]);
  }

  async function doDelete(id: string) {
    setBusyId(id);
    const { error } = await supabase.from("temp_drone_sightings").delete().eq("id", id);
    setBusyId(null);
    setDeleteId(null);

    if (error) {
      setNoticeTitle("Delete failed");
      setNoticeMessage(error.message);
      setNoticeOpen(true);
      return;
    }

    setNoticeTitle("Draft deleted");
    setNoticeMessage("The drone draft and its temp photos were removed.");
    setNoticeOpen(true);
    await load();
  }

  async function doCommit(id: string) {
    setBusyId(id);

    try {
      const { data, error } = await supabase.functions.invoke("commit-drone-draft", {
        body: { draft_id: id },
      });

      setBusyId(null);
      setCommitId(null);

      if (error) {
        console.error("[DroneDrafts] commit error", error);
        setNoticeTitle("Commit failed");
        setNoticeMessage(error.message || String(error));
        setNoticeOpen(true);
        return;
      }

      console.info("[DroneDrafts] commit ok", data);
      setNoticeTitle("Committed");
      setNoticeMessage("The drone survey was committed to the live drone survey tables.");
      setNoticeOpen(true);
      await load();
    } catch (e: any) {
      setBusyId(null);
      setCommitId(null);
      console.error("[DroneDrafts] commit exception", e);
      setNoticeTitle("Commit failed");
      setNoticeMessage(e?.message || String(e));
      setNoticeOpen(true);
    }
  }

  const commitRow = useMemo(
    () => rows.find((r) => r.id === commitId) ?? null,
    [rows, commitId]
  );

  const deleteRow = useMemo(
    () => rows.find((r) => r.id === deleteId) ?? null,
    [rows, deleteId]
  );

  return (
    <Layout>
      <div className="bg-gradient-to-r from-sky-600 to-blue-700 text-white py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 lg:px-16 text-center">
          <h1 className="text-3xl font-semibold">Drone Survey Submissions Needing Review</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 lg:px-16 py-3 text-sm">
        <Link to="/admin" className="text-blue-700 underline">Admin</Link>
        <span className="text-slate-600"> / Drone Review</span>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 lg:px-16">
        <Card>
          <CardHeader>
            <CardTitle>Submissions ({loading ? "…" : rows.length})</CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            {rows.map((r) => {
              const submitted = r.created_at ? new Date(r.created_at).toLocaleString() : "—";

              return (
                <div key={r.id} className="border rounded p-3 bg-white">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-medium">
                        {(r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : "—")} · {r.island || "—"} {r.location ? `· ${r.location}` : ""}
                      </div>
                      <div className="text-xs text-slate-500">submitted: {submitted}</div>
                      <div className="text-xs text-muted-foreground">
                        pilot: {r.pilot || "—"} · email: {r.email || "—"} · photos: {r.photo_count ?? "—"} · total mantas: {r.total_mantas_observed ?? "—"} · status: {r.status || "draft"}
                      </div>

                      {r.times_unknown ? (
                        <div className="mt-2 inline-flex rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                          Times unknown
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => viewPhotos(r.id)}>
                        {openId === r.id ? "Hide Photos" : "View Photos"}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setCommitId(r.id)}
                        disabled={busyId === r.id}
                      >
                        Commit
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => setDeleteId(r.id)}
                        disabled={busyId === r.id}
                      >
                        Delete
                      </Button>
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
                                <div className="w-full h-40 bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                                  no image
                                </div>
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
              );
            })}

            {rows.length === 0 && !loading && (
              <div className="text-sm text-muted-foreground">No drafts to review.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!commitId} onOpenChange={(open) => !open && setCommitId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Commit drone survey?</DialogTitle>
            <DialogDescription>
              This will copy the draft into the live drone survey tables and move any temp photos into the permanent drone photo bucket.
            </DialogDescription>
          </DialogHeader>

          <div className="text-sm text-slate-700">
            {commitRow ? `${commitRow.island || "—"} · ${commitRow.location || "—"} · total mantas ${commitRow.total_mantas_observed ?? "—"}` : ""}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCommitId(null)}>Cancel</Button>
            <Button onClick={() => commitId && doCommit(commitId)} disabled={!commitId || busyId === commitId}>
              Commit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete draft submission?</DialogTitle>
            <DialogDescription>
              This will remove the draft submission and its temp photos. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="text-sm text-slate-700">
            {deleteRow ? `${deleteRow.island || "—"} · ${deleteRow.location || "—"}` : ""}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteId && doDelete(deleteId)} disabled={!deleteId || busyId === deleteId}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={noticeOpen} onOpenChange={setNoticeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{noticeTitle}</DialogTitle>
            <DialogDescription>{noticeMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setNoticeOpen(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
