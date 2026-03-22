import React from "react";
import Layout from "@/components/layout/Layout";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Row = {
  id: string;
  submitted_at: string | null;
  email: string | null;
  sighting_date: string | null;
  manta_count: number | null;
  photo_count: number | null;
  payload: any | null;
};

type ReviewPhoto = {
  url: string;
  name: string;
  view?: string | null;
};

export default function ReviewListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [photosOpen, setPhotosOpen] = React.useState(false);
  const [photosTitle, setPhotosTitle] = React.useState("Submitted Photos");
  const [photos, setPhotos] = React.useState<ReviewPhoto[]>([]);

  const { data = [] } = useQuery({
    queryKey: ["review-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sighting_submissions")
        .select("id,submitted_at,email,sighting_date,manta_count,photo_count,payload,status")
        .eq("status", "pending")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  function extractPhotos(row: Row): ReviewPhoto[] {
    const payload = row.payload || {};
    const mantas = Array.isArray(payload.mantas) ? payload.mantas : [];
    const out: ReviewPhoto[] = [];

    for (const m of mantas) {
      const mPhotos = Array.isArray(m?.photos) ? m.photos : [];
      for (const p of mPhotos) {
        if (!p?.url) continue;
        out.push({
          url: String(p.url),
          name: String(p.name || p.path || "photo"),
          view: p.view ?? null,
        });
      }
    }

    return out;
  }

  return (
    <Layout>
      <div className="bg-gradient-to-r from-sky-600 to-blue-700 py-10 text-white text-center">
        <h1 className="text-3xl font-semibold">Submitted Water Sightings Needing Review</h1>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-2" data-review-breadcrumb>
        <Link to="/admin" className="text-sm text-blue-700 underline">Admin</Link>
        <span className="text-sm text-slate-600"> / Water Review</span>
      </div>

      <div className="max-w-4xl mx-auto p-4">
        {data.length === 0 && <div className="text-slate-500">No pending submissions.</div>}

        <ul className="space-y-3">
          {data.map((r) => {
            const p = r.payload || {};
            const photographer = p.photographer || "—";
            const when = r.sighting_date || "—";
            const submitted = r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—";

            return (
              <li key={r.id} className="border rounded-lg p-4 flex items-center justify-between">
                <div>
                  <div className="text-slate-900 font-medium">{when}</div>
                  <div className="text-sm text-slate-600">{photographer} • {r.email || "no email"}</div>
                  <div className="text-xs text-slate-500">Submitted: {submitted}</div>
                  <div className="text-xs text-slate-500 mt-1">{r.manta_count || 0} mantas • {r.photo_count || 0} photos</div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPhotos(extractPhotos(r));
                      setPhotosTitle(`Submission ${r.id.slice(0, 8)} — Photos`);
                      setPhotosOpen(true);
                    }}
                  >
                    View Photos
                  </Button>

                  <Button
                    onClick={() =>
                      navigate(`/sightings/add?review=${encodeURIComponent(r.id)}&return=/admin/review`, {
                        state: { reviewId: r.id, return: "/admin/review" },
                      })
                    }
                  >
                    Review
                  </Button>

                  <Button
                    variant="destructive"
                    onClick={async () => {
                      if (!window.confirm("Are you sure you want to delete this sighting entry?")) return;
                      await supabase
                        .from("sighting_submissions")
                        .update({ status: "rejected", rejected_at: new Date().toISOString() })
                        .eq("id", r.id);
                      await qc.invalidateQueries({ queryKey: ["review-list"] });
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <Dialog open={photosOpen} onOpenChange={setPhotosOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{photosTitle}</DialogTitle>
          </DialogHeader>

          {photos.length === 0 ? (
            <div className="text-sm text-slate-500">No photos attached to this submission.</div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[65vh] overflow-auto">
              {photos.map((p, idx) => (
                <div key={`${p.url}-${idx}`} className="border rounded-lg bg-white overflow-hidden">
                  {String(p.name || "").toLowerCase().endsWith(".heic") || String(p.name || "").toLowerCase().endsWith(".heif") ? (
                  <div className="w-full h-52 bg-slate-100 flex flex-col items-center justify-center text-center px-3">
                    <div className="text-sm font-semibold text-slate-700">HEIC photo</div>
                    <div className="text-xs text-slate-500 mt-1 break-all">{p.name}</div>
                  </div>
                ) : (
                  <img src={p.url} alt={p.name} className="w-full h-52 object-contain bg-white" />
                )}
                  <div className="p-3 text-xs">
                    <div className="font-medium break-all">{p.name}</div>
                    <div className="mt-1 text-slate-500">View: {p.view || "—"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
