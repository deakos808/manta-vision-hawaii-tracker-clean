import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
export default function SubmitDock(){
  const { pathname } = useLocation();
  if (!pathname.startsWith("/sightings/add")) return null;
  return (
    <div className="mt-10 flex justify-center">
      <Button variant="default">Submit (coming soon)</Button>
    </div>
  );
}
