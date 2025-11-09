import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type LocRec = { name: string; island: string; latitude?: number|null; longitude?: number|null };

export function useIslandsLocations(selectedIsland: string) {
  const [islands, setIslands] = useState<string[]>([]);
  const [locations, setLocations] = useState<LocRec[]>([]);
  const [loadingIsl, setLoadingIsl] = useState(false);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [err, setErr] = useState<string|null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingIsl(true); setErr(null);
      const { data, error } = await supabase
        .from("islands_distinct")
        .select("island")
        .order("island", { ascending: true });
      if (!alive) return;
      if (error) { setErr(error.message); setIslands([]); setLoadingIsl(false); return; }
      const list = (data ?? []).map((r:any)=> String(r.island).trim()).filter(Boolean);
      setIslands(Array.from(new Set(list)));
      setLoadingIsl(false);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLocations([]);
      if (!selectedIsland) return;
      setLoadingLoc(true);

      // primary: location_defaults
      const { data, error } = await supabase
        .from("location_defaults")
        .select("name,island,latitude,longitude")
        .eq("island", selectedIsland)
        .order("name",{ascending:true});

      if (!alive) return;

      if (!error && data && data.length) {
        const seen = new Set<string>();
        const list = (data as any[]).reduce<LocRec[]>((acc, r:any) => {
          const key = String(r.name||"").trim().toLowerCase();
          if (!key || seen.has(key)) return acc;
          seen.add(key);
          acc.push({ name: String(r.name), island: selectedIsland, latitude: r.latitude ?? null, longitude: r.longitude ?? null });
          return acc;
        }, []);
        setLocations(list);
        setLoadingLoc(false);
        return;
      }

      // fallback: distinct sightings.sitelocation for island
      const { data: srows, error: serr } = await supabase
        .from("sightings").select("sitelocation")
        .eq("island", selectedIsland)
        .not("sitelocation","is", null);

      if (!alive) return;

      if (!serr && srows) {
        const names = Array.from(new Set((srows as any[]).map(r => String(r.sitelocation||"").trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
        setLocations(names.map(n => ({ name:n, island:selectedIsland })));
      } else {
        setLocations([]);
      }
      setLoadingLoc(false);
    })();

    return () => { alive = false; };
  }, [selectedIsland]);

  return { islands, locations, loadingIsl, loadingLoc, err };
}
