import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList } from "lucide-react";

export default function ReviewSubmissionsTile(){
  const navigate = useNavigate();
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-600" />
            Manage Submitted Sightings
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Review and decide on submitted sightings, mantas, and photos.
        </p>
        <Button variant="outline" onClick={()=>navigate("/admin/review")}>Review</Button>
      </CardContent>
    </Card>
  );
}
