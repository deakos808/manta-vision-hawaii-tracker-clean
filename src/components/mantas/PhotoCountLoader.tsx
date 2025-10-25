import React from "react";
import { supabase } from "@/lib/supabase";

export default function PhotoCountLoader({
  mantaId,
  onLoaded,
}: { mantaId: number; onLoaded: (n: number) => void }) {
  React.useEffect(() => {
    let dead = false;
    (async () => {
      const { count, error } = await supabase
        .from("photos")
        .select("pk_photo_id", { count: "exact", head: true })
        .eq("fk_manta_id", mantaId);
      if (!dead && typeof count === "number" && !error) onLoaded(count);
    })();
    return () => { dead = true; };
  }, [mantaId, onLoaded]);
  return null;
}
