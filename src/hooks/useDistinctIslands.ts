import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Row = { island: string | null };

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

export function useDistinctIslands() {
  const [islands, setIslands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("sightings")
        .select("island", { distinct: true })
        .not("island", "is", null)
        .order("island", { ascending: true });
      if (!alive) return;
      if (error) { setError(error.message); setLoading(false); return; }
      const vals = (data as Row[])
        .map(r => (r.island ?? "").trim())
        .filter(Boolean);
      setIslands(vals);
      setLoading(false);
      console.debug("[IslandSelect] islands:", vals);
    })();
    return () => { alive = false; };
  }, []);

  return { islands, loading, error };
}
