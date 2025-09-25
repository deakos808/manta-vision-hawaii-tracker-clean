import { useEffect, useMemo, useState } from "react";
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
    async function loadLocations() {
      if (!selectedIsland) { setLocations([]); return; }
      setLoadingLocations(true);
      const { data, error } = await supabase.from("sightings").select("location,island").eq("island", selectedIsland);
      if (mounted) {
        if (!error && data) {
          const uniq = Array.from(new Set((data.map(r => (r as any).location || "").filter(Boolean)))).sort();
          setLocations(uniq);
        } else {
          setLocations([]);
        }
        setLoadingLocations(false);
      }
    }
    loadLocations();
    return () => { mounted = false; };
  }, [selectedIsland]);

  return { islands, locations, loadingIslands, loadingLocations };
}
