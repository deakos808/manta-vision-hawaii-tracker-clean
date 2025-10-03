import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type SubRow = {
  id: string;
  submitted_at: string;
  email: string | null;
  sighting_date: string | null;
  manta_count: number | null;
  photo_count: number | null;
  status: string | null;
};

export default function ReviewSubmissionsCard() {
  const [rows, setRows] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sighting_submissions")
      .select("id, submitted_at, email, sighting_date, manta_count, photo_count, status")
      .order("submitted_at", { ascending: false })
      .limit(50);
    setLoading(false);
    if (!error && data) setRows(data as any);
  };

  useEffect(() => { load(); }, []);

  const commit = async (id: string) => {
    await supabase
      .from("sighting_submissions")
      .update({ status: "committed", committed_at: new Date().toISOString() })
      .eq("id", id);
    await load();
  };

  return (
    <Card className="mt-6">
      <CardHeader><CardTitle>Review Submitted Sightings</CardTitle></CardHeader>
      <CardContent>
        <div className="text-sm text-gray-500 mb-3">
          {loading ? "Loading…" : `${rows.length} submission(s)`}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_150px_120px_90px_90px_220px] gap-2 text-sm font-medium text-gray-700 mb-2">
          <div>Email</div>
          <div>Submitted</div>
          <div>Sighting</div>
          <div>Mantas</div>
          <div>Photos</div>
          <div>Actions</div>
        </div>

        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_150px_120px_90px_90px_220px] items-center gap-2 border rounded p-2 mb-2">
            <div className="truncate">{r.email ?? "—"}</div>
            <div className="text-sm">{new Date(r.submitted_at).toLocaleString()}</div>
            <div className="text-sm">{r.sighting_date ?? "—"}</div>
            <div className="text-sm">{r.manta_count ?? 0}</div>
            <div className="text-sm">{r.photo_count ?? 0}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={()=>{ window.location.href = \`/admin/review-submission?id=\${r.id}\`; }}>Review</Button>
              <Button size="sm" onClick={() => commit(r.id)}>Commit</Button>
            </div>
          </div>
        ))}

        {!loading && rows.length === 0 && (
          <div className="text-sm text-gray-500">No submissions yet.</div>
        )}
      </CardContent>
    </Card>
  );
}
