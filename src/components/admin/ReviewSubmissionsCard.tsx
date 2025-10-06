
import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ReviewSubmissionsCard() {
  const navigate = useNavigate();
  const handleReview = (id: string) => navigate(`/add-sighting?reviewId=${id}&return=/admin/review`);


  const { data } = useQuery({
    queryKey: ["submissions-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sighting_submissions")
        .select("id,manta_count,photo_count,status")
        .eq("status","pending");
      if (error) throw error;
      return data ?? [];
    }
  });

  const pending = data?.length ?? 0;
  const mantas = (data ?? []).reduce((a, r)=> a + (r.manta_count || 0), 0);
  const photos = (data ?? []).reduce((a, r)=> a + (r.photo_count || 0), 0);

  return (
    <Card>
      <CardHeader><CardTitle>Review Submitted Sightings</CardTitle></CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          <div><span className="font-medium">{pending}</span> pending</div>
          <div><span className="font-medium">{mantas}</span> mantas • <span className="font-medium">{photos}</span> photos</div>
        </div>
        <Button onClick={()=>navigate("/admin/review")}>Open Review Queue</Button>
      </CardContent>
    </Card>
  );
}
