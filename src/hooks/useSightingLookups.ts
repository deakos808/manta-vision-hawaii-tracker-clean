import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useSightingLookups(selectedIsland: string) {
  const [islands, setIslands] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [loadingIslands, setLoadingIslands] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadIslands() {
      setLoadingIslands(true);
      const { data, error } = await supabase.from("sightings").select("island");
      if (mounted) {
        if (!error && data) {
          const uniq = Array.from(new Set((data.map(r => (r as any).island || "").filter(Boolean)))).sort();
          setIslands(uniq);
        } else {
          setIslands([]);
        }
        setLoadingIslands(false);
      }
    }
    loadIslands();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function trySelect(col: string) {
      const { data, error } = await supabase
        .from("sightings")
        .select(`island,${col}`)
        .eq("island", selectedIsland);
      if (error) return { ok:false, vals:[] as string[] };
      const vals = (data || []).map((r:any)=> r[col] || "").filter(Boolean);
      return { ok: vals.length>0, vals };
    }
    async function loadLocations() {
      if (!selectedIsland) { setLocations([]); return; }
      setLoadingLocations(true);
      let out:string[]=[];
      for (const col of ["location","sitelocation","site_location"]) {
        const res = await trySelect(col);
        if (res.ok) { out = res.vals; break; }
      }
      const uniq = Array.from(new Set(out)).sort();
      if (mounted) setLocations(uniq);
      setLoadingLocations(false);
    }
    loadLocations();
    return () => { mounted = false; };
  }, [selectedIsland]);

  return { islands, locations, loadingIslands, loadingLocations };
}
