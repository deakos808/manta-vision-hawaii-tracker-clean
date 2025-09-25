import { useLocation } from "react-router-dom";
import MantasSummaryList from "./MantasSummaryList";

/**
 * Temporary summary dock: only renders on /sightings/add.
 * Next step will pass real mantas + handlers via context/props.
 */
export default function MantasSummaryDock() {
  const { pathname } = useLocation();
  if (!pathname.startsWith("/sightings/add")) return null;
  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-10 md:right-auto z-40 max-w-3xl">
      <div className="rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <MantasSummaryList />
      </div>
    </div>
  );
}
