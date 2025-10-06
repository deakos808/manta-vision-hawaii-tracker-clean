
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import Layout from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  submitted_at: string | null;
  email: string | null;
  sighting_date: string | null;
  manta_count: number | null;
  photo_count: number | null;
  status?: string | null;
  payload?: any;
};

function MatchPill({ payload }: { payload:any }) {
  const arr = Array.isArray(payload?.mantas) ? payload.mantas : [];
  let matched = 0, no = 0;
  for (const m of arr) {
    if (m?.matchedCatalogId != null) matched++;
    else if (m?.noMatch) no++;
  }
  if (matched > 0) return <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">{matched} matched</span>;
  if (no > 0) return <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-700">{no} no match</span>;
  return <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">match pending</span>;
}

export default function ReviewSubmissionsPage(){
  const [rows, setRows] = useState<Row[]>([]);
  const nav = useNavigate();

  useEffect(()=>{
    let alive=true;
    (async ()=>{
      const { data, error } = await supabase
        .from("sighting_submissions")
        .select("id,submitted_at,email,sighting_date,manta_count,photo_count,status,payload")
        .order("submitted_at",{ascending:false})
        .limit(500);
      if(!alive) return;
      if(!error && data) setRows(data as Row[]);
    })();
    return ()=>{ alive=false; };
  },[]);

  const onReview = (id:string) => {
    nav("/sightings/add?review=" + encodeURIComponent(id));
  };

  const onReject = async (id:string) => {
    await supabase.from("sighting_submissions").update({ status: "rejected" }).eq("id", id);
    setRows(prev => prev.map(r => r.id===id ? ({...r, status:"rejected"}) : r));
  };

  const onCommit = async (id:string) => {
    // Stub: keep as-is for now; your existing commit flow can be wired here.
    alert("Commit is stubbed in this patch. Hook your insertion pipeline here.");
  };

  return (
    <Layout title="Review Submissions">
      <div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 shadow">
        <h1 className="text-3xl font-semibold">Review Submitted Sightings</h1>
        <div className="text-sm opacity-90 mt-1">
          <Link to="/admin" className="underline text-white/90">← Back to Admin Dashboard</Link>
        </div>
      </div>

      <div className="px-4 sm:px-8 lg:px-16 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Submissions</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Submitted</th>
                  <th className="py-2 pr-4">Sighting</th>
                  <th className="py-2 pr-4">Mantas</th>
                  <th className="py-2 pr-4">Photos</th>
                  <th className="py-2 pr-4">Match</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r=>(
                  <tr key={r.id} className="border-t">
                    <td className="py-2 pr-4">{r.email || "—"}</td>
                    <td className="py-2 pr-4">{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}</td>
                    <td className="py-2 pr-4">{r.sighting_date || "—"}</td>
                    <td className="py-2 pr-4">{r.manta_count ?? 0}</td>
                    <td className="py-2 pr-4">{r.photo_count ?? 0}</td>
                    <td className="py-2 pr-4"><MatchPill payload={r.payload} /></td>
                    <td className="py-2 pr-4">{r.status || "pending"}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={()=>onReview(r.id)}>Review</Button>
                        <Button onClick={()=>onCommit(r.id)}>Commit</Button>
                        <Button variant="destructive" onClick={()=>onReject(r.id)}>Reject</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length===0 && (
                  <tr><td className="py-4 text-slate-500" colSpan={8}>No submissions.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
