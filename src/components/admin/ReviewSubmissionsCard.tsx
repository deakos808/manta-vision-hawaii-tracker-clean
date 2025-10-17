import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Counts = { pending: number; committed: number; rejected: number };

async function fetchCounts(): Promise<Counts> {
  const [p, c, r] = await Promise.all([
    supabase.from("sighting_submissions").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("sighting_submissions").select("*", { count: "exact", head: true }).eq("status", "committed"),
    supabase.from("sighting_submissions").select("*", { count: "exact", head: true }).eq("status", "rejected"),
  ]);
  return {
    pending: p.count ?? 0,
    committed: c.count ?? 0,
    rejected: r.count ?? 0,
  };
}

export default function ReviewSubmissionsCard() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["sighting-submission-counts"], queryFn: fetchCounts, staleTime: 30_000 });
  const counts = data ?? { pending: 0, committed: 0, rejected: 0 };

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Manage Submitted Sightings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">Review submitted sightings, mantas, and photos.</p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-base font-semibold">{counts.pending}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
            <div>
              <div className="text-base font-semibold">{counts.committed}</div>
              <div className="text-xs text-muted-foreground">Committed</div>
            </div>
            <div>
              <div className="text-base font-semibold">{counts.rejected}</div>
              <div className="text-xs text-muted-foreground">Rejected</div>
            </div>
          </div>
          <div>
            <Button variant="outline" onClick={() => navigate("/admin/review")}>Review</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
