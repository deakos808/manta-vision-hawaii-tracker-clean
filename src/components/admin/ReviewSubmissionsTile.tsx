import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function ReviewSubmissionsTile(){
  const navigate = useNavigate();
  const [pending, setPending] = React.useState<number | null>(null);

  React.useEffect(() => { (async () => {
  try {
    const { count, error } = await supabase
      .from("sighting_submissions")
      .select("id", { count: "exact" })   // body SELECT (no HEAD)
      .eq("status", "pending")
      .limit(1);
    if (error) throw error;
    setPending(count ?? 0);
  } catch (e) {
    console.debug("[ReviewTile] sighting_submissions status=pending error:", (e as any)?.message || e);
    setPending(0);
  }
})(); }, []);return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-600" />
            Manage Submitted Sightings{typeof pending === 'number' ? ' (' + pending + ')' : ''}
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Review and decide on submitted sightings, mantas, and photos.
        </p>
        <Button variant="outline" onClick={() => navigate("/admin/review")}>Review</Button>
      </CardContent>
    </Card>
  );
}
