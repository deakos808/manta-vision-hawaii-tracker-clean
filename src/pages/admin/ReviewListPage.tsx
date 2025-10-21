
import React from "react";
import Layout from "@/components/layout/Layout";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  submitted_at: string | null;
  email: string | null;
  sighting_date: string | null;
  manta_count: number | null;
  photo_count: number | null;
  payload: any | null;
};

export default function ReviewListPage(){
  const navigate = useNavigate();
    const qc = useQueryClient();
const { data = [] } = useQuery({
    queryKey: ["review-list"],
    queryFn: async ()=>{
      const { data, error } = await supabase
        .from("sighting_submissions")
        .select("id,submitted_at,email,sighting_date,manta_count,photo_count,payload,status")
        .eq("status","pending")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Row[];
    }
  });

  return (
    <Layout>
      <div className="bg-gradient-to-r from-sky-600 to-blue-700 py-10 text-white text-center">
        <h1 className="text-3xl font-semibold">New Sightings Needing Review</h1>
      </div>
        <div className="max-w-4xl mx-auto px-4 py-2" data-review-breadcrumb>
          <Link to="/admin" className="text-sm text-blue-700 underline">Admin</Link>
          <span className="text-sm text-slate-600"> / Review</span>
        </div>
      <div className="max-w-4xl mx-auto p-4">
        {data.length === 0 && (
          <div className="text-slate-500">No pending submissions.</div>
        )}
        <ul className="space-y-3">
          {data.map(r=>{
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
                  <Button onClick={() => navigate(`/sightings/add?review=${encodeURIComponent(r.id)}&return=/admin/review`, { state: { reviewId: r.id, return: "/admin/review" } })}>Review</Button>
                  <Button variant="destructive" onClick={async ()=>{
                      if (!window.confirm("Are you sure you want to delete this sighting entry?")) return;
                      await supabase.from("sighting_submissions")
                        .update({ status: "rejected", rejected_at: new Date().toISOString() })
                        .eq("id", r.id);
                      await qc.invalidateQueries({ queryKey: ["review-list"] });
                    }}>Reject</Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Layout>
  );
}
