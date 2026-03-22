import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function DroneReviewSubmissionsTile() {
  const navigate = useNavigate();
  const [pending, setPending] = React.useState<number | null>(null);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      const { count, error } = await supabase
        .from("temp_drone_sightings")
        .select("*", { count: "exact", head: true })
        .is("committed_at", null);

      if (!alive) return;

      if (error) {
        console.debug("[DroneReviewTile] temp_drone_sightings pending error:", error.message);
        setPending(0);
        return;
      }

      setPending(count ?? 0);
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <h3 className="font-semibold">
          Manage Submitted Drone Sightings
          {typeof pending === "number" ? ` (${pending})` : ""}
        </h3>
        <p className="text-sm text-muted-foreground">
          Review and decide on submitted drone surveys and photos.
        </p>
        <Button variant="outline" onClick={() => navigate("/admin/drone-drafts")}>
          Review
        </Button>
      </CardContent>
    </Card>
  );
}
